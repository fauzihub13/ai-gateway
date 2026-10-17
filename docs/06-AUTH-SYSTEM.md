# 06 — Auth System

Register, login, verify email, forgot/reset password, session management (JWT + httpOnly cookie), RBAC, middleware. Endpoint ringkas ada di [05-API-CONTRACT.md](./05-API-CONTRACT.md).

---

## 1. Model auth

- **Untuk dashboard/UI:** session JWT ditandatangani (jose), disimpan di cookie **httpOnly + Secure + SameSite=Lax**. Stateless (tidak ada tabel Session), token pendek + rotasi.
- **Untuk `/v1/*` API:** **bukan** JWT — memakai **user API key** (`sk-mpruy-...`), lihat [07-API-KEY-MANAGEMENT.md](./07-API-KEY-MANAGEMENT.md). Auth system ini hanya untuk `/api/*` dashboard/admin.

Asumsi: dua jalur auth berbeda dan tidak boleh tercampur. Cookie session tidak pernah diterima di `/v1/*`.

---

## 2. Password

- Algoritma: **argon2id** (`@node-rs/argon2`, prebuilt agar tidak butuh build native).
- Parameter awal: `memoryCost 19456 KiB, timeCost 2, parallelism 1` (tune sesuai hardware).
- Aturan password: min 8 karakter, maks 128, tolak password umum (cek list pendek), tidak memaksa simbol (UX) tapi wajibkan panjang.
- Jangan pernah log password. Redact di Sentry (lihat [13-SECURITY.md](./13-SECURITY.md)).

```ts
import { hash, verify } from '@node-rs/argon2';

export const hashPassword = (p: string) =>
  hash(p, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

export const verifyPassword = (h: string, p: string) =>
  verify(h, p).catch(() => false);
```

---

## 3. Session JWT

### 3.1 Struktur token

Header: `{ alg: "HS256", typ: "JWT" }`. Payload:

```json
{
  "sub": "usr_1",
  "role": "USER",
  "sid": "sess_ab12",
  "iat": 1723802400,
  "exp": 1723806000
}
```

- `exp`: **1 jam** (access). Token lebih lama via **refresh cookie terpisah** (opsional, TTL 30 hari).
- `sid`: id sesi unik; dipakai untuk rotasi & invalidasi (dengan Redis denylist).
- Secret: `AUTH_JWT_SECRET` (≥ 32 byte acak), di env, **beda per lingkungan**.

### 3.2 Sign & verify

```ts
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET!);

export async function signSession(p: { sub: string; role: string; sid: string }) {
  return await new SignJWT({ role: p.role, sid: p.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

export async function verifySession(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload as { sub: string; role: string; sid: string };
}
```

### 3.3 Set cookie

```ts
import { cookies } from 'next/headers';

export function setSessionCookie(token: string, maxAge: number) {
  cookies().set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}
```

### 3.4 Rotasi & invalidasi

- Setiap login: buat `sid` baru.
- Endpoint `/api/auth/sessions/rotate` menerbitkan token baru (rotasi berkala).
- Logout / ubah password / suspend: tambahkan `sid` ke Redis denylist dengan TTL = sisa masa token:

```ts
await redis.set(`denylist:${sid}`, '1', { ex: 3600 });
```

Middleware & endpoint memverifikasi `sid` tidak ada di denylist.

---

## 4. CSRF

Cookie `SameSite=Lax` menutup mayoritas CSRF. Untuk mutasi (POST/PATCH/DELETE) di `/api/*` dashboard, tambahkan **double-submit token**:

- Server set cookie `csrf_token` (non-httpOnly, acak) saat login.
- Client mengirim header `X-CSRF-Token` = nilai cookie.
- Server bandingkan header vs cookie; tolak bila beda/absen.

```ts
function assertCsrf(req: Request) {
  const cookie = parseCookie(req.headers.get('cookie') ?? '').csrf_token;
  const header = req.headers.get('x-csrf-token');
  if (!cookie || !header || cookie !== header) throw new ForbiddenError('csrf');
}
```

> `/v1/*` tidak butuh CSRF (auth pakai Bearer token, bukan cookie).

---

## 5. Role-based access

| Role | Akses |
|---|---|
| `USER` | `/api/auth/*`, `/api/keys/*`, `/api/billing/*`, `/api/models`, `/api/playground/*`, `/v1/*` |
| `ADMIN` | semua di atas + `/api/admin/*` |

Guard util:

```ts
export async function requireUser() {
  const token = cookies().get('auth_token')?.value;
  if (!token) throw new UnauthorizedError();
  const payload = await verifySession(token);
  if (await redis.get(`denylist:${payload.sid}`)) throw new UnauthorizedError();
  return payload; // { sub, role, sid }
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== 'ADMIN') throw new ForbiddenError('admin_required');
  return u;
}
```

---

## 6. Middleware proteksi route

```ts
// src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET!);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('auth_token')?.value;

  const isDashboard = pathname.startsWith('/dashboard') || pathname.startsWith('/playground');
  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (isDashboard || isAdmin) {
    if (!token) return redirectLogin(req);
    try {
      const { payload } = await jwtVerify(token, secret);
      if (isAdmin && payload.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    } catch {
      return redirectLogin(req);
    }
  }
  return NextResponse.next();
}

function redirectLogin(req: NextRequest) {
  const url = new URL('/login', req.url);
  url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/dashboard/:path*', '/playground/:path*', '/admin/:path*', '/api/admin/:path*'],
};
```

Catatan middleware: **hanya cek cepat** (signature + role). Pengecekan denylist `sid` tetap dilakukan di `requireUser()` (karena middleware edge tidak selalu bisa Redis call murah). Endpoint tetap memanggil `requireUser/requireAdmin`.

---

## 7. Alur login

```
POST /api/auth/login { email, password }
  1. rate limit per IP + per email (anti brute force; lihat [12-RATE-LIMITING.md])
  2. cari user by email (tanpa bocorkan ada/tidak)
  3. bila user ada: verifyPassword(hash, password)  ← selalu jalankan (timing-safe-ish)
  4. gagal → 401 invalid_credentials (pesan generik, jangan bedakan email/password)
  5. user.status = SUSPENDED → 403 account_suspended
  6. user.status = PENDING_EMAIL → 403 email_not_verified
       (login diblokir sampai email diverifikasi; UI `/login` menawarkan "Kirim ulang tautan verifikasi")
  7. user.status = DEACTIVATED → 401 invalid_credentials (tanpa bocor)
  8. sukses:
       - sid = nanoid()
       - token = signSession({ sub, role, sid })
       - set cookie auth_token (httpOnly) + csrf_token (non-httpOnly)
       - update lastLoginAt
       - (opsional) kirim email "login baru" bila IP/user-agent tak dikenal
       - balas { user, plan, balance }
```

Anti user-enumeration: response 401 selalu sama + waktu respons disamakan (selalu jalankan verify walau user tidak ada, bandingkan dengan dummy hash).

---

## 8. Alur register & verify email

```
POST /api/auth/register { email, password, name? }
  1. rate limit per IP
  2. validasi Zod
  3. cek email ada? (jika ada: tetap balas 201, kirim email "sudah terdaftar")
  4. hashPassword
  5. resolve plan default register (`getDefaultSignupPlan()`, env `SIGNUP_PLAN`, default `free`) → create User(status=PENDING_EMAIL, plan=free)
  6. token = randomBytes(32) ; simpan VerificationToken{ tokenHash=sha256(token), type=EMAIL_VERIFY, expires 24h }
  7. email link: https://app.mpruy.ai/verify?token=<token>
  8. balas 201 { ok: true }
```

```
POST /api/auth/verify-email { token }
  1. tokenHash = sha256(token); cari VerificationToken
  2. cek type=EMAIL_VERIFY, usedAt=null, expiresAt>now
  3. set User.status=ACTIVE, emailVerifiedAt=now
  4. tandai token usedAt=now
  5. balas ok (client redirect ke /login)
```

Edge: token kedaluwarsa → 400 + UI tawarkan kirim ulang.

Implementasi UI: halaman `/verify` (client component) memanggil endpoint ini saat dibuka, lalu menampilkan status **loading → berhasil (tombol "Masuk ke halaman login") → gagal (pesan + tombol "Kirim ulang" yang memanggil `POST /api/auth/resend-verification`)**. Halaman `/forgot-password` dan `/reset-password` mengikuti pola yang sama untuk alur reset.

---

## 9. Forgot & reset password

```
POST /api/auth/forgot-password { email }
  1. rate limit ketat (per email + per IP)
  2. cari user; SELALU balas { ok: true } (jangan ungkap ada/tidak)
  3. bila ada: buat VerificationToken{ type=PASSWORD_RESET, expires 1h }
  4. email link /reset?token=...
```

```
POST /api/auth/reset-password { token, password }
  1. validasi token (type=PASSWORD_RESET, belum dipakai, belum expire)
  2. validasi kekuatan password
  3. update passwordHash
  4. tandai token used
  5. INVALIDATE semua sesi user (rotasi: tambah semua sid terdaftar ke denylist,
     atau bump user.tokenVersion → token lama otomatis invalid)
  6. email notifikasi "password diubah"
```

Catatan: implementasi paling sederhana untuk invalidasi massal — tambah kolom `sessionVersion` (int) di `User`; JWT menyertakan `ver`; `requireUser` membandingkan `ver` dengan DB. Perubahan password/suspend menaikkan `sessionVersion` → semua token lama ditolak. (Alternatif Redis denylist per-sid lebih halus tapi lebih kompleks.)

---

## 10. Logout

```
POST /api/auth/logout
  1. ambil sid dari token
  2. tambah ke denylist Redis (TTL sisa token)
  3. clear cookies
```

---

## 11. Security best practices

| Praktik | Implementasi |
|---|---|
| Password hashing | argon2id |
| Session cookie | httpOnly, Secure, SameSite=Lax, Path=/ |
| CSRF | SameSite + double-submit token pada mutasi |
| Rotasi token | sid baru per login + rotate endpoint |
| Invalidasi massal | sessionVersion / denylist |
| Anti enumeration | pesan & waktu respons seragam |
| Anti brute force | rate limit per IP+email, lockout sementara |
| Timing attacks | selalu verify password (dummy hash bila user absen) |
| Transport | HTTPS wajib (HSTS dari [17](./17-DEPLOYMENT.md)) |
| Secret | `AUTH_JWT_SECRET` di env, rotasi berkala |
| Logging | redact token/password |

---

## 12. Referensi

- API key (jalur `/v1`) → [07-API-KEY-MANAGEMENT.md](./07-API-KEY-MANAGEMENT.md)
- Rate limiting → [12-RATE-LIMITING.md](./12-RATE-LIMITING.md)
- Security & secret → [13-SECURITY.md](./13-SECURITY.md)