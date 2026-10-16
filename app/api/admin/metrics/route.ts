import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    await requireAdmin();

    const since = new Date(Date.now() - 86_400_000);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [users, activeUsers, reqToday, revToday, errToday, tokensToday] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { status: 'ACTIVE' } }),
      db.usageLog.count({ where: { createdAt: { gte: since } } }),
      db.transaction.aggregate({ where: { status: 'PAID', paidAt: { gte: monthStart } }, _sum: { amountIdr: true } }),
      db.usageLog.count({ where: { createdAt: { gte: since }, status: 'ERROR' } }),
      db.usageLog.aggregate({ where: { createdAt: { gte: since }, status: { not: 'REJECTED' } }, _sum: { totalTokens: true } }),
    ]);

    const topModels = await db.usageLog.groupBy({
      by: ['modelId'],
      where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, status: { not: 'REJECTED' } },
      _count: { _all: true },
      _sum: { totalTokens: true, costIdr: true },
      orderBy: { _count: { modelId: 'desc' } },
      take: 5,
    });

    const modelIds = topModels.map((m) => m.modelId);
    const models = await db.model.findMany({ where: { id: { in: modelIds } }, select: { id: true, publicName: true } });
    const modelName = Object.fromEntries(models.map((m) => [m.id, m.publicName]));

    const errorRate = reqToday > 0 ? errToday / reqToday : 0;

    return json(
      {
        users,
        activeUsers,
        reqToday,
        revenueMonthIdr: revToday._sum.amountIdr ?? 0,
        errorRate,
        tokensToday: tokensToday._sum.totalTokens ?? 0,
        topModels: topModels.map((m) => ({
          model: modelName[m.modelId] ?? m.modelId,
          requests: m._count._all,
          tokens: m._sum.totalTokens ?? 0,
          cost: m._sum.costIdr ?? 0,
        })),
      },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}