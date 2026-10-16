# 03 — Flow & Logic

State machine, alur bisnis end-to-end, decision tree, decision matrix, SLA, dan strategi concurrency. Untuk detail teknis spesifik, dokumen ini merujuk ke file lain.

---

## 1. State machine

### 1.1 User lifecycle

```
                  ┌──────────────┐
                  │  (unregistered)│
                  └──────┬───────┘
       register          │
                  ┌──────▼───────┐
                  │ PENDING_EMAIL │◀── verify email token expire → resend
                  └──────┬───────┘
          verify email   │
                  ┌──────▼───────┐
                  │   ACTIVE      │◀── login/logout (state tetap ACTIVE)
                  └──┬────┬───────┘
      admin suspend  │    │ user deactivate
                  ┌──▼─┐ ┌▼────────┐
                  │SUSPENDED│ │DEACTIVATED│
                  └──┬─┘ └────┬────┘
        admin unsuspend │      │ (soft delete, data tetap)
                  ┌──▼─────────▼─┐
                  ▼              ▼
              (ACTIVE)      (terminal)
```

| Status | Bisa login | Bisa pakai API | Catatan |
|---|---|---|---|
| `PENDING_EMAIL` | tidak | tidak | belum verifikasi |
| `ACTIVE` | ya | ya | normal |
| `SUSPENDED` | ya (read-only) | tidak | pelanggaran/ToS |
| `DEACTIVATED` | tidak | tidak | user minta hapus |

### 1.2 API Key lifecycle

```
   ┌──────────┐  create   ┌────────┐  revoke   ┌──────────┐
   │ (none)    │──────────▶│ ACTIVE │──────────▶│ REVOKED  │
   └──────────┘           └───┬────┘           └──────────┘
                              │ expire (auto)        ▲
                              ▼                      │
                          ┌─────────┐  user/admin revoke
                          │ EXPIRED │────────────────┘
                          └─────────┘
```

| Status | Efek |
|---|---|
| `ACTIVE` | bisa dipakai |
| `REVOKED` | ditolak 401 `invalid_api_key`, tidak bisa di-un-revoke |
| `EXPIRED` | ditolak, bisa dibuat key baru |

### 1.3 Transaction (top-up) lifecycle

```
  ┌─────────┐ create  ┌──────────┐  webhook paid   ┌────────┐
  │ (none)  │────────▶│ PENDING  │────────────────▶│  PAID  │
  └─────────┘         └────┬─────┘                 └────────┘
                           │ webhook deny/expire/refund
                           ▼
                    ┌───────────┐
                    │ FAILED /  │
                    │ EXPIRED   │
                    └───────────┘
```

Detail → [11-PAYMENT-GATEWAY.md](./11-PAYMENT-GATEWAY.md).

### 1.4 Request (usage) lifecycle

```
  RECEIVED → AUTHORIZED → UPSTREAM → COMPLETED ─┐
                │             │                 ├─▶ BILLED
                │             │                 │
   (ditolak) ───┘             └─(gagal)─────────┴─▶ NOT_BILLED
```

`UsageLog.status`: `completed`, `partial`, `error`, `rejected` (rejected = ditolak sebelum ke upstream).

---

## 2. Alur registrasi

```
User → GET /register → isi form (email, password)
     → POST /api/auth/register
            1. validasi Zod (email format, password ≥ 8, konfirmasi)
            2. cek email belum terdaftar (unique)
            3. hash password (argon2)
            4. buat User status PENDING_EMAIL + default plan "basic"
            5. buat VerificationToken (TTL 24 jam)
            6. kirim email verifikasi (Resend)
            7. balas 201 (JANGAN bocorkan apakah email sudah ada — balas generik)
     → User klik link: GET /verify?token=...
            1. validasi token (belum dipakai, belum expire)
            2. set User.status = ACTIVE, tandai token terpakai
            3. buat saldo awal 0 (record Balance)
            4. redirect ke /login?verified=1
```

**Edge cases:**
- Email sudah terdaftar → tetap balas 201, kirim email "sudah terdaftar" (jangan user enumeration).
- Token expired → halaman menawarkan resend.
- Token dipakai dua kali → tolak, arahkan login.

---

## 3. Alur top-up saldo

```
User → /dashboard/billing → pilih nominal (mis. Rp100.000)
     → POST /api/billing/topup { amount }
            1. validasi amount (min Rp10.000, kelipatan 1.000, max Rp50jt)
            2. buat Transaction { status: PENDING, orderId: TRX-<nanoid> }
            3. panggil Midtrans Snap createTransaction
            4. simpan snapToken + redirectUrl
            5. balas { redirectUrl }
     → User bayar di Snap
     → Midtrans → POST /api/billing/webhook
            1. verifikasi signature (SHA512 order_id+status_code+gross_amount+serverKey)
            2. idempotency: cek transaction.status sudah PAID? → abaikan
            3. map status → PAID/FAILED/EXPIRED
            4. bila PAID: tambah saldo (atomic), tulis BalanceLedger
            5. balas 200 (WAJIB cepat; proses berat async bila perlu)
     → Saldo user bertambah, tampil di dashboard
```

Detail → [11-PAYMENT-GATEWAY.md](./11-PAYMENT-GATEWAY.md).

---

## 4. Alur generate API key

```
User → /dashboard/keys → "Create key"
     → POST /api/keys { name, scope: "full"|"models", models?: [], rpmLimit?, monthlyLimit? }
            1. auth session (JWT cookie) + cek plan akses
            2. validasi Zod
            3. generate: raw = "sk-mpruy-" + base62(32 byte acak)
            4. hash = sha256(raw + PEPPER), prefix = raw.slice(0, 12) (display)
            5. simpan ApiKey { hash, prefix, last4, userId, ... } — RAW TIDAK DISIMPAN
            6. balas raw SEKALI ke user (hanya saat ini)
     → UI tampilkan modal "copy sekarang, tidak akan tampil lagi"
```

**Edge cases:** key collision (astronomis kecil; retry generate bila hash sudah ada), user lupa key (tidak bisa dilihat — harus buat baru), revoke lalu buat lagi (boleh, banyak key per user).

Detail → [07-API-KEY-MANAGEMENT.md](./07-API-KEY-MANAGEMENT.md).

---

## 5. Alur chat completion

### 5.1 Non-stream

```
Client → POST /v1/chat/completions  { stream: false }
  [auth]      hash key → lookup → ok?
  [plan]      key scope mengizinkan model?
  [limit]     per-key & per-user rate limit lolos?
  [balance]   saldo > 0 & quota plan belum habis?
  [map]       public model → internal model
  [upstream]  POST 9Router (stream:none/false) → JSON
  [settle]    usage = response.usage ?? estimate(messages, content)
              biaya = f(usage, model, plan.markup)
              ALWAYS potong saldo + tulis UsageLog dalam satu transaksi
  [respond]   JSON OpenAI-normalized + header rate limit
```

### 5.2 Stream

```
Client → POST /v1/chat/completions  { stream: true }
  [pre-flight] sama seperti 5.1 langkah auth..map
  [upstream]   POST 9Router (stream: true) → ReadableStream SSE
  [transform]  TransformStream:
                 - parse tiap `data: {...}` chunk
                 - rewrite model internal → public
                 - forward delta ke client
                 - akumulasi: content, role, finish_reason, usage
  [end]        detect `[DONE]`; bila absen → inject `data: [DONE]\n\n`
  [settle]     after stream close: usage (chunk usage ?? estimate)
                 potong saldo + UsageLog (status completed/partial)
  [respond]    SSE selesai; header rate limit dikirim di awal
```

Detail quirk & implementasi → [09-STREAMING.md](./09-STREAMING.md).

---

## 6. Model access decision tree

```
Request model "X" dari user dengan plan P, key K
│
├─ Model X ada di tabel Model & active? ──tidak──▶ 404 model_not_found
│
├─ Plan P punya akses ke X? ──tidak──▶ 403 model_not_allowed
│      (plan_models: basic ⊂ pro ⊂ enterprise, configurable)
│
├─ Key K scope:
│     ├─ scope="full" → semua model plan boleh
│     └─ scope="models" → X harus ada di K.allowedModels ──tidak──▶ 403 model_not_in_key_scope
│
├─ Saldo user > 0? ──tidak──▶ 402 insufficient_balance
│
├─ Quota bulanan plan belum habis? ──habis──▶ 429 quota_exceeded
│
└─ LOLOS → resolve internal model → forward ke 9Router
```

---

## 7. Billing calculation

```
cost_idr = (prompt_tokens  / 1000 * price_in_per_1k  * markup)
         + (completion_tokens / 1000 * price_out_per_1k * markup)

where:
  price_in_per_1k, price_out_per_1k = harga dasar model (di tabel Model, IDR)
  markup = faktor per plan (mis. basic 1.5, pro 1.35, enterprise 1.2)
           — ATAU harga final per plan langsung disimpan (lihat [08-MODEL-MAPPING.md])

director: simpan hasil dalam satuan Rupiah pecahan terkecil agar presisi
  → simpan sebagai Int (sen? atau rupiah bulat?) → keputusan: simpan balance sebagai
    Int rupiah (Rp), pembulatan ke atas (ceil) ke rupiah terdekat ke arah AMAN (kami).
```

Aturan pembulatan: **ceil ke rupiah** bila harga pecahan, untuk mencegah kebocoran uang karena pembulatan bawah berulang. Contoh: biaya `Rp12.3` → tagih `Rp13`.

Atomic debit (pseudocode):

```ts
await db.$transaction(async (tx) => {
  const user = await tx.user.findUnique({
    where: { id: userId }, select: { balance: true },
  });
  if (user.balance < cost) throw new InsufficientBalance();
  await tx.user.update({
    where: { id: userId },
    data: { balance: { decrement: cost } },
  });
  await tx.usageLog.create({ data: { /* ... */ costIdr: cost } });
});
```

Idempotency: sertakan `requestId` unik; unique constraint di `UsageLog.requestId` mencegah dobel tagih saat retry.

Detail → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md).

---

## 8. Usage recording — idempotent

```
requestId = nanoid() dibuat di awal request (juga dikirim sebagai x-request-id)

settle():
  BEGIN TX
    INSERT UsageLog (requestId UNIQUE, ...)
       ├─ sukses → UPDATE balance (decrement)
       └─ unique violation (sudah ada) → ROLLBACK (sudah pernah dicatat) → no-op
  COMMIT
```

Karena `INSERT ... ON CONFLICT DO NOTHING` + decrement di transaksi yang sama, retry apa pun tidak menagih dua kali.

---

## 9. Decision matrix (kondisi → HTTP → error code)

| Kondisi | HTTP | `error.code` | Retryable user? |
|---|---|---|---|
| Header Authorization absen/malformed | 401 | `invalid_api_key` | setelah perbaiki |
| Key hash tidak ditemukan | 401 | `invalid_api_key` | tidak |
| Key revoked/expired | 401 | `invalid_api_key` | tidak |
| Body invalid (Zod) | 400 | `invalid_request_error` | setelah perbaiki |
| Model tidak ada | 404 | `model_not_found` | tidak |
| Plan/key tidak boleh model | 403 | `model_not_allowed` | tidak |
| Saldo habis | 402 | `insufficient_balance` | setelah top-up |
| Quota bulanan habis | 429 | `quota_exceeded` | bulan depan/upgrade |
| Rate limit per key | 429 | `rate_limit_exceeded` | ya (setelah reset) |
| Rate limit per IP | 429 | `rate_limit_exceeded` | ya |
| 9Router timeout/5xx | 503 | `upstream_unavailable` | ya |
| 9Router 400 (model invalid internal) | 502 | `upstream_error` | tidak |
| Provider upstream rate limited | 429 | `upstream_rate_limited` | ya |
| Error tak terduga | 500 | `internal_error` | ya (laporkan) |

Format error lengkap → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md).

---

## 10. Timing SLA (target internal)

| Tahap | Target p50 | Target p95 | Batas keras |
|---|---|---|---|
| Auth + rate limit + balance check | < 15 ms | < 50 ms | 500 ms |
| Model resolution | < 3 ms | < 10 ms | — |
| Connect ke 9Router (TTFB) | < 300 ms | < 1.200 ms | 15 s connect timeout |
| First token (stream) | < 700 ms | < 2.500 ms | 30 s |
| Full non-stream (500 token) | < 2 s | < 6 s | 120 s |
| Billing settle (post-response) | < 20 ms | < 60 ms | — |
| Webhook end-to-end | < 100 ms | < 300 ms | 5 s (Midtrans timeout) |

Bila p95 di atas target 2 jam berturut-turut → alert (lihat [18-MONITORING.md](./18-MONITORING.md)).

---

## 11. Concurrency & locking

Masalah: user kirim 20 request paralel, semua cek saldo Rp100 lalu semua lolos, tagih total > Rp100 → saldo negatif.

Strategi berlapis:

1. **Redis balance guard (optimistik cepat):**
   `DECRBY` counter saldo yang dicache; bila hasil < 0 → tolak sebelum ke upstream. Nilai disinkronkan berkala dari DB.
2. **DB atomic decrement + cek (otoritatif):**
   Transaksi `SELECT ... FOR UPDATE` (row lock per user) atau `UPDATE ... SET balance = balance - cost WHERE id = ? AND balance >= cost`, cek `rowcount`. Bila 0 → tolak.
3. **Redis mutex per-user (opsional):** serialisasi settle untuk user yang sama, mencegah kontensi lock DB tinggi.

```
Request paralel user U:
  Redis fast-guard  → biarkan ≤ budget lewat
  DB settle (lock)  → yang benar-benar memotong; sisanya gagal dengan 402
  Reconcile         → cache Redis di-set ulang = saldo DB sebenarnya
```

Pre-auth hold (DTO) sengaja dihindari fase awal karena over-charge & kompleksitas. Namun untuk request **non-stream besar**, boleh estimasi biaya maksimum & reservasi via Redis guard, dilepas saat settle.

---

## 12. Referensi

- Skema data & transaksi → [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md)
- Billing detail → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md)
- Stream → [09-STREAMING.md](./09-STREAMING.md)
- Error → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)