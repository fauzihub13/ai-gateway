import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const take = Math.min(Number(searchParams.get('limit') ?? 50), 200);

    const logs = await db.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { admin: { select: { email: true } } },
    });

    return json(
      {
        logs: logs.map((l) => ({
          id: l.id, action: l.action, admin: l.admin.email,
          targetType: l.targetType, targetId: l.targetId, metadata: l.metadata, createdAt: l.createdAt,
        })),
      },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}