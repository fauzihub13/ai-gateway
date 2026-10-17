import { z } from 'zod';
import { db } from './db';
import { extractBearer, hashApiKey, looksLikeApiKey } from './apikey';
import { resolveModel, type ModelCapabilities } from './model-mapping';
import { getBalance, isFreeModel } from './billing';
import { enforceRateLimitsSafe, type RateHeaders } from './ratelimit';
import { UnauthorizedError, InsufficientBalanceError, TooManyRequestsError, BadRequestError } from './errors';
import type { ApiKey, Plan, Model } from '@prisma/client';

type ResolvedModel = Omit<Model, 'capabilities'> & { capabilities: ModelCapabilities };

export interface AuthContext {
  userId: string;
  apiKeyId: string;
  key: ApiKey;
  plan: Plan;
  planId: string;
  keyModels: string[] | null;
}

export async function authenticateApiKey(req: Request): Promise<AuthContext> {
  const raw = extractBearer(req.headers.get('authorization'));
  if (!raw || !looksLikeApiKey(raw)) throw new UnauthorizedError();

  const hash = hashApiKey(raw);

  const key = await db.apiKey.findUnique({ where: { keyHash: hash }, include: { user: { include: { plan: true } } } });
  if (!key) throw new UnauthorizedError();
  if (key.status !== 'ACTIVE') throw new UnauthorizedError();
  if (key.expiresAt && key.expiresAt < new Date()) throw new UnauthorizedError();
  if (key.user.status === 'SUSPENDED') throw new UnauthorizedError('account_suspended', 'Account suspended.');
  if (key.user.status !== 'ACTIVE') throw new UnauthorizedError();

  void db.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    userId: key.userId,
    apiKeyId: key.id,
    key,
    plan: key.user.plan,
    planId: key.user.planId,
    keyModels: key.scope === 'MODELS' ? key.allowedModels : null,
  };
}

export interface PreflightContext extends AuthContext {
  model: ResolvedModel;
  rateHeaders: RateHeaders;
}

/**
 * Tolak request hanya bila saldo <= 0 DAN model berbayar.
 * Model gratis (harga efektif 0) tetap bisa dipakai walau saldo 0 — biayanya 0.
 */
export async function assertBalance(
  userId: string,
  opts?: { model?: { priceInPer1kIdr: number; priceOutPer1kIdr: number }; plan?: { markup: number } },
): Promise<void> {
  const free = opts?.model && opts?.plan ? isFreeModel(opts.model, opts.plan) : false;
  if (free) return;
  const balance = await getBalance(userId);
  if (balance <= 0) throw new InsufficientBalanceError();
}

async function monthTokens(userId: string): Promise<number> {
  const agg = await db.usageLog.aggregate({
    where: { userId, createdAt: { gte: startOfMonth() } },
    _sum: { totalTokens: true },
  });
  return agg._sum.totalTokens ?? 0;
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function assertMonthlyQuota(ctx: AuthContext): Promise<void> {
  if (ctx.plan.monthlyTokenLimit == null) return;
  const used = await monthTokens(ctx.userId);
  if (used >= ctx.plan.monthlyTokenLimit) {
    throw new TooManyRequestsError('quota_exceeded', 'Monthly token quota exceeded.');
  }
}

export async function assertKeyMonthlyLimit(ctx: AuthContext, costEstimate: number): Promise<void> {
  if (ctx.key.monthlyLimitIdr == null) return;
  const agg = await db.usageLog.aggregate({
    where: { apiKeyId: ctx.apiKeyId, createdAt: { gte: startOfMonth() }, status: { not: 'REJECTED' } },
    _sum: { costIdr: true },
  });
  const spent = agg._sum.costIdr ?? 0;
  if (spent + costEstimate > ctx.key.monthlyLimitIdr) {
    throw new TooManyRequestsError('key_quota_exceeded', 'This API key has reached its monthly spending limit.');
  }
}

export async function preflight(
  req: Request,
  opts: { endpoint: string; modelName: string; ip: string },
): Promise<PreflightContext> {
  const { getMaintenance } = await import('./settings');
  const maintenance = await getMaintenance();
  if (maintenance.enabled) {
    const { UpstreamUnavailableError } = await import('./errors');
    throw new UpstreamUnavailableError(maintenance.message || 'Service is under maintenance. Please try again later.');
  }

  const auth = await authenticateApiKey(req);

  const rate = await enforceRateLimitsSafe({
    ip: opts.ip,
    userId: auth.userId,
    keyId: auth.apiKeyId,
    planRpm: auth.plan.rpmLimit,
    keyRpm: auth.key.rpmLimit,
  });
  if (!rate.ok) {
    const err = rate.res;
    return Promise.reject({ __rateLimited: true, res: err });
  }

  const model = await resolveModel(opts.modelName, auth.planId, auth.keyModels);
  await assertBalance(auth.userId, { model, plan: auth.plan });
  await assertMonthlyQuota(auth);

  return { ...auth, model, rateHeaders: rate.headers };
}

export function isRateLimited(e: unknown): e is { __rateLimited: true; res: Response } {
  return typeof e === 'object' && e !== null && '__rateLimited' in (e as object);
}

export const ChatBodySchema = z
  .object({
    model: z.string().min(1).max(64),
    messages: z
      .array(
        z.object({
          role: z.enum(['system', 'user', 'assistant', 'tool']),
          content: z.union([z.string().max(100_000), z.array(z.any()).max(50)]),
          name: z.string().max(64).optional(),
          tool_call_id: z.string().max(128).optional(),
        }),
      )
      .min(1)
      .max(200),
    stream: z.boolean().optional().default(false),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    max_tokens: z.number().int().min(1).max(32_000).optional(),
    stop: z.union([z.string().max(64), z.array(z.string().max(64)).max(4)]).optional(),
    tools: z.array(z.any()).max(64).optional(),
    tool_choice: z.union([z.string(), z.object({}).passthrough()]).optional(),
    response_format: z.object({ type: z.string() }).passthrough().optional(),
    user: z.string().max(128).optional(),
  })
  .passthrough();

export function assertCapabilities(
  model: { capabilities: ModelCapabilities },
  body: { stream?: boolean; tools?: unknown[]; response_format?: { type?: string }; messages: Array<{ content: unknown }> },
): void {
  const caps = model.capabilities ?? {};
  if (body.stream && caps.stream === false) {
    throw new BadRequestError('invalid_request_error', 'This model does not support streaming.');
  }
  if (body.tools && body.tools.length > 0 && caps.tools === false) {
    throw new BadRequestError('invalid_request_error', 'This model does not support tools.');
  }
  if (body.response_format?.type === 'json_object' && caps.jsonMode === false) {
    throw new BadRequestError('invalid_request_error', 'This model does not support json_object response format.');
  }
  const hasImage = body.messages.some(
    (m) => Array.isArray(m.content) && (m.content as Array<{ type?: string }>).some((p) => p?.type === 'image_url'),
  );
  if (hasImage && caps.vision === false) {
    throw new BadRequestError('invalid_request_error', 'This model does not support image input.');
  }
}