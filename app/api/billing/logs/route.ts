import { requireUser } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';
import { listUsageLogs, parseUsageListQuery } from '@/lib/usage-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    const q = parseUsageListQuery(new URL(req.url).searchParams);
    const result = await listUsageLogs(s.sub, q);
    return json(result, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
