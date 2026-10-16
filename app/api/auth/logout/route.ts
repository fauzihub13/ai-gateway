import { clearAuthCookies } from '@/lib/auth';
import { json } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST() {
  clearAuthCookies();
  return json({ ok: true });
}