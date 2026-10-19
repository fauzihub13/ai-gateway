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

  it('cached token tanpa harga khusus -> sama seperti harga input biasa', () => {
    const withCached = computeCost({ model, plan, promptTokens: 1200, completionTokens: 800, cachedPromptTokens: 500 });
    const withoutCached = computeCost({ model, plan, promptTokens: 1200, completionTokens: 800 });
    expect(withCached).toBe(withoutCached);
  });

  it('cached token dengan harga diskon -> lebih murah dari tanpa diskon', () => {
    const discounted = computeCost({
      model: { ...model, priceCachedInPer1kIdr: 1 }, plan, promptTokens: 1000, completionTokens: 0, cachedPromptTokens: 1000,
    });
    const full = computeCost({ model, plan, promptTokens: 1000, completionTokens: 0, cachedPromptTokens: 1000 });
    expect(discounted).toBeLessThan(full);
    expect(discounted).toBe(Math.ceil((1000 / 1000) * 1 * 1.35));
  });

  it('cached token di-clamp ke promptTokens', () => {
    const c = computeCost({ model: { ...model, priceCachedInPer1kIdr: 2 }, plan, promptTokens: 500, completionTokens: 0, cachedPromptTokens: 9999 });
    expect(c).toBe(Math.ceil((500 / 1000) * 2 * 1.35));
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