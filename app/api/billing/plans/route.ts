import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getPlanStatus, toPlanView } from '@/lib/subscription';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daftar plan yang bisa dibeli + status plan user saat ini.
 * Plan gratis tetap ditampilkan supaya user tahu tier-nya, tapi tidak bisa dibeli.
 */
export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();

    const [plans, status, user] = await Promise.all([
      db.plan.findMany({
        where: { isActive: true },
        orderBy: { monthlyPriceIdr: 'asc' },
        include: { models: { include: { model: { select: { publicName: true } } } } },
      }),
      getPlanStatus(s.sub),
      db.user.findUniqueOrThrow({ where: { id: s.sub }, select: { balance: true } }),
    ]);

    return json(
      {
        balance: user.balance,
        currency: 'IDR',
        current: status,
        plans: plans.map(toPlanView),
      },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
