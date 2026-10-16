import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { ForbiddenError, UnauthorizedError } from './errors';

const secret = () => new TextEncoder().encode(process.env.AUTH_JWT_SECRET!);

export interface SessionPayload {
  sub: string;
  role: 'USER' | 'ADMIN';
  sid: string;
  ver: number;
}

export async function signSession(p: { sub: string; role: string; sid: string; ver: number }): Promise<string> {
  return await new SignJWT({ role: p.role, sid: p.sid, ver: p.ver })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret());
  return payload as unknown as SessionPayload;
}

export const SESSION_COOKIE = 'auth_token';
export const CSRF_COOKIE = 'csrf_token';

export function setSessionCookie(token: string, maxAge = 3600): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function setCsrfCookie(token: string, maxAge = 3600): void {
  cookies().set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearAuthCookies(): void {
  cookies().delete(SESSION_COOKIE);
  cookies().delete(CSRF_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new UnauthorizedError('invalid_session', 'Not authenticated.');
  return s;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const s = await requireUser();
  if (s.role !== 'ADMIN') throw new ForbiddenError('admin_required', 'Admin access required.');
  return s;
}

export function assertCsrf(req: Request): void {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookiesMap: Record<string, string> = {};
  for (const c of cookieHeader.split(';')) {
    const idx = c.indexOf('=');
    if (idx === -1) continue;
    cookiesMap[c.slice(0, idx).trim()] = c.slice(idx + 1).trim();
  }
  const cookie = cookiesMap[CSRF_COOKIE];
  const header = req.headers.get('x-csrf-token');
  if (!cookie || !header || cookie !== header) {
    throw new ForbiddenError('csrf_failed', 'CSRF validation failed.');
  }
}