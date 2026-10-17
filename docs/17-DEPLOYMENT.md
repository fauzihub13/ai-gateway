# 17 — Deployment

Environment, env variables, migrasi DB, deploy Vercel, deploy 9Router di VPS, Cloudflare, CI/CD, rollback, backup & restore.

---

## 1. Lingkungan

| Lingkungan | Platform | DB | 9Router | Midtrans |
|---|---|---|---|---|
| dev | local | Postgres lokal / Neon dev | dev instance / mock | sandbox |
| staging | Vercel preview | Neon staging | 9Router staging | sandbox |
| production | Vercel prod | Neon/RDS prod | 9Router prod (VPS private) | production |

Branch: `main` → prod; PR → preview (staging-like); `develop` (opsional) → staging tetap.

---

## 2. Environment variables (lengkap)

| Variable | Wajib | Contoh | Deskripsi |
|---|---|---|---|
| `DATABASE_URL` | ya | `postgresql://...` | koneksi Postgres |
| `DIRECT_URL` | ya | `postgresql://...` | non-pooled (migrasi Prisma) |
| `AUTH_JWT_SECRET` | ya | 32+ byte acak | tanda tangan session JWT |
| `API_KEY_PEPPER` | ya | rahasia | pepper hash API key |
| `NINE_ROUTER_URL` | ya | `http://10.0.0.5:8080` | base URL 9Router (private) |
| `NINE_ROUTER_API_KEY` | ya | rahasia | gateway key 9Router |
| `MIDTRANS_SERVER_KEY` | ya | rahasia | Midtrans server |
| `MIDTRANS_CLIENT_KEY` | ya | publik | Midtrans client |
| `MIDTRANS_IS_PRODUCTION` | ya | `false` | mode |
| `APP_BASE_URL` | ya | `https://app.mpruy.ai` | base URL app |
| `RESEND_API_KEY` | tidak | rahasia | email (transport `api`) |
| `MAIL_TRANSPORT` | tidak | `smtp` | `smtp`/`api`/`console` |
| `SMTP_HOST` | ya | `smtp.resend.com` | server SMTP |
| `SMTP_PORT` | ya | `587` | 465/2465 SSL, 25/587/2587 STARTTLS |
| `SMTP_SECURE` | tidak | auto | paksa SSL implisit |
| `SMTP_USER` | ya | `resend` | username SMTP |
| `SMTP_PASS` | ya | rahasia | API key Resend untuk SMTP |
| `EMAIL_FROM` | ya | `noreply@mpruy.ai` | pengirim email |
| `EMAIL_FROM_NAME` | tidak | `Mpruy AI` | nama pengirim |
| `UPSTASH_REDIS_REST_URL` | ya | url | Redis |
| `UPSTASH_REDIS_REST_TOKEN` | ya | token | Redis |
| `SENTRY_DSN` | tidak | dsn | error tracking |
| `SENTRY_AUTH_TOKEN` | tidak | token | upload sourcemap |
| `CACHE_MODELS_TTL` | tidak | `60` | TTL cache model (detik) |
| `LOGGING_LEVEL` | tidak | `info` | level log |
| `ADMIN_IP_ALLOWLIST` | tidak | `1.2.3.4` | batasi admin panel (opsional) |

> `.env.example` wajib sinkron. Secret produksi hanya di Vercel (encrypted) + secret manager VPS.

---

## 3. Migrasi database

- Dev: `npx prisma migrate dev --name <desc>`.
- Prod: **`npx prisma migrate deploy`** dijalankan saat build/deploy.
- Gunakan `DIRECT_URL` (non-pooled) untuk migrasi bila `DATABASE_URL` via pooler (Supavisor/PgBouncer).

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Build script Vercel:

```json
{ "scripts": { "build": "prisma generate && prisma migrate deploy && next build" } }
```

Reset (dev only): `npx prisma migrate reset`.

---

## 4. Deploy Next.js ke Vercel

1. Hubungkan repo GitHub → import project di Vercel.
2. Set env vars (section 2) untuk Production & Preview.
3. Build command: `npm run build` (sudah termasuk migrate).
4. Node version: 20.x (set di project settings).
5. Region: pilih terdekat pengguna (mis. Singapore `sin1`) — juga dekat ke VPS 9Router untuk latensi.
6. **Route Handler `/v1/chat/completions`**: pastikan Node runtime & `maxDuration` sesuai plan. Untuk stream panjang, pertimbangkan Vercel Pro (durasi lebih panjang) atau proxy di VPS bila perlu.
7. Custom domain: `api.mpruy.ai` (API) + `app.mpruy.ai` (dashboard), atau satu domain.
8. Aktifkan Vercel Cron (`vercel.json`) untuk reconcile & cleanup.

```json
{
  "crons": [
    { "path": "/api/cron/reconcile-transactions", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/cleanup-tokens", "schedule": "0 3 * * *" },
    { "path": "/api/cron/reconcile-balances", "schedule": "0 4 * * *" },
    { "path": "/api/cron/sync-models", "schedule": "0 5 * * *" }
  ]
}
```

Cron handler wajib verifikasi (`CRON_SECRET`) agar tidak dipanggil publik:

```ts
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }
  await reconcilePending();
  return Response.json({ ok: true });
}
```

---

## 5. Deploy 9Router di VPS (private)

### 5.1 Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <admin-ip> to any port 22 proto tcp        # SSH
sudo ufw allow from <vercel-egress-or-tunnel> to any port 8080 proto tcp
sudo ufw enable
```

### 5.2 Network privat

Pilihan konektivitas Vercel (public) → VPS (private):

| Opsi | Cara | Catatan |
|---|---|---|
| WireGuard tunnel | VPS jadi peer; Vercel connect via gateway/proxy kecil | Umum |
| Cloudflare Tunnel | `cloudflared` di VPS → hostname privat | Tanpa buka port |
| Tailscale | mesh VPN | Mudah, tapi butuh client di runtime |

Rekomendasi: **Cloudflare Tunnel** (tanpa buka port publik) atau WireGuard bila butuh IP privat tetap. Bila memakai tunnel, `NINE_ROUTER_URL` menunjuk hostname tunnel.

### 5.3 systemd service

```ini
# /etc/systemd/system/ninerouter.service
[Unit]
Description=9Router AI Gateway
After=network.target

[Service]
Type=simple
User=ninerouter
WorkingDirectory=/opt/ninerouter
EnvironmentFile=/opt/ninerouter/.env
ExecStart=/opt/ninerouter/ninerouter --port 8080
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ninerouter
sudo systemctl status ninerouter
```

### 5.4 Health & gateway key

- Uji lokal: `curl -H "Authorization: Bearer <gateway_key>" http://127.0.0.1:8080/v1/models`.
- Pastikan gateway key tersimpan hanya di `.env` VPS (chmod 600, owner `ninerouter`).

---

## 6. Cloudflare

| Setting | Nilai |
|---|---|
| DNS | `api`/`app` → CNAME Vercel (proxied/orange) |
| SSL | Full (strict) |
| WAF | Managed rules ON |
| Bot Fight Mode | ON |
| Rate limiting | aturan edge untuk `/api/auth/*` & `/v1/*` |
| Cache | jangan cache `/v1/*` dan `/api/*`; cache aset statis |
| Origin lock | hanya terima trafik dari Cloudflare (allowlist IP CF / authenticated origin pull) |

Aturan cache: tambahkan header `Cache-Control: no-store` pada `/v1/*` (sudah di [09](./09-STREAMING.md) untuk stream).

---

## 7. CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - name: gitleaks
        uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
          AUTH_JWT_SECRET: test-secret
          API_KEY_PEPPER: test-pepper
```

Deploy produksi: Vercel otomatis pada merge ke `main` (git integration). Bila butuh gate, gunakan Vercel Deploy Hook setelah CI hijau.

Staging deploy 9Router: pipeline terpisah (opsional) — rsync + `systemctl restart`.

---

## 8. Rollback strategy

| Lapisan | Cara rollback |
|---|---|
| Next.js | Vercel → Deployments → "Promote to Production" deployment sebelumnya (instan) |
| DB | Migrasi backward-compatible; rollback manual via migration down atau restore snapshot |
| 9Router | `git checkout <prev>` + `systemctl restart` |
| Env | Vercel menyimpan riwayat; set ulang nilai lama |
| Feature | Flag di `AppSetting` (matikan fitur tanpa deploy) |

Aturan: **selalu deploy migrasi backward-compatible** agar app versi lama tetap jalan bila perlu rollback cepat.

---

## 9. Backup & restore

| Data | Metode | Frekuensi | Retensi |
|---|---|---|---|
| Postgres | snapshot otomatis provider + `pg_dump` harian ke S3 | harian | 30 hari |
| Redis | tidak kritis (cache) | — | — |
| Env/secrets | password manager + catatan aman (bukan repo) | saat berubah | — |
| 9Router config | backup file `.env` & config ke vault | saat berubah | — |

```bash
# backup manual
pg_dump "$DATABASE_URL" | gzip > backup_$(date +%F).sql.gz
# restore
gunzip -c backup.sql.gz | psql "$DATABASE_URL"
```

Uji restore berkala (quarterly) agar tidak sekadar ada backup.

---

## 10. Deployment checklist

```
[ ] Env vars semua terisi (prod)
[ ] Migrasi backward-compatible & sudah diuji di staging
[ ] 9Router reachable dari Vercel (uji /v1/models)
[ ] Gateway key benar & tidak bocor
[ ] Cloudflare proxied + SSL strict
[ ] Domain custom aktif (api + app)
[ ] Cron terdaftar & CRON_SECRET diset
[ ] Sentry DSN aktif
[ ] Backup harian aktif
[ ] Rollback plan siap
```

---

## 11. Referensi

- Monitoring → [18-MONITORING.md](./18-MONITORING.md)
- Security & firewall → [13-SECURITY.md](./13-SECURITY.md)
- Go-live → [20-GO-LIVE-CHECKLIST.md](./20-GO-LIVE-CHECKLIST.md)
- Tech stack → [02-TECH-STACK.md](./02-TECH-STACK.md)