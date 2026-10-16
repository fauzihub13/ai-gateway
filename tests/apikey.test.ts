import { describe, it, expect, beforeAll } from 'vitest';
import { generateApiKey, hashApiKey, looksLikeApiKey, extractBearer } from '@/lib/apikey';

beforeAll(() => {
  process.env.API_KEY_PEPPER = 'test-pepper';
});

describe('api key', () => {
  it('format key benar', () => {
    const raw = generateApiKey();
    expect(raw).toMatch(/^sk-mpruy-[A-Za-z0-9]{40,}$/);
    expect(looksLikeApiKey(raw)).toBe(true);
  });

  it('hash deterministik dengan pepper', () => {
    const raw = generateApiKey();
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
    expect(hashApiKey(raw)).toHaveLength(64);
  });

  it('hash beda untuk key beda', () => {
    expect(hashApiKey(generateApiKey())).not.toBe(hashApiKey(generateApiKey()));
  });

  it('extractBearer', () => {
    expect(extractBearer('Bearer sk-mpruy-abc')).toBe('sk-mpruy-abc');
    expect(extractBearer('bearer sk-mpruy-abc')).toBe('sk-mpruy-abc');
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer('Basic xyz')).toBeNull();
  });
});