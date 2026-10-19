import { z } from 'zod';
import {
  preflight,
  isRateLimited,
  ChatBodySchema,
  assertCapabilities,
  enforceModelLimits,
  assertKeyMonthlyLimit,
  type PreflightContext,
} from '@/lib/proxy';
import { nineRouterFetch } from '@/lib/ninerouter';
import { createNormalizer, extractCachedTokens } from '@/lib/stream';
import { settleUsage, computeCost } from '@/lib/billing';
import { estimatePromptTokens, estimateTokens, promptToText } from '@/lib/tokens';
import { toErrorResponse, BadRequestError, InternalError } from '@/lib/errors';
import { mapUpstreamError } from '@/lib/upstream';
import { getRequestId, getClientIp, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  let ctx: PreflightContext | null = null;

  try {
    const rawBody = await req.json();
    const body = ChatBodySchema.parse(rawBody);
    const ip = getClientIp(req);

    ctx = await preflight(req, { endpoint: 'chat.completions', modelName: body.model, ip });
    assertCapabilities(ctx.model, body);
    const limited = enforceModelLimits(ctx.model, body);

    // Gerbang limit per-key dicek SEKARANG (sebelum upstream), bukan tengah stream.
    // Estimasi pakai max_tokens yang sudah di-clamp; settle tetap rekam biaya aktual.
    await assertKeyMonthlyLimit(
      ctx,
      computeCost({
        model: ctx.model,
        plan: ctx.plan,
        promptTokens: estimatePromptTokens(limited.messages),
        completionTokens: limited.max_tokens ?? 0,
      }),
    );

    const wantsStream = body.stream === true;
    const promptText = promptToText(body.messages);

    const upstreamBody = { ...limited, model: ctx.model.internalName, stream: wantsStream };
    const upstreamStart = Date.now();

    const upstream = await nineRouterFetch('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(wantsStream ? 300_000 : 120_000),
    }).catch((e: unknown) => {
      if (e instanceof Error && e.name === 'TimeoutError') throw new InternalError('upstream_timeout');
      throw new InternalError('upstream_unavailable');
    });

    if (!upstream.ok) {
      await recordUsage(ctx, {
        requestId, endpoint: 'chat.completions', streamed: wantsStream,
        promptTokens: estimatePromptTokens(body.messages), completionTokens: 0,
        costIdr: 0, status: 'ERROR', latencyMs: Date.now() - start, errorCode: `upstream_${upstream.status}`,
      });
      return mapUpstreamError(upstream, requestId);
    }

    if (!wantsStream) {
      const data = (await upstream.json()) as Record<string, unknown>;
      data.model = ctx.model.publicName;

      const usage = data.usage as
        | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
        | undefined;
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

      const cost = computeCost({
        model: ctx.model, plan: ctx.plan,
        promptTokens, completionTokens, cachedPromptTokens,
      });
      await assertKeyMonthlyLimit(ctx, cost);
      await recordUsage(ctx, {
        requestId, endpoint: 'chat.completions', streamed: false,
        promptTokens, completionTokens, cachedPromptTokens, costIdr: cost, status: 'COMPLETED',
        latencyMs: Date.now() - start, upstreamLatencyMs: Date.now() - upstreamStart,
      });

      return json(data, 200, { ...ctx.rateHeaders, 'x-request-id': requestId });
    }

    // Kontrak: sekali stream mulai, TIDAK dipotong karena limit/billing. Semua gerbang
    // (auth, rate, saldo, quota, key limit, context) sudah lewat di atas. onSettle hanya
    // mencatat biaya aktual (best-effort) — tidak membatalkan stream.
    const finalCtx = ctx;
    const normalizer = createNormalizer(
      finalCtx.model.publicName,
      finalCtx.model.internalName,
      promptText,
      async (state) => {
        const usage = state.usage!;
        const status =
          state.finishReason === 'stop' || state.sawDone ? 'COMPLETED' : 'PARTIAL';
        const cost = computeCost({
          model: finalCtx.model, plan: finalCtx.plan,
          promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
          cachedPromptTokens: usage.cachedPromptTokens,
        });
        await recordUsage(finalCtx, {
          requestId, endpoint: 'chat.completions', streamed: true,
          promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
          cachedPromptTokens: usage.cachedPromptTokens ?? 0,
          costIdr: cost, status, latencyMs: Date.now() - start,
          upstreamLatencyMs: Date.now() - upstreamStart,
        });
      },
    );

    const normalized = upstream.body!.pipeThrough(normalizer);

    return new Response(normalized, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...ctx.rateHeaders,
        'x-request-id': requestId,
      },
    });
  } catch (err) {
    if (isRateLimited(err)) return err.res;
    if (err instanceof z.ZodError) {
      const issue = err.errors[0];
      const message =
        issue?.code === 'invalid_union'
          ? `Invalid \`${issue.path.join('.')}\`: expected string, array of content parts, or null.`
          : issue?.message ?? 'Invalid body.';
      return toErrorResponse(
        new BadRequestError('invalid_request_error', message, issue?.path.join('.') ?? null),
        requestId,
      );
    }
    return toErrorResponse(err, requestId);
  }
}

interface UsageRecord {
  requestId: string;
  endpoint: string;
  streamed: boolean;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens?: number;
  costIdr: number;
  status: 'COMPLETED' | 'PARTIAL' | 'ERROR' | 'REJECTED';
  latencyMs: number;
  upstreamLatencyMs?: number;
  errorCode?: string;
}

async function recordUsage(ctx: PreflightContext, u: UsageRecord): Promise<void> {
  try {
    await settleUsage({
      requestId: u.requestId,
      userId: ctx.userId,
      apiKeyId: ctx.apiKeyId,
      modelId: ctx.model.id,
      endpoint: u.endpoint,
      promptTokens: u.promptTokens,
      completionTokens: u.completionTokens,
      cachedPromptTokens: u.cachedPromptTokens ?? 0,
      costIdr: u.costIdr,
      status: u.status,
      streamed: u.streamed,
      latencyMs: u.latencyMs,
      upstreamLatencyMs: u.upstreamLatencyMs,
      errorCode: u.errorCode,
    });
  } catch (e) {
    console.error('usage_settle_failed', { requestId: u.requestId, error: String(e) });
  }
}