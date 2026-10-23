import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, assertCsrf } from '@/lib/auth';
import { nineRouterFetch } from '@/lib/ninerouter';
import { settleUsage, computeCostBreakdown, getBalance, isFreeModel } from '@/lib/billing';
import { ensureQuotaPeriod } from '@/lib/subscription';
import { estimatePromptTokens, estimateTokens } from '@/lib/tokens';
import {
  toErrorResponse,
  BadRequestError,
  InsufficientBalanceError,
  ForbiddenError,
  NotFoundError,
  PlanExpiredError,
  TooManyRequestsError,
} from '@/lib/errors';
import { mapUpstreamError } from '@/lib/upstream';
import { extractCachedTokens } from '@/lib/stream';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Schema = z.object({
  model: z.string().min(1).max(64),
  messages: z
    .array(z.object({ role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.union([z.string(), z.array(z.any()), z.null()]) }))
    .min(1),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(32_000).optional(),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  try {
    const s = await requireUser();
    assertCsrf(req);
    const body = Schema.parse(await req.json());

    const user = await db.user.findUniqueOrThrow({ where: { id: s.sub }, include: { plan: true } });

    // Gerbang masa aktif plan: lewat `planExpiresAt` → tolak sampai beli lagi.
    // Plan tidak diturunkan otomatis; admin menurunkannya manual bila perlu.
    if (user.planExpiresAt && user.planExpiresAt.getTime() <= Date.now()) {
      throw new PlanExpiredError('Masa aktif plan sudah habis. Perpanjang dari dashboard untuk memakai playground lagi.');
    }

    const model = await db.model.findUnique({ where: { publicName: body.model } });
    if (!model || !model.isActive) throw new NotFoundError('model_not_found', `The model \`${body.model}\` does not exist.`);

    const access = await db.planModel.findUnique({
      where: { planId_modelId: { planId: user.planId, modelId: model.id } },
    });
    if (!access) throw new ForbiddenError('model_not_allowed', `You do not have access to model \`${body.model}\`.`);

    // Gerbang kuota token per periode plan (plan berkuota) — helper yang sama
    // dengan gateway API supaya aturannya satu sumber.
    const period = await ensureQuotaPeriod(user.id);
    if (period.planTokenQuota != null && period.planStartedAt) {
      const agg = await db.usageLog.aggregate({
        where: { userId: user.id, createdAt: { gte: period.planStartedAt }, status: { not: 'REJECTED' } },
        _sum: { totalTokens: true },
      });
      if ((agg._sum.totalTokens ?? 0) >= period.planTokenQuota) {
        throw new TooManyRequestsError(
          'quota_exceeded',
          'Kuota token periode ini sudah habis. Beli plan lagi untuk menambah kuota.',
        );
      }
    }

    // PAYG: saldo harus > 0 (kecuali model gratis). SUBSCRIPTION: tanpa potong saldo.
    if (user.plan.billingMode !== 'SUBSCRIPTION' && !isFreeModel(model, user.plan)) {
      const balance = await getBalance(s.sub);
      if (balance <= 0) throw new InsufficientBalanceError();
    }

    const upstream = await nineRouterFetch('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ ...body, model: model.internalName, stream: false }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!upstream.ok) {
      await settleUsage({
        requestId, userId: user.id, modelId: model.id, endpoint: 'playground',
        promptTokens: estimatePromptTokens(body.messages), completionTokens: 0, costIdr: 0,
        status: 'ERROR', latencyMs: Date.now() - start,
      }).catch(() => undefined);
      return mapUpstreamError(upstream, requestId);
    }

    const data = (await upstream.json()) as Record<string, unknown>;
    data.model = model.publicName;

    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
    const promptTokens = usage?.prompt_tokens ?? estimatePromptTokens(body.messages);
    const completionTokens =
      usage?.completion_tokens ??
      estimateTokens(String((data.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content ?? ''));
    const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
    const cachedPromptTokens = extractCachedTokens(data.usage as Record<string, unknown> | undefined);
    data.usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      prompt_tokens_details: { cached_tokens: cachedPromptTokens },
    };

    const cost = computeCostBreakdown({
      model, plan: user.plan, promptTokens, completionTokens, cachedPromptTokens,
    });

    await settleUsage({
      requestId, userId: user.id, modelId: model.id, endpoint: 'playground',
      promptTokens, completionTokens, cachedPromptTokens,
      costIdr: cost.valueIdr, chargedIdr: cost.chargedIdr, savedIdr: cost.savedIdr,
      status: 'COMPLETED',
      streamed: false, latencyMs: Date.now() - start,
    });

    return json(data, 200, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}