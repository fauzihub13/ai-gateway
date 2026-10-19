import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Cursor keyset: (createdAt desc, id desc). Dienkode base64url supaya opaque
 * ke client dan tahan terhadap baris baru yang masuk di antara halaman.
 */
function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const [ts, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    const createdAt = new Date(ts);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    const { searchParams } = new URL(req.url);

    const rawLimit = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_LIMIT, 1), MAX_LIMIT);

    const apiKeyId = searchParams.get('apiKeyId');
    const modelId = searchParams.get('modelId');
    const from = parseDate(searchParams.get('from'));
    const to = parseDate(searchParams.get('to'));
    const cursorRaw = searchParams.get('cursor');
    const wantFacets = searchParams.get('facets') === '1';

    const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
    if (cursorRaw && !cursor) throw new BadRequestError('invalid_cursor', 'Invalid pagination cursor.');

    // Filter dasar selalu di-scope ke user yang login.
    const base: Prisma.UsageLogWhereInput = { userId: s.sub };
    if (apiKeyId) base.apiKeyId = apiKeyId;
    if (modelId) base.modelId = modelId;
    if (from || to) {
      base.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }

    const where: Prisma.UsageLogWhereInput = cursor
      ? {
          AND: [
            base,
            {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : base;

    const rows = await db.usageLog.findMany({
      where,
      include: {
        model: { select: { publicName: true, displayName: true } },
        apiKey: { select: { name: true, prefix: true, last4: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    const items = page.map((l) => ({
      id: l.id,
      requestId: l.requestId,
      createdAt: l.createdAt.toISOString(),
      model: l.model.publicName,
      modelDisplayName: l.model.displayName,
      apiKey: l.apiKey ? { name: l.apiKey.name, masked: `${l.apiKey.prefix}…${l.apiKey.last4}` } : null,
      endpoint: l.endpoint,
      status: l.status,
      streamed: l.streamed,
      promptTokens: l.promptTokens,
      completionTokens: l.completionTokens,
      cachedPromptTokens: l.cachedPromptTokens,
      totalTokens: l.totalTokens,
      costIdr: l.costIdr,
      latencyMs: l.latencyMs,
      upstreamLatencyMs: l.upstreamLatencyMs,
      errorCode: l.errorCode,
    }));

    // Facet: daftar model & API key yang benar-benar pernah dipakai user,
    // dipakai untuk mengisi dropdown filter. Hanya dihitung bila diminta.
    let facets: { models: unknown[]; keys: unknown[] } | undefined;
    if (wantFacets) {
      const [modelFacets, keyFacets] = await Promise.all([
        db.usageLog.groupBy({ by: ['modelId'], where: { userId: s.sub }, _count: { _all: true } }),
        db.usageLog.groupBy({ by: ['apiKeyId'], where: { userId: s.sub }, _count: { _all: true } }),
      ]);
      const modelIds = modelFacets.map((f) => f.modelId);
      const keyIds = keyFacets
        .map((f) => f.apiKeyId)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);

      const [models, keys] = await Promise.all([
        db.model.findMany({
          where: { id: { in: modelIds } },
          select: { id: true, publicName: true, displayName: true },
          orderBy: { publicName: 'asc' },
        }),
        db.apiKey.findMany({
          where: { id: { in: keyIds } },
          select: { id: true, name: true, prefix: true, last4: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      facets = {
        models: models.map((m) => ({ id: m.id, publicName: m.publicName, displayName: m.displayName })),
        keys: keys.map((k) => ({ id: k.id, name: k.name, masked: `${k.prefix}…${k.last4}` })),
      };
    }

    return json(
      { items, nextCursor, hasMore, ...(facets ? { facets } : {}) },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
