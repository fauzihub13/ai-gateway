# 01 — Architecture

Dokumen ini menjelaskan arsitektur makro platform Mpruy AI: komponen, boundary trust, alur request end-to-end, failover, dan pertimbangan scaling.

---

## 1. Prinsip arsitektur

1. **9Router tidak pernah terekspos.** Semua trafik ke 9Router keluar dari server platform, di jaringan privat. User hanya melihat domain platform.
2. **Satu pintu masuk.** Semua request chat masuk lewat proxy platform (`/v1/*`) agar auth, rate limit, billing, dan normalisasi bisa diterapkan seragam.
3. **Stateless app layer.** Next.js API route stateless; state di PostgreSQL + Redis. Memudahkan scale horizontal.
4. **Uang tidak boleh salah.** Setiap perubahan saldo lewat transaksi DB atomik + idempotency key.
5. **Normalisasi ke spec OpenAI.** Baik stream maupun non-stream, output ke user selalu spec OpenAI apa pun quirk provider upstream.
6. **Fail closed untuk hal sensitif** (auth, billing), **fail open untuk non-kritis** (mis. Redis down → rate limit dilonggarkan, lihat [12-RATE-LIMITING.md](./12-RATE-LIMITING.md)).

---

## 2. Diagram arsitektur makro

```
                          ┌──────────────────────────────────────────────┐
                          │                   INTERNET                    │
                          │   (Cloudflare: DNS, WAF, DDoS, TLS)          │
                          └───────────────────────┬──────────────────────┘
                                                  │ HTTPS
          ┌───────────────────────────────────────┼───────────────────────────────────────┐
          │                                       ▼                                        │
          │                        ┌──────────────────────────────┐                        │
          │                        │        VERCEL EDGE            │                        │
          │                        │  routing + static + CDN       │                        │
          │                        └──────────────┬───────────────┘                        │
          │                                       │                                        │
          │            ┌──────────────────────────┴──────────────────────────┐            │
          │            ▼                                                     ▼            │
          │  ┌───────────────────────┐                     ┌───────────────────────────┐  │
          │  │  Next.js 14 UI        │                     │  Next.js 14 API Routes    │  │
          │  │  (App Router, RSC)    │                     │  ┌─────────────────────┐  │  │
          │  │  dashboard/docs/      │                     │  │ /api/auth/*         │  │  │
          │  │  playground/pricing   │                     │  │ /api/keys/*         │  │  │
          │  └───────────────────────┘                     │  │ /api/billing/*      │  │  │
          │                                                 │  │ /api/admin/*        │  │  │
          │                                                 │  │ /v1/chat/completions│━━┿━━┓
          │                                                 │  │ /v1/models          │  │  │
          │                                                 │  │ /v1/embeddings      │  │  │
          │                                                 │  └─────────────────────┘  │  │
          │                                                 └───────┬───────────┬───────┘  │
          │                                                         │           │          │
          │                        ┌────────────────────────────────┘           │          │
          │                        ▼                                            ▼          │
          │              ┌──────────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
          │              │  PostgreSQL      │   │  Redis (Upstash) │   │ External Svc    │  │
          │              │  (Prisma)        │   │  rate limit, cache│  │ - Midtrans      │  │
          │              │  users, keys,    │   │  balance guard,  │   │ - Resend (email)│  │
          │              │  usage, billing  │   │  idempotency     │   │ - Sentry        │  │
          │              └──────────────────┘   └──────────────────┘   └─────────────────┘  │
          │                                                                                  │
          └───────────────────────────────┬──────────────────────────────────────────────────┘
                                          │  PRIVATE NETWORK (WireGuard / VPC peering / tunnel)
                                          │  Authorization: Bearer <GATEWAY_KEY>
                                          ▼
                          ┌──────────────────────────────────────────────┐
                          │              9Router (VPS, private)           │
                          │  OpenAI-compatible /v1                        │
                          │  - simpan kredensial upstream                 │
                          │  - routing model ({prefix}/{model})           │
                          │  - streaming & failover antar provider        │
                          └──────────────┬───────────────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
      ┌───────────────┐         ┌───────────────┐          ┌───────────────┐
      │ GitHub Copilot│         │  Anthropic    │          │  Google / dll │
      │  (gh/...)     │         │  (kr/...)     │          │  (gm/...)     │
      └───────────────┘         └───────────────┘          └───────────────┘
```

---

## 3. Komponen

| Komponen | Peran | Teknologi | Trust level |
|---|---|---|---|
| Edge/CDN | TLS, WAF, DDoS, cache statis | Cloudflare | Untrusted perimeter |
| Frontend UI | Halaman & dashboard | Next.js 14 RSC + TSX | — |
| API Routes | Auth, keys, billing, admin | Next.js Route Handlers | Trusted app code |
| **Proxy `/v1/*`** | Terjemah user key → 9Router, normalisasi stream, billing | Next.js Route Handlers (Node runtime) | Trusted core |
| App DB | Sumber kebenaran data | PostgreSQL + Prisma | Trusted data |
| Cache/Guard | Rate limit, lock saldo, idempotency | Redis (Upstash) | Semi-trusted (fail-open) |
| Payment | Top-up saldo | Midtrans Snap + webhook | External untrusted |
| Email | Verifikasi, reset, invoice | Resend | External |
| Observability | Error, log, trace | Sentry + log platform | External |
| **9Router** | Gateway AI internal | Service di VPS | **Sangat trusted, terisolasi** |

---

## 4. Boundary & trust level

```
TRUST BOUNDARY #1 (Internet → Platform Edge)
  Input dari user/attacker. Semua divalidasi (Zod), tidak ada yang dipercaya.
  Cek: auth, rate limit, input sanitization.

TRUST BOUNDARY #2 (Platform App → Data Layer)
  App code dipercaya; akses DB lewat Prisma (parameterized).
  Cek: otorisasi kepemilikan resource (user hanya akses key/usage miliknya).

TRUST BOUNDARY #3 (Platform App → 9Router)  ★ paling sensitif
  Lintas jaringan privat. Kredensial gateway key hanya di server env.
  User tidak boleh pernah menyentuh boundary ini secara langsung.

TRUST BOUNDARY #4 (9Router → Upstream Provider)
  Di luar kendali platform; kredensial upstream dipegang 9Router.
```

Aturan: **data hanya mengalir "ke atas" (trust naik), request hanya mengalir "ke bawah" (trust turun)**. User tidak boleh memengaruhi apa pun di boundary #3 selain memilih model yang sudah di-whitelist.

---

## 5. Alur request lengkap (chat completion, stream)

```
[1] User → POST https://api.mpruy.ai/v1/chat/completions
        Authorization: Bearer sk-mpruy-xxx
        Body: { model: "gpt-4o", messages: [...], stream: true }

[2] Cloudflare: TLS, WAF rule, rate limit kasar per IP (opsional)

[3] Next.js Route Handler /v1/chat/completions
        a. Parse & validasi body (Zod). Wajibkan field `stream` ada (default di-set false oleh platform bila absen).
        b. Ambil raw key dari header → hash (SHA-256 + pepper) → lookup ApiKey
              ├─ tidak ada / revoked / expired → 401 invalid_api_key
              └─ ada → lanjut, dapat userId, planId, keyId
        c. Ceck scope model: apakah key boleh akses model ini? (lihat [08-MODEL-MAPPING.md])
        d. Rate limit: per key (Redis sliding window) → 429 kalau lewat
        e. Cek saldo & quota plan (Redis cache → fallback DB) → 402 kalau saldo habis
        f. Resolve model: public "gpt-4o" → internal "gh/gpt-4o" dari tabel Model

[4] Bangun request ke 9Router
        POST {NINE_ROUTER_URL}/v1/chat/completions
        Authorization: Bearer <GATEWAY_KEY>
        Body: { model: "gh/gpt-4o", messages, stream: <eksplisit true/false>, ... }

[5] 9Router → routing → upstream provider → balas (stream SSE atau JSON)

[6a] Non-stream:
        - Terima JSON, normalisasi (buang field internal, tambah `id`, `created`, `object`)
        - Baca usage dari response; kalau absen → estimasi token
        - Potong saldo atomik, tulis UsageLog
        - Balas JSON ke user

[6b] Stream:
        - Pipe SSE via TransformStream
        - Rewrite field model internal → public
        - Akumulasi content + usage dari chunk
        - Deteksi akhir: `[DONE]` ada? kalau tidak → inject `data: [DONE]\n\n`
        - Saat stream tutup: potong saldo (atomic), tulis UsageLog, kirim header usage (opsional)
        - Balas stream ke user

[7] Response header menyertakan rate limit info (X-RateLimit-*), request id (x-request-id)
```

Detail stream → [09-STREAMING.md](./09-STREAMING.md). Detail billing → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md).

---

## 6. Skenario failover

### 6.1 9Router down / timeout

```
Proxy → 9Router (timeout 30s untuk connect, 120s total stream)
  │
  ├─ Connection refused / 5xx → coba 1x retry (idempotent, hanya sebelum stream dimulai)
  │     ├─ masih gagal → balas 503 upstream_unavailable (TIDAK potong saldo)
  │     └─ sukses → lanjut normal
  │
  └─ Timeout setelah stream dimulai → tutup stream dengan error chunk spec OpenAI,
        potong saldo hanya untuk token yang benar-benar terkirim (estimasi),
        tulis UsageLog status "partial"
```

Aturan penting: **saldo hanya dipotong bila ada token yang benar-benar dihasilkan** (atau request 2xx dari upstream). Kegagalan koneksi tidak pernah menagih user.

### 6.2 Provider upstream tertentu down (di dalam 9Router)

Ditangani 9Router sendiri (routing & failover antar provider). Platform hanya melihat latency/error naik. Bila 9Router mengembalikan error model tidak tersedia, platform map ke error publik (lihat [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)).

### 6.3 DB down

- Request chat: **fail closed** → 503 (tidak bisa billing dengan aman).
- Halaman dashboard: tampilkan error state.

### 6.4 Redis down

- Rate limit: fail-open (log + alert), longgarkan limit sementara.
- Balance guard: fallback ke DB (lebih lambat, tapi benar).
- Idempotency: fallback ke unique constraint DB.

### 6.5 Payment webhook hilang

- Reconciliation job berkala (cron) query status ke Midtrans untuk transaksi `pending` > 15 menit → sinkronkan (lihat [11-PAYMENT-GATEWAY.md](./11-PAYMENT-GATEWAY.md)).

---

## 7. Scaling considerations

| Dimensi | Keputusan | Batas upgrade |
|---|---|---|
| App compute | Vercel serverless autoscale | Node runtime wajib untuk stream (bukan Edge) |
| Proxy throughput | Stateless, scale horizontal otomatis | Batasan: koneksi DB pool → pakai Prisma Accelerate / PgBouncer |
| DB | Postgres managed (Neon/Supabase/RDS) | Read replica saat usage report berat |
| Redis | Upstash serverless | — |
| Streaming | Long-lived connection | Perhatikan limit durasi function Vercel (plan) |
| 9Router | Single VPS | Scale ke beberapa node + load balancer internal |
| Billing contention | Lock per-user di Redis (mutex) agar potong saldo serial | Bila kontensi tinggi → row-level lock `SELECT ... FOR UPDATE` |
| Usage write | Batch/flush + indeks yang tepat | Partition `UsageLog` per bulan bila > 50M baris |

### 7.1 Estimasi beban awal

- 1.000 user, 100 request/user/hari → 100k request/hari ≈ 1.2 req/s rata-rata, puncak ~10 req/s.
- Rata-rata 1.500 token/request → 150M token/hari. Billing menulis 1 baris `UsageLog`/request → 100k write/hari (sangat ringan).

Dengan beban ini, single Postgres + serverless sudah cukup. Titik upgrade pertama: **koneksi DB** (pakai pooler) dan **batas durasi serverless untuk stream panjang**.

---

## 8. Non-goals (secara sengaja TIDAK dilakukan)

1. **Tidak membangun inference sendiri** — selalu lewat 9Router.
2. **Tidak menyimpan konten chat user** untuk training (hanya metadata usage; lihat kebijakan retensi di [13-SECURITY.md](./13-SECURITY.md)).
3. **Tidak multi-tenant 9Router** pada fase awal (satu gateway key platform).
4. **Tidak self-host model** atau GPU management.
5. **Tidak menyediakan fine-tuning / file upload** di fase awal.
6. **Tidak menjamin SLA provider upstream** — hanya menjamin gateway kami; status page menjelaskan ini.

---

## 9. Keputusan arsitektur (ADR singkat)

| # | Keputusan | Alasan | Alternatif ditolak |
|---|---|---|---|
| ADR-1 | Proxy di Next.js Route Handler (Node) | Satu codebase, mudah; Node mendukung stream | Service terpisah (Go/Node) — overhead ops |
| ADR-2 | Redis untuk rate limit & balance guard | Cepat, atomik (INCR/Lua) | In-memory (tidak scale lintas instance) |
| ADR-3 | Hash API key + pepper | Aman bila DB bocor | Enkripsi simetris (butuh kunci, kompleks) |
| ADR-4 | Public model mapping table | Menyembunyikan upstream & fleksibel ganti | Teruskan nama internal (bocor) |
| ADR-5 | Saldo dipotong setelah request | Tidak menagih kegagalan | Pre-auth hold (kompleks, over-charge) |
| ADR-6 | Cloudflare di depan | WAF/DDoS murah & cepat | Hanya Vercel firewall |

---

## 10. Referensi

- Alur & state machine → [03-FLOW-LOGIC.md](./03-FLOW-LOGIC.md)
- Skema data → [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md)
- Stream & quirk 9Router → [09-STREAMING.md](./09-STREAMING.md)
- Deploy & network isolation → [17-DEPLOYMENT.md](./17-DEPLOYMENT.md)