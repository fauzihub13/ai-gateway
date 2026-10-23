import { describe, it, expect } from 'vitest';
import { parseProviderOutputLimit, tryHealMaxTokens } from '@/lib/upstream';

describe('parseProviderOutputLimit', () => {
  it('parses openscale max_tokens_exceeded message', () => {
    const msg =
      "`max_tokens` is 511486, above the 384000-token output limit of 'deepseek/deepseek-v4.1-flash'.";
    expect(parseProviderOutputLimit(msg)).toBe(384_000);
  });

  it('parses formatted numbers with commas', () => {
    expect(parseProviderOutputLimit('above the 384,000-token output limit of x')).toBe(384_000);
  });

  it('returns null for unrelated messages', () => {
    expect(parseProviderOutputLimit('model is overloaded')).toBeNull();
    expect(parseProviderOutputLimit('')).toBeNull();
  });
});

describe('tryHealMaxTokens', () => {
  const log = { model: 'ops/deepseek-v4-1-flash', requestId: 'req_test' };

  function res(body: unknown, status = 400): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('clamps max_tokens to provider limit', async () => {
    const out = await tryHealMaxTokens(
      res({
        error: {
          message:
            "`max_tokens` is 511486, above the 384000-token output limit of 'deepseek/deepseek-v4.1-flash'.",
          type: 'invalid_request_error',
          param: 'max_tokens',
          code: 'max_tokens_exceeded',
        },
      }),
      { model: 'x', messages: [], max_tokens: 511_486 },
      log,
    );
    expect(out.body).not.toBeNull();
    expect(out.body!.max_tokens).toBe(384_000);
  });

  it('skips when requested is already within limit (different problem)', async () => {
    const out = await tryHealMaxTokens(
      res({
        error: {
          message:
            "`max_tokens` is 100, above the 384000-token output limit of 'deepseek/deepseek-v4.1-flash'.",
          type: 'invalid_request_error',
          param: 'max_tokens',
          code: 'max_tokens_exceeded',
        },
      }),
      { model: 'x', messages: [], max_tokens: 100 },
      log,
    );
    expect(out.body).toBeNull();
  });

  it('skips unrelated 400 errors but returns raw body', async () => {
    const out = await tryHealMaxTokens(
      res({ error: { message: 'invalid model', code: 'model_not_found' } }),
      { model: 'x', messages: [], max_tokens: 100 },
      log,
    );
    expect(out.body).toBeNull();
    expect(out.raw).toContain('invalid model');
  });
});
