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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('auth_token')?.value;

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

      return res;
    } catch {
      return redirectLogin(req);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/playground/:path*', '/admin/:path*', '/api/admin/:path*'],
};