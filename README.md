# Mpruy AI

Platform yang **menjual API key AI (OpenAI-compatible)**. Dibangun di atas **9Router** sebagai gateway internal. User hanya melihat platform ini — URL 9Router, gateway key, dan nama model internal tidak pernah terekspos.

- **Frontend + Backend:** Next.js 14 (App Router, TypeScript)
- **Database:** PostgreSQL + Prisma ORM
- **Payment:** Midtrans (Snap)
- **Email:** Resend (SMTP)
- **AI engine internal:** 9Router (`/v1`)

> Dokumentasi arsitektur lengkap ada di [`docs/`](./docs/00-README.md). README ini fokus: **setup dari nol sampai jalan di lokal.**

---

## Daftar isi

1. [Prasyarat](#1-prasyarat)
2. [Setup PostgreSQL](#2-setup-postgresql)
3. [Setup 9Router](#3-setup-9router)
4. [Clone & Install](#4-clone--install)
5. [Environment variables](#5-environment-variables)
6. [Migrasi & Seed](#6-migrasi--seed)
7. [Wajib: perbaiki model mapping](#7-wajib-perbaiki-model-mapping)
8. [Jalankan dev server](#8-jalankan-dev-server)
9. [Verifikasi end-to-end](#9-verifikasi-end-to-end)
10. [Scripts](#10-scripts)
11. [Struktur project](#11-struktur-project)
12. [Troubleshooting](#12-troubleshooting)
13. [Catatan lokal](#13-catatan-lokal)

---

## 1. Prasyarat

| Komponen | Versi minimal | Cek |
|---|---|---|
| Node.js | 20 | `node -v` |
| npm | 10 | `npm -v` |
| PostgreSQL | 14 (disarankan 16/18) | `psql --version` |
| 9Router | berjalan & reachable | `curl -s localhost:20128/v1/models` |
| Git | — | `git --version` |

Opsional (hanya bila menguji fitur terkait):

- **Midtrans** account sandbox (top-up)
- **Resend** account + domain terverifikasi (email verify/reset, dikirim via SMTP)

---

## 2. Setup PostgreSQL

Bagian ini untuk **macOS (Homebrew)**. Linux/Windows sesuaikan perintah service-nya.

### 2.1 Install & jalankan

```bash
brew install postgresql@18
brew services start postgresql@18
pg_isready                      # harus: accepting connections
```

Postgres Homebrew memakai:

- Port **5432**, listen `localhost`
- Superuser = **username OS** kamu (mis. `fauzi`), **bukan** `postgres`
- Auth lokal = `trust` (tanpa password)

### 2.2 Buat role `postgres` (kompatibilitas tooling)

```bash
psql -d postgres -c "CREATE ROLE postgres WITH LOGIN SUPERUSER;"
```

> `psql` tanpa `-d` akan error `database "<namamu>" does not exist` karena psql default connect ke DB senama user. Selalu pakai `-d postgres` atau buat DB senama user.

### 2.3 Buat database project

```bash
createdb mpruy

# opsional: biar `psql` telanjang berfungsi
createdb "$(whoami)"
```

Cek:

```bash
psql -d mpruy -c "select current_database(), current_user;"
# harus: mpruy | <user>
```

### 2.4 Koneksi database

Untuk lokal (auth `trust`), tanpa password:

```text
postgresql://<user>@localhost:5432/mpruy?schema=public
```

Contoh user `fauzi`:

```text
postgresql://fauzi@localhost:5432/mpruy?schema=public
```

> Jangan pernah pakai `host` sebagai nama host. Selalu `localhost` atau `127.0.0.1`.

---

## 3. Setup 9Router

9Router adalah gateway AI internal. Platform **menerjemahkan** user API key menjadi request ke 9Router memakai **gateway key**.

### 3.1 Pastikan 9Router jalan

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:20128/v1/models
# 200
```

### 3.2 Ambil gateway key

Gateway key tersimpan di konfigurasi lokal 9Router. Cari lewat:

```bash
# 1) Database lokal 9Router (SQLite)
sqlite3 ~/.9router/db/data.sqlite "select name, key from apiKeys;"

# 2) Atau dashboard 9Router di browser
```

Catat nilainya (format `sk-...`). Ini yang masuk ke `NINE_ROUTER_API_KEY`.

### 3.3 Cek singkat

```bash
KEY=$(sqlite3 ~/.9router/db/data.sqlite "select key from apiKeys limit 1;")
curl -s http://localhost:20128/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"ag/gemini-3.8-flash","messages":[{"role":"user","content":"hi"}],"stream":false}'
```

> `/v1/models` 9Router **tidak butuh auth** — jadi ia bisa balas 200 walau key salah. Auth baru dicek di endpoint chat.

---

## 4. Clone & Install

```bash
git clone <repo-url> mpruy-ai
cd mpruy-ai
npm install
```

`npm install` akan menginstall dependency, termasuk Prisma CLI dan `@node-rs/argon2` (native).

---

## 5. Environment variables

```bash
cp .env.example .env
```

Generate secret:

```bash
openssl rand -hex 32      # → AUTH_JWT_SECRET
openssl rand -hex 32      # → API_KEY_PEPPER
```

Isi `.env`:

```dotenv
# --- Database ---
DATABASE_URL="postgresql://fauzi@localhost:5432/mpruy?schema=public"
DIRECT_URL="postgresql://fauzi@localhost:5432/mpruy?schema=public"

# --- Auth / keamanan ---
AUTH_JWT_SECRET="<openssl #1>"
API_KEY_PEPPER="<openssl #2>"

# --- 9Router (internal) ---
NINE_ROUTER_URL="http://localhost:20128"
NINE_ROUTER_API_KEY="<gateway key dari langkah 3>"

# --- Midtrans (opsional untuk lokal) ---
MIDTRANS_SERVER_KEY=""
MIDTRANS_CLIENT_KEY=""
MIDTRANS_IS_PRODUCTION="false"

# --- App ---
APP_BASE_URL="http://localhost:3000"

# --- Email ---
# Transport: smtp | api | console (kosong = auto-detect).
# SMTP default memakai Resend SMTP: host smtp.resend.com, user `resend`, password = API key Resend.
MAIL_TRANSPORT=""
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"          # 465/2465 = SSL implisit · 25/587/2587 = STARTTLS
SMTP_SECURE=""           # kosong = otomatis dari port
SMTP_USER="resend"
SMTP_PASS=""             # = API key Resend (fallback ke RESEND_API_KEY)
SMTP_ALLOW_SELF_SIGNED=""
EMAIL_FROM="noreply@mpruy.ai"
EMAIL_FROM_NAME="Mpruy AI"
RESEND_API_KEY=""        # opsional; dipakai bila MAIL_TRANSPORT=api
```

| Variable | Wajib | Fungsi |
|---|---|---|
| `DATABASE_URL` | ya | koneksi Postgres (pooled) |
| `DIRECT_URL` | ya | koneksi non-pooled (migrasi) |
| `AUTH_JWT_SECRET` | ya | tanda tangan session JWT |
| `API_KEY_PEPPER` | ya | pepper hash API key user |
| `NINE_ROUTER_URL` | ya | base URL 9Router |
| `NINE_ROUTER_API_KEY` | ya | gateway key ke 9Router |
| `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` | top-up | kredensial Midtrans |
| `MIDTRANS_IS_PRODUCTION` | top-up | `false` = sandbox |
| `APP_BASE_URL` | ya | base URL app (link email, redirect) |
| `MAIL_TRANSPORT` | email | `smtp` / `api` / `console`; kosong = auto-detect |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | email | server SMTP (default Resend) |
| `SMTP_USER` / `SMTP_PASS` | email | kredensial SMTP (user `resend`, pass = API key) |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | email | alamat + nama pengirim |
| `RESEND_API_KEY` | opsional | hanya untuk transport `api` |

> `.env` **jangan di-commit** (sudah ada di `.gitignore`).

### 5.1 Setup email (SMTP Resend)

1. Buat API key di <https://resend.com/api-keys> dan verifikasi domain di <https://resend.com/domains>.
2. Isi `.env` (password SMTP = API key Resend, username selalu `resend`):

   ```env
   MAIL_TRANSPORT="smtp"
   SMTP_HOST="smtp.resend.com"
   SMTP_PORT="587"          # atau 465/2465 (SSL implisit)
   SMTP_USER="resend"
   SMTP_PASS="re_xxxxxxxxxxxx"
   EMAIL_FROM="noreply@domainterverifikasi.com"
   EMAIL_FROM_NAME="Mpruy AI"
   ```

   `EMAIL_FROM` **wajib** memakai domain yang sudah diverifikasi di Resend, jika tidak pengiriman ditolak.
3. Tes koneksi + kirim email contoh:

   ```bash
   npm run mail:test -- kamu@email.com
   ```

   Output: `Transport: smtp (smtp.resend.com:587)` → `Koneksi SMTP OK (verify).` → `Email tes terkirim ...`
4. Alternatif: pakai transport HTTP API dengan `MAIL_TRANSPORT="api"` + `RESEND_API_KEY`.
5. Tanpa kredensial apa pun, transport otomatis `console`: link verifikasi hanya muncul di log dev server (tidak ada email terkirim).

Catatan: `MAIL_TRANSPORT` kosong = auto-detect (`smtp` bila `SMTP_HOST` + password ada → `api` bila `RESEND_API_KEY` ada → `console`).

---

## 6. Migrasi & Seed

```bash
npx prisma migrate dev
```

Seed data awal (plans, models, admin, app setting):

```bash
ADMIN_EMAIL=admin@mpruy.ai ADMIN_PASSWORD='ChangeMe!123' npx prisma db seed
```

Hasil seed:

- **Plans:** `basic` (markup 1.5×, 60 RPM), `pro` (1.35×, 300 RPM), `enterprise` (1.2×, 1200 RPM)
- **Models:** `gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4.5`, `gemini-1.5-pro`
- **Admin:** `admin@mpruy.ai` / `ChangeMe!123` (role `ADMIN`)

Ubah kredensial admin:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='StrongPass!123' npx prisma db seed
```

> Untuk kredensial produksi, **jangan** pakai default `ChangeMe!123`.

Verifikasi:

```bash
psql -d mpruy -c '\dt'
psql -d mpruy -Atc 'select (select count(*) from "Plan") plans, (select count(*) from "Model") models, (select count(*) from "User") users'
```

---

## 7. Wajib: perbaiki model mapping

Seed mengisi kolom `internalName` dengan contoh (`gh/gpt-4o`, `kr/claude-sonnet-4.5`, `gm/gemini-1.5-pro`). **Prefix ini harus sama dengan yang dikenal 9Router kamu.** Kalau tidak sama, request chat akan gagal `model_not_available`.

Lihat model internal yang benar-benar tersedia:

```bash
KEY=$(sqlite3 ~/.9router/db/data.sqlite "select key from apiKeys limit 1;")
curl -s http://localhost:20128/v1/models -H "Authorization: Bearer $KEY" \
  | python3 -c "import sys,json;[print(m['id']) for m in json.load(sys.stdin)['data']]"
```

Lalu samakan tiap `publicName` → `internalName` yang valid. Contoh (ganti sesuai model 9Router-mu):

```bash
psql -d mpruy -c "UPDATE \"Model\" SET \"internalName\"='ag/gemini-3.8-flash' WHERE \"publicName\"='gpt-4o';"
psql -d mpruy -c "UPDATE \"Model\" SET \"internalName\"='tbr/deepseek-v4.1-flash:free' WHERE \"publicName\"='gpt-4o-mini';"
```

Atau permanen: edit array `models` di [`prisma/seed.ts`](./prisma/seed.ts) lalu `npx prisma db seed` ulang.

Mapping di atas bisa dikelola dari **Admin Panel → Models** (`/admin/models`) tanpa sentuh DB.

---

## 8. Jalankan dev server

```bash
npm run dev
```

Buka:

- App: <http://localhost:3000>
- Docs publik: <http://localhost:3000/docs>
- Dashboard: <http://localhost:3000/dashboard>
- Admin: <http://localhost:3000/admin>
- Prisma Studio (opsional): `npx prisma studio` → <http://localhost:5555>

---

## 9. Verifikasi end-to-end

### 9.1 Health check

```bash
curl -s localhost:3000/api/health
# {"status":"ok","checks":{"db":true,"upstream":true}}
```

### 9.2 Login admin

Buka <http://localhost:3000/login> → `admin@mpruy.ai` / `ChangeMe!123`. Cek `/admin` bisa diakses.

### 9.3 Buat user + API key

1. Register di <http://localhost:3000/register>.
2. (Opsional) verifikasi email — email link dikirim lewat SMTP (Resend SMTP). Tanpa kredensial SMTP, link hanya muncul di log dev server (`[mailer] ...`). Untuk lokal bisa juga lewat API:
   ```bash
   curl -s localhost:3000/api/auth/verify-email \
     -H 'Content-Type: application/json' -d '{"token":"<token>"}'
   ```
3. Login → **Dashboard → Keys → Create key**. Copy raw key (`sk-mpruy-...`) — hanya tampil sekali.

> Endpoint manajemen key butuh session cookie **dan** header `x-csrf-token` yang nilainya sama dengan cookie `csrf_token`. Lewat UI lebih mudah.

### 9.4 Uji chat (stream & non-stream)

```bash
# non-stream
curl -s localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-mpruy-XXXX" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}],"stream":false}'

# stream (SSE) — harus berakhir dengan data: [DONE]
curl -N localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-mpruy-XXXX" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}],"stream":true}'
```

Cek saldo terpotong & usage tercatat:

```bash
psql -d mpruy -c 'select "promptTokens","completionTokens","costIdr",status from "UsageLog" order by "createdAt" desc limit 5;'
```

### 9.5 Top-up saldo (tanpa Midtrans)

```bash
# via admin API (ganti <userId>)
curl -s -X POST localhost:3000/api/admin/users/<userId>/balance \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"deltaIdr":50000,"note":"manual topup"}'
```

Saldo habis (`<= 0`) → chat balas **402** `insufficient_balance`. Model dengan harga efektif 0 (gratis) tetap bisa dipakai walau saldo 0.

---

## 10. Scripts

| Script | Fungsi |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | `prisma generate && next build` |
| `npm run start` | jalankan hasil build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript tanpa emit |
| `npm run test` | unit test (Vitest) |
| `npm run test:watch` | test mode watch |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:deploy` | `prisma migrate deploy` (produksi) |
| `npm run db:seed` | seed data awal |

---

## 11. Struktur project

```text
mpruy-ai/
├── app/
│   ├── page.tsx                 # landing
│   ├── login/ register/ docs/   # halaman publik
│   ├── dashboard/               # keys, usage, billing, playground
│   ├── admin/                   # users, models, plans, transactions, settings, audit
│   ├── v1/                      # API publik (chat/completions, models, embeddings)
│   └── api/                     # API internal (auth, keys, billing, admin, health)
├── src/
│   ├── middleware.ts            # proteksi /dashboard & /admin
│   └── lib/                     # proxy, stream, billing, auth, apikey, ratelimit, midtrans, ...
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── tests/                       # unit test (Vitest)
└── docs/                        # dokumentasi teknis (22 file)
```

---

## 12. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `P1001: Can't reach database server at "host:5432"` | `DATABASE_URL` masih pakai host literal `host` | ganti ke `localhost` / `127.0.0.1` |
| `database "<user>" does not exist` | psql default connect ke DB senama user | `psql -d postgres`, atau `createdb "$(whoami)"` |
| `role "postgres" does not exist` | Homebrew bikin superuser = username OS | `psql -d postgres -c "CREATE ROLE postgres WITH LOGIN SUPERUSER;"` |
| `database "postgres" does not exist` | DB maintenance terhapus | `psql -d template1 -c "CREATE DATABASE postgres;"` |
| Chat balas `model_not_available` | `internalName` salah prefix | lihat [langkah 7](#7-wajib-perbaiki-model-mapping) |
| Chat balas `401 invalid_api_key` dari upstream | `NINE_ROUTER_API_KEY` salah/kadaluarsa | ambil gateway key terbaru dari 9Router |
| Chat balas `402 insufficient_balance` | saldo user habis | top-up (9.5) |
| `429 rate_limit_exceeded` | limit RPM plan/key/IP | naikkan plan atau tunggu |
| Stream menggantung tanpa `[DONE]` | quirk upstream 9Router | platform otomatis inject `[DONE]`; cek log bila masih macet |
| Email verify tidak terkirim | kredensial SMTP kosong (`SMTP_PASS` / `RESEND_API_KEY`) | isi `SMTP_PASS`, tes dengan `npm run mail:test`, atau verifikasi via API (9.3) |
| `brew services` postgres mati | service berhenti | `brew services restart postgresql@18` |
| `prisma migrate reset` menghapus data | perintah butuh konfirmasi | jangan jalankan di DB penting |

Log Postgres:

```bash
tail -f /opt/homebrew/var/log/postgresql@18.log
```

---

## 13. Catatan lokal

Beberapa item ini adalah **batasan implementasi saat ini**, bukan kesalahan setup:

- **Rate limit in-memory** (`src/lib/ratelimit.ts`) — per instance, reset saat dev restart. Cocok untuk lokal; untuk produksi butuh Redis/Upstash.
- **Redis & Sentry belum dipakai** walau disebut di `docs/`. Anggap dokumentasi sebagai target.
- **Halaman `/verify`, `/forgot-password`, `/reset-password` sudah ada** dan menangani tautan dari email (incl. kirim ulang verifikasi dari halaman `/verify`).
- **Login diblokir sampai email terverifikasi** (`PENDING_EMAIL` → 403 `email_not_verified`). Alur lokal tanpa kredensil SMTP: link verifikasi muncul di log dev server (`[mailer] ...`), atau admin bisa klik **Verifikasi** di `/admin/users`.
- **Jalur top-up** butuh Midtrans sandbox + URL webhook publik (mis. `ngrok`). Untuk lokal, tambah saldo lewat admin API.
- **Jangan commit `.env`** dan jangan pernah menaruh gateway key 9Router di kode client.

---

## Lisensi

Internal/proprietary. Semua hak dilindungi.