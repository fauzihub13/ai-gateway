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
    const take = Math.min(Number(searchParams.get('limit') ?? 25), 100);
    const cursor = searchParams.get('cursor') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const q = searchParams.get('q') ?? undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (q) where.email = { contains: q, mode: 'insensitive' };

    const items = await db.user.findMany({
      where,
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, name: true, role: true, status: true, balance: true,
        createdAt: true, planExpiresAt: true,
        plan: { select: { name: true } },
      },
    });

    return json({ items, nextCursor: items.at(-1)?.id ?? null }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}