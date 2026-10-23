import { z } from 'zod';
import { db } from './db';
import { extractBearer, hashApiKey, looksLikeApiKey } from './apikey';
import { resolveModel, type ModelCapabilities } from './model-mapping';
import { estimatePromptTokens } from './tokens';
import { getBalance, isFreeModel } from './billing';
import { ensureQuotaPeriod } from './subscription';
import { enforceRateLimitsSafe, type RateHeaders } from './ratelimit';
import {
  UnauthorizedError,
  InsufficientBalanceError,
  TooManyRequestsError,
  BadRequestError,
  PlanExpiredError,
} from './errors';
import type { ApiKey, Plan, Model } from '@prisma/client';

type ResolvedModel = Omit<Model, 'capabilities'> & { capabilities: ModelCapabilities };

export interface AuthContext {
  userId: string;
  apiKeyId: string;
  key: ApiKey;
  plan: Plan;
  planId: string;
  keyModels: string[] | null;
  /** Masa aktif plan berbayar; null = gratis / tanpa expiry. */
  planExpiresAt: Date | null;
  /** Awal periode kuota berjalan (tanggal beli/perpanjang terakhir). */
  planStartedAt: Date | null;
  /** Total kuota token periode berjalan; null = tanpa kuota. */
  planTokenQuota: number | null;
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

  // Plan yang lewat masa aktif TIDAK diturunkan otomatis di sini (tidak ada
  // auto-downgrade). Penolakan terjadi di `assertPlanActive` pada preflight,
  // dan plan tetap menempel sampai admin menurunkannya manual.
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
    planExpiresAt: key.user.planExpiresAt,
    planStartedAt: key.user.planStartedAt,
    planTokenQuota: key.user.planTokenQuota,
  };
}

export interface PreflightContext extends AuthContext {
  model: ResolvedModel;
  rateHeaders: RateHeaders;
}

/**
 * Gerbang masa aktif plan. Plan berbayar yang lewat `planExpiresAt` ditolak
 * (`plan_expired`) sampai user membeli lagi. Plan gratis (expiry null) lolos.
 * Plan TIDAK diturunkan otomatis; admin menurunkannya manual bila perlu.
 */
export async function assertPlanActive(ctx: AuthContext): Promise<void> {
  if (!ctx.planExpiresAt) return;
  if (ctx.planExpiresAt.getTime() <= Date.now()) {
    throw new PlanExpiredError(
      'Masa aktif plan sudah habis. Perpanjang dari dashboard untuk memakai API lagi.',
    );
  }
}

/**
 * Gerbang biaya per request.
 * - Plan SUBSCRIPTION: tidak memotong saldo — dibatasi kuota token (assertTokenQuota).
 * - Plan PAYG: saldo harus > 0, kecuali model gratis (harga efektif 0).
 */
export async function assertBalance(
  userId: string,
  opts?: {
    model?: { priceInPer1MIdr: number; priceOutPer1MIdr: number };
    plan?: { markup: number; billingMode?: string };
  },
): Promise<void> {
  if (opts?.plan?.billingMode === 'SUBSCRIPTION') return; // tidak pakai saldo
  const free = opts?.model && opts?.plan ? isFreeModel(opts.model, opts.plan) : false;
  if (free) return;
  const balance = await getBalance(userId);
  if (balance <= 0) throw new InsufficientBalanceError();
}

/** Token terpakai sejak awal periode kuota berjalan (`planStartedAt`). */
async function periodTokensUsed(userId: string, startedAt: Date): Promise<number> {
  const agg = await db.usageLog.aggregate({
    where: { userId, createdAt: { gte: startedAt }, status: { not: 'REJECTED' } },
    _sum: { totalTokens: true },
  });
  return agg._sum.totalTokens ?? 0;
}

/**
 * Gerbang kuota token per **periode plan** (`Plan.periodDays` hari, diatur admin).
 *
 * - `planTokenQuota` di-set saat beli/perpanjang. `null` = tanpa kuota (PAYG/gratis).
 * - Beli lagi saat aktif menambah kuota (stack), jadi periode & kuota selalu
 *   sejajar: keduanya berakhir bersamaan saat `planExpiresAt`.
 * - Kuota habis → `quota_exceeded` sampai user membeli lagi.
 */
export async function assertTokenQuota(ctx: AuthContext): Promise<void> {
  if (ctx.planTokenQuota == null) return;
  const startedAt = ctx.planStartedAt ?? ctx.planExpiresAt;
  if (!startedAt) return;
  const used = await periodTokensUsed(ctx.userId, startedAt);
  if (used >= ctx.planTokenQuota) {
    throw new TooManyRequestsError(
      'quota_exceeded',
      'Kuota token periode ini sudah habis. Beli plan lagi untuk menambah kuota.',
    );
  }
}

/**
 * Batas belanja per API key dalam **periode plan berjalan** (`planStartedAt`).
 * Menjumlahkan `chargedIdr` (biaya yang benar-benar dipotong dari saldo), bukan
 * `costIdr` (harga list) — jadi plan SUBSCRIPTION (charged = 0) otomatis tidak
 * pernah menyentuh batas ini, sesuai perilaku "tanpa potong saldo".
 * Estimasi pemakaian dikirim caller lewat `costEstimate` (0 untuk SUBSCRIPTION).
 */
export async function assertKeyPeriodLimit(ctx: AuthContext, costEstimate: number): Promise<void> {
  if (ctx.key.monthlyLimitIdr == null) return;
  const startedAt = ctx.planStartedAt ?? ctx.planExpiresAt ?? undefined;
  const agg = await db.usageLog.aggregate({
    where: {
      apiKeyId: ctx.apiKeyId,
      ...(startedAt ? { createdAt: { gte: startedAt } } : {}),
      status: { not: 'REJECTED' },
    },
    _sum: { chargedIdr: true },
  });
  const spent = agg._sum.chargedIdr ?? 0;
  if (spent + costEstimate > ctx.key.monthlyLimitIdr) {
    throw new TooManyRequestsError('key_quota_exceeded', 'This API key has reached its spending limit for this plan period.');
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

  // Kuota plan gratis bergulir per `Plan.periodDays`: pastikan periode berjalan
  // ada & belum kedaluwarsa sebelum membaca saldo/kuota. Plan berbayar tidak
  // disentuh (periode dikelola purchasePlan/grantPlan).
  const period = await ensureQuotaPeriod(auth.userId);
  auth.planStartedAt = period.planStartedAt;
  auth.planTokenQuota = period.planTokenQuota;

  // Urutan gerbang: masa aktif → kuota periode → saldo (mode-aware).
  await assertPlanActive(auth);
  await assertTokenQuota(auth);
  await assertBalance(auth.userId, { model, plan: auth.plan });

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
          // Batas panjang teks tidak divalidasi di sini.
          // Payload dibatasi oleh client_max_body_size Nginx (50M)
          // dan context window model upstream.
          // Validasi Zod hanya memastikan tipe data, bukan ukuran.
          content: z.union([z.string(), z.array(z.any()).max(50), z.null()]),
          name: z.string().max(64).optional(),
          tool_call_id: z.string().max(128).optional(),
        }),
      )
      .min(1),
    // ponytail: no global message-count cap — batas asli = model.contextWindow (lihat enforceModelLimits).
    // Hanya sanity guard panjang string di bawah (cegah payload OOM).
    stream: z.boolean().optional().default(false),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    max_tokens: z.number().int().min(1).optional(),
    stop: z.union([z.string().max(64), z.array(z.string().max(64)).max(4)]).optional(),
    tools: z.array(z.any()).max(64).optional(),
    tool_choice: z.union([z.string(), z.object({}).passthrough()]).optional(),
    response_format: z.object({ type: z.string() }).passthrough().optional(),
    user: z.string().max(128).optional(),
  })
  .passthrough();

/**
 * Limit diturunkan dari baris Model (contextWindow/maxOutputTokens), bukan hardcode global.
 * - max_tokens di-clamp ke model.maxOutputTokens (UX: jangan tolak, cukup turunkan).
 * - prompt estimate > contextWindow - max_tokens → error context_length_exceeded yang jelas.
 * Return body dengan max_tokens sudah di-clamp.
 */
export interface EnforceModelLimitsResult<T> {
  /**
   * Body yang siap dikirim ke UPSTREAM.
   *
   * ATURAN: batas lokal (row Model) dipakai sebagai gerbang/validasi terhadap
   * request USER saja. Ke upstream, `max_tokens` hanya diteruskan bila USER
   * mengirimnya secara eksplisit — bila tidak, field TIDAK di-inject dan
   * provider memakai default internalnya. Menyuntikkan alokasi output sebesar
   * kapasitas model ternyata ditolak beberapa provider (400 `max_tokens_exceeded`
   * lalu `request_rejected` walau di bawah limit) — kasus deepseek/openscale.
   */
  upstreamBody: T;
  /** Prompt tokens hasil estimasi lokal (untuk log/telemetri). */
  promptTokens: number;
  /**
   * `max_tokens` yang diminta user (eksplisit), atau null bila tidak mengirim.
   * Tidak pernah berisi default buatan gateway.
   */
  requestedMaxTokens: number | null;
}

/**
 * Gerbang limit berbasis baris Model. Dua peran, hati-hati jangan tertukar:
 *
 * 1. VALIDASI REQUEST USER (selalu): prompt estimasi + `max_tokens` eksplisit
 *    user tidak boleh melebihi contextWindow / maxOutputTokens row Model.
 *    Pelanggaran → 400 `context_length_exceeded` / clamp ke margin wajar.
 * 2. TERUSKAN KE UPSTREAM (hanya apa yang user minta): `max_tokens` user
 *    diteruskan apa adanya (di-clamp ke maxOutputTokens bila terpasang).
 *    User tidak mengirim → TIDAK di-inject sama sekali. Default provider
 *    (umumnya 4k–16k) memang bisa memotong jawaban agent panjang, tapi itu
 *    masalah klien untuk kirim `max_tokens` eksplisit — bukan alasan gateway
 *    mengarang angka yang provider bisa tolak.
 *
 * Return `upstreamBody` + telemetri. Tidak pernah melempar untuk kasus
 * "default terlalu besar" karena tidak ada default lagi.
 */
export function enforceModelLimits<T extends { messages: Array<{ role: string; content: unknown }>; max_tokens?: number }>(
  model: { contextWindow: number; maxOutputTokens: number | null },
  body: T,
): EnforceModelLimitsResult<T> {
  const promptTokens = estimatePromptTokens(body.messages);
  const cap = model.maxOutputTokens ?? model.contextWindow;

  const requested = body.max_tokens;
  let upstreamMaxTokens: number | undefined;

  if (requested != null) {
    /**
     * User minta eksplisit: clamp ke `cap` (UX: jangan tolak, cukup turunkan),
     * lalu cek budget gabungan terhadap context window lokal.
     */
    const maxTokens = requested > cap ? cap : requested;
    const budget = promptTokens + maxTokens;
    if (budget > model.contextWindow) {
      throw new BadRequestError(
        'context_length_exceeded',
        `This request exceeds the ${model.contextWindow}-token context window for this model ` +
          `(prompt ~${promptTokens} tokens + max_tokens ${maxTokens}). ` +
          `Reduce the conversation history or lower max_tokens.`,
        'messages',
      );
    }
    upstreamMaxTokens = maxTokens;
  } else {
    /**
     * User tidak mengirim `max_tokens` → jangan inject. Cek prompt terhadap
     * contextWindow saja supaya prompt keterlaluan ditolak di sini dengan
     * pesan yang jelas (bukan 400 samar dari provider).
     */
    if (promptTokens > model.contextWindow) {
      throw new BadRequestError(
        'context_length_exceeded',
        `This prompt (~${promptTokens} tokens) exceeds the ${model.contextWindow}-token context window for this model. ` +
          `Reduce the conversation history.`,
        'messages',
      );
    }
    upstreamMaxTokens = undefined;
  }

  const upstreamBody = (upstreamMaxTokens === undefined
    ? omit(body, ['max_tokens'])
    : { ...body, max_tokens: upstreamMaxTokens }) as T;

  return { upstreamBody, promptTokens, requestedMaxTokens: requested ?? null };
}

/** Salin `body` tanpa key yang disebut (shallow). */
function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out as Omit<T, K>;
}

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