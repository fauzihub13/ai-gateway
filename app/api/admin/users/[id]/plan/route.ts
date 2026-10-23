import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, assertCsrf } from '@/lib/auth';
import { grantPlan } from '@/lib/subscription';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';

export const runtime = 'nodejs';

// Admin mengganti plan user TANPA memotong saldo (kompensasi, hadiah, migrasi
// manual). `days = 0` berarti plan diberikan tanpa expiry (khusus plan gratis).
const Schema = z.object({
  plan: z.string().min(1).max(64),
  // Opsional: override panjang periode. Bila tidak diisi, dipakai `Plan.periodDays`.
  days: z.number().int().min(0).max(3650).optional(),
  note: z.string().max(200).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);
    const body = Schema.parse(await req.json());

    const user = await db.user.findUnique({ where: { id: params.id }, select: { id: true, email: true } });
    if (!user) throw new BadRequestError('user_not_found', 'User not found.');

    const result = await grantPlan(params.id, body.plan, body.days);

    await db.adminAuditLog.create({
      data: {
        adminId: admin.sub,
        action: 'user.plan.grant',
        targetType: 'User',
        targetId: params.id,
        metadata: {
          email: user.email,
          plan: body.plan,
          days: body.days,
          subscriptionId: result.subscription?.id ?? null,
          note: body.note ?? null,
        },
        ip: getClientIp(req),
      },
    });

    return json(
      {
        ok: true,
        plan: body.plan,
        planExpiresAt: result.planExpiresAt?.toISOString() ?? null,
      },
      200,
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
