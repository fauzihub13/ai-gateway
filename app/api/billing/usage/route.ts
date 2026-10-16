import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getBalance } from '@/lib/billing';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    const { searchParams } = new URL(req.url);
    const groupBy = searchParams.get('groupBy') ?? 'day';
    const days = Math.min(Number(searchParams.get('days') ?? 30), 90);
    const from = new Date(Date.now() - days * 86_400_000);

    const [balance, logs] = await Promise.all([
      getBalance(s.sub),
      db.usageLog.findMany({
        where: { userId: s.sub, createdAt: { gte: from }, status: { not: 'REJECTED' } },
        include: { model: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ]);

    const buckets = new Map<string, { requests: number; tokens: number; cost: number }>();
    for (const l of logs) {
      const key =
        groupBy === 'model'
          ? l.model.publicName
          : groupBy === 'key'
            ? (l.apiKeyId ?? 'none')
            : l.createdAt.toISOString().slice(0, 10);
      const b = buckets.get(key) ?? { requests: 0, tokens: 0, cost: 0 };
      b.requests += 1;
      b.tokens += l.totalTokens;
      b.cost += l.costIdr;
      buckets.set(key, b);
    }

    const totals = logs.reduce(
      (acc, l) => ({ requests: acc.requests + 1, tokens: acc.tokens + l.totalTokens, cost: acc.cost + l.costIdr }),
      { requests: 0, tokens: 0, cost: 0 },
    );

    return json(
      {
        balance,
        currency: 'IDR',
        totals,
        items: [...buckets.entries()].map(([key, v]) => ({ key, ...v })),
      },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}