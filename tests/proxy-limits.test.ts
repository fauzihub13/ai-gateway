import { describe, it, expect } from 'vitest';
import { enforceModelLimits } from '@/lib/proxy';
import { BadRequestError } from '@/lib/errors';

const model = { contextWindow: 1000, maxOutputTokens: 200 };
const msg = (content: string) => ({ role: 'user', content });

describe('enforceModelLimits', () => {
  it('clamps max_tokens to model.maxOutputTokens', () => {
    const out = enforceModelLimits(model, { messages: [msg('hi')], max_tokens: 99999 });
    expect(out.max_tokens).toBe(200);
  });

  it('lets small max_tokens through', () => {
    const out = enforceModelLimits(model, { messages: [msg('hi')], max_tokens: 50 });
    expect(out.max_tokens).toBe(50);
  });

  it('rejects prompt past context window', () => {
    const long = 'word '.repeat(5000);
    expect(() => enforceModelLimits(model, { messages: [msg(long)], max_tokens: 200 })).toThrow(BadRequestError);
  });

  it('no message-count cap: 500 short messages pass', () => {
    const messages = Array.from({ length: 500 }, (_, i) => msg(`m${i}`));
    const out = enforceModelLimits({ contextWindow: 1_000_000, maxOutputTokens: 1000 }, { messages });
    expect(out.messages.length).toBe(500);
  });
});
