# Mpruy AI — Dokumentasi Teknis

**Mpruy AI** adalah platform yang **menjual API key AI** (OpenAI-compatible) dari berbagai provider upstream. Dibangun di atas **9Router** sebagai engine internal (AI gateway), dengan website customer-facing milik kami sendiri.

> **Prinsip utama:** User hanya berinteraksi dengan Mpruy AI. 9Router adalah backend privat yang tidak pernah terekspos ke user.

---

## 1. Apa yang user lihat vs tidak lihat

| Yang user lihat (publik) | Yang user TIDAK lihat (internal) |
|---|---|
| Base URL `https://api.mpruy.ai/v1` | URL 9Router |
| API key terbitan kami (`sk-mpruy-xxx`) | Gateway key 9Router |
| Nama model versi kami (`gpt-4o`) | Nama internal model (`gh/gpt-4o`) |
| Harga jual kami | Harga upstream provider |
| Dashboard kami | Dashboard 9Router |
| — | Provider upstream (GitHub Copilot, Kiro, Antigravity, dll) |

Detail konsep abstraksi model → [08-MODEL-MAPPING.md](./08-MODEL-MAPPING.md)

---

## 2. Ringkasan fitur

1. Auth user (register, login, verify email)
2. Generate & manage API key user (multiple keys, revoke, rate limit per key)
3. Pilih plan (basic, pro, enterprise) dengan limit & akses model berbeda
4. Top-up saldo via payment gateway (Midtrans)
5. Endpoint proxy `/v1/chat/completions` & `/v1/models` yang forward ke 9Router
6. Streaming SSE support (normalisasi output ke spec OpenAI)
7. Usage tracking & billing per request
8. Dashboard user (keys, usage, billing, playground)
9. Admin panel (manage users, models, pricing, transactions, monitoring)
10. Dokumentasi publik untuk user

---

## 3. Tech stack ringkas

| Layer | Teknologi |
|---|---|
| Frontend + Backend | Next.js 14 (App Router, TypeScript) |
| Database | PostgreSQL + Prisma ORM |
| Cache / Rate limit | Redis (Upstash) |
| Payment | Midtrans |
| Email | Resend |
| Error tracking | Sentry |
| Deploy | Vercel (platform) + VPS (9Router, private network) |
| AI engine internal | 9Router (OpenAI-compatible, `/v1`) |

Detail lengkap + `package.json` → [02-TECH-STACK.md](./02-TECH-STACK.md)

---

## 4. Index dokumentasi

| # | File | Isi |
|---|---|---|
| 00 | [00-README.md](./00-README.md) | Overview, index, glossary, quick start |
| 01 | [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) | Diagram makro, komponen, alur request, failover |
| 02 | [02-TECH-STACK.md](./02-TECH-STACK.md) | Stack per layer, versi, `package.json` |
| 03 | [03-FLOW-LOGIC.md](./03-FLOW-LOGIC.md) | State machine, alur registrasi/top-up/request, decision matrix |
| 04 | [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md) | Prisma schema, ERD, seed, query patterns |
| 05 | [05-API-CONTRACT.md](./05-API-CONTRACT.md) | Kontrak API publik & internal, format error |
| 06 | [06-AUTH-SYSTEM.md](./06-AUTH-SYSTEM.md) | Register, login, JWT, RBAC, middleware |
| 07 | [07-API-KEY-MANAGEMENT.md](./07-API-KEY-MANAGEMENT.md) | Format key, hashing, lifecycle, audit |
| 08 | [08-MODEL-MAPPING.md](./08-MODEL-MAPPING.md) | Public vs internal model, pricing, capability flags |
| 09 | [09-STREAMING.md](./09-STREAMING.md) | SSE, quirk 9Router, TransformStream |
| 10 | [10-BILLING-USAGE.md](./10-BILLING-USAGE.md) | Saldo, usage log, atomic billing, idempotency |
| 11 | [11-PAYMENT-GATEWAY.md](./11-PAYMENT-GATEWAY.md) | Midtrans Snap, webhook, reconciliation |
| 12 | [12-RATE-LIMITING.md](./12-RATE-LIMITING.md) | Multi-level limit, Redis, header, abuse detection |
| 13 | [13-SECURITY.md](./13-SECURITY.md) | Threat model, secret mgmt, WAF, compliance |
| 14 | [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md) | Error hierarchy, mapping 9Router → publik |
| 15 | [15-UI-UX.md](./15-UI-UX.md) | Sitemap, wireframe, design system |
| 16 | [16-ADMIN-PANEL.md](./16-ADMIN-PANEL.md) | Fitur admin, permission, bulk ops, audit |
| 17 | [17-DEPLOYMENT.md](./17-DEPLOYMENT.md) | Env, Vercel, VPS, Cloudflare, CI/CD |
| 18 | [18-MONITORING.md](./18-MONITORING.md) | Metrics, tools, alerting, tracing |
| 19 | [19-TESTING.md](./19-TESTING.md) | Unit/integration/E2E, mocking 9Router & Midtrans |
| 20 | [20-GO-LIVE-CHECKLIST.md](./20-GO-LIVE-CHECKLIST.md) | Checklist pre-launch |
| 21 | [21-TROUBLESHOOTING.md](./21-TROUBLESHOOTING.md) | Common issues, debugging tools, escalation |

---

## 5. Konvensi penamaan

Aturan konsisten di seluruh dokumentasi:

### 5.1 Model

- **Public model name** (yang user kirim): `gpt-4o`, `claude-sonnet-4.5`, `gemini-1.5-pro`
- **Internal model name** (format 9Router): `{prefix}/{model}` → `gh/gpt-4o`, `kr/claude-sonnet-4.5`

Mapping disimpan di tabel `Model` (lihat [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md)).

### 5.2 Kredensial

| Nama | Format | Dipakai oleh | Header |
|---|---|---|---|
| User API Key | `sk-mpruy-<32 base62>` | User → Mpruy AI | `Authorization: Bearer sk-mpruy-...` |
| Gateway Key 9Router | string dari dashboard 9Router | platform → 9Router | `Authorization: Bearer <gateway_key>` |

Jangan pernah campur keduanya. Platform **menerjemahkan** user API key menjadi request ke 9Router dengan gateway key.

### 5.3 Database

- Tabel: `PascalCase` singular (`User`, `ApiKey`, `UsageLog`)
- Kolom: `camelCase`
- Foreign key: `<model>Id`
- Timestamp: `createdAt`, `updatedAt`, `deletedAt` (soft delete)

### 5.4 Endpoint

- Publik (OpenAI-compatible): `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`
- Internal platform: `/api/...` (`/api/auth/login`, `/api/keys`, `/api/billing/...`)
- Admin: `/api/admin/...`

---

## 6. Glossary

| Istilah | Arti |
|---|---|
| **9Router** | AI gateway internal, OpenAI-compatible, menyimpan kredensial upstream & routing |
| **Gateway key** | Kredensial ke 9Router, hanya dipakai server platform |
| **User API key** | Kredensial `sk-mpruy-xxx` yang diterbitkan platform ke user |
| **Public model** | Nama model versi kami (`gpt-4o`) |
| **Internal model** | Nama model di 9Router (`gh/gpt-4o`) |
| **Plan** | Paket langganan (basic/pro/enterprise) dengan limit & akses model |
| **Balance** | Saldo Rupiah user, dipotong per request |
| **Usage log** | Catatan satu request (token in/out, biaya, model, status) |
| **Upstream** | Provider asli model (GitHub Copilot, Anthropic, dll) |
| **Markup** | Selisih harga jual kami di atas cost upstream |
| **SSE** | Server-Sent Events, protokol streaming token |
| **Idempotency** | Jaminan operasi sama tidak dobel efek (billing/webhook) |

---

## 7. Quick start (developer)

```bash
# 1. Clone & install
git clone <repo-url> mpruy-ai
cd mpruy-ai
npm install

# 2. Siapkan env
cp .env.example .env
# isi DATABASE_URL, REDIS_URL, NINE_ROUTER_URL, NINE_ROUTER_API_KEY, dll

# 3. Migrasi database
npx prisma migrate dev

# 4. Seed data awal (models, plans, admin user)
npx prisma db seed

# 5. Jalankan dev server
npm run dev
# → http://localhost:3000
```

Env variable lengkap → [17-DEPLOYMENT.md](./17-DEPLOYMENT.md)

---

## 8. Alur request singkat (high level)

```
User ──Authorization: Bearer sk-mpruy-xxx──▶ Platform /v1/chat/completions
                                                │
                                    1. auth: hash & lookup ApiKey
                                    2. rate limit (Redis)
                                    3. resolve model: gpt-4o → gh/gpt-4o
                                    4. cek saldo & akses plan
                                                │
                                                ▼
                                      9Router /v1/chat/completions
                                      (Authorization: Bearer <gateway_key>)
                                                │
                                                ▼
                                        Upstream provider
                                                │
                                    5. normalisasi stream (SSE)
                                    6. kumpulkan usage (fallback estimasi)
                                    7. potong saldo (atomic)
                                    8. tulis UsageLog
                                                │
                                                ▼
User ◀───────────── normalized OpenAI response ────────
```

Detail → [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) & [03-FLOW-LOGIC.md](./03-FLOW-LOGIC.md)

---

## 9. Batasan teknis 9Router (yang harus ditangani platform)

| Quirk | Dampak | Penanganan |
|---|---|---|
| `stream` default `true` (beda dari OpenAI) | Request non-stream bisa jadi stream | Platform **selalu** kirim `stream` eksplisit |
| `[DONE]` sentinel kadang hilang | Client gantung menunggu akhir | Platform inject `data: [DONE]` sendiri kalau perlu |
| Usage metadata tergantung upstream | Billing tidak akurat | Fallback estimasi token (tokenizer) |
| Model naming `{prefix}/{model}` | User kirim nama salah | Mapping table public → internal |
| Gateway key via Bearer | User tidak boleh tahu | Simpan di server, jangan pernah log |

Penanganan detail → [09-STREAMING.md](./09-STREAMING.md) & [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)

---

## 10. Konvensi dokumentasi ini

- Bahasa Indonesia; istilah teknis tetap Inggris.
- Diagram pakai ASCII (portable), bukan Mermaid.
- Setiap file fokus **satu concern**, saling referensi via link relatif.
- Setiap flow menyertakan **edge case & failure mode**.
- Contoh kode: TypeScript (backend), TSX (frontend), bash (CLI), SQL (query), JSON (payload).
- Asumsi yang diambil ditulis eksplisit (bukan placeholder "TODO").

---

## 11. Status & roadmap asumsi

Dokumentasi ini mengasumsikan:

- Platform baru dibangun (greenfield), 9Router sudah live di production.
- Skala awal: ~1.000 user, ~100k request/hari (petunjuk scaling di [01-ARCHITECTURE.md](./01-ARCHITECTURE.md)).
- Mata uang: IDR. Semua harga dalam Rupiah.
- 9Router dapat dijangkau platform via private network (Vercel → VPS tunnel/private IP).
- Gateway key 9Router bersifat single-tenant (satu key untuk platform).

Bila asumsi berubah (mis. multi-region, multi-tenant gateway), lihat catatan revisi di file terkait.

---

**Mulai baca dari:** [01-ARCHITECTURE.md](./01-ARCHITECTURE.md)