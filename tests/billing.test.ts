import { describe, it, expect } from 'vitest';
import { computeCostBreakdown, computeUsageValue, isFreeModel } from '@/lib/billing';

/**
 * Model biaya:
 *   valueIdr   = harga resmi (official) × token, tanpa markup
 *   markedIdr  = valueIdr × markup plan (harga retail)
 *   chargedIdr = PAYG ? markedIdr : 0
 *   savedIdr   = markedIdr − chargedIdr
 */
describe('computeCostBreakdown', () => {
  const model = { priceInPer1MIdr: 4000, priceOutPer1MIdr: 12000 };
  const payg = { markup: 1.35, billingMode: 'PAYG' };
  const sub = { markup: 1.35, billingMode: 'SUBSCRIPTION' };

  it('PAYG: ditagih = harga resmi × markup, hemat 0', () => {
    const c = computeCostBreakdown({ model, plan: payg, promptTokens: 1200, completionTokens: 800 });
    // (1200/1M)*4000 + (800/1M)*12000 = 4.8 + 9.6 = 14.4 → ceil 15
    expect(c.valueIdr).toBe(15);
    // 14.4 * 1.35 = 19.44 → ceil 20
    expect(c.markedIdr).toBe(20);
    expect(c.chargedIdr).toBe(20);
    expect(c.savedIdr).toBe(0);
  });

  it('SUBSCRIPTION: ditagih 0, hemat = harga retail penuh', () => {
    const c = computeCostBreakdown({ model, plan: sub, promptTokens: 1200, completionTokens: 800 });
    expect(c.valueIdr).toBe(15);
    expect(c.markedIdr).toBe(20);
    expect(c.chargedIdr).toBe(0);
    expect(c.savedIdr).toBe(20);
  });

  it('nilai pemakaian (valueIdr) tidak terpengaruh markup plan', () => {
    const cheap = computeCostBreakdown({ model, plan: { markup: 1, billingMode: 'PAYG' }, promptTokens: 1000, completionTokens: 0 });
    const pricey = computeCostBreakdown({ model, plan: { markup: 3, billingMode: 'PAYG' }, promptTokens: 1000, completionTokens: 0 });
    expect(cheap.valueIdr).toBe(pricey.valueIdr);
    expect(pricey.markedIdr).toBeGreaterThan(cheap.markedIdr);
  });

  it('nol token -> semua nol', () => {
    const c = computeCostBreakdown({ model, plan: payg, promptTokens: 0, completionTokens: 0 });
    expect(c).toEqual({ valueIdr: 0, markedIdr: 0, chargedIdr: 0, savedIdr: 0 });
  });

  it('ceil ke rupiah untuk pecahan kecil', () => {
    const c = computeCostBreakdown({ model, plan: payg, promptTokens: 100, completionTokens: 0 });
    expect(c.valueIdr).toBe(1);
  });

  it('cached token tanpa harga khusus -> sama seperti harga input biasa', () => {
    const withCached = computeCostBreakdown({ model, plan: payg, promptTokens: 1200, completionTokens: 800, cachedPromptTokens: 500 });
    const withoutCached = computeCostBreakdown({ model, plan: payg, promptTokens: 1200, completionTokens: 800 });
    expect(withCached).toEqual(withoutCached);
  });

  it('cached token dengan harga diskon -> lebih murah', () => {
    const discounted = computeCostBreakdown({
      model: { ...model, priceCachedInPer1MIdr: 1000 },
      plan: payg,
      promptTokens: 1_000_000,
      completionTokens: 0,
      cachedPromptTokens: 1_000_000,
    });
    const full = computeCostBreakdown({ model, plan: payg, promptTokens: 1_000_000, completionTokens: 0, cachedPromptTokens: 1_000_000 });
    expect(discounted.valueIdr).toBeLessThan(full.valueIdr);
    expect(discounted.valueIdr).toBe(1000); // (1M/1M) * 1000, tanpa markup
  });

  it('cached token di-clamp ke promptTokens', () => {
    const c = computeCostBreakdown({
      model: { ...model, priceCachedInPer1MIdr: 2000 },
      plan: payg,
      promptTokens: 500,
      completionTokens: 0,
      cachedPromptTokens: 9999,
    });
    expect(c.valueIdr).toBe(1); // (500/1M)*2000 = 1 → ceil 1
  });

  it('harga per 1M, bukan per 1k', () => {
    const c = computeCostBreakdown({ model, plan: { markup: 1, billingMode: 'PAYG' }, promptTokens: 1_000_000, completionTokens: 0 });
    expect(c.valueIdr).toBe(4000);
  });
});

describe('computeUsageValue', () => {
  it('sama dengan valueIdr di breakdown', () => {
    const model = { priceInPer1MIdr: 4000, priceOutPer1MIdr: 12000 };
    const t = { promptTokens: 1200, completionTokens: 800 };
    expect(computeUsageValue(model, t)).toBe(
      computeCostBreakdown({ model, plan: { markup: 2.5, billingMode: 'PAYG' }, ...t }).valueIdr,
    );
  });
});

describe('isFreeModel', () => {
  it('harga in/out 0 -> gratis', () => {
    expect(isFreeModel({ priceInPer1MIdr: 0, priceOutPer1MIdr: 0 }, { markup: 1 })).toBe(true);
  });

  it('markup 0 -> efektif gratis walau harga > 0', () => {
    expect(isFreeModel({ priceInPer1MIdr: 4000, priceOutPer1MIdr: 12000 }, { markup: 0 })).toBe(true);
  });

  it('salah satu harga > 0 -> tidak gratis', () => {
    expect(isFreeModel({ priceInPer1MIdr: 0, priceOutPer1MIdr: 12000 }, { markup: 1 })).toBe(false);
    expect(isFreeModel({ priceInPer1MIdr: 4000, priceOutPer1MIdr: 0 }, { markup: 1.35 })).toBe(false);
  });

  it('model berbayar + markup > 1 -> tidak gratis', () => {
    expect(isFreeModel({ priceInPer1MIdr: 4000, priceOutPer1MIdr: 12000 }, { markup: 1.35 })).toBe(false);
  });

  it('konsisten dengan breakdown: gratis -> ditagih 0', () => {
    const m = { priceInPer1MIdr: 0, priceOutPer1MIdr: 0 };
    const p = { markup: 1, billingMode: 'PAYG' };
    expect(isFreeModel(m, p)).toBe(true);
    expect(computeCostBreakdown({ model: m, plan: p, promptTokens: 5000, completionTokens: 5000 }).chargedIdr).toBe(0);
  });
});
