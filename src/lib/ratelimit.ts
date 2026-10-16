import { TooManyRequestsError } from './errors';

// ponytail: in-memory sliding-window limiter. Per-instance only — on serverless each
// instance has its own counters, so effective limit = limit × instance count. Fine at
// low scale. Upgrade path: swap for Upstash/Redis or a DB counter when you need global limits.
interface Bucket {
  hits: number[];
}

const store = new Map<string, Bucket>();
let lastPrune = 0;

function prune(now: number, windowMs: number): void {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, bucket] of store) {
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    if (bucket.hits.length === 0) store.delete(key);
  }
}

export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export function checkLimit(key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now();
  prune(now, windowMs);

  const bucket = store.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    store.set(key, bucket);
    return { success: false, limit, remaining: 0, reset: bucket.hits[0] + windowMs };
  }

  bucket.hits.push(now);
  store.set(key, bucket);
  return { success: true, limit, remaining: limit - bucket.hits.length, reset: now + windowMs };
}

export interface RateHeaders {
  'X-RateLimit-Limit'?: string;
  'X-RateLimit-Remaining'?: string;
  'X-RateLimit-Reset'?: string;
  'Retry-After'?: string;
}

export function rateHeaders(r: LimitResult): RateHeaders {
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(Math.ceil(r.reset / 1000)),
  };
}

export interface RateContext {
  ip: string;
  userId: string;
  keyId: string;
  planRpm: number;
  keyRpm: number | null;
}

export type RateCheck = { ok: true; headers: RateHeaders } | { ok: false; res: Response };

const MINUTE = 60_000;

export function enforceRateLimits(ctx: RateContext): RateCheck {
  const ipR = checkLimit(`ip:${ctx.ip}`, 600, MINUTE);
  if (!ipR.success) return blocked(ipR, 'ip');

  const userR = checkLimit(`user:${ctx.userId}`, ctx.planRpm, MINUTE);
  if (!userR.success) return blocked(userR, 'user');

  const keyRpm = ctx.keyRpm ?? ctx.planRpm;
  const keyR = checkLimit(`key:${ctx.keyId}`, keyRpm, MINUTE);
  if (!keyR.success) return blocked(keyR, 'key');

  return { ok: true, headers: rateHeaders(keyR) };
}

export function enforceRateLimitsSafe(ctx: RateContext): RateCheck {
  try {
    return enforceRateLimits(ctx);
  } catch {
    return { ok: true, headers: {} };
  }
}

function blocked(r: LimitResult, scope: string): RateCheck {
  const retryAfter = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
  return {
    ok: false,
    res: Response.json(
      {
        error: {
          message: `Rate limit reached (${scope}). Please retry after ${retryAfter}s.`,
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
          param: null,
        },
      },
      { status: 429, headers: { ...rateHeaders(r), 'Retry-After': String(retryAfter) } },
    ),
  };
}

export function enforceLoginLimit(ip: string, email: string): void {
  const byIp = checkLimit(`login:ip:${ip}`, 5, 15 * MINUTE);
  if (!byIp.success) throw new TooManyRequestsError('rate_limit_exceeded', 'Too many login attempts. Try again later.');
  const byEmail = checkLimit(`login:email:${email.toLowerCase()}`, 5, 15 * MINUTE);
  if (!byEmail.success) throw new TooManyRequestsError('rate_limit_exceeded', 'Too many login attempts. Try again later.');
}