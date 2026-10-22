import { nanoid } from 'nanoid';
import { requireUser, setCsrfCookie, refreshSessionIfNeeded } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * Auto-recovery CSRF: bila csrf_token sudah hilang dari browser (mis. build-up
 * dari bug lama) tapi sesi masih valid, client panggil endpoint ini untuk
 * membuat csrf_token baru. Endpoint GET, dipanggil sebelum mutasi.
 */
export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    // Sliding sesi supaya auth_token tidak expired saat recovery dipanggil.
    await refreshSessionIfNeeded(s);
    setCsrfCookie(nanoid(24));
    return json({ ok: true }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
