# 10 — Billing & Usage

Konsep saldo, usage log, kalkulasi biaya, transaksi atomik, idempotency, pencegahan saldo negatif, refund/adjustment, report, quota, invoice.

---

## 1. Konsep saldo

- Saldo dalam **Rupiah bulat (Int)**. Tidak ada pecahan di level saldo.
- Sumber saldo: top-up (Midtrans), adjustment admin, refund.
- Saldo berkurang hanya karena usage (`UsageLog`) atau adjustment negatif.
- **Semua pergerakan dicatat di `BalanceLedger`** (append-only, menyimpan `balanceAfter` untuk audit).
- Saldo tidak boleh negatif (dicegah atomik, lihat §5).

`User.balance` adalah saldo berjalan (fast read). Kebenaran penuh = replay `BalanceLedger`. Job rekonsiliasi berkala memverifikasi `balance == sum(deltaIdr)`.

---

## 2. Tiga angka biaya (nilai, tagih, hemat)

Harga model (`Model.priceInPer1MIdr`, `priceOutPer1MIdr`, `priceCachedInPer1MIdr`)
adalah **harga resmi provider (official)** — angka yang muncul kalau user bayar
langsung ke provider. Harga ini **tidak** dipakai untuk menagih; fungsinya
menghitung **nilai pemakaian**.

Dari situ diturunkan tiga angka per request (semua kolom `UsageLog`):

| Kolom | Arti | PAYG | SUBSCRIPTION |
|---|---|---|---|
| `costIdr` | **Nilai pemakaian** = harga resmi × token, tanpa markup | harga resmi | harga resmi |
| `chargedIdr` | Yang **benar-benar ditagih** ke saldo | resmi × `plan.markup` | **0** |
| `savedIdr` | **Hemat** = `markedIdr − chargedIdr` | **0** | resmi × `plan.markup` |

`markedIdr` (harga retail = nilai × markup) tidak disimpan sebagai kolom; nilainya
= `chargedIdr + savedIdr`, dihitung ulang bila perlu.

Struktur `UsageLog` (lihat [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md)):

```
requestId (unique)  → idempotency
userId, apiKeyId
modelId
endpoint            → chat.completions | embeddings | playground
promptTokens, completionTokens, cachedPromptTokens, totalTokens
costIdr             → NILAI pemakaian (harga resmi, tanpa markup)
chargedIdr          → yang dipotong dari saldo (0 untuk SUBSCRIPTION)
savedIdr            → hemat user
status              → COMPLETED | PARTIAL | ERROR | REJECTED
streamed, latencyMs, upstreamLatencyMs, errorCode
createdAt
```

Status: `REJECTED` = ditolak sebelum ke upstream (auth/limit/saldo) → semua angka biaya `0`.
`ERROR` = gagal upstream tanpa token. `PARTIAL` = stream terputus setelah sebagian token.

---

## 3. Kalkulasi biaya

Satu fungsi tunggal: `computeCostBreakdown()` di [`src/lib/billing.ts`](../src/lib/billing.ts).

```ts
export interface CostBreakdown {
  /** Nilai pemakaian dengan harga resmi provider (tanpa markup). */
  valueIdr: number;
  /** Harga retail = nilai × markup plan. */
  markedIdr: number;
  /** Yang benar-benar ditagih ke saldo (0 untuk SUBSCRIPTION). */
  chargedIdr: number;
  /** Hemat = markedIdr − chargedIdr. */
  savedIdr: number;
}

/** Biaya resmi mentah (belum dibulatkan), token cached pakai harga cache bila ada. */
function rawOfficialCost(model: CostModel, t: CostTokens): number {
  const prompt = Math.max(t.promptTokens, 0);
  const completion = Math.max(t.completionTokens, 0);
  const cached = Math.min(Math.max(t.cachedPromptTokens ?? 0, 0), prompt);
  const nonCached = prompt - cached;
  const cachedPrice = model.priceCachedInPer1MIdr ?? model.priceInPer1MIdr;

  const inCost = (nonCached / 1_000_000) * model.priceInPer1MIdr;
  const cachedCost = (cached / 1_000_000) * cachedPrice;
  const outCost = (completion / 1_000_000) * model.priceOutPer1MIdr;
  return inCost + cachedCost + outCost;
}

export function computeCostBreakdown(opts: {
  model: { priceInPer1MIdr: number; priceOutPer1MIdr: number; priceCachedInPer1MIdr?: number | null };
  plan: { markup: number; billingMode: string };
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens?: number;
}): CostBreakdown {
  const valueIdr = Math.ceil(rawOfficialCost(opts.model, tokens));
  const markedIdr = Math.ceil(rawOfficialCost(opts.model, tokens) * opts.plan.markup);
  const chargedIdr = opts.plan.billingMode === 'SUBSCRIPTION' ? 0 : markedIdr;
  const savedIdr = Math.max(0, markedIdr - chargedIdr);
  return { valueIdr, markedIdr, chargedIdr, savedIdr };
}
```

Harga disimpan **per 1 juta token**, sama dengan satuan provider upstream.

Contoh: mimo (resmi Rp4.000/1M in, Rp12.000/1M out), 1.200 prompt + 800 completion:
```
raw resmi = 1200/1M × 4000 + 800/1M × 12000 = 4.8 + 9.6 = 14.4

PAYG  markup 1.35 : value = ceil(14.4)      = Rp15
                    marked = ceil(14.4×1.35) = Rp20 → charged=20, saved=0
SUBSCRIPTION      : value = Rp15, marked = Rp20 → charged=0, saved=20
```

> `Math.ceil` per request membuat request kecil (mis. 100 token) tetap kena Rp1.
> Itu disengaja — biaya minimum satu request adalah Rp1.

`isFreeModel` (model dengan harga efektif 0) tetap dipakai agar user PAYG bersaldo 0
boleh memakai model gratis: `priceInPer1MIdr * markup <= 0 && priceOutPer1MIdr * markup <= 0`.

---

## 4. Atomic settle (potong saldo + catat usage)

Satu transaksi DB. Saldo **boleh minus** (overdraft) — kebijakan: request yang sudah dikerjakan / stream yang sudah jalan tidak dipotong di tengah. Gerbang saldo ada di preflight (`balance <= 0 → 402`, lihat §5), jadi overshoot dibatasi satu request dan request berikutnya diblokir.

```ts
// src/lib/billing.ts
export async function settleUsage(input: {
  requestId: string; userId: string; apiKeyId?: string; modelId: string;
  endpoint: string; promptTokens: number; completionTokens: number;
  /** Nilai pemakaian (harga resmi, tanpa markup). */
  costIdr: number;
  /** Yang benar-benar ditagih ke saldo (0 untuk SUBSCRIPTION). Default = costIdr. */
  chargedIdr?: number;
  /** Hemat = retail − charged. Default 0. */
  savedIdr?: number;
  status: 'COMPLETED' | 'PARTIAL' | 'ERROR' | 'REJECTED';
  streamed?: boolean; latencyMs?: number; errorCode?: string;
}) {
  const charged = Math.max(0, input.chargedIdr ?? input.costIdr);
  const saved = Math.max(0, input.savedIdr ?? 0);

  return db.$transaction(async (tx) => {
    // 1. idempotency: insert usage dulu
    const existing = await tx.usageLog.findUnique({ where: { requestId: input.requestId } });
    if (existing) return { duplicated: true, usageId: existing.id };

    const usage = await tx.usageLog.create({
      data: {
        requestId: input.requestId,
        userId: input.userId,
        apiKeyId: input.apiKeyId ?? null,
        modelId: input.modelId,
        endpoint: input.endpoint,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: input.promptTokens + input.completionTokens,
        costIdr: input.costIdr,     // nilai pemakaian (analitik)
        chargedIdr: charged,        // yang dipotong dari saldo
        savedIdr: saved,            // hemat user
        status: input.status,
        streamed: input.streamed ?? false,
        latencyMs: input.latencyMs,
        errorCode: input.errorCode,
      },
    });

    // 2. potong saldo atomic (hanya bila charged > 0). Saldo boleh minus — task in-flight selesai.
    if (charged > 0) {
      await tx.$executeRaw`
        UPDATE "User"
        SET balance = balance - ${charged}, "updatedAt" = now()
        WHERE id = ${input.userId}
      `;

      // 3. ledger
      const u = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { balance: true } });
      await tx.balanceLedger.create({
        data: {
          userId: input.userId, deltaIdr: -charged, balanceAfter: u.balance,
          reason: 'USAGE', referenceId: usage.id,
        },
      });
    }

    // 4. update lastUsedAt key (di luar transaksi idealnya)
    return { duplicated: false, usageId: usage.id };
  });
}
```

### 4.1 Idempotency

- `requestId` unique. Retry `settleUsage` dengan `requestId` sama → `duplicated: true`, tidak potong lagi.
- Untuk stream, `settle` dipanggil sekali di `flush`. Bila function retry (mis. crash), `findUnique` mencegah dobel.

---

## 5. Saldo & concurrency (kebijakan: selesaikan task, jangan potong tengah)

```
Request masuk (sama user, paralel):
  1. FAST GUARD (Redis, opsional): cek saldo cache; bila balance <= 0 → 402 SEBELUM ke upstream
  2. AUTHORITATIVE (DB): settle atomik (§4). Saldo boleh minus (overdraft) —
     request yang sudah dikerjakan tidak dibatalkan di tengah
  3. RECONCILE: setelah settle, set ulang cache Redis = balance DB
  4. Blokir berikutnya: preflight `balance <= 0` menolak request BARU (bukan memotong yang jalan)
```

Prinsip: **gerbang di awal, bukan di tengah.** Semua limit (auth, rate, saldo, kuota periode plan, limit per-key, context window) dicek di preflight sebelum upstream. Sekali request/stream jalan, ia selesai; biaya direkam di settle (best-effort). Request berikutnya yang diblokir.

Pre-flight check sebelum ke upstream (optimistik, mencegah kirim request yang pasti gagal):

```ts
// src/lib/proxy.ts — urutan gerbang di preflight()
await assertPlanActive(auth);                    // planExpiresAt lewat → 402 plan_expired
await assertTokenQuota(auth);                    // kuota token periode habis → 429 quota_exceeded
await assertBalance(auth.userId, { model, plan: auth.plan }); // saldo ≤ 0 → 402 (kecuali SUBSCRIPTION / model gratis)
```

`assertBalance` **mode-aware** — plan SUBSCRIPTION tidak pernah menyentuh saldo:

```ts
export async function assertBalance(
  userId: string,
  opts?: {
    model?: { priceInPer1MIdr: number; priceOutPer1MIdr: number };
    plan?: { markup: number; billingMode?: string };
  },
): Promise<void> {
  if (opts?.plan?.billingMode === 'SUBSCRIPTION') return; // tidak pakai saldo
  const free = opts?.model && opts?.plan ? isFreeModel(opts.model, opts.plan) : false;
  if (free) return;
  const balance = await getBalance(userId);
  if (balance <= 0) throw new InsufficientBalanceError();
}
```

`isFreeModel` (lihat implementasi di `src/lib/billing.ts`): `priceInPer1MIdr * plan.markup <= 0 && priceOutPer1MIdr * plan.markup <= 0`.

Catatan: karena biaya final tak diketahui sebelum respons, pre-flight hanya mencegah saldo 0 pada model berbayar PAYG. Penagihan sebenarnya di settle. Saldo boleh minus satu request (overdraft) supaya task in-flight selesai; request berikutnya diblokir. Untuk plan SUBSCRIPTION, `chargedIdr = 0` sehingga settle tidak memotong saldo dan tidak menulis `BalanceLedger`.

---

## 6. Refund & adjustment

### 6.1 Refund (usage gagal setelah ditagih)

```
Admin/user ajukan refund → buat BalanceLedger { deltaIdr: +X, reason: REFUND, referenceId: usageId }
                        → tambah User.balance
                        → tandai UsageLog (mis. errorCode: refunded, costIdr & chargedIdr tetap untuk audit)
```

> Refund memakai `chargedIdr` (yang benar-benar dipotong), bukan `costIdr` (nilai
> pemakaian). Untuk plan SUBSCRIPTION tidak ada saldo yang dipotong, jadi tidak
> ada yang perlu direfund.

### 6.2 Adjustment (koreksi manual)

```bash
curl -X POST /api/admin/users/:id/balance \
  -d '{ "deltaIdr": 50000, "reason": "Manual transfer", "note": "INV-001" }'
```

```ts
await db.$transaction(async (tx) => {
  const u = await tx.user.update({ where: { id }, data: { balance: { increment: delta } }, select: { balance: true } });
  await tx.balanceLedger.create({ data: { userId: id, deltaIdr: delta, balanceAfter: u.balance, reason: 'ADJUSTMENT', note } });
});
```

Semua refund/adjustment wajib beralasan & tercatat di audit admin.

---

## 7. Usage report queries

### 7.1 Per user, per hari (30 hari)

```sql
SELECT date_trunc('day', "createdAt") AS day,
       SUM("totalTokens") AS tokens,
       SUM("costIdr")     AS value,    -- nilai pemakaian (harga resmi)
       SUM("chargedIdr")  AS charged,  -- yang ditagih ke saldo
       SUM("savedIdr")    AS saved,    -- hemat user
       COUNT(*)           AS requests
FROM "UsageLog"
WHERE "userId" = $1
  AND "createdAt" >= now() - interval '30 days'
  AND status <> 'REJECTED'
GROUP BY 1 ORDER BY 1;
```

### 7.2 Per model

```sql
SELECT m."publicName",
       COUNT(*) AS req,
       SUM(l."costIdr")    AS value,
       SUM(l."chargedIdr") AS charged
FROM "UsageLog" l JOIN "Model" m ON m.id = l."modelId"
WHERE l."userId" = $1 AND l."createdAt" >= now() - interval '30 days'
GROUP BY 1 ORDER BY value DESC;
```

### 7.3 Per API key

```sql
SELECT k.prefix, k.name,
       COUNT(*) AS req,
       SUM(l."costIdr")    AS value,
       SUM(l."chargedIdr") AS charged
FROM "UsageLog" l JOIN "ApiKey" k ON k.id = l."apiKeyId"
WHERE l."userId" = $1 AND l."createdAt" >= now() - interval '30 days'
GROUP BY 1,2 ORDER BY charged DESC;
```

### 7.4 Summary 30 hari (tiga angka biaya)

```sql
SELECT COUNT(*) AS requests,
       SUM("totalTokens") AS tokens,
       SUM("costIdr")     AS value,
       SUM("chargedIdr")  AS charged,
       SUM("savedIdr")    AS saved
FROM "UsageLog"
WHERE "userId" = $1 AND "createdAt" >= date_trunc('month', now());
```

---

## 8. Kuota & limit

Tiga lapis, semuanya dicek di preflight (bukan di tengah request):

| Lapis | Basis | Habis → |
|---|---|---|
| **Masa aktif plan** | `User.planExpiresAt` | 402 `plan_expired` |
| **Kuota token periode** | `User.planTokenQuota` vs pemakaian sejak `User.planStartedAt` | 429 `quota_exceeded` |
| **Saldo** (hanya PAYG) | `User.balance > 0` | 402 `insufficient_balance` |

### 8.1 Kuota token per **periode plan**

Kuota dihitung **per periode plan** (`Plan.periodDays` hari sejak tanggal
beli/perpanjang) — **bukan** per bulan kalender:

```
pemakaian_periode = SUM(totalTokens)
  WHERE userId = $1
    AND createdAt >= user.planStartedAt
    AND status <> 'REJECTED'

bila pemakaian_periode >= user.planTokenQuota → 429 quota_exceeded
```

- `planTokenQuota` di-set saat beli/perpanjang. `NULL` = plan tanpa kuota.
- Beli lagi saat plan sama masih aktif → kuota **ditambah** (stack), jadi
  pemakaian tetap dihitung dari `planStartedAt` awal dan tidak pernah reset diam-diam.
- Kuota habis → beli plan lagi untuk menambah kuota & masa aktif.

**Plan tanpa expiry (gratis) & berkuota:** periode bergulir otomatis. Bila
`planStartedAt` kosong atau sudah lewat `Plan.periodDays`, periode di-reset dari
sekarang dan kuota diisi ulang dari `Plan.monthlyTokenLimit`. Logika ada di
`ensureQuotaPeriod()` ([`src/lib/subscription.ts`](../src/lib/subscription.ts)),
dipanggil dari preflight & dashboard dengan guard DB (`updateMany where planStartedAt = nilai lama`)
supaya dua request paralel tidak saling menimpa.

**Plan berbayar tidak ikut bergulir otomatis** — kalau ikut, user akan dapat
kuota gratis setelah masa aktifnya habis. Periode plan berbayar hanya berubah
lewat pembelian (`purchasePlan`) atau pemberian admin (`grantPlan`).

### 8.2 Limit belanja per API key

`ApiKey.monthlyLimitIdr` = batas belanja key **per periode plan berjalan**.

Dihitung dari `chargedIdr` (yang benar-benar dipotong dari saldo), bukan
`costIdr`:

```sql
SELECT COALESCE(SUM("chargedIdr"), 0)
FROM "UsageLog"
WHERE "apiKeyId" = $1
  AND "createdAt" >= user.planStartedAt
  AND status <> 'REJECTED';
```

Konsekuensi: plan SUBSCRIPTION (`chargedIdr = 0`) otomatis tidak pernah
menyentuh batas ini — konsisten dengan "tanpa potong saldo". Terlampaui → 429
`key_quota_exceeded`.

> **Catatan implementasi:** counter di Redis belum dipakai di fase ini — kuota
> & limit dihitung langsung dari agregat `UsageLog` di Postgres. Bila volume
> membesar, tambahkan counter Redis (`quota:{userId}:{periodStart}`) yang
> di-increment per settle dengan fallback ke DB.

---

## 9. Invoice

- **Top-up:** invoice dibuat saat `Transaction` PAID. `GET /api/billing/invoices/:id` → JSON/PDF.
- **Pembelian plan:** satu baris `Subscription` = satu invoice (snapshot `priceIdr`, `days`, `billingMode`, `tokenQuota`).
- Nomor invoice: `INV-{YYYYMM}-{seq}`. Simpan nomor & snapshot total di `Transaction`/tabel invoice (fase awal: derive dari Transaction/Subscription).

Contoh JSON invoice pembelian plan:

```json
{
  "invoiceNumber": "INV-202408-000123",
  "issuedAt": "2024-08-01T00:00:00Z",
  "user": { "email": "user@example.com", "name": "Budi" },
  "items": [{ "description": "Plan Pro · 30 hari", "amountIdr": 100000 }],
  "totalIdr": 100000,
  "status": "PAID"
}
```

Contoh JSON invoice:

```json
{
  "invoiceNumber": "INV-202408-000123",
  "issuedAt": "2024-08-01T00:00:00Z",
  "user": { "email": "user@example.com", "name": "Budi" },
  "items": [{ "description": "Top-up saldo", "amountIdr": 100000 }],
  "totalIdr": 100000,
  "status": "PAID"
}
```

---

## 10. Rekonsiliasi saldo

Job harian:

```ts
async function reconcileBalances() {
  const users = await db.user.findMany({ select: { id: true, balance: true } });
  for (const u of users) {
    const agg = await db.balanceLedger.aggregate({ where: { userId: u.id }, _sum: { deltaIdr: true } });
    const expected = agg._sum.deltaIdr ?? 0;
    if (expected !== u.balance) {
      await alert('balance_mismatch', { userId: u.id, db: u.balance, ledger: expected });
      // koreksi otomatis opsional (buat entri ADJUSTMENT) — butuh review manual
    }
  }
}
```

Selisih menandakan bug; jangan auto-koreksi tanpa review, tapi alert keras.

---

## 11. Edge cases & failure modes

| Kasus | Penanganan |
|---|---|
| 9Router tidak kirim usage | fallback `estimateTokens` |
| Stream putus setelah sebagian | status `PARTIAL`, tagih token terkumpul |
| Settle gagal (DB down) | request balas sukses tapi **harus** masuk antrean retry; tulis ke Redis queue untuk settle ulang → JANGAN hilang (lihat [18-MONITORING.md](./18-MONITORING.md)) |
| Dobel settle (retry) | `requestId` unique mencegah |
| Saldo kurang saat settle | tagih 0, status ERROR, log; user tetap respons |
| Harga model berubah di tengah bulan | harga dibaca saat settle (real-time); dokumentasikan bahwa harga bisa berubah |
| Refund besar | butuh persetujuan admin + audit |

**Penting:** kegagalan settle (setelah user sudah dapat respons) harus tetap diproses lewat antrean. Data uang tidak boleh hilang. Implementasi minimal: tulis job ke Redis list; worker/cron memproses; alert bila antrean menumpuk.

---

## 12. Referensi

- Skema & ledger → [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md)
- Top-up & webhook → [11-PAYMENT-GATEWAY.md](./11-PAYMENT-GATEWAY.md)
- Rate limit & guard Redis → [12-RATE-LIMITING.md](./12-RATE-LIMITING.md)
- Stream settle → [09-STREAMING.md](./09-STREAMING.md)
- Monitoring & alert → [18-MONITORING.md](./18-MONITORING.md)