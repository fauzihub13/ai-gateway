import { describe, it, expect } from 'vitest';
import {
  parseShareRange,
  rangeDays,
  rangeLabel,
  computeCacheHitPct,
  compactId,
  fullId,
  periodLabel,
} from '@/lib/share-card-format';

describe('parseShareRange', () => {
  it('accepts valid values', () => {
    expect(parseShareRange('7')).toBe('7');
    expect(parseShareRange('30')).toBe('30');
    expect(parseShareRange('90')).toBe('90');
    expect(parseShareRange('all')).toBe('all');
  });

  it('falls back to 30 for unknown/null', () => {
    expect(parseShareRange(null)).toBe('30');
    expect(parseShareRange('999')).toBe('30');
    expect(parseShareRange('hack')).toBe('30');
  });
});

describe('rangeDays', () => {
  it('maps presets to day counts and null for all-time', () => {
    expect(rangeDays('7')).toBe(7);
    expect(rangeDays('30')).toBe(30);
    expect(rangeDays('90')).toBe(90);
    expect(rangeDays('all')).toBeNull();
  });
});

describe('rangeLabel', () => {
  it('returns human labels', () => {
    expect(rangeLabel('7')).toBe('7 hari');
    expect(rangeLabel('all')).toBe('Semua waktu');
    expect(rangeLabel('30')).toBe('30 hari');
  });
});

describe('computeCacheHitPct', () => {
  it('computes cached/prompt with 1 decimal', () => {
    expect(computeCacheHitPct(374, 1000)).toBe(37.4);
    expect(computeCacheHitPct(1000, 1000)).toBe(100);
    expect(computeCacheHitPct(0, 1000)).toBe(0);
  });

  it('returns null when there are no prompt tokens or invalid input', () => {
    expect(computeCacheHitPct(0, 0)).toBeNull();
    expect(computeCacheHitPct(100, 0)).toBeNull();
    expect(computeCacheHitPct(Number.NaN, 100)).toBeNull();
    expect(computeCacheHitPct(100, Number.NaN)).toBeNull();
  });

  it('does not divide by total tokens (cache only saves input)', () => {
    // cached 500 dari prompt 1000 dengan completion 4000 → 50%, bukan 10%.
    expect(computeCacheHitPct(500, 1000)).toBe(50);
  });
});

describe('compactId / fullId', () => {
  it('formats small numbers plainly', () => {
    expect(compactId(0)).toBe('0');
    expect(compactId(999)).toBe('999');
    expect(fullId(1234)).toBe('1.234');
  });

  it('compacts large numbers id-ID style', () => {
    // id-ID compact: 12.345 → "12,3 rb"
    expect(compactId(12_345)).toBe('12,3 rb');
    expect(compactId(2_500_000)).toBe('2,5 jt');
    expect(compactId(1_000_000_000)).toBe('1 M');
  });
});

describe('periodLabel', () => {
  it('joins short-left and full-right dates', () => {
    const from = new Date(2026, 9, 1); // 1 Okt 2026
    const to = new Date(2026, 9, 23);
    expect(periodLabel(from, to)).toBe('01 Okt – 23 Okt 2026');
  });

  it('includes year on the left when years differ', () => {
    const from = new Date(2025, 11, 30);
    const to = new Date(2026, 0, 2);
    expect(periodLabel(from, to)).toBe('30 Des 2025 – 02 Jan 2026');
  });

  it('handles null from (all-time)', () => {
    const to = new Date(2026, 9, 23);
    expect(periodLabel(null, to)).toBe('s.d. 23 Okt 2026');
  });
});
