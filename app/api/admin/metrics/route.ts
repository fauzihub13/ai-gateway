import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RANGES = {
  all: null,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
} as const;

type Range = keyof typeof RANGES;

function parseRange(raw: string | null): Range {
  return raw && raw in RANGES ? (raw as Range) : 'all';
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const range = parseRange(searchParams.get('range'));

    const windowMs = RANGES[range];
    const from = windowMs ? new Date(Date.now() - windowMs) : null;
    const createdAt = from ? { gte: from } : undefined;

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [users, activeUsers, revMonth, usage, errors, topModels] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { status: 'ACTIVE' } }),
      db.transaction.aggregate({ where: { status: 'PAID', paidAt: { gte: monthStart } }, _sum: { amountIdr: true } }),
      db.usageLog.aggregate({
        where: { ...(createdAt ? { createdAt } : {}), status: { not: 'REJECTED' } },
        _count: { _all: true },
        _sum: { totalTokens: true, cachedPromptTokens: true, costIdr: true, chargedIdr: true, savedIdr: true },
      }),
      db.usageLog.count({ where: { ...(createdAt ? { createdAt } : {}), status: 'ERROR' } }),
      db.usageLog.groupBy({
        by: ['modelId'],
        where: { ...(createdAt ? { createdAt } : {}), status: { not: 'REJECTED' } },
        _count: { _all: true },
        _sum: { totalTokens: true, costIdr: true, chargedIdr: true, savedIdr: true },
        orderBy: { _count: { modelId: 'desc' } },
        take: 5,
      }),
    ]);

    const modelIds = topModels.map((m) => m.modelId);
    const models = await db.model.findMany({ where: { id: { in: modelIds } }, select: { id: true, publicName: true } });
    const modelName = Object.fromEntries(models.map((m) => [m.id, m.publicName]));

    const requests = usage._count._all;
    const errorRate = requests > 0 ? errors / requests : 0;

    return json(
      {
        range,
        users,
        activeUsers,
        revenueMonthIdr: revMonth._sum.amountIdr ?? 0,
        requests,
        tokens: usage._sum.totalTokens ?? 0,
        cachedTokens: usage._sum.cachedPromptTokens ?? 0,
        // Tiga angka biaya: nilai resmi, yang ditagih, dan hemat user.
        valueIdr: usage._sum.costIdr ?? 0,
        chargedIdr: usage._sum.chargedIdr ?? 0,
        savedIdr: usage._sum.savedIdr ?? 0,
        errors,
        errorRate,
        topModels: topModels.map((m) => ({
          model: modelName[m.modelId] ?? m.modelId,
          requests: m._count._all,
          tokens: m._sum.totalTokens ?? 0,
          value: m._sum.costIdr ?? 0,
          charged: m._sum.chargedIdr ?? 0,
          saved: m._sum.savedIdr ?? 0,
        })),
      },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
