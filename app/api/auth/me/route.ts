import { db } from '@/lib/db';
import { requireUser, refreshSessionIfNeeded } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    await refreshSessionIfNeeded(s).catch(() => undefined);
    const user = await db.user.findUniqueOrThrow({
      where: { id: s.sub },
      include: { plan: true },
    });
    return json(
      {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status },
        plan: user.plan.name,
        planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
        balance: user.balance,
      },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}