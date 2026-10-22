import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, assertCsrf } from '@/lib/auth';
import { purchasePlan, toPlanView, PLAN_PERIOD_DAYS } from '@/lib/subscription';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

const Schema = z.object({
  plan: z.string().min(1).max(64),
});

/**
 * Beli / upgrade plan memakai saldo.
 * Saldo dipotong penuh di dalam satu transaksi DB (lihat src/lib/subscription.ts).
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    assertCsrf(req);
    const { plan } = Schema.parse(await req.json());

    const result = await purchasePlan(s.sub, plan);

    const row = await db.plan.findUniqueOrThrow({
      where: { id: result.subscription.planId },
      include: { models: { include: { model: { select: { publicName: true } } } } },
    });

    return json(
      {
        ok: true,
        plan: toPlanView(row),
        days: PLAN_PERIOD_DAYS,
        priceIdr: result.subscription.priceIdr,
        balance: result.balanceAfter,
        planExpiresAt: result.planExpiresAt.toISOString(),
      },
      201,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(
        new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.'),
        requestId,
      );
    }
    return toErrorResponse(err, requestId);
  }
}
