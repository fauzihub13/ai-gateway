import { z } from 'zod';
import {
  preflight,
  isRateLimited,
  ChatBodySchema,
  assertCapabilities,
  enforceModelLimits,
  assertKeyPeriodLimit,
  type PreflightContext,
} from '@/lib/proxy';
import { nineRouterFetch } from '@/lib/ninerouter';
import {
  createNormalizer,
  extractCachedTokens,
  SSE_CONNECTED_COMMENT,
  buildSseErrorEvent,
} from '@/lib/stream';
import { settleUsage, computeCostBreakdown } from '@/lib/billing';
import { estimatePromptTokens, estimateTokens, promptToText } from '@/lib/tokens';
import { toErrorResponse, BadRequestError, InternalError, UpstreamTimeoutError } from '@/lib/errors';
import { mapUpstreamError } from '@/lib/upstream';
import { getRequestId, getClientIp, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 30 menit. Hanya berlaku di platform serverless (Vercel) sesuai plan; pada
// deployment `next start` di VPS nilai ini tidak berpengaruh. Stream sendiri
// tidak dibatasi durasi total — hanya idle upstream (lihat UPSTREAM_IDLE_MS).
export const maxDuration = 1800;

/**
 * Batas idle upstream (tidak ada byte sama sekali).
 *
 * Sengaja LEBIH BESAR dari watchdog di `createNormalizer` (120 dtk) supaya
 * watchdog punya kesempatan mengirim `event: error` yang rapi ke klien lebih
 * dulu. Abort di sini adalah jaring pengaman terakhir bila watchdog gagal
 * (misal event loop tersumbat) — dan saat itu pun stream ditutup dengan event
 * error, bukan dipotong diam-diam.
 */
function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const STREAM_UPSTREAM_IDLE_MS = envMs('UPSTREAM_STREAM_IDLE_TIMEOUT_MS', 180_000);
const NONSTREAM_UPSTREAM_TIMEOUT_MS = envMs('UPSTREAM_TIMEOUT_MS', 120_000);

/**
 * Bungkus body upstream agar:
 * 1. `onActivity()` dipanggil setiap chunk → timer idle di-reset.
 * 2. Bila upstream putus/abort di tengah stream, klien tetap menerima event
 *    error yang bisa dibaca, lalu stream ditutup normal (bukan error mentah).
 */
function guardUpstreamBody(
  body: ReadableStream<Uint8Array>,
  onActivity: () => void,
  onDone: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const enc = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          onDone();
          controller.close();
          return;
        }
        onActivity();
        controller.enqueue(value);
      } catch {
        onDone();
        // Upstream mati di tengah stream. Kirim event error supaya klien tahu
        // ini terpotong, bukan selesai. Normalizer akan meneruskannya sebagai
        // `data: {...}` lalu meng-inject `[DONE]` pada flush().
        try {
          controller.enqueue(
            enc.encode(
              buildSseErrorEvent(
                'Koneksi ke model terputus sebelum jawaban selesai. Silakan coba lagi.',
                'upstream_stream_interrupted',
              ),
            ),
          );
        } catch {
          // controller sudah tidak bisa menerima data
        }
        controller.close();
      }
    },
    cancel(reason) {
      onDone();
      return reader.cancel(reason);
    },
  });
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  let ctx: PreflightContext | null = null;

  try {
    // Body dibaca sebagai teks lalu di-parse sendiri: `req.json()` melempar
    // SyntaxError mentah untuk payload besar/terpotong, yang lalu jadi 500
    // "internal_error" padahal masalahnya ada di request klien.
    const rawText = await req.text();
    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      throw new BadRequestError('invalid_json', 'Request body is not valid JSON.');
    }
    const body = ChatBodySchema.parse(rawBody);
    const ip = getClientIp(req);

    ctx = await preflight(req, { endpoint: 'chat.completions', modelName: body.model, ip });
    assertCapabilities(ctx.model, body);
    // Limit berbasis row Model HANYA untuk validasi lokal. `max_tokens` /
    // `max_completion_tokens` selalu dibuang dari body upstream (lihat
    // enforceModelLimits) supaya provider memakai kapasitas output aslinya.
    const { upstreamBody: limitedBody, promptTokens: estPrompt, requestedMaxTokens } = enforceModelLimits(
      ctx.model,
      body,
    );

    // Gerbang limit per-key dicek SEKARANG (sebelum upstream), bukan tengah stream.
    // Estimasi memakai `max_tokens` eksplisit klien (`requestedMaxTokens`) bila
    // ada; kalau tidak ada, 0. `settle` tetap merekam biaya aktual.
    // SUBSCRIPTION tidak memotong saldo → charged 0, gerbang key otomatis lolos.
    const estimate = computeCostBreakdown({
      model: ctx.model,
      plan: ctx.plan,
      promptTokens: estPrompt,
      completionTokens: requestedMaxTokens ?? 0,
    });
    await assertKeyPeriodLimit(ctx, estimate.chargedIdr);

    const wantsStream = body.stream === true;
    const promptText = promptToText(body.messages);

    // `limitedBody` sudah dijamin TANPA `max_tokens`/`max_completion_tokens`
    // (lihat enforceModelLimits). Provider memakai kapasitas output aslinya.
    const upstreamBody = { ...limitedBody, model: ctx.model.internalName, stream: wantsStream };
    const upstreamStart = Date.now();

    // ── Idle-based abort (bukan total timeout) ─────────────────────────────
    // Timeout total memutus task panjang walau model masih aktif mengeluarkan
    // token. Yang benar: batalkan hanya bila TIDAK ADA byte dari upstream.
    const ac = new AbortController();
    const idleMs = wantsStream ? STREAM_UPSTREAM_IDLE_MS : NONSTREAM_UPSTREAM_TIMEOUT_MS;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const clearIdle = (): void => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };
    const resetIdle = (): void => {
      clearIdle();
      idleTimer = setTimeout(() => ac.abort(new Error('upstream_idle_timeout')), idleMs);
    };
    resetIdle();

    let upstream: Response;
    try {
      upstream = await nineRouterFetch('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(upstreamBody),
        signal: ac.signal,
      });
    } catch (e: unknown) {
      clearIdle();
      const reason = ac.signal.reason;
      const idle = ac.signal.aborted && reason instanceof Error && reason.message === 'upstream_idle_timeout';
      if (idle) throw new UpstreamTimeoutError();
      if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        throw new InternalError('upstream_timeout');
      }
      throw new InternalError('upstream_unavailable');
    }

    // Catatan: self-heal `max_tokens` sudah tidak dipakai karena gateway tidak
    // pernah mengirim field itu ke provider. `tryHealMaxTokens` tetap ada di
    // `src/lib/upstream.ts` untuk kompatibilitas/test, tetapi tidak dipanggil
    // di jalur produksi.

    if (!upstream.ok) {
      clearIdle();
      await recordUsage(ctx, {
        requestId, endpoint: 'chat.completions', streamed: wantsStream,
        promptTokens: estimatePromptTokens(body.messages), completionTokens: 0,
        costIdr: 0, status: 'ERROR', latencyMs: Date.now() - start, errorCode: `upstream_${upstream.status}`,
      });
      return mapUpstreamError(upstream, requestId);
    }

    if (!wantsStream) {
      let data: Record<string, unknown>;
      try {
        data = (await upstream.json()) as Record<string, unknown>;
      } catch (e) {
        const reason = ac.signal.reason;
        if (ac.signal.aborted && reason instanceof Error && reason.message === 'upstream_idle_timeout') {
          throw new UpstreamTimeoutError();
        }
        throw new InternalError('upstream_unavailable');
      } finally {
        clearIdle();
      }
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

      // Tiga angka biaya: nilai resmi (analitik), tagihan saldo, dan hemat.
      const cost = computeCostBreakdown({
        model: ctx.model, plan: ctx.plan,
        promptTokens, completionTokens, cachedPromptTokens,
      });
      await assertKeyPeriodLimit(ctx, cost.chargedIdr);
      await recordUsage(ctx, {
        requestId, endpoint: 'chat.completions', streamed: false,
        promptTokens, completionTokens, cachedPromptTokens,
        costIdr: cost.valueIdr, chargedIdr: cost.chargedIdr, savedIdr: cost.savedIdr,
        status: 'COMPLETED',
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
        // `errorCode` diisi normalizer bila stream terpotong: idle timeout,
        // koneksi putus, atau `finish_reason: "length"` (kena cap token output).
        // Semua kondisi itu BUKAN pemakaian selesai → catat PARTIAL supaya
        // laporan usage tidak menyesatkan.
        const status =
          state.errorCode
            ? 'PARTIAL'
            : state.finishReason === 'stop' || state.sawDone
              ? 'COMPLETED'
              : 'PARTIAL';
        const cost = computeCostBreakdown({
          model: finalCtx.model, plan: finalCtx.plan,
          promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
          cachedPromptTokens: usage.cachedPromptTokens,
        });
        await recordUsage(finalCtx, {
          requestId, endpoint: 'chat.completions', streamed: true,
          promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
          cachedPromptTokens: usage.cachedPromptTokens ?? 0,
          costIdr: cost.valueIdr, chargedIdr: cost.chargedIdr, savedIdr: cost.savedIdr,
          status, latencyMs: Date.now() - start,
          upstreamLatencyMs: Date.now() - upstreamStart,
          errorCode: state.errorCode,
        });
      },
    );

    // pipe upstream -> normalizer, dengan guard aktivitas (reset timer idle tiap
    // chunk) sekaligus konversi putus-koneksi jadi event error yang terbaca klien.
    const guarded = guardUpstreamBody(upstream.body!, resetIdle, clearIdle);
    const out = guarded.pipeThrough(normalizer);

    // `: connected` "memanaskan" koneksi: Cloudflare/Nginx melihat byte pertama
    // segera setelah header sehingga koneksi tidak dianggap idle sejak awal.
    const encoder = new TextEncoder();
    const merged = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(SSE_CONNECTED_COMMENT));
        } catch {
          // klien sudah menutup koneksi
        }

        const reader = out.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch {
          // stream upstream error setelah header terkirim: tutup rapi.
          try {
            controller.close();
          } catch {
            // sudah tertutup
          }
        } finally {
          clearIdle();
        }
      },
      cancel(reason) {
        clearIdle();
        return out.cancel(reason);
      },
    });

    return new Response(merged, {
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
    // Error idle yang terjadi sebelum header terkirim → 504 dengan pesan jelas.
    // Angka detik diambil dari konfigurasi aktif supaya pesan tidak berbohong
    // saat env diubah.
    if (err instanceof UpstreamTimeoutError) {
      const seconds = Math.round(STREAM_UPSTREAM_IDLE_MS / 1000);
      return Response.json(
        {
          error: {
            message: `Model tidak merespons dalam ${seconds} detik. Silakan coba lagi atau pecah tugas Anda.`,
            type: 'upstream_idle_timeout',
            code: 'upstream_idle_timeout',
            param: null,
          },
        },
        { status: 504, headers: { 'x-request-id': requestId } },
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
  /** Nilai pemakaian: harga resmi provider × token (tanpa markup). */
  costIdr: number;
  /** Yang benar-benar ditagih ke saldo (0 untuk SUBSCRIPTION). */
  chargedIdr?: number;
  /** Hemat = (harga resmi × markup) − charged. 0 untuk PAYG. */
  savedIdr?: number;
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
      chargedIdr: u.chargedIdr,
      savedIdr: u.savedIdr,
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
