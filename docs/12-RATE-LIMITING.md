# 12 — Rate Limiting

Multi-level rate limit, algoritma, implementasi Redis (Upstash), header, 429 format, abuse detection, grace period, fallback saat Redis down.

---

## 1. Level rate limit

| Level | Key | Limit sumber | Tujuan |
|---|---|---|---|
| Per IP | `rl:ip:{ip}` | global (mis. 600/mnt) | cegah abuse anonim, brute force |
| Per user | `rl:user:{userId}` | plan.rpmLimit | batas wajar per akun |
| Per API key | `rl:key:{keyId}` | key.rpmLimit ?? plan.rpmLimit | kontrol per key |
| Endpoint sensitif | `rl:login:{ip}`, `rl:forgot:{email}` | khusus (mis. 5/15mnt) | brute force |

Urutan cek: **IP → user → key**. Gagal di level mana pun → 429.

---

## 2. Algoritma: sliding window

Pilihan: **sliding window** (lebih halus dari fixed window, lebih sederhana dari token bucket). Implementasi Upstash Ratelimit sudah menyediakan sliding window.

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });

export function makeLimiter(tokens: number, window: `${number} s` | `${number} m`) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: false,
    prefix: 'rl',
  });
}
```

Kenapa bukan token bucket: sliding window cukup untuk RPM, lebih mudah dipahami & diaudit. Burst allowance ditangani via window kecil + limit sedikit lebih tinggi (lihat §6).

---

## 3. Implementasi multi-level

```ts
// src/lib/ratelimit.ts
const ipLimiter    = makeLimiter(600, '1 m');
const loginLimiter = makeLimiter(5,   '15 m');
const forgotLimiter= makeLimiter(3,   '15 m');

export async function enforceRateLimits(ctx: {
  ip: string; userId: string; keyId: string; planRpm: number; keyRpm: number | null;
}) {
  // 1. IP
  const ipR = await ipLimiter.limit(`ip:${ctx.ip}`);
  if (!ipR.success) return blocked(ipR, 'ip');

  // 2. user
  const userLimiter = makeLimiter(ctx.planRpm, '1 m');
  const userR = await userLimiter.limit(`user:${ctx.userId}`);
  if (!userR.success) return blocked(userR, 'user');

  // 3. key
  const keyRpm = ctx.keyRpm ?? ctx.planRpm;
  const keyLimiter = makeLimiter(keyRpm, '1 m');
  const keyR = await keyLimiter.limit(`key:${ctx.keyId}`);
  if (!keyR.success) return blocked(keyR, 'key');

  return { ok: true, headers: rateHeaders(keyR) };
}

function rateHeaders(r: { limit: number; remaining: number; reset: number }) {
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(Math.ceil(r.reset / 1000)),
  };
}

function blocked(r: { limit: number; remaining: number; reset: number }, scope: string) {
  const retryAfter = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
  return {
    ok: false,
    res: Response.json(
      { error: { message: `Rate limit exceeded (${scope}).`, type: 'rate_limit_error', code: 'rate_limit_exceeded', param: null } },
      { status: 429, headers: { ...rateHeaders(r), 'Retry-After': String(retryAfter) } },
    ),
  };
}
```

Pemakaian di proxy:

```ts
const rl = await enforceRateLimits({ ip, userId, keyId, planRpm: plan.rpmLimit, keyRpm: key.rpmLimit });
if (!rl.ok) return rl.res;
```

---

## 4. Header rate limit

Semua response `/v1/*` (sukses maupun 429) menyertakan:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1723802460     # epoch detik
Retry-After: 12                    # hanya 429
```

Konsisten dengan spec umum (mirip OpenAI/Anthropic). Lihat [05-API-CONTRACT.md](./05-API-CONTRACT.md).

---

## 5. 429 response format (OpenAI)

```json
{
  "error": {
    "message": "Rate limit reached for mimo on requests per min. Limit: 100. Please retry after 12s.",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded",
    "param": null
  }
}
```

Bila kuota token periode plan atau batas belanja key (bukan rate) → `type: "insufficient_quota"`, `code: "quota_exceeded"` / `"key_quota_exceeded"`.

---

## 6. Grace period & burst allowance

- Window pendek (1 menit) memberi respons natural untuk burst singkat.
- Untuk model mahal / endpoint berat, bisa limit lebih ketat per model (mis. `mimo` 30/mnt) via limiter per model:

```ts
async function modelLimit(modelPublic: string, keyId: string, rpm: number) {
  return makeLimiter(rpm, '1 m').limit(`model:${modelPublic}:${keyId}`);
}
```

- **Grace awal akun baru:** user baru boleh dapat limit sedikit lebih longgar di 24 jam pertama (opsional, cegah frustrasi onboarding).

---

## 7. Brute-force & auth limiter

```ts
export async function enforceLoginLimit(ip: string, email: string) {
  const byIp = await loginLimiter.limit(`login:ip:${ip}`);
  if (!byIp.success) throw new TooManyRequestsError('login_ip');
  const byEmail = await loginLimiter.limit(`login:email:${email.toLowerCase()}`);
  if (!byEmail.success) throw new TooManyRequestsError('login_email');
}
```

Endpoint sensitif lain: `register`, `forgot-password`, `resend-verification`, `verify-email`.

---

## 8. Abuse detection

Sinyal & aksi:

| Sinyal | Ambang | Aksi |
|---|---|---|
| Spike request per user | > 10× median 1 jam | alert + rate limit diperketat sementara |
| Banyak key baru per user | > N dalam 1 jam | batas jumlah key aktif |
| Key dipakai dari banyak IP | > 10 IP unik / 5 mnt | log + opsi auto-suspend |
| Error 401 beruntun per IP | > 50 / 5 mnt | blokir IP sementara |
| Request sangat cepat (bot) | durasi antar-request < 100ms konsisten | challenge / limiter ketat |
| Content flagged (opsional) | moderation | suspend + review |

```ts
// contoh deteksi spike sederhana
async function detectSpike(userId: string) {
  const k = `spike:${userId}:${Math.floor(Date.now() / 3600000)}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 3600);
  if (n > SPIKE_THRESHOLD) await alert('abuse_spike', { userId, n });
}
```

Auto-suspend sebaiknya **opt-in** (config) dengan audit; fase awal: alert ke admin saja.

---

## 9. Fallback saat Redis down

Rate limit = **fail-open** (lebih baik melayani daripada memblokir semua karena Redis mati), dengan alert.

```ts
export async function enforceRateLimitsSafe(ctx: Ctx) {
  try {
    return await enforceRateLimits(ctx);
  } catch (e) {
    // Redis error → log + alert, jangan blokir
    captureException(e, { scope: 'ratelimit' });
    alert('ratelimit_redis_down');
    return { ok: true, headers: {} };
  }
}
```

Namun: endpoint auth sensitif (login) boleh **fail-closed** (menolak sementara) karena risikonya lebih tinggi. Kebijakan per-endpoint.

---

## 10. Konfigurasi limit per plan (default)

| Plan | RPM | burst |
|---|---|---|
| free | 100 | window 60s |

Saat ini hanya ada satu plan (`free`) sehingga tabel di atas hanya berisi satu baris. Tambahkan baris baru bila menambah plan di admin.

Override per key via `ApiKey.rpmLimit`.

---

## 11. Edge cases

| Kasus | Penanganan |
|---|---|
| `X-Forwarded-For` dipalsukan | ambil IP dari Cloudflare `CF-Connecting-IP` (tepercaya), fallback header terakhir |
| User di balik proxy/NAT | limit per user/key tetap berlaku (bukan hanya IP) |
| Redis timeout | fail-open + alert |
| Limiter analytics mahal | `analytics: false` |
| Multi-region | Upstash global; key tunggal |
| Clock skew | gunakan TTL Redis (server), bukan waktu klien |

---

## 12. Referensi

- Error & 429 → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)
- Security/abuse → [13-SECURITY.md](./13-SECURITY.md)
- Ledger guard Redis → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md)
- Monitoring → [18-MONITORING.md](./18-MONITORING.md)