import { describe, it, expect } from 'vitest';
import { crc16, parseTlv, serializeTlv, toDynamicQris, validateQris, readQris } from '@/lib/qris';

/** Bangun QRIS statis valid dari elemen minimal (tanpa merchant account info). */
function buildStatic(overrides: Record<string, string> = {}): string {
  const base = [
    { tag: '00', value: '01' },
    { tag: '01', value: '11' },
    { tag: '53', value: '360' },
    { tag: '58', value: 'ID' },
    { tag: '59', value: 'Warung Test' },
    { tag: '60', value: 'Jakarta' },
  ];
  const known = new Set(base.map((e) => e.tag));
  const extra = Object.entries(overrides)
    .filter(([tag]) => !known.has(tag))
    .map(([tag, value]) => ({ tag, value }));
  const els = [...base, ...extra]
    .map((e) => ({ ...e, value: overrides[e.tag] ?? e.value }))
    .sort((a, b) => Number(a.tag) - Number(b.tag));
  const body = `${serializeTlv(els)}6304`;
  return body + crc16(body);
}

describe('crc16', () => {
  it('cocok dengan check value standar CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });
});

describe('validateQris', () => {
  it('payload statis valid', () => {
    expect(validateQris(buildStatic())).toEqual({ valid: true });
  });

  it('CRC salah ditolak', () => {
    const p = buildStatic();
    const broken = p.slice(0, -1) + (p.at(-1) === '0' ? '1' : '0');
    expect(validateQris(broken).valid).toBe(false);
  });
});

describe('toDynamicQris', () => {
  it('ubah tag 01 ke 12 dan inject tag 54', () => {
    const dynamic = toDynamicQris(buildStatic(), 100_123);
    expect(validateQris(dynamic)).toEqual({ valid: true });

    const info = readQris(dynamic);
    expect(info.static).toBe(false);
    expect(info.amount).toBe('100123');
    expect(info.merchantName).toBe('Warung Test');
  });

  it('membuang tag tip/fee lama', () => {
    const withTip = buildStatic({ 55: '02' });
    const dynamic = toDynamicQris(withTip, 50_000);
    const tags = parseTlv(dynamic).map((e) => e.tag);
    expect(tags).not.toContain('55');
    expect(tags).toContain('54');
  });

  it('menolak nominal tidak valid', () => {
    expect(() => toDynamicQris(buildStatic(), 0)).toThrow();
    expect(() => toDynamicQris(buildStatic(), 10.5)).toThrow();
  });
});
