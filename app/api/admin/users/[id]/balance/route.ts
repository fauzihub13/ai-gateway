import { db } from '@/lib/db';
import { requireAdmin, assertCsrf } from '@/lib/auth';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';
import { z } from 'zod';

export const runtime = 'nodejs';

const AdjustSchema = z.object({
  deltaIdr: z.number().int().refine((v) => v !== 0, 'delta must be non-zero'),
  reason: z.string().min(1).max(200),
  note: z.string().max(200).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);
    const body = AdjustSchema.parse(await req.json());

    const result = await db.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: params.id },
        data: { balance: { increment: body.deltaIdr } },
        select: { balance: true },
      });
      await tx.balanceLedger.create({
        data: {
          userId: params.id,
          deltaIdr: body.deltaIdr,
          balanceAfter: u.balance,
          reason: 'ADJUSTMENT',
          note: body.note ?? body.reason,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: admin.sub,
          action: 'user.balance.adjust',
          targetType: 'User',
          targetId: params.id,
          metadata: { deltaIdr: body.deltaIdr, reason: body.reason },
          ip: getClientIp(req),
        },
      });
      return u;
    });

    return json({ balance: result.balance }, 200, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}