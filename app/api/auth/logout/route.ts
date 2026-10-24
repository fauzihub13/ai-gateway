import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Logout via fetch (dipakai tombol Keluar di dashboard). */
export async function POST() {
  clearAuthCookies();
  return json({ ok: true });
}

/**
 * Logout via navigasi biasa, dipakai saat server mendeteksi sesi yang tokennya
 * masih valid tapi usernya tidak layak masuk (dihapus / dinonaktifkan).
 * Cookie dibersihkan lebih dulu supaya middleware tidak me-redirect balik ke
 * dashboard (loop) ketika halaman /login dibuka.
 */
export async function GET(req: Request) {
  clearAuthCookies();
  const { searchParams, origin } = new URL(req.url);
  const url = new URL('/login', origin);
  const reason = searchParams.get('reason');
  if (reason) url.searchParams.set('error', reason);
  return NextResponse.redirect(url);
}
