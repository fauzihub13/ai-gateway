import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const secret = () => new TextEncoder().encode(process.env.AUTH_JWT_SECRET!);

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
    } catch {
      return redirectLogin(req);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/playground/:path*', '/admin/:path*', '/api/admin/:path*'],
};