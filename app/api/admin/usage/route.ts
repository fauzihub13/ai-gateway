import { requireAdmin } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';
import { parseSummaryRange, summarizeByUser, summarizeUsage } from '@/lib/usage-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ringkasan usage admin.
 * - Tanpa `userId`: agregat per user (tabel "siapa paling banyak pakai").
 * - Dengan `userId`: breakdown satu user (day / model / key) — dipakai drilldown.
 */
export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const range = parseSummaryRange(searchParams);
    const userId = searchParams.get('userId');

    if (userId) {
      const summary = await summarizeUsage(userId, range);
      return json({ scope: 'user', userId, ...range, ...summary }, 200, { 'x-request-id': requestId });
    }

    const items = await summarizeByUser({ from: range.from, to: range.to, limit: 200 });
    const totals = items.reduce(
      (a, i) => ({ requests: a.requests + i.requests, tokens: a.tokens + i.tokens, cost: a.cost + i.cost }),
      { requests: 0, tokens: 0, cost: 0 },
    );

    return json({ scope: 'all', ...range, totals, items }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
