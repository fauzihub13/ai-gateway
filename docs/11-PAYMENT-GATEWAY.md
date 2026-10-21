# 11 — Payment Gateway (Midtrans)

Flow top-up end-to-end, Snap API, webhook handling (signature, idempotency), status mapping, retry, reconciliation, refund, sandbox testing, security.

---

## 1. Kenapa Midtrans

| Alasan | Detail |
|---|---|
| Dominan di Indonesia | Mendukung VA, GoPay, QRIS, kartu, retail |
| Snap | UI pembayaran siap pakai, sedikit integrasi |
| Sandbox | Mudah tes tanpa uang nyata |
| Webhook | Notifikasi server-to-server andal |

Alternatif ditolak: Xendit (mirip, tapi Snap lebih cepat), Stripe (kurang mendukung metode lokal).

---

## 2. Konfigurasi

```
MIDTRANS_SERVER_KEY       (rahasia, server-side saja)
MIDTRANS_CLIENT_KEY       (untuk Snap di client, opsional)
MIDTRANS_IS_PRODUCTION    (false di dev/staging)
MIDTRANS_MERCHANT_ID
APP_BASE_URL              (untuk redirect finish)
```

```ts
import midtransClient from 'midtrans-client';

export const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY!,
  clientKey: process.env.MIDTRANS_CLIENT_KEY!,
});
```

> **Server key tidak pernah** dikirim ke browser. Snap token dibuat di server.

---

## 3. Flow top-up end-to-end

```
User ──pilih nominal────▶ POST /api/billing/topup { amountIdr }
                              │
                        1. validasi (min 10.000, kelipatan 1.000, max 50.000.000)
                        2. buat Transaction { orderId: "TRX-<nanoid>", status: PENDING, amountIdr }
                        3. snap.createTransaction({ transaction_details, customer_details, callbacks })
                        4. simpan snapToken + redirectUrl
                        5. balas { redirectUrl, orderId }
                              │
User ──buka redirectUrl────▶ Snap UI (pilih metode, bayar)
                              │
            ┌─────────────────┴──────────────────┐
            ▼                                     ▼
   User dibawa ke finish URL          Midtrans kirim webhook ke kami
   (frontend polling status)          POST /api/billing/webhook
                                               │
                                     verifikasi signature
                                     idempotency check
                                     map status → PAID
                                     tambah saldo (atomic) + ledger
                                     balas 200
```

---

## 4. Create transaction

```ts
// app/api/billing/topup/route.ts
const TopupSchema = z.object({
  amountIdr: z.number().int().min(10_000).max(50_000_000)
    .refine((v) => v % 1000 === 0, 'amount_must_multiple_of_1000'),
});

export async function POST(req: Request) {
  const { sub: userId } = await requireUser();
  assertCsrf(req);
  const { amountIdr } = TopupSchema.parse(await req.json());

  const orderId = `TRX-${nanoid(16)}`;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  await db.transaction.create({
    data: { orderId, userId, amountIdr, status: 'PENDING' },
  });

  const snapTrx = await snap.createTransaction({
    transaction_details: { order_id: orderId, gross_amount: amountIdr },
    customer_details: { first_name: user.name ?? 'User', email: user.email },
    callbacks: { finish: `${process.env.APP_BASE_URL}/dashboard/billing?order=${orderId}` },
    expiry: { unit: 'hours', duration: 24 },
  });

  await db.transaction.update({
    where: { orderId },
    data: { snapToken: snapTrx.token, redirectUrl: snapTrx.redirect_url },
  });

  return Response.json({ redirectUrl: snapTrx.redirect_url, orderId });
}
```

Contoh request:

```bash
curl -X POST https://app.mpruy.ai/api/billing/topup \
  -H "Content-Type: application/json" -H "X-CSRF-Token: <tok>" -b cookies.txt \
  -d '{ "amountIdr": 100000 }'
```

---

## 5. Webhook handling

### 5.1 Verifikasi signature

Midtrans mengirim `signature_key = sha512(order_id + status_code + gross_amount + serverKey)`.

```ts
import { createHash } from 'node:crypto';

function verifySignature(p: { order_id: string; status_code: string; gross_amount: string; signature_key: string }) {
  const raw = `${p.order_id}${p.status_code}${p.gross_amount}${process.env.MIDTRANS_SERVER_KEY!}`;
  const expected = createHash('sha512').update(raw).digest('hex');
  return expected === p.signature_key;
}
```

**Wajib** tolak (401) bila signature tidak cocok. Jangan percaya body tanpa verifikasi.

### 5.2 Handler idempotent

```ts
// app/api/billing/webhook/route.ts
export async function POST(req: Request) {
  const body = await req.json();

  if (!verifySignature(body)) {
    return new Response('invalid signature', { status: 401 });
  }

  const { order_id, transaction_status, fraud_status, transaction_id, payment_type } = body;

  const trx = await db.transaction.findUnique({ where: { orderId: order_id } });
  if (!trx) return new Response('unknown order', { status: 404 });

  // idempotency: sudah final? → abaikan (tetap balas 200)
  if (trx.status === 'PAID' || trx.status === 'REFUNDED') {
    return new Response('ok', { status: 200 });
  }

  const newStatus = mapMidtransStatus(transaction_status, fraud_status);

  await db.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { orderId: order_id },
      data: {
        status: newStatus,
        midtransTxnId: transaction_id,
        method: payment_type ?? null,
        rawPayload: redactPayload(body),
        paidAt: newStatus === 'PAID' ? new Date() : null,
      },
    });

    if (newStatus === 'PAID') {
      const u = await tx.user.update({
        where: { id: trx.userId },
        data: { balance: { increment: trx.amountIdr } },
        select: { balance: true },
      });
      await tx.balanceLedger.create({
        data: {
          userId: trx.userId, deltaIdr: trx.amountIdr, balanceAfter: u.balance,
          reason: 'TOPUP', referenceId: trx.id,
        },
      });
    }
  });

  // update cache saldo Redis (best effort)
  await syncBalanceCache(trx.userId);

  return new Response('ok', { status: 200 });
}
```

### 5.3 Kenapa idempotent penting

Midtrans **mengirim ulang** notifikasi (retry) sampai menerima 200. Tanpa idempotency, saldo bisa bertambah berkali-kali. Cek status final (PAID/REFUNDED) sebelum menambah saldo.

---

## 6. Status mapping

| `transaction_status` | `fraud_status` | Status kami | Saldo |
|---|---|---|---|
| `capture` | `accept` | PAID | + |
| `capture` | `challenge` | PENDING | (tunggu manual/admin) |
| `settlement` | — | PAID | + |
| `pending` | — | PENDING | — |
| `deny` | — | FAILED | — |
| `cancel` | — | FAILED | — |
| `expire` | — | EXPIRED | — |
| `refund` / `partial_refund` | — | REFUNDED | − (refund manual via ledger) |

```ts
function mapMidtransStatus(ts: string, fraud?: string) {
  switch (ts) {
    case 'capture': return fraud === 'accept' ? 'PAID' : 'PENDING';
    case 'settlement': return 'PAID';
    case 'pending': return 'PENDING';
    case 'deny':
    case 'cancel': return 'FAILED';
    case 'expire': return 'EXPIRED';
    case 'refund':
    case 'partial_refund': return 'REFUNDED';
    default: return 'PENDING';
  }
}
```

---

## 7. Reconciliation (webhook hilang)

Webhook bisa hilang (downtime, bug). Job cron (tiap 10 menit) memeriksa transaksi PENDING yang lambat:

```ts
async function reconcilePending() {
  const stale = await db.transaction.findMany({
    where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 15 * 60_000) } },
    take: 100,
  });
  for (const t of stale) {
    const status = await snap.transaction.status(t.orderId); // query ke Midtrans
    const newStatus = mapMidtransStatus(status.transaction_status, status.fraud_status);
    if (newStatus !== 'PENDING') {
      await applyStatus(t.orderId, newStatus, status);
    }
  }
}
```

`applyStatus` memakai logika idempotent yang sama (ekstrak dari webhook handler agar reuse).

---

## 8. Refund flow

Refund lewat dashboard Midtrans (manual) atau API. Setelah refund:

1. Midtrans kirim webhook `refund`/`partial_refund` → kami set `REFUNDED`.
2. Saldo dikurangi **hanya bila belum dibelanjakan**. Bila saldo kurang (user sudah pakai), buat saldo negatif? **Tidak.** Keputusan: catat sebagai receivable/adjustment negatif sampai terbayar, atau blokir akun. Fase awal: set flag + alert admin (lihat catatan di bawah).

```
Refund Rp100.000, user sudah pakai Rp30.000:
  - kurangi saldo Rp100.000 → bila saldo tersisa < 100.000,
    sisanya dicatat di BalanceLedger (deltaIdr negatif) dan saldo bisa jadi negatif?
    → KEBIJAKAN: cegah negatif; sisa jadi "debt" record terpisah + suspend ringan.
```

Sederhanakan fase awal: refund hanya diproses bila saldo cukup; jika tidak, tandai untuk review admin manual.

---

## 9. Testing (Midtrans sandbox)

```
MIDTRANS_IS_PRODUCTION=false
Gunakan kartu tes: 4811 1111 1111 1114 (simulasi sukses)
```

| Skenario | Metode |
|---|---|
| Top-up sukses | Snap sandbox bayar → webhook settlement → saldo bertambah |
| Webhook dobel | Kirim webhook sama 2x → saldo tetap bertambah sekali |
| Signature salah | Kirim signature palsu → 401 |
| Transaksi expire | Set expiry singkat → status EXPIRED, saldo tidak bertambah |
| Reconciliation | Set PENDING, paksa query status → sinkron |

Simulasi webhook:

```bash
curl -X POST http://localhost:3000/api/billing/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "order_id":"TRX-test123","status_code":"200","gross_amount":"100000.00",
    "transaction_status":"settlement","transaction_id":"abc","payment_type":"bank_transfer",
    "signature_key":"<sha512 dari order_id+status_code+gross_amount+serverKey>"
  }'
```

Signature harus dihitung dengan serverKey sandbox yang benar.

---

## 10. Security

| Aturan | Alasan |
|---|---|
| Verifikasi signature **selalu** | mencegah webhook palsu menambah saldo gratis |
| Server key hanya di server | jangan pernah ke client |
| Jangan percaya `amount` dari client | validasi ketat + bandingkan dengan `Transaction.amountIdr` |
| Bandingkan `gross_amount` dengan `amountIdr` DB | cegah manipulasi nominal |
| Webhook balas 200 cepat | Midtrans retry bila lambat; proses berat async |
| Redact payload | jangan simpan PII berlebih di `rawPayload` |
| Idempotency | cegah dobel kredit |
| Log audit | semua perubahan status + admin action |

Cek tambahan di webhook: pastikan `gross_amount` (string seperti `"100000.00"`) sama dengan `trx.amountIdr`:

```ts
if (Math.round(parseFloat(body.gross_amount)) !== trx.amountIdr) {
  return new Response('amount mismatch', { status: 400 });
}
```

---

## 11. Edge cases

| Kasus | Penanganan |
|---|---|
| User buka Snap lalu tutup tanpa bayar | transaksi tetap PENDING sampai expire |
| Webhook datang sebelum Transaction tersimpan | jarang; bila order tidak dikenal → 404, Midtrans retry |
| Dua top-up bareng | orderId unik, masing-masing independen |
| Webhook `capture` + `challenge` (fraud) | tahan saldo, tunggu keputusan manual admin |
| User klaim sudah bayar tapi status PENDING | admin reconcile manual via endpoint |
| Refund setelah dihabiskan | kebijakan review manual (§8) |

---

## 12. Top-up QRIS manual (QRIS statis → dinamis + kode unik)

Metode kedua, tanpa payment gateway: merchant punya satu QRIS **statis** (NMid/merchant).
Platform mengubahnya jadi QRIS **dinamis** dengan nominal `amountIdr + uniqueCode`, lalu admin
memverifikasi mutasi secara manual.

Referensi implementasi TLV/CRC16: [verssache/qris-dinamis](https://github.com/verssache/qris-dinamis).

### 12.1 Kenapa kode unik

QRIS statis tidak membawa identitas transaksi. Bila 5 user top-up Rp100.000 bersamaan, mutasi
masuk terlihat identik dan tidak bisa dicocokkan. Kode unik **1..200** membuat nominal bayar
selalu berbeda, tanpa menambah nominal yang harus dibayar user secara berlebihan:

| amountIdr | uniqueCode | payAmountIdr |
|---|---|---|
| 100000 | 37 | 100037 |
| 100000 | 112 | 100112 |
| 50000 | 8 | 50008 |

Konsekuensinya: maksimal 200 transaksi `PENDING` per nominal. Lebih dari itu → 409
`qris_code_exhausted` (lihat §12.7).

Saldo yang dikreditkan tetap `amountIdr`. Kode unik bukan pendapatan — selisihnya menjadi
biaya pencocokan (atau dikembalikan lewat adjustment bila diminta).

### 12.2 Konfigurasi

```
QRIS_STATIC_PAYLOAD   payload TLV hasil scan QRIS statis (string, bukan gambar)
QRIS_EXPIRY_HOURS     masa berlaku transaksi (default 24)
```

Ambil payload dengan scan QR pakai aplikasi pembaca QR apa pun yang menampilkan isi teks
(mis. aplikasi "QR & Barcode Scanner"), bukan sekadar membuka gambar QR.

Validasi saat start: `validateQris()` menolak payload dengan CRC salah, sehingga salah copy
langsung ketahuan, bukan setelah user transfer.

### 12.3 Flow

```
User ──pilih nominal────▶ POST /api/billing/topup/qris { amountIdr }
                              │
                        1. validasi nominal (min 10.000, kelipatan 1.000)
                        2. expire transaksi QRIS PENDING yang lewat masa berlaku
                        3. ambil kode unik 1..200 yang belum dipakai untuk nominal ini,
                           pilih acak dari yang kosong → payAmountIdr = amountIdr + kode
                        4. toDynamicQris(QRIS_STATIC_PAYLOAD, payAmountIdr)
                           (tag 01: 11→12, inject tag 54, hitung ulang CRC tag 63)
                        5. INSERT Transaction { provider: QRIS_MANUAL, payAmountKey }
                           UNIQUE payAmountKey = "qris:<payAmountIdr>" → race dua request
                           ditolak, ulangi langkah 3 (maks 5 percobaan)
                        6. balas { qrDataUrl, payAmountIdr, uniqueCode, expiresAt }
                              │
User ──scan & bayar──────▶ mutasi masuk ke rekening merchant
                              │
Admin ──cek mutasi───────▶ POST /api/admin/transactions/:id/verify { action: approve }
                              │
                        applyStatus(orderId, 'PAID') → saldo += amountIdr + ledger TOPUP
```

### 12.4 Konversi QRIS

`src/lib/qris.ts` — tanpa dependency, murni TLV + CRC16:

```ts
import { toDynamicQris, validateQris, readQris } from '@/lib/qris';

validateQris(process.env.QRIS_STATIC_PAYLOAD!); // { valid: true }
readQris(payload);                                // { static: true, merchantName, merchantCity, ... }
toDynamicQris(payload, 100_037);                  // payload dinamis + CRC baru
```

Aturan EMVCo yang dipakai:

| Tag | Aksi |
|---|---|
| `01` | `11` (statis) → `12` (dinamis) |
| `54` | inject nominal (`payAmountIdr`, bilangan bulat, tanpa desimal) |
| `55/56/57` | dibuang (tip/fee lama tidak relevan) |
| `63` | dihitung ulang: CRC16-CCITT-FALSE, poly `0x1021`, init `0xFFFF`, atas body + `"6304"` |

Nominal QRIS **tidak boleh desimal dan tidak boleh > 13 digit** — divalidasi di `toDynamicQris`.

Generate gambar QR di server (bukan di client) supaya payload tidak bisa dimodifikasi user:

```ts
const qrDataUrl = await QRCode.toDataURL(qrisPayload, { width: 512, margin: 1 });
```

> Dependency: `qrcode` + `@types/qrcode`. Client cukup menampilkan `<img src={qrDataUrl}>`.

### 12.5 Anti tabrakan nominal

Bukan pakai partial index (Prisma 5 belum mendukung deklarasi `WHERE` di schema), tapi kolom
`payAmountKey` yang `@unique`:

- diisi `qris:<payAmountIdr>` saat `PENDING`
- di-NULL-kan saat `PAID` / `FAILED` / `EXPIRED` / `REFUNDED`

Postgres mengizinkan banyak `NULL` di unique index, jadi setelah transaksi final nominal itu
boleh dipakai lagi. Pelanggaran unique (Prisma `P2002`) ditangkap lalu kode unik diacak ulang.

### 12.6 Verifikasi manual

```ts
POST /api/admin/transactions/:id/verify
{ "action": "approve" | "reject", "note": " opsional " }
```

| Cek | Perilaku |
|---|---|
| Bukan `provider = QRIS_MANUAL` | 400 `not_manual_qris` |
| Sudah `PAID`/`REFUNDED` | 200 `alreadyFinal: true`, tidak dobel kredit |
| `expiresAt` sudah lewat | transaksi di-set `EXPIRED`, 400 `transaction_expired` — **jangan** di-approve |
| `approve` | `applyStatus(…, 'PAID')` → saldo += `amountIdr`, ledger `TOPUP`, `payAmountKey = null` |
| `reject` | status `FAILED`, tidak ada perubahan saldo |
| Semua aksi | dicatat di `AdminAuditLog` (`transaction.qris.approve` / `.reject`) |

Admin **wajib** mencocokkan `payAmountIdr` persis (termasuk kode unik), bukan hanya nominal
bulat, sebelum approve. Bila dana masuk setelah transaksi kedaluwarsa, jangan approve —
buat transaksi baru atau pakai adjustment saldo manual (lihat [16-ADMIN-PANEL.md](./16-ADMIN-PANEL.md)).

### 12.7 Edge cases

| Kasus | Penanganan |
|---|---|
| User transfer nominal bulat (tanpa kode) | tidak cocok dengan transaksi mana pun → verifikasi manual/adjustment |
| Dua user pilih nominal sama | `payAmountKey` unik memaksa kode unik berbeda |
| Semua 200 kode untuk nominal itu terpakai | 409 `qris_code_exhausted`, minta tunggu expired |
| Transaksi kedaluwarsa tapi dana tetap masuk | admin adjustment, bukan approve |
| QRIS statis diganti merchant (ganti rekening) | update `QRIS_STATIC_PAYLOAD`; transaksi lama tetap valid untuk verifikasi |
| `QRIS_STATIC_PAYLOAD` kosong | endpoint balas 500 "belum dikonfigurasi" — UI tetap menampilkan tombol Midtrans |
| Kode unik membuat nominal tidak bulat | wajar; user mengetik nominal persis dari halaman pembayaran |

---

## 13. Referensi

- Ledger & saldo → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md)
- Admin reconcile → [16-ADMIN-PANEL.md](./16-ADMIN-PANEL.md)
- Skema `Transaction` → [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md)
- Security → [13-SECURITY.md](./13-SECURITY.md)
- Contract webhook → [05-API-CONTRACT.md](./05-API-CONTRACT.md)