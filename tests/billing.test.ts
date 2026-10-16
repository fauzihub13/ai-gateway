import { describe, it, expect } from 'vitest';
import { computeCost } from '@/lib/billing';

describe('computeCost', () => {
  const model = { priceInPer1kIdr: 4, priceOutPer1kIdr: 12 };
  const plan = { markup: 1.35 };

  it('menghitung in+out dengan markup dan ceil', () => {
    const c = computeCost({ model, plan, promptTokens: 1200, completionTokens: 800 });
    expect(c).toBe(20);
  });

  it('ceil ke rupiah untuk pecahan kecil', () => {
    const c = computeCost({ model, plan, promptTokens: 100, completionTokens: 0 });
    expect(c).toBe(1);
  });

  it('nol token -> nol biaya', () => {
    expect(computeCost({ model, plan, promptTokens: 0, completionTokens: 0 })).toBe(0);
  });
});