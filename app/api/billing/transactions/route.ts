import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? 1));
    const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);

    const [items, total] = await Promise.all([
      db.transaction.findMany({
        where: { userId: s.sub },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, orderId: true, amountIdr: true, status: true,
          method: true, redirectUrl: true, paidAt: true, createdAt: true,
        },
      }),
      db.transaction.count({ where: { userId: s.sub } }),
    ]);

    return json({ items, total, page, limit }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}