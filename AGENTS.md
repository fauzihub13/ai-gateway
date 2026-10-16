# TASK: Generate Complete Project Documentation Files (.md)

Kamu adalah senior software architect + tech writer. Tugasmu adalah membuat **paket dokumentasi `.md` lengkap, detail, dan production-ready** untuk sebuah project. Setiap file `.md` fokus pada **satu concern** dan tidak boleh tumpang tindih dengan file lain.

## PROJECT CONTEXT

Saya sedang membangun **platform yang menjual API key AI** dari berbagai provider (OpenAI, Anthropic, Google, dll). Platform ini menggunakan **9Router** sebagai engine internal (AI gateway) yang sudah live di production.

**Pembagian peran:**
- **9Router** = internal backend milik saya, menyimpan kredensial provider upstream, routing ke model, handle streaming & failover. User TIDAK BOLEH tahu 9Router ada.
- **Platform saya** = website customer-facing tempat user register, top-up saldo, pilih model, generate API key, dan pakai API. User hanya berinteraksi dengan platform saya.
- **User** = developer yang beli API key. Mereka hanya lihat: base URL platform saya (`https://api.kamu.com/v1`), API key yang saya terbitkan (`sk-kamu-xxx`), nama model versi saya (`gpt-4o`), harga jual saya, dan dashboard saya.

**Yang user TIDAK lihat:**
- URL 9Router
- Gateway key 9Router
- Nama internal model (mis. `gh/gpt-4o`)
- Provider upstream (GitHub Copilot, Kiro, Antigravity, dll)
- Dashboard 9Router
- Harga upstream

**Fitur platform:**
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

**Tech stack yang saya pakai:**
- Next.js 14 (App Router, TypeScript)
- PostgreSQL + Prisma ORM
- Redis (Upstash) untuk rate limit
- Midtrans untuk payment
- Resend untuk email
- Sentry untuk error tracking
- Deploy: Vercel + VPS untuk 9Router (private network)

**Batasan teknis 9Router yang sudah saya ketahui:**
- Endpoint kompatibel OpenAI di `/v1`
- Default `stream` di 9Router adalah `true` (beda dari OpenAI yang default `false`) → platform harus selalu kirim `stream` eksplisit
- Kadang `[DONE]` sentinel hilang di akhir stream → platform harus inject sendiri kalau perlu
- Usage metadata di stream tergantung provider upstream → platform harus siap fallback estimasi
- Model naming pakai format `{prefix}/{model}` (mis. `gh/gpt-4o`, `kr/claude-sonnet-4.5`)
- Gateway key dari dashboard 9Router, dikirim via header `Authorization: Bearer`

## OUTPUT YANG DIMINTA

Buatkan **22 file `.md`** dengan struktur & nama berikut. Setiap file harus **detail, actionable, dan siap di-copy** oleh developer. Sertakan **code example (TypeScript)** di file yang relevan, **diagram ASCII** untuk alur, dan **tabel** untuk data terstruktur.

### Struktur folder output:

```
docs/
├── 00-README.md
├── 01-ARCHITECTURE.md
├── 02-TECH-STACK.md
├── 03-FLOW-LOGIC.md
├── 04-DATABASE-SCHEMA.md
├── 05-API-CONTRACT.md
├── 06-AUTH-SYSTEM.md
├── 07-API-KEY-MANAGEMENT.md
├── 08-MODEL-MAPPING.md
├── 09-STREAMING.md
├── 10-BILLING-USAGE.md
├── 11-PAYMENT-GATEWAY.md
├── 12-RATE-LIMITING.md
├── 13-SECURITY.md
├── 14-ERROR-HANDLING.md
├── 15-UI-UX.md
├── 16-ADMIN-PANEL.md
├── 17-DEPLOYMENT.md
├── 18-MONITORING.md
├── 19-TESTING.md
├── 20-GO-LIVE-CHECKLIST.md
└── 21-TROUBLESHOOTING.md
```

### Spesifikasi setiap file:

**`00-README.md`** — Overview project, index semua file `.md` dengan link relatif, prinsip utama, quick start guide, konvensi penamaan (public vs internal model, gateway key vs user API key), glossary singkat.

**`01-ARCHITECTURE.md`** — Diagram arsitektur makro (ASCII), daftar komponen (frontend, backend API, data layer, external services), alur request lengkap dari user sampai upstream, boundary & trust level, skenario failover, scaling considerations, non-goals.

**`02-TECH-STACK.md`** — Tabel stack per layer dengan alasan pemilihan, versi minimum, alternatif untuk setiap komponen, contoh `package.json` lengkap dengan dependencies & scripts, batasan versi.

**`03-FLOW-LOGIC.md`** — State machine user & API key, alur registrasi, top-up, generate key, request chat completion (stream & non-stream), model access decision tree, billing calculation, usage recording idempotent, decision matrix (kondisi → HTTP → error code), timing SLA, concurrency & locking strategy.

**`04-DATABASE-SCHEMA.md`** — Prinsip desain, ERD ringkas, detail setiap tabel (kolom, tipe, constraint, index, aturan bisnis), Prisma schema lengkap siap pakai, seed data awal, migration strategy, query patterns untuk kasus umum (usage report, top user, dsb).

**`05-API-CONTRACT.md`** — Kontrak API publik (endpoint `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`) dengan request/response schema, contoh curl, error codes. Kontrak API internal (auth, keys, billing, admin) dengan method, path, body, response. Format error standard (sesuai OpenAI spec). Rate limit headers. Versioning strategy.

**`06-AUTH-SYSTEM.md`** — Flow registrasi, login, logout, verify email, forgot password, reset password. Session management (JWT + httpOnly cookie), role-based access (user, admin), middleware proteksi route, security best practices (password hashing, session rotation, CSRF).

**`07-API-KEY-MANAGEMENT.md`** — Format API key, generation algorithm, hashing dengan pepper, storage (hash + prefix saja), display strategy (hanya sekali muncul), lifecycle (create → use → revoke), multiple keys per user, per-key rate limit & spending limit, audit log, edge cases (key collision, lost key, migration).

**`08-MODEL-MAPPING.md`** — Konsep abstraksi public vs internal model, mapping table structure, cara tambah/update/hapus model, pricing strategy (markup per plan), model capability flags (stream, vision, tools), versioning model (mis. `gpt-4o-2024-08` vs alias), deprecation strategy, sync dengan 9Router models.

**`09-STREAMING.md`** — Kenapa streaming penting, SSE format spec, quirk 9Router (default `stream: true`, `[DONE]` hilang, usage tidak konsisten), strategi handle quirk, TransformStream implementation, accumulating usage dari stream, detecting stream end, injecting `[DONE]` kalau perlu, error handling di tengah stream, client-side consumption example (fetch + ReadableStream), testing streaming.

**`10-BILLING-USAGE.md`** — Konsep saldo & currency, usage log structure, billing calculation (dengan markup plan), atomic transaction untuk potong saldo, idempotency & retry handling, negative balance prevention, refund & adjustment, usage report queries (per user, per model, per day), quota & limit (monthly token limit untuk subscription plan), invoice generation.

**`11-PAYMENT-GATEWAY.md`** — Kenapa Midtrans, flow top-up end-to-end, Snap API integration, webhook handling (verifikasi signature, idempotency), status mapping (pending/paid/failed/expired), handling webhook retry, reconciliation (kalau webhook hilang), refund flow, testing dengan Midtrans sandbox, security (jangan trust client, verifikasi server-side).

**`12-RATE-LIMITING.md`** — Multi-level rate limit (per IP, per user, per API key), algoritma (sliding window vs token bucket), Redis implementation dengan Upstash, header rate limit (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`), 429 response format, abuse detection (sudden spike, many keys, unusual patterns), grace period & burst allowance, fallback kalau Redis down.

**`13-SECURITY.md`** — Threat model, secret management (env, jangan commit, rotate), API key security (hash, pepper, tidak log full key), network isolation (9Router di private network), WAF & DDoS (Cloudflare), SQL injection prevention (Prisma), XSS prevention (React default + CSP), CSRF protection, input validation (Zod), output sanitization, audit logging, compliance considerations (GDPR, UU PDP), incident response plan.

**`14-ERROR-HANDLING.md`** — Error hierarchy & codes, mapping error 9Router → error publik (jangan bocorkan detail internal), format error standard (sesuai OpenAI), HTTP status code mapping, retryable vs non-retryable, user-facing error messages (i18n ready), logging strategy (apa yang di-log, apa yang di-redact), alerting threshold, error budget.

**`15-UI-UX.md`** — Sitemap lengkap, wireframe tiap halaman (landing, pricing, docs, login, register, dashboard, keys, usage, billing, playground, settings), komponen reusable (Button, Card, Table, Modal, Chart), design system (color, typography, spacing), responsive strategy, accessibility (WCAG), loading states, empty states, error states, dark mode.

**`16-ADMIN-PANEL.md`** — Fitur admin (manage users, models, plans, transactions, monitoring, audit log), permission model, halaman detail (user detail, model detail, transaction detail), bulk operations, export data (CSV/Excel), impersonation (opsional dengan audit), admin activity log, emergency actions (suspend all, disable model).

**`17-DEPLOYMENT.md`** — Environment setup (dev, staging, prod), environment variables lengkap dengan deskripsi, database migration strategy, deploy Next.js ke Vercel, deploy 9Router ke VPS (firewall, private network, systemd service), Cloudflare setup (DNS, WAF, cache rules), CI/CD dengan GitHub Actions, rollback strategy, backup & restore (DB, env, secrets).

**`18-MONITORING.md`** — Metrics yang di-track (request rate, latency p50/p95/p99, error rate, cost per request, token usage), tools (Sentry, Axiom, Better Stack), dashboard setup, alerting rules (kapan alert, threshold, channel), log retention policy, tracing (request ID propagation), health check endpoints, status page (opsional).

**`19-TESTING.md`** — Testing pyramid (unit, integration, E2E), tools (Vitest, Playwright), test coverage target, contoh test untuk kritikal path (auth, API key validation, billing calculation, streaming), mocking 9Router & Midtrans, load testing (k6), security testing (OWASP top 10), test data management, CI integration.

**`20-GO-LIVE-CHECKLIST.md`** — Checklist pre-launch: security (secrets, headers, firewall), performance (load test, caching), reliability (backup, monitoring, alerting), compliance (ToS, privacy policy, refund policy), documentation (user docs, API docs, status page), operational (runbook, on-call, escalation), business (pricing verified, payment tested, legal). Format checklist dengan checkbox.

**`21-TROUBLESHOOTING.md`** — Common issues & solutions: user tidak bisa akses API (cek list), streaming error (cek list), billing mismatch (cek list), 9Router connection (cek list), payment webhook tidak masuk (cek list), performance degradation (cek list). Debugging tools (log query, DB query, Redis inspect), escalation path, contact info, known limitations.

## ATURAN PENULISAN

1. **Bahasa:** Indonesia, tapi istilah teknis (API, endpoint, request, response, streaming, dll) tetap dalam bahasa Inggris.
2. **Format:** Markdown dengan heading `##` dan `###`, tabel untuk data terstruktur, code block dengan language tag.
3. **Detail level:** Setiap file minimal 300 baris (kecuali README & checklist). Sertakan contoh konkret, bukan teori abstrak.
4. **Code example:** TypeScript untuk backend, TSX untuk frontend, bash untuk command, SQL untuk query, JSON untuk payload.
5. **Diagram:** ASCII art untuk arsitektur & flow. Jangan pakai Mermaid (biar portable).
6. **Konsistensi:** Nama variabel, endpoint, model harus konsisten antar file. Contoh: selalu `gpt-4o` (public) dan `gh/gpt-4o` (internal).
7. **Tidak boleh overlap:** Kalau suatu topik sudah dibahas di file lain, cukup referensi dengan link relatif (mis. "lihat [08-MODEL-MAPPING.md](./08-MODEL-MAPPING.md)").
8. **Actionable:** Setiap file harus bisa langsung dipakai developer untuk implementasi, bukan cuma teori.
9. **Edge cases:** Sertakan edge cases & failure modes di setiap flow.
10. **Jangan placeholder:** Jangan tulis "TODO" atau "akan diisi nanti". Kalau tidak yakin, buat asumsi yang wajar dan tulis asumsinya.

## FORMAT OUTPUT

Untuk setiap file, output dengan format:

```
=== FILE: docs/XX-NAMA.md ===

[isi file lengkap dalam markdown]

=== END FILE ===
```

Pisahkan setiap file dengan pemisah yang jelas. Jangan gabungkan beberapa file dalam satu output — saya akan copy-paste satu per satu.

## URUTAN GENERATE

Generate dalam urutan berikut supaya konteks tetap terjaga:

1. `00-README.md`
2. `01-ARCHITECTURE.md`
3. `02-TECH-STACK.md`
4. `03-FLOW-LOGIC.md`
5. `04-DATABASE-SCHEMA.md`
6. `05-API-CONTRACT.md`
7. `06-AUTH-SYSTEM.md`
8. `07-API-KEY-MANAGEMENT.md`
9. `08-MODEL-MAPPING.md`
10. `09-STREAMING.md`
11. `10-BILLING-USAGE.md`
12. `11-PAYMENT-GATEWAY.md`
13. `12-RATE-LIMITING.md`
14. `13-SECURITY.md`
15. `14-ERROR-HANDLING.md`
16. `15-UI-UX.md`
17. `16-ADMIN-PANEL.md`
18. `17-DEPLOYMENT.md`
19. `18-MONITORING.md`
20. `19-TESTING.md`
21. `20-GO-LIVE-CHECKLIST.md`
22. `21-TROUBLESHOOTING.md`

## MULAI

Mulai dari file pertama (`00-README.md`). Setelah selesai satu file, tanya saya: "Lanjut ke file berikutnya?" supaya saya bisa review dulu.

Kalau output terlalu panjang untuk satu response, bagi jadi beberapa bagian dan beri tahu saya di bagian mana kita berhenti.

## CATATAN
Kalau konteks hampir penuh, prioritaskan menyelesaikan file yang sedang dikerjakan dulu. Jangan mulai file baru sebelum file saat ini selesai. Beri tahu saya nomor file terakhir yang selesai supaya saya bisa lanjut di sesi baru dengan konteks: "Lanjutkan dari file XX, konteks project sama seperti sebelumnya."