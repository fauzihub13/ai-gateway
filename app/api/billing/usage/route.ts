import { requireUser } from '@/lib/auth';
import { getBalance } from '@/lib/billing';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';
import { parseSummaryRange, summarizeUsage } from '@/lib/usage-query';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    const range = parseSummaryRange(new URL(req.url).searchParams);

    const [balance, summary] = await Promise.all([getBalance(s.sub), summarizeUsage(s.sub, range)]);

    return json(
      { balance, currency: 'IDR', ...summary },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
