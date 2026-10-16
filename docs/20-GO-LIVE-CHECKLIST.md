# 20 — Go-Live Checklist

Checklist pre-launch. Semua item wajib tercentang sebelum membuka akses publik.

---

## 1. Security

```
[ ] .env tidak ter-commit; gitleaks aktif di CI
[ ] Semua secret produksi di Vercel env (encrypted), bukan hardcode
[ ] Gateway key 9Router hanya di server env, tidak pernah di response/log
[ ] Redaction logger aktif (sk-*, Bearer)
[ ] Sentry beforeSend scrub authorization/cookie
[ ] 9Router tanpa port publik (private network / tunnel)
[ ] Firewall VPS: deny incoming default, allow seperlunya
[ ] Cloudflare proxied + SSL Full (strict)
[ ] WAF managed rules + Bot Fight Mode aktif
[ ] Rate limit edge untuk /api/auth/* dan /v1/*
[ ] Security headers (HSTS, CSP, X-Frame-Options, nosniff) aktif
[ ] CSRF double-submit pada mutasi /api/*
[ ] Semua endpoint validasi input (Zod)
[ ] Tidak ada queryRawUnsafe dengan input user
[ ] Error tidak membocorkan internal (uji)
[ ] Audit log untuk aksi admin & uang
[ ] Rotasi secret terdokumentasi
```

## 2. Performance

```
[ ] Load test /v1 lolos target (p95 < 2s, error < 1%)
[ ] Load test streaming stabil
[ ] Cache model (TTL) aktif
[ ] DB index lengkap untuk query utama (usage, balance)
[ ] Connection pooling DB dikonfigurasi (pooler/Accelerate)
[ ] Bundling & build optimal (bundle analyzer dicek)
[ ] Static assets di-cache CDN
```

## 3. Reliability

```
[ ] Backup DB harian aktif & diuji restore
[ ] Health endpoints berfungsi (/api/health, /db, /redis, /upstream)
[ ] Uptime monitor aktif
[ ] Cron terdaftar (reconcile transaksi/saldo, cleanup, sync model)
[ ] CRON_SECRET diset & diverifikasi
[ ] Settle queue & retry berfungsi (uji kegagalan)
[ ] Idempotency webhook diuji (dobel kirim)
[ ] Failover 9Router / retry diuji
```

## 4. Compliance & Legal

```
[ ] Terms of Service published
[ ] Privacy Policy published (jelaskan: konten chat tidak disimpan untuk training)
[ ] Refund policy jelas
[ ] Kebijakan retensi data tercantum
[ ] Persetujuan ToS saat register
[ ] Daftar sub-processor terdokumentasi
[ ] Kepatuhan UU PDP / GDPR dasar
```

## 5. Documentation

```
[ ] Dokumentasi publik user (/docs/quickstart, api-reference, models)
[ ] Harga final tampil transparan (per plan)
[ ] Snippet integrasi (curl, JS, Python) berfungsi
[ ] Status page (opsional) siap
[ ] Changelog tersedia
[ ] Kontak support tercantum
```

## 6. Operational

```
[ ] Runbook insiden siap (lihat 21)
[ ] On-call / eskalasi didefinisikan
[ ] Alert channel (Slack/PagerDuty) terhubung & diuji
[ ] Dashboard monitoring (ops + bisnis) aktif
[ ] Rollback plan diuji (Vercel promote, migrasi)
```

## 7. Business

```
[ ] Harga & markup diverifikasi (margin positif tiap model)
[ ] Biaya upstream terkonfirmasi dari 9Router
[ ] Payment production Midtrans aktif & diuji nominal kecil
[ ] Invoice/top-up end-to-end diuji
[ ] Reconciliation transaksi manual diuji
[ ] Admin panel diuji (adjust saldo, suspend, reconcile)
```

## 8. Functional smoke test (produksi)

```
[ ] Register user baru → email verifikasi masuk
[ ] Login → dashboard tampil
[ ] Buat API key → raw key tampil sekali → copy
[ ] curl /v1/models dengan key → daftar model (owned_by: mpruy)
[ ] curl /v1/chat/completions (non-stream) → respons + saldo berkurang
[ ] curl /v1/chat/completions (stream) → SSE + [DONE] di akhir
[ ] Top-up sandbox→production kecil → saldo bertambah
[ ] Playground berfungsi
[ ] Admin: suspend user → user tak bisa pakai API
[ ] Admin: adjust saldo → ledger tercatat
[ ] Error saldo habis → 402 dengan pesan benar
[ ] Rate limit → 429 dengan header benar
```

## 9. Final gate

```
[ ] Semua item di atas tercentang
[ ] Satu orang (bukan pelaksana) memverifikasi checklist
[ ] Maintenance mode OFF
[ ] Rencana komunikasi peluncuran siap
```

---

Kerjakan smoke test §8 di **produksi** dengan akun uji sebelum mengumumkan. Setelah hijau, buka akses publik.

---

## Referensi

- Deployment → [17-DEPLOYMENT.md](./17-DEPLOYMENT.md)
- Monitoring → [18-MONITORING.md](./18-MONITORING.md)
- Troubleshooting → [21-TROUBLESHOOTING.md](./21-TROUBLESHOOTING.md)