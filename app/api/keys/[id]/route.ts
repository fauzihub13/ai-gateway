import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, assertCsrf } from '@/lib/auth';
import { toErrorResponse, BadRequestError, NotFoundError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';
import { publicKeyView } from '@/lib/key-view';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  rpmLimit: z.number().int().min(1).max(10_000).nullable().optional(),
  monthlyLimitIdr: z.number().int().min(0).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    assertCsrf(req);
    const data = PatchSchema.parse(await req.json());

    const key = await db.apiKey.findFirst({ where: { id: params.id, userId: s.sub } });
    if (!key) throw new NotFoundError('key_not_found', 'API key not found.');

    const updated = await db.apiKey.update({
      where: { id: key.id },
      data: {
        name: data.name,
        rpmLimit: data.rpmLimit === undefined ? undefined : data.rpmLimit,
        monthlyLimitIdr: data.monthlyLimitIdr === undefined ? undefined : data.monthlyLimitIdr,
      },
    });

    await db.adminAuditLog.create({
      data: {
        adminId: s.sub,
        action: 'apikey.update',
        targetType: 'ApiKey',
        targetId: key.id,
        metadata: { name: updated.name },
      },
    });

    return json({ key: publicKeyView(updated) }, 200, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    assertCsrf(req);

    const key = await db.apiKey.findFirst({ where: { id: params.id, userId: s.sub } });
    if (!key) throw new NotFoundError('key_not_found', 'API key not found.');

    await db.apiKey.update({
      where: { id: key.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    await db.adminAuditLog.create({
      data: {
        adminId: s.sub,
        action: 'apikey.revoke',
        targetType: 'ApiKey',
        targetId: key.id,
        metadata: { name: key.name, prefix: key.prefix },
      },
    });

    return json({ ok: true }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}