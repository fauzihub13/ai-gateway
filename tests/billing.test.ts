import { describe, it, expect } from 'vitest';
import { computeCost, isFreeModel } from '@/lib/billing';

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

describe('isFreeModel', () => {
  it('harga in/out 0 -> gratis', () => {
    expect(isFreeModel({ priceInPer1kIdr: 0, priceOutPer1kIdr: 0 }, { markup: 1 })).toBe(true);
  });

  it('markup 0 -> efektif gratis walau harga > 0', () => {
    expect(isFreeModel({ priceInPer1kIdr: 4, priceOutPer1kIdr: 12 }, { markup: 0 })).toBe(true);
  });

  it('salah satu harga > 0 -> tidak gratis', () => {
    expect(isFreeModel({ priceInPer1kIdr: 0, priceOutPer1kIdr: 12 }, { markup: 1 })).toBe(false);
    expect(isFreeModel({ priceInPer1kIdr: 4, priceOutPer1kIdr: 0 }, { markup: 1.35 })).toBe(false);
  });

  it('model berbayar + markup > 1 -> tidak gratis', () => {
    expect(isFreeModel({ priceInPer1kIdr: 4, priceOutPer1kIdr: 12 }, { markup: 1.35 })).toBe(false);
  });

  it('konsisten dengan computeCost: gratis -> biaya 0', () => {
    const m = { priceInPer1kIdr: 0, priceOutPer1kIdr: 0 };
    const p = { markup: 1 };
    expect(isFreeModel(m, p)).toBe(true);
    expect(computeCost({ model: m, plan: p, promptTokens: 5000, completionTokens: 5000 })).toBe(0);
  });
});