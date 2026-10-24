import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const secret = () => new TextEncoder().encode(process.env.AUTH_JWT_SECRET!);

// Selaras dengan SESSION_TTL_SECONDS di src/lib/auth.ts
const TTL_SECONDS = 3600;
const REFRESH_THRESHOLD = TTL_SECONDS / 2; // refresh kalau sisa umur < 30 menit

function redirectLogin(req: NextRequest) {
  const url = new URL('/login', req.url);
  url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

/**
 * Hanya izinkan path internal sebagai tujuan redirect (`next`), supaya parameter
 * tidak bisa dipakai untuk open redirect ke domain lain.
 */
function safeNextPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  // Jangan pernah redirect balik ke halaman guest — bisa jadi loop.
  if (value === '/login' || value.startsWith('/login?') || value === '/register' || value.startsWith('/register?')) {
    return null;
  }
  return value;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('auth_token')?.value;

  const isAuthPage = pathname === '/login' || pathname === '/register';

  // Sudah login tapi membuka /login atau /register → langsung ke dashboard.
  // Token diverifikasi dulu; token rusak/expired dibiarkan lewat supaya user
  // bisa login ulang.
  if (isAuthPage) {
    if (!token) return NextResponse.next();
    try {
      await jwtVerify(token, secret());
      const target = safeNextPath(req.nextUrl.searchParams.get('next')) ?? '/dashboard';
      return NextResponse.redirect(new URL(target, req.url));
    } catch {
      return NextResponse.next();
    }
  }

  const isDashboard = pathname.startsWith('/dashboard') || pathname.startsWith('/playground');
  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (isDashboard || isAdmin) {
    if (!token) return redirectLogin(req);
    try {
      const { payload } = await jwtVerify(token, secret());
      if (isAdmin && payload.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }

      const res = NextResponse.next();

      // Sliding session: perpanjang cookie saat user masih aktif.
      const exp = typeof payload.exp === 'number' ? payload.exp : 0;
      const now = Math.floor(Date.now() / 1000);
      if (exp - now < REFRESH_THRESHOLD) {
        const fresh = await new SignJWT({ role: payload.role, sid: payload.sid, ver: payload.ver })
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject(String(payload.sub))
          .setIssuedAt()
          .setExpirationTime(`${TTL_SECONDS}s`)
          .sign(secret());
        res.cookies.set('auth_token', fresh, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: TTL_SECONDS,
        });
      }

      // Selalu perpanjang csrf_token di tiap request dashboard selama masih ada.
      // NB: tanpa ini csrf_token yang TTL-nya sama dengan auth_token (3600s) tapi
      // tidak ikut sliding akan expired setelah 1 jam, sementara auth_token tetap
      // hidup via sliding di atas → semua mutation gagal CSRF padahal masih login.
      const csrf = req.cookies.get('csrf_token')?.value;
      if (csrf) {
        res.cookies.set('csrf_token', csrf, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: TTL_SECONDS,
        });
      }

      return res;
    } catch {
      return redirectLogin(req);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/register',
    '/dashboard/:path*',
    '/playground/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
