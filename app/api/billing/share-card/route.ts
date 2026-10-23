import { requireUser } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';
import { parseShareRange, rangeDays } from '@/lib/share-card-format';
import { buildShareCardData } from '@/lib/share-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Data kartu share "Usage Wrapped". Ringkas & hanya berisi agregat — tidak ada
 * informasi sensitif (email, nama key, dsb). Client yang merender gambar.
 */
export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    const range = parseShareRange(new URL(req.url).searchParams.get('days'));
    const days = rangeDays(range);
    const to = new Date();
    const from = days == null ? null : new Date(to.getTime() - days * 86_400_000);

    const data = await buildShareCardData(s.sub, { from, to, days });

    return json(data, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
