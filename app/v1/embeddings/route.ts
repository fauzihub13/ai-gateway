import { z } from 'zod';
import { preflight, isRateLimited } from '@/lib/proxy';
import { nineRouterFetch } from '@/lib/ninerouter';
import { settleUsage, computeCost } from '@/lib/billing';
import { estimateTokens } from '@/lib/tokens';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { mapUpstreamError } from '@/lib/upstream';
import { getRequestId, getClientIp, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Schema = z.object({
  model: z.string().min(1).max(64),
  input: z.union([z.string().max(100_000), z.array(z.string().max(100_000)).max(200)]),
  encoding_format: z.enum(['float', 'base64']).optional(),
  dimensions: z.number().int().min(1).max(4096).optional(),
  user: z.string().max(128).optional(),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  try {
    const body = Schema.parse(await req.json());

    const ctx = await preflight(req, { endpoint: 'embeddings', modelName: body.model, ip: getClientIp(req) });

    if ((ctx.model.capabilities as Record<string, boolean>)?.embedding === false) {
      throw new BadRequestError('invalid_request_error', 'This model does not support embeddings.');
    }

    const upstream = await nineRouterFetch('/v1/embeddings', {
      method: 'POST',
      body: JSON.stringify({ ...body, model: ctx.model.internalName }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!upstream.ok) return mapUpstreamError(upstream, requestId);

    const data = (await upstream.json()) as Record<string, unknown>;
    data.model = ctx.model.publicName;

    const usage = data.usage as { prompt_tokens?: number; total_tokens?: number } | undefined;
    const inputText = Array.isArray(body.input) ? body.input.join(' ') : body.input;
    const promptTokens = usage?.prompt_tokens ?? estimateTokens(inputText);
    const totalTokens = usage?.total_tokens ?? promptTokens;
    data.usage = { prompt_tokens: promptTokens, total_tokens: totalTokens };

    const cost = computeCost({ model: ctx.model, plan: ctx.plan, promptTokens, completionTokens: 0 });

    await settleUsage({
      requestId,
      userId: ctx.userId,
      apiKeyId: ctx.apiKeyId,
      modelId: ctx.model.id,
      endpoint: 'embeddings',
      promptTokens,
      completionTokens: 0,
      costIdr: cost,
      status: 'COMPLETED',
      streamed: false,
      latencyMs: Date.now() - start,
    });

    return json(data, 200, { ...ctx.rateHeaders, 'x-request-id': requestId });
  } catch (err) {
    if (isRateLimited(err)) return err.res;
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}