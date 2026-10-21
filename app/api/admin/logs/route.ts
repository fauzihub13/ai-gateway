import { requireAdmin } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';
import { listAllUsageLogs, parseUsageListQuery } from '@/lib/usage-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Log request semua user. Filter opsional: `userId`, `apiKeyId`, `modelId`, `from`, `to`. */
export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    await requireAdmin();
    const q = parseUsageListQuery(new URL(req.url).searchParams);
    const result = await listAllUsageLogs(q);
    return json(result, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
