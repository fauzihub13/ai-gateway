import {
  TooManyRequestsError,
  UpstreamUnavailableError,
  UpstreamError,
  UpstreamTimeoutError,
  NotFoundError,
  toErrorResponse,
} from './errors';

/**
 * Angka limit output yang disebut provider pada pesan error `max_tokens`.
 * Contoh pesan openscale: "...above the 384000-token output limit of 'deepseek/...'".
 * Mendukung pemisah ribuan (`,`) dan underscore.
 */
const OUTPUT_LIMIT_RE = /(\d[\d,_]*)\s*-?\s*tokens?\s+output\s+limit/i;

export function parseProviderOutputLimit(message: string): number | null {
  const m = OUTPUT_LIMIT_RE.exec(message);
  if (!m) return null;
  const n = Number(m[1].replace(/[,_]/g, ''));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export interface HealAttempt<T> {
  /** Body baru dengan `max_tokens` di-clamp, bila heal berlaku. */
  body: T | null;
  /**
   * Teks body error yang sudah konsumsi saat mencoba parse. Caller dipakai
   * untuk membangun ulang Response sintetis bila heal TIDAK berlaku, supaya
   * `mapUpstreamError` masih bisa membaca `error.code`.
   */
  raw: string | null;
}

export interface HealLogContext {
  model: string;
  requestId: string;
}

/**
 * Self-heal `max_tokens` yang melebihi limit output provider sebenarnya.
 *
 * Default `max_tokens` dihitung dari baris Model (contextWindow − prompt).
 * Bila metadata baris Model tertinggal dari provider (limit output asli lebih
 * kecil, mis. 384k padahalkita clamp ke 512k), upstream menjawab 400
 * `max_tokens_exceeded` lengkap dengan angka limit di pesannya. Fungsi ini
 * membaca jawaban error tersebut dan menyiapkan body retry dengan
 * `max_tokens` tepat pada limit — callers melakukan fetch ulang SEKALI,
 * semuanya sebelum header terkirim sehingga klien tak pernah melihat 400.
 *
 * Heal TIDAK berlaku bila: kode error tidak menyangkut `max_tokens`, angka
 * limit tidak terbaca dari pesan, `max_tokens` klien memang di bawah limit
 * (berarti masalahnya lain), atau limit terbaca tidak valid.
 */
export async function tryHealMaxTokens<T extends { max_tokens?: number }>(
  res: Response,
  body: T,
  log: HealLogContext,
): Promise<HealAttempt<T>> {
  let raw: string | null = null;
  try {
    raw = await res.text();
  } catch {
    return { body: null, raw: null };
  }

  let payload: { error?: { code?: string; message?: string } } | null = null;
  try {
    payload = JSON.parse(raw) as { error?: { code?: string; message?: string } };
  } catch {
    payload = null;
  }

  const code = payload?.error?.code ?? '';
  const message = payload?.error?.message ?? '';
  const involvesMaxTokens = code === 'max_tokens_exceeded' || /max_tokens/i.test(message);
  const current = body?.max_tokens;
  const limit = parseProviderOutputLimit(message);

  if (!involvesMaxTokens || limit == null || current == null || !Number.isFinite(current)) {
    return { body: null, raw };
  }
  // `above the X-token output limit` berarti X masih diizinkan. Bila `current`
  // sudah ≤ limit, penolakan bukan karena max_tokens → jangan sentuh.
  if (limit >= current) {
    return { body: null, raw };
  }

  console.warn(
    `[heal] max_tokens ${current} -> ${limit} (model=${log.model}, requestId=${log.requestId}). ` +
      `Sinkronkan maxOutputTokens pada baris Model agar heal ini tidak perlu lagi.`,
  );
  return { body: { ...body, max_tokens: limit }, raw };
}

export async function mapUpstreamError(res: Response, requestId: string): Promise<Response> {
  const status = res.status;
  let upstreamCode = '';
  try {
    const body = (await res.json()) as { error?: { code?: string } };
    upstreamCode = body?.error?.code ?? '';
  } catch {
    // ignore non-JSON
  }

  if (status === 429) {
    return toErrorResponse(
      new TooManyRequestsError('upstream_rate_limited', 'Upstream rate limit reached. Please retry shortly.'),
      requestId,
    );
  }
  if (status === 504) return toErrorResponse(new UpstreamTimeoutError(), requestId);
  if (status >= 500) return toErrorResponse(new UpstreamUnavailableError(), requestId);
  if (status === 404 || upstreamCode === 'model_not_found') {
    return toErrorResponse(new NotFoundError('model_not_found', 'The requested model is unavailable.'), requestId);
  }
  if (status === 400) {
    return toErrorResponse(
      new UpstreamError('upstream_error', 'The request could not be processed by the provider.'),
      requestId,
    );
  }
  return toErrorResponse(new UpstreamError(), requestId);
}