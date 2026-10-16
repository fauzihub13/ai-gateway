import { z } from 'zod';
import { requireAdmin, assertCsrf } from '@/lib/auth';
import { getMaintenance, setMaintenance } from '@/lib/settings';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    await requireAdmin();
    const maintenance = await getMaintenance();
    return json({ maintenance }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}

const Schema = z.object({
  maintenance: z.object({ enabled: z.boolean(), message: z.string().max(200).default('') }),
});

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);
    const { maintenance } = Schema.parse(await req.json());

    await setMaintenance(maintenance.enabled, maintenance.message);
    await db.adminAuditLog.create({
      data: {
        adminId: admin.sub,
        action: 'settings.update',
        metadata: { maintenance },
        ip: getClientIp(req),
      },
    });

    return json({ maintenance }, 200, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}