import { beforeAll, describe, expect, it } from 'vitest';
import { decryptApiKey, encryptApiKey } from '@/lib/key-crypto';

beforeAll(() => {
  process.env.API_KEY_PEPPER = 'test-pepper';
  delete process.env.API_KEY_ENCRYPTION_KEY;
});

describe('key crypto', () => {
  it('roundtrip raw key', () => {
    const raw = 'sk-mpruy-3f9aK2mQabcdefghijklmnopqrstuvwxyz012345';
    const blob = encryptApiKey(raw);

    expect(blob).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(blob).not.toContain(raw);
    expect(decryptApiKey(blob)).toBe(raw);
  });

  it('iv acak menghasilkan ciphertext berbeda', () => {
    const raw = 'sk-mpruy-same-key';
    expect(encryptApiKey(raw)).not.toBe(encryptApiKey(raw));
  });

  it('menolak ciphertext yang diubah', () => {
    const blob = encryptApiKey('sk-mpruy-secret');
    const parts = blob.split('.');
    parts[3] = parts[3].slice(0, -1) + (parts[3].endsWith('A') ? 'B' : 'A');

    expect(() => decryptApiKey(parts.join('.'))).toThrow();
  });

  it('menolak format asing', () => {
    expect(() => decryptApiKey('not-a-ciphertext')).toThrow();
    expect(() => decryptApiKey('v2.a.b.c')).toThrow();
  });
});
