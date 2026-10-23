import { describe, it, expect } from 'vitest';
import { enforceModelLimits } from '@/lib/proxy';
import { BadRequestError } from '@/lib/errors';

const model = { contextWindow: 1000, maxOutputTokens: 200 };
const msg = (content: string) => ({ role: 'user', content });

describe('enforceModelLimits', () => {
  it('validates explicit max_tokens locally but NEVER forwards it upstream', () => {
    const out = enforceModelLimits(model, { messages: [msg('hi')], max_tokens: 99999 });
    expect('max_tokens' in out.upstreamBody).toBe(false);
    expect(out.requestedMaxTokens).toBe(99999);
  });

  it('strips small explicit max_tokens too (provider uses its own default)', () => {
    const out = enforceModelLimits(model, { messages: [msg('hi')], max_tokens: 50 });
    expect('max_tokens' in out.upstreamBody).toBe(false);
    expect(out.requestedMaxTokens).toBe(50);
  });

  it('strips max_completion_tokens (newer OpenAI field) as well', () => {
    const out = enforceModelLimits(model, {
      messages: [msg('hi')],
      max_completion_tokens: 50,
    } as unknown as { messages: Array<{ role: string; content: unknown }>; max_tokens?: number });
    expect('max_tokens' in out.upstreamBody).toBe(false);
    expect('max_completion_tokens' in out.upstreamBody).toBe(false);
    expect(out.requestedMaxTokens).toBe(50);
  });

  it('omits max_tokens entirely when user does not send it (no gateway default)', () => {
    const out = enforceModelLimits(model, { messages: [msg('hi')] });
    expect('max_tokens' in out.upstreamBody).toBe(false);
    expect(out.requestedMaxTokens).toBeNull();
  });

  it('rejects explicit max_tokens pushing prompt+output past context window', () => {
    const long = 'word '.repeat(2000); // > 1000 tokens secara estimasi
    expect(() =>
      enforceModelLimits(model, { messages: [msg(long)], max_tokens: 200 }),
    ).toThrow(BadRequestError);
  });

  it('rejects oversized prompt even without max_tokens', () => {
    const long = 'word '.repeat(5000);
    expect(() => enforceModelLimits(model, { messages: [msg(long)] })).toThrow(
      BadRequestError,
    );
  });

  it('prompt within window without max_tokens passes', () => {
    const out = enforceModelLimits(model, { messages: [msg('short')] });
    expect('max_tokens' in out.upstreamBody).toBe(false);
    expect(out.promptTokens).toBeGreaterThan(0);
  });

  it('falls back cap to contextWindow when maxOutputTokens is null (validation only)', () => {
    const m = { contextWindow: 1000, maxOutputTokens: null };
    const out = enforceModelLimits(m, { messages: [msg('hi')], max_tokens: 900 });
    // 900 < 1000 → lolos validasi, tapi tetap TIDAK dikirim ke upstream.
    expect('max_tokens' in out.upstreamBody).toBe(false);
    expect(out.requestedMaxTokens).toBe(900);
  });

  it('rejects explicit max_tokens whose clamped value busts the budget (cap fallback case)', () => {
    const m = { contextWindow: 1000, maxOutputTokens: null };
    // 5000 di-clamp ke cap 1000, budget 1007 > 1000 -> ditolak, bukan diam-diam dikirim.
    expect(() => enforceModelLimits(m, { messages: [msg('hi')], max_tokens: 5000 })).toThrow(
      BadRequestError,
    );
  });

  it('no message-count cap: 500 short messages pass', () => {
    const messages = Array.from({ length: 500 }, (_, i) => msg(`m${i}`));
    const out = enforceModelLimits(
      { contextWindow: 1_000_000, maxOutputTokens: 1000 },
      { messages },
    );
    expect(out.upstreamBody.messages.length).toBe(500);
    // max_tokens tidak dikirim user -> tidak di-inject gateway.
    expect('max_tokens' in out.upstreamBody).toBe(false);
  });
});
