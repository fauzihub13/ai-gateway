import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { publicModelView } from '@/lib/model-mapping';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    const user = await db.user.findUniqueOrThrow({ where: { id: s.sub }, include: { plan: true } });

    const planModels = await db.planModel.findMany({
      where: { planId: user.planId },
      include: { model: true },
    });

    const models = planModels
      .map((pm) => pm.model)
      .filter((m) => m.isActive)
      .map((m) => publicModelView(m, user.plan));

    return json({ models }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}