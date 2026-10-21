import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { BadRequestError } from '@/lib/errors';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Cursor keyset: (createdAt desc, id desc). Dienkode base64url supaya opaque
 * ke client dan tahan terhadap baris baru yang masuk di antara halaman.
 */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
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

export interface UsageListQuery {
  limit: number;
  /** Filter per user. Hanya dipakai admin; user biasa selalu di-scope ke dirinya. */
  userId: string | null;
  apiKeyId: string | null;
  modelId: string | null;
  from: Date | null;
  to: Date | null;
  cursor: { createdAt: Date; id: string } | null;
  facets: boolean;
}

export function parseUsageListQuery(searchParams: URLSearchParams): UsageListQuery {
  const rawLimit = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_LIMIT, 1), MAX_LIMIT);
  const cursorRaw = searchParams.get('cursor');
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) throw new BadRequestError('invalid_cursor', 'Invalid pagination cursor.');

  return {
    limit,
    userId: searchParams.get('userId'),
    apiKeyId: searchParams.get('apiKeyId'),
    modelId: searchParams.get('modelId'),
    from: parseDate(searchParams.get('from')),
    to: parseDate(searchParams.get('to')),
    cursor,
    facets: searchParams.get('facets') === '1',
  };
}

export interface UsageLogItem {
  id: string;
  requestId: string;
  createdAt: string;
  model: string;
  modelDisplayName: string;
  apiKey: { name: string; masked: string } | null;
  endpoint: string;
  status: string;
  streamed: boolean;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  totalTokens: number;
  costIdr: number;
  latencyMs: number | null;
  upstreamLatencyMs: number | null;
  errorCode: string | null;
}

export interface UsageFacets {
  models: Array<{ id: string; publicName: string; displayName: string }>;
  keys: Array<{ id: string; name: string; masked: string }>;
}

/**
 * Inti query log. `base` WAJIB sudah membawa scope (userId untuk route user,
 * kosong untuk admin) supaya tidak ada jalur yang lupa memfilter.
 */
async function listLogs(
  base: Prisma.UsageLogWhereInput,
  q: UsageListQuery,
): Promise<{ items: UsageLogItem[]; nextCursor: string | null; hasMore: boolean; facets?: UsageFacets }> {
  // Facet memakai scope murni (tanpa filter tanggal/model) — snapshot dulu
  // sebelum `base` ditambah filter di bawah.
  const scope: Prisma.UsageLogWhereInput = { ...base };
  if (q.apiKeyId) base.apiKeyId = q.apiKeyId;
  if (q.modelId) base.modelId = q.modelId;
  if (q.from || q.to) {
    base.createdAt = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) };
  }

  const where: Prisma.UsageLogWhereInput = q.cursor
    ? {
        AND: [
          base,
          {
            OR: [
              { createdAt: { lt: q.cursor.createdAt } },
              { createdAt: q.cursor.createdAt, id: { lt: q.cursor.id } },
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
    take: q.limit + 1,
  });

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  const items: UsageLogItem[] = page.map((l) => ({
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
  let facets: UsageFacets | undefined;
  if (q.facets) {
    const [modelFacets, keyFacets] = await Promise.all([
      db.usageLog.groupBy({ by: ['modelId'], where: scope, _count: { _all: true } }),
      db.usageLog.groupBy({ by: ['apiKeyId'], where: scope, _count: { _all: true } }),
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

  return { items, nextCursor, hasMore, ...(facets ? { facets } : {}) };
}

/** Log milik satu user. Selalu di-scope ke `userId`. */
export async function listUsageLogs(userId: string, q: UsageListQuery) {
  return listLogs({ userId }, q);
}

/** Log semua user (admin). Scope kosong; filter `userId` opsional dari query. */
export async function listAllUsageLogs(q: UsageListQuery) {
  return listLogs(q.userId ? { userId: q.userId } : {}, q);
}

export type UsageGroupBy = 'day' | 'model' | 'key';

export interface UsageBucket {
  key: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface UsageSummary {
  totals: { requests: number; tokens: number; cost: number };
  items: UsageBucket[];
}

function parseGroupBy(raw: string | null): UsageGroupBy {
  return raw === 'model' || raw === 'key' ? raw : 'day';
}

/** Rentang default 30 hari; `days` di-clamp 1..365. */
export function parseSummaryRange(searchParams: URLSearchParams): {
  groupBy: UsageGroupBy;
  from: Date;
  to: Date;
} {
  const rawDays = Number(searchParams.get('days') ?? 30);
  const days = Math.min(Math.max(Number.isFinite(rawDays) ? Math.floor(rawDays) : 30, 1), 365);
  const to = parseDate(searchParams.get('to')) ?? new Date();
  const from = parseDate(searchParams.get('from')) ?? new Date(to.getTime() - days * 86_400_000);
  return { groupBy: parseGroupBy(searchParams.get('groupBy')), from, to };
}

export interface PerUserUsage {
  userId: string;
  email: string;
  requests: number;
  tokens: number;
  cost: number;
}

/** Agregasi usage per user (admin). Diurutkan dari biaya terbesar. */
export async function summarizeByUser(opts: { from: Date; to: Date; limit?: number }): Promise<PerUserUsage[]> {
  const rows = await db.usageLog.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: opts.from, lte: opts.to }, status: { not: 'REJECTED' } },
    _count: { _all: true },
    _sum: { totalTokens: true, costIdr: true },
    orderBy: { _sum: { costIdr: 'desc' } },
    take: Math.min(Math.max(opts.limit ?? 100, 1), 500),
  });

  const users = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, email: true },
  });
  const email = Object.fromEntries(users.map((u) => [u.id, u.email]));

  return rows.map((r) => ({
    userId: r.userId,
    email: email[r.userId] ?? r.userId,
    requests: r._count._all,
    tokens: r._sum.totalTokens ?? 0,
    cost: r._sum.costIdr ?? 0,
  }));
}

/**
 * Agregasi usage satu user dalam rentang waktu. Dihitung di Postgres
 * (bukan menarik semua baris ke Node) supaya user dengan traffic tinggi
 * tidak memotong data diam-diam.
 */
export async function summarizeUsage(
  userId: string,
  opts: { groupBy: UsageGroupBy; from: Date; to: Date },
): Promise<UsageSummary> {
  const where: Prisma.UsageLogWhereInput = {
    userId,
    createdAt: { gte: opts.from, lte: opts.to },
    status: { not: 'REJECTED' },
  };

  const totalsAgg = await db.usageLog.aggregate({
    where,
    _count: { _all: true },
    _sum: { totalTokens: true, costIdr: true },
  });

  const totals = {
    requests: totalsAgg._count._all,
    tokens: totalsAgg._sum.totalTokens ?? 0,
    cost: totalsAgg._sum.costIdr ?? 0,
  };

  let items: UsageBucket[] = [];

  if (opts.groupBy === 'model') {
    const rows = await db.usageLog.groupBy({
      by: ['modelId'],
      where,
      _count: { _all: true },
      _sum: { totalTokens: true, costIdr: true },
      orderBy: { _sum: { costIdr: 'desc' } },
    });
    const models = await db.model.findMany({
      where: { id: { in: rows.map((r) => r.modelId) } },
      select: { id: true, publicName: true },
    });
    const names = Object.fromEntries(models.map((m) => [m.id, m.publicName]));
    items = rows.map((r) => ({
      key: names[r.modelId] ?? r.modelId,
      requests: r._count._all,
      tokens: r._sum.totalTokens ?? 0,
      cost: r._sum.costIdr ?? 0,
    }));
  } else if (opts.groupBy === 'key') {
    const rows = await db.usageLog.groupBy({
      by: ['apiKeyId'],
      where,
      _count: { _all: true },
      _sum: { totalTokens: true, costIdr: true },
      orderBy: { _sum: { costIdr: 'desc' } },
    });
    const ids = rows.map((r) => r.apiKeyId).filter((v): v is string => Boolean(v));
    const keys = await db.apiKey.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, prefix: true, last4: true },
    });
    const names = Object.fromEntries(keys.map((k) => [k.id, `${k.name} (${k.prefix}…${k.last4})`]));
    items = rows.map((r) => ({
      key: r.apiKeyId ? names[r.apiKeyId] ?? r.apiKeyId : 'tanpa key',
      requests: r._count._all,
      tokens: r._sum.totalTokens ?? 0,
      cost: r._sum.costIdr ?? 0,
    }));
  } else {
    // Prisma groupBy tidak bisa date_trunc, jadi pakai raw.::"UsageStatus"
    // eksplisit supaya literal enum tidak ambigu.
    const rows = await db.$queryRaw<
      Array<{ key: string; requests: bigint; tokens: bigint | null; cost: bigint | null }>
    >(Prisma.sql`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS key,
             count(*) AS requests,
             COALESCE(sum("totalTokens"), 0) AS tokens,
             COALESCE(sum("costIdr"), 0) AS cost
      FROM "UsageLog"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${opts.from}
        AND "createdAt" <= ${opts.to}
        AND status <> 'REJECTED'::"UsageStatus"
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    items = rows.map((r) => ({
      key: r.key,
      requests: Number(r.requests),
      tokens: Number(r.tokens ?? 0),
      cost: Number(r.cost ?? 0),
    }));
  }

  return { totals, items };
}
