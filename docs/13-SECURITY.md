# 13 — Security

Threat model, secret management, API key security, network isolation, WAF/DDoS, injection & XSS & CSRF prevention, validasi input, audit, compliance, incident response.

---

## 1. Prinsip

1. **Least privilege** — tiap komponen hanya akses yang perlu.
2. **Defense in depth** — validasi berlapis (edge → app → DB).
3. **Jangan percaya input** — semua dari user divalidasi (Zod).
4. **Rahasia tidak pernah log** — gateway key, API key, password, server key.
5. **Fail closed untuk uang & auth**, fail open untuk non-kritis (rate limit).
6. **Audit segalanya yang menyentuh uang & admin.**

---

## 2. Threat model

| Aset | Ancaman | Mitigasi |
|---|---|---|
| User API keys | Kebocoran, brute force | 256-bit entropi, hash+pepper, tidak disimpan mentah |
| Saldo user | Manipulasi, dobel kredit | transaksi atomik, idempotency, verifikasi webhook |
| Gateway key 9Router | Kebocoran → akses gratis ke 9Router | env-only, network private, redaction, tidak pernah disimpan di DB/log |
| 9Router | Akses langsung dari internet | private network, firewall, tanpa public port |
| Kredensial upstream | Tersimpan di 9Router (bukan kami) | tanggung jawab 9Router |
| Data user (PII) | Kebocoran | enkripsi transit, minimisasi, akses berbasis peran |
| Session dashboard | Hijack | httpOnly cookie, SameSite, rotasi, denylist |
| Uang perusahaan | Fraud top-up | signature webhook, reconcile, idempotency |

---

## 3. Secret management

| Secret | Lokasi | Rotasi |
|---|---|---|
| `DATABASE_URL` | env Vercel | saat kredensial DB ganti |
| `AUTH_JWT_SECRET` | env | 90 hari |
| `API_KEY_PEPPER` | env | saat insiden (lihat [07](./07-API-KEY-MANAGEMENT.md)) |
| `NINE_ROUTER_API_KEY` | env | saat insiden / berkala |
| `MIDTRANS_SERVER_KEY` | env | saat insiden |
| `RESEND_API_KEY` | env | berkala |
| `SMTP_PASS` (Resend SMTP) | env | berkala (samakan dengan rotasi API key Resend) |
| `UPSTASH_*` | env | berkala |

Aturan:
- **Jangan commit `.env`.** `.gitignore` memuat `.env*`. Selalu sediakan `.env.example` tanpa nilai nyata.
- Secret produksi hanya di Vercel Environment Variables (encrypted). Tidak di kode, tidak di CI log.
- Scan repo (gitleaks/trufflehog) di CI untuk mencegah commit rahasia.
- Beda secret per lingkungan (dev/staging/prod).

```bash
# .env.example (tanpa nilai nyata)
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public"
AUTH_JWT_SECRET=""
API_KEY_PEPPER=""
NINE_ROUTER_URL="http://<private-ip>:8080"
NINE_ROUTER_API_KEY=""
MIDTRANS_SERVER_KEY=""
MIDTRANS_CLIENT_KEY=""
MIDTRANS_IS_PRODUCTION="false"
RESEND_API_KEY=""
SMTP_PASS=""
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
SENTRY_DSN=""
APP_BASE_URL="http://localhost:3000"
```

---

## 4. API key security

- Raw tidak pernah disimpan sebagai plaintext. Verifikasi memakai hash SHA-256 + pepper; salinan yang bisa dibaca server disimpan terenkripsi AES-256-GCM (`keyCiphertext`) agar user bisa copy ulang dari dashboard. Lihat [07](./07-API-KEY-MANAGEMENT.md).
- **Redaction di logger:** semua log melewati redactor yang mengganti pola `sk-[a-z]+-[A-Za-z0-9]+` dengan `sk-***REDACTED***`.

```ts
export function redact(input: string): string {
  return input
    .replace(/sk-[a-z]+-[A-Za-z0-9]{10,}/gi, 'sk-***REDACTED***')
    .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer ***REDACTED***');
}
```

- Jangan pernah log header `Authorization` mentah.
- Kirim ke Sentry dengan `beforeSend` yang men-scrub `authorization`, `cookie`, `password`.

```ts
Sentry.init({
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    return event;
  },
});
```

---

## 5. Network isolation (9Router)

```
┌─────────────── Internet ───────────────┐
│                                         │
│   Vercel (public)  ── WireGuard/VPC ──▶ 9Router (private, NO public port)
│                                         │
└─────────────────────────────────────────┘
```

- 9Router **tidak** punya port publik. Hanya dapat dijangkau dari jaringan privat (WireGuard tunnel / VPC peering / IP allowlist).
- Firewall VPS: tolak semua inbound kecuali SSH dari IP admin & koneksi dari Vercel (via tunnel IP).
- Outbound dari 9Router ke provider dibuka seperlunya.
- Gateway key sebagai lapis autentikasi kedua di atas isolasi jaringan.

```bash
# contoh ufw di VPS
sudo ufw default deny incoming
sudo ufw allow from <admin-ip> to any port 22 proto tcp
sudo ufw allow from <vercel/egress-ip> to any port 8080 proto tcp
sudo ufw enable
```

---

## 6. WAF & DDoS (Cloudflare)

- Semua trafik melewati Cloudflare (proxy ON, "orange cloud").
- Aktifkan: Managed WAF rules, Bot Fight Mode, Rate limiting rules (kasar, di edge), DDoS protection (otomatis).
- Origin (`api.mpruy.ai`) hanya menerima dari Cloudflare (cek `CF-Connecting-IP` / allowlist Cloudflare IP).
- Turnstile pada halaman register/login (opsional) untuk cegah bot.

Aturan edge rate limit contoh:

```
(http.request.uri.path matches "^/api/auth/login") and rate(5m) > 10 → block 15m
(http.request.uri.path matches "^/v1/") and rate(1m) > 300 per ip → managed challenge
```

---

## 7. SQL injection

- **Semua query lewat Prisma** (parameterized). Dilarang menyusun SQL dari string interpolasi user.
- Raw query (`$queryRaw`) **hanya** dengan tagged template + parameter (`${userId}`), tidak `queryRawUnsafe` dengan input user.

```ts
// AMAN
await db.$queryRaw`SELECT * FROM "User" WHERE id = ${userId}`;

// BAHAYA — jangan
await db.$queryRawUnsafe(`SELECT * FROM "User" WHERE id = '${userId}'`);
```

---

## 8. XSS

- React meng-escape by default. Hindari `dangerouslySetInnerHTML`; bila perlu (markdown render), sanitasi dengan `DOMPurify` di server.
- **CSP** ketat via header:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-<random>';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.mpruy.ai;
  frame-ancestors 'none';
  base-uri 'self';
```

- Set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (lihat [02](./02-TECH-STACK.md)).

---

## 9. CSRF

- Session cookie `SameSite=Lax`.
- Mutasi `/api/*` butuh double-submit token (lihat [06](./06-AUTH-SYSTEM.md)).
- `/v1/*` pakai Bearer → tidak rentan CSRF.

---

## 10. Input validation (Zod)

- Validasi **di batas trust** (setiap endpoint) sebelum menyentuh logic/DB.
- Zod = sanity guard: panjang string, `.min(1)`, `.strict()` bila perlu. **Bukan** tempat membatasi jumlah pesan/token — batas asli diturunkan dari baris `Model` (`contextWindow`, `maxOutputTokens`) saat runtime, lihat [08-MODEL-MAPPING.md](./08-MODEL-MAPPING.md).
- Jangan hardcode cap jumlah `messages`: agent client (opencode) resend full history → cap global bikin 400 di session panjang. Batasi pakai **token vs contextWindow**, bukan jumlah item.

```ts
const ChatSchema = z.object({
  model: z.string().min(1).max(64),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.union([z.string().max(100_000), z.array(z.any()).max(50), z.null()]),
    name: z.string().max(64).optional(),
    tool_call_id: z.string().max(128).optional(),
  })).min(1), // no count cap — lihat enforceModelLimits
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(1).optional(), // di-clamp per-model nanti
  stop: z.union([z.string().max(64), z.array(z.string().max(64)).max(4)]).optional(),
  tools: z.array(z.any()).max(64).optional(),
  tool_choice: z.union([z.string(), z.object({}).passthrough()]).optional(),
  response_format: z.object({ type: z.string() }).passthrough().optional(),
  user: z.string().max(128).optional(),
}).passthrough();

// setelah resolveModel(): clamp max_tokens ke maxOutputTokens + cek prompt vs contextWindow
const body = enforceModelLimits(model, ChatSchema.parse(raw));
```

---

## 11. Output sanitization

- Jangan kembalikan pesan error internal (stack, SQL, URL 9Router) ke user. Map ke error publik (lihat [14](./14-ERROR-HANDLING.md)).
- Jangan kembalikan `internalName` model, `keyHash`, atau field internal lain di response.
- Response serializer eksplisit (whitelist field), bukan spread seluruh objek DB.

---

## 12. Audit logging

Dicatat:
- Semua aksi admin (`AdminAuditLog`): suspend, adjust saldo, ubah harga model, reconcile.
- Perubahan key (create/revoke).
- Login sukses/gagal (metadata IP/UA, tanpa password).
- Perubahan status transaksi.

Tidak dicatat: password, raw API key, gateway key, konten chat penuh.

---

## 13. Compliance (GDPR / UU PDP)

| Aspek | Implementasi |
|---|---|
| Minimisasi data | simpan hanya yang perlu (email, usage metadata) |
| Hak akses | user bisa unduh datanya (export) |
| Hak hapus | soft delete + anonimisasi 30 hari |
| Retensi | UsageLog 24 bulan; Transparency di privacy policy |
| Persetujuan | ToS + privacy policy saat register |
| Konten chat | **tidak disimpan** untuk training; jelaskan di policy |
| Sub-processor | daftar (Vercel, Upstash, Midtrans, Resend, Sentry, 9Router infra) |

---

## 14. Incident response plan

```
1. DETEKSI         → alert (Sentry/uptime), laporan user, monitoring anomali
2. TRIAGE          → klasifikasi: kebocoran secret? saldo? DoS? data?
3. CONTAIN         → rotate secret terdampak, revoke key, blokir IP,
                     matikan fitur (maintenance mode)
4. ERADICATE       → tambal celah, deploy fix
5. RECOVER         → restore layanan, verifikasi integritas saldo/ledger
6. POST-MORTEM     → root cause, timeline, action items (tanpa menyalahkan)
```

Rotasi darurat:
- Gateway key bocor → ganti `NINE_ROUTER_API_KEY` di 9Router & Vercel.
- Pepper bocor → rotasi dua-fase (lihat [07 §10](./07-API-KEY-MANAGEMENT.md)).
- JWT secret bocor → ganti + bump `sessionVersion` (semua sesi logout).

Runbook detail → [21-TROUBLESHOOTING.md](./21-TROUBLESHOOTING.md).

---

## 15. Security checklist ringkas

```
[ ] .env tidak ter-commit; gitleaks di CI
[ ] Secret produksi di Vercel env (encrypted)
[ ] Redaction logger untuk sk-* dan Bearer
[ ] Sentry beforeSend scrub headers sensitif
[ ] 9Router tanpa port publik (private network)
[ ] Cloudflare proxy + WAF + rate limit edge
[ ] Prisma parameterized; tidak ada queryRawUnsafe dengan input user
[ ] CSP + security headers
[ ] CSRF double-submit pada mutasi /api/*
[ ] Zod validasi semua endpoint
[ ] Error tidak bocorkan internal
[ ] Audit log untuk aksi admin & uang
[ ] Incident runbook + rotasi secret terdokumentasi
```

---

## 16. Referensi

- Auth & session → [06-AUTH-SYSTEM.md](./06-AUTH-SYSTEM.md)
- API key → [07-API-KEY-MANAGEMENT.md](./07-API-KEY-MANAGEMENT.md)
- Error → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)
- Deployment & firewall → [17-DEPLOYMENT.md](./17-DEPLOYMENT.md)