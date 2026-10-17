import { db } from '@/lib/db';
import { requireAdmin, assertCsrf } from '@/lib/auth';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';
import { z } from 'zod';

export const runtime = 'nodejs';

const Schema = z.object({ action: z.enum(['suspend', 'unsuspend', 'verify']) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);
    const { action } = Schema.parse(await req.json());

    if (params.id === admin.sub && action !== 'verify') {
      throw new BadRequestError('invalid_request_error', 'Cannot suspend your own account.');
    }

    // `verify` = aktifkan manual user yang masih PENDING_EMAIL (mis. email tak bisa dikirim).
    const user =
      action === 'verify'
        ? await db.user.update({
            where: { id: params.id },
            data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
          })
        : await db.user.update({
            where: { id: params.id },
            data: { status: action === 'suspend' ? 'SUSPENDED' : 'ACTIVE' },
          });

    await db.adminAuditLog.create({
      data: {
        adminId: admin.sub,
        action: `user.${action}`,
        targetType: 'User',
        targetId: params.id,
        metadata: { email: user.email },
        ip: getClientIp(req),
      },
    });

    return json({ ok: true, status: user.status }, 200, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}