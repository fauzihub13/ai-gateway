# 21 — Troubleshooting

Isu umum & solusi, alat debugging, eskalasi, keterbatasan yang diketahui. Format tiap bagian: gejala → kemungkinan penyebab → langkah cek.

---

## 1. User tidak bisa akses API

**Gejala:** 401 / 403 / error sebelum respons.

```
Kemungkinan penyebab (cek berurutan):
[ ] Header Authorization salah format → harus "Bearer sk-mpruy-..."
[ ] Key bukan milik platform (pakai key OpenAI asli) → 401 invalid_api_key
[ ] Key di-revoke / expired → cek ApiKey.status & expiresAt
[ ] Key hash mismatch setelah rotasi pepper → cek pepper env & lazy-migration
[ ] Plan tidak punya akses model → 403 model_not_allowed
[ ] Key scope MODELS & model tak ada di allowedModels → 403 model_not_in_key_scope
[ ] User SUSPENDED/DELETED → 403/401
[ ] Base URL salah (pakai domain lain) → 404
```

Debug cepat:

```bash
# uji key langsung
curl -s https://api.mpruy.ai/v1/models -H "Authorization: Bearer sk-mpruy-xxx" | jq

# cek di DB (tanpa bocorkan full key)
# SELECT prefix, last4, status, "expiresAt" FROM "ApiKey" WHERE prefix='sk-mpruy-ab12';
```

Lihat [07-API-KEY-MANAGEMENT.md](./07-API-KEY-MANAGEMENT.md).

---

## 2. Streaming error

**Gejala:** respons menggantung, tidak ada `[DONE]`, atau putus di tengah.

```
[ ] 9Router tidak kirim [DONE] → pastikan normalizer inject (uji unit)
[ ] Buffer parser tidak flush → cek pemisah "\n\n" (bukan "\n")
[ ] Chunk korup JSON → parser men-skip & forward; cek log
[ ] Timeout function Vercel (maxDuration) → naikkan / pakai Vercel Pro
[ ] Client baca salah (pakai response.json()) → harus ReadableStream/SSE
[ ] Upstream benar-benar down di tengah → chunk error + [DONE] dikirim, settle PARTIAL
[ ] Content-Encoding kompresi mangle SSE → pastikan no-transform
```

Debug:

```bash
curl -N https://api.mpruy.ai/v1/chat/completions \
  -H "Authorization: Bearer sk-mpruy-xxx" -H "Content-Type: application/json" \
  -d '{"model":"mimo","messages":[{"role":"user","content":"hi"}],"stream":true}'
```

`-N` matikan buffering curl. Lihat [09-STREAMING.md](./09-STREAMING.md).

---

## 3. Billing mismatch

**Gejala:** saldo tidak sesuai, usage hilang, atau dobel.

```
[ ] Usage tercatat tapi saldo tidak turun → cek transaksi settle atomik & WHERE balance>=cost
[ ] Saldo turun tapi usage hilang → cek idempotency insert (requestId unique)
[ ] Dobel tagih → cek settle dipanggil 2x dengan requestId BEDA (bug); harus sama
[ ] Settle gagal (DB down) → cek queue settle (Redis list) & worker retry
[ ] Mismatch ledger vs balance → jalankan reconcileBalances() (§10 billing)
[ ] Stream PARTIAL tidak tertagih → cek onSettle dipanggil di flush
[ ] Refund tidak mengurangi saldo → cek handler refund
```

Reconcile manual:

```sql
-- bandingkan saldo vs jumlah ledger
SELECT u.id, u.balance, COALESCE(SUM(l."deltaIdr"),0) AS ledger_sum
FROM "User" u LEFT JOIN "BalanceLedger" l ON l."userId"=u.id
GROUP BY u.id, u.balance
HAVING u.balance <> COALESCE(SUM(l."deltaIdr"),0);
```

Lihat [10-BILLING-USAGE.md](./10-BILLING-USAGE.md).

---

## 4. Koneksi 9Router

**Gejala:** 503 `upstream_unavailable`, timeout, atau 502 error.

```
[ ] Vercel tidak bisa menjangkau 9Router → uji dari runtime (health/upstream)
[ ] Tunnel/VPN mati (WireGuard/Cloudflared) → cek service di VPS
[ ] Firewall blokir IP egress → buka port 8080 untuk sumber benar
[ ] Gateway key salah/expired → 401 dari 9Router → cek env
[ ] 9Router down → systemctl status ninerouter
[ ] Timeout terlalu pendek → sesuaikan connect timeout (15s) & total
[ ] Provider upstream down (di dalam 9Router) → cek log 9Router
```

Debug dari VPS:

```bash
curl -H "Authorization: Bearer <gateway_key>" http://127.0.0.1:8080/v1/models
sudo systemctl status ninerouter
sudo journalctl -u ninerouter -n 100 --no-pager
```

Lihat [17-DEPLOYMENT.md](./17-DEPLOYMENT.md).

---

## 5. Payment webhook tidak masuk

**Gejala:** user klaim bayar, saldo tidak bertambah.

```
[ ] URL webhook Midtrans salah → cek setting merchant
[ ] Signature invalid → webhook ditolak 401; cek server key
[ ] Webhook terkirim tapi 500 → cek log endpoint (bug handler)
[ ] Webhook hilang total → jalankan reconcile (query status ke Midtrans)
[ ] Transaksi PENDING lama → cron reconcilePending harus jalan
[ ] gross_amount mismatch → cek validasi (tolak bila beda)
[ ] CSRF memblokir webhook → /api/billing/webhook HARUS dikecualikan dari CSRF
[ ] Body parsing gagal → pastikan baca raw JSON
```

Reconcile manual:

```bash
curl -X POST https://app.mpruy.ai/api/admin/transactions/TRX-ab12/reconcile -b admin_cookies.txt
```

Lihat [11-PAYMENT-GATEWAY.md](./11-PAYMENT-GATEWAY.md).

---

## 6. Performance degradation

**Gejala:** latensi naik, p95 di atas target.

```
[ ] DB connection pool habis → cek pool usage, aktifkan pooler/Accelerate
[ ] Query tanpa index → EXPLAIN query usage/balance
[ ] UsageLog membengkak → pertimbangkan partition per bulan
[ ] Redis lambat/down → rate limit fail-open + alert
[ ] Upstream lambat (provider) → cek TTFB 9Router; bukan bug kami
[ ] Cache model tidak aktif → pastikan TTL & invalidasi
[ ] Cold start serverless → pindah region lebih dekat / warm
[ ] N+1 query → cek include Prisma
```

Debug:

```sql
EXPLAIN ANALYZE
SELECT date_trunc('day',"createdAt"), SUM("costIdr")
FROM "UsageLog" WHERE "userId"=$1 AND "createdAt" >= now() - interval '30 days'
GROUP BY 1;
```

Lihat [18-MONITORING.md](./18-MONITORING.md).

---

## 7. Model mapping issues

```
[ ] User kirim internalName (mimo-free) → 404 (benar, jangan bocor)
[ ] Model ada di 9Router tapi 404 di platform → belum didaftarkan di DB
[ ] Harga jual salah → cek priceIn/OutPer1MIdr & markup plan
[ ] Model deprecated masih muncul → cek isActive
[ ] Response stream masih tampilkan internal model → cek rewrite di normalizer
[ ] capabilities salah (tools ditolak) → update capabilities JSON
```

Lihat [08-MODEL-MAPPING.md](./08-MODEL-MAPPING.md).

---

## 8. Auth / session issues

```
[ ] User tak bisa login padahal password benar → cek status user, sessionVersion
[ ] Cookie tidak ter-set → cek Secure/SameSite & domain
[ ] Sesi lama masih valid setelah reset password → bump sessionVersion
[ ] CSRF gagal → pastikan header X-CSRF-Token dikirim
[ ] Denylist Redis tak tercek → cek requireUser pakai denylist
```

Lihat [06-AUTH-SYSTEM.md](./06-AUTH-SYSTEM.md).

---

## 9. Alat debugging

```bash
# Cari request di log (Axiom/Vercel)
# filter: requestId="req_xxx" atau code:"upstream_error"

# Redis inspect (Upstash via CLI/console)
GET balance:usr_1
GET rl:key:key_1
LRANGE settle:queue 0 10

# DB: user terkait
# SELECT * FROM "User" WHERE email='x@y.com';
# SELECT * FROM "ApiKey" WHERE "userId"='usr_1';
# SELECT * FROM "UsageLog" WHERE "userId"='usr_1' ORDER BY "createdAt" DESC LIMIT 20;

# Health checks
curl https://api.mpruy.ai/api/health/db
curl https://api.mpruy.ai/api/health/redis
curl https://api.mpruy.ai/api/health/upstream
```

Header `x-request-id` pada respons = kunci korelasi semua log/trace.

---

## 10. Eskalasi

| Tingkat | Siapa | Kapan |
|---|---|---|
| L1 | on-call engineer | error produksi |
| L2 | backend lead | bug billing/stream |
| L3 | pemilik 9Router/infra | masalah gateway/network/provider |
| Vendor | Midtrans/Upstash/Vercel support | isu eksternal |

Kontak: isi di sini → `{ nama, channel, jam }`.
SLA internal: L1 respon < 15 menit (jam kerja), < 1 jam (luar jam kerja).

---

## 11. Known limitations

1. **9Router default `stream:true`** — selalu kirim eksplisit; jangan andalkan default.
2. **`[DONE]` tidak selalu ada** — platform inject; klien tetap harus menangani.
3. **Usage dari provider tidak konsisten** — estimasi token bila absen (akurasi ±5–10%).
4. **Single gateway key** — satu key platform untuk 9Router (fase awal).
5. **Refund parsial setelah saldo dipakai** — review manual.
6. **Streaming durasi** terbatas pada maxDuration serverless (naikkan bila perlu).
7. **Tidak menyimpan konten chat** — audit konten tidak mungkin (by design).
8. **Provider upstream bisa berubah** — model dapat deprecated; ikuti pengumuman.

---

## 12. Referensi

- Error codes → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)
- Streaming → [09-STREAMING.md](./09-STREAMING.md)
- Billing → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md)
- Payment → [11-PAYMENT-GATEWAY.md](./11-PAYMENT-GATEWAY.md)
- Monitoring → [18-MONITORING.md](./18-MONITORING.md)