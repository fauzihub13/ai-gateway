import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Tes unit untuk logika plan: periode per plan (`Plan.periodDays`), stack saat
 * beli lagi, kuota token, mode SUBSCRIPTION (tanpa potong saldo), dan status plan.
 *
 * Prisma di-mock supaya aturan bisnis bisa diuji cepat tanpa DB.
 *
 * Catatan produk: **tidak ada auto-downgrade**. `getPlanStatus` hanya membaca
 * dan menandai `expired`; penurunan plan dilakukan manual oleh admin.
 */

const tx = {
  plan: { findUnique: vi.fn() },
  user: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  subscription: { create: vi.fn() },
  balanceLedger: { create: vi.fn() },
};

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    usageLog: { aggregate: vi.fn() },
    $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(txMock)),
  },
}));

const txMock = tx;

const { db } = await import('@/lib/db');
const { getPlanStatus, purchasePlan, ensureQuotaPeriod } = await import('@/lib/subscription');

/**
 * `getPlanStatus` memanggil `ensureQuotaPeriod` lebih dulu. Default mock:
 * periode kuota tidak perlu di-roll (plan tanpa kuota).
 */
function mockNoQuotaPeriod() {
  vi.mocked(db.user.findUnique).mockResolvedValue({
    planExpiresAt: null,
    planStartedAt: null,
    planTokenQuota: null,
    plan: { periodDays: 30, monthlyTokenLimit: null },
  } as never);
}

const DAY = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPlanStatus', () => {
  it('plan gratis tanpa expiry: expired=false, tanpa kuota', async () => {
    vi.mocked(db.user.findUniqueOrThrow).mockResolvedValue({
      planId: 'plan-free',
      planExpiresAt: null,
      planStartedAt: null,
      planTokenQuota: null,
      plan: { name: 'free', billingMode: 'PAYG' },
    } as never);

    const status = await getPlanStatus('u1');
    expect(status).toEqual({
      planId: 'plan-free',
      planName: 'free',
      billingMode: 'PAYG',
      startedAt: null,
      expiresAt: null,
      daysLeft: null,
      expired: false,
      tokenQuota: null,
      tokensUsed: 0,
      tokensRemaining: null,
      quotaExhausted: false,
    });
  });

  it('plan berbayar masih aktif: sisa hari & kuota dihitung dari periode', async () => {
    const startedAt = new Date(Date.now() - 2 * DAY);
    vi.mocked(db.user.findUniqueOrThrow).mockResolvedValue({
      planId: 'plan-pro',
      planExpiresAt: new Date(Date.now() + 5 * DAY),
      planStartedAt: startedAt,
      planTokenQuota: 1000,
      plan: { name: 'pro', billingMode: 'SUBSCRIPTION' },
    } as never);
    vi.mocked(db.usageLog.aggregate).mockResolvedValue({ _sum: { totalTokens: 400 } } as never);

    const status = await getPlanStatus('u1');
    expect(status.expired).toBe(false);
    expect(status.daysLeft).toBe(5);
    expect(status.billingMode).toBe('SUBSCRIPTION');
    expect(status.tokenQuota).toBe(1000);
    expect(status.tokensUsed).toBe(400);
    expect(status.tokensRemaining).toBe(600);
    expect(status.quotaExhausted).toBe(false);

    // Kuota dihitung sejak `planStartedAt`, bukan awal bulan.
    expect(db.usageLog.aggregate).toHaveBeenCalledWith({
      where: { userId: 'u1', createdAt: { gte: startedAt }, status: { not: 'REJECTED' } },
      _sum: { totalTokens: true },
    });
  });

  it('kuota habis: quotaExhausted=true, sisa 0', async () => {
    vi.mocked(db.user.findUniqueOrThrow).mockResolvedValue({
      planId: 'plan-pro',
      planExpiresAt: new Date(Date.now() + 5 * DAY),
      planStartedAt: new Date(Date.now() - DAY),
      planTokenQuota: 1000,
      plan: { name: 'pro', billingMode: 'SUBSCRIPTION' },
    } as never);
    vi.mocked(db.usageLog.aggregate).mockResolvedValue({ _sum: { totalTokens: 1000 } } as never);

    const status = await getPlanStatus('u1');
    expect(status.tokensRemaining).toBe(0);
    expect(status.quotaExhausted).toBe(true);
  });

  it('plan lewat tanggal: expired=true, tapi TIDAK mengubah plan user', async () => {
    vi.mocked(db.user.findUniqueOrThrow).mockResolvedValue({
      planId: 'plan-pro',
      planExpiresAt: new Date(Date.now() - DAY),
      planStartedAt: new Date(Date.now() - 40 * DAY),
      planTokenQuota: null,
      plan: { name: 'pro', billingMode: 'PAYG' },
    } as never);

    const status = await getPlanStatus('u1');
    expect(status.expired).toBe(true);
    expect(status.daysLeft).toBe(0);
    expect(status.planId).toBe('plan-pro');
  });
});

describe('ensureQuotaPeriod', () => {
  it('plan gratis tanpa periode berjalan: periode dimulai & kuota diisi', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      planExpiresAt: null,
      planStartedAt: null,
      planTokenQuota: null,
      plan: { periodDays: 30, monthlyTokenLimit: 20_000_000 },
    } as never);
    vi.mocked(db.user.updateMany).mockResolvedValue({ count: 1 } as never);

    const now = new Date('2026-01-01T00:00:00.000Z');
    const res = await ensureQuotaPeriod('u1', now);

    expect(res.planStartedAt?.getTime()).toBe(now.getTime());
    expect(res.planTokenQuota).toBe(20_000_000);
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', planStartedAt: null },
      data: { planStartedAt: now, planTokenQuota: 20_000_000 },
    });
  });

  it('plan gratis periode masih berjalan: TIDAK direset', async () => {
    const started = new Date(Date.now() - 5 * DAY);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      planExpiresAt: null,
      planStartedAt: started,
      planTokenQuota: 20_000_000,
      plan: { periodDays: 30, monthlyTokenLimit: 20_000_000 },
    } as never);

    const res = await ensureQuotaPeriod('u1');
    expect(res.planStartedAt?.getTime()).toBe(started.getTime());
    expect(res.planTokenQuota).toBe(20_000_000);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('plan gratis periode lewat: reset & kuota diisi ulang', async () => {
    const started = new Date(Date.now() - 31 * DAY);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      planExpiresAt: null,
      planStartedAt: started,
      planTokenQuota: 20_000_000,
      plan: { periodDays: 30, monthlyTokenLimit: 20_000_000 },
    } as never);
    vi.mocked(db.user.updateMany).mockResolvedValue({ count: 1 } as never);

    const now = new Date('2026-02-01T00:00:00.000Z');
    // Periode dihitung dari `now` (bukan `Date.now()`), jadi geser `started`
    // relatif ke `now` supaya kedaluwarsa apa pun tanggal berjalannya test.
    vi.mocked(db.user.findUnique).mockResolvedValue({
      planExpiresAt: null,
      planStartedAt: new Date(now.getTime() - 31 * DAY),
      planTokenQuota: 20_000_000,
      plan: { periodDays: 30, monthlyTokenLimit: 20_000_000 },
    } as never);

    const res = await ensureQuotaPeriod('u1', now);
    expect(res.planStartedAt?.getTime()).toBe(now.getTime());
    expect(res.planTokenQuota).toBe(20_000_000);
  });

  it('plan berbayar: TIDAK disentuh (periode dikelola pembelian)', async () => {
    const started = new Date(Date.now() - 40 * DAY);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      planExpiresAt: new Date(Date.now() + 5 * DAY),
      planStartedAt: started,
      planTokenQuota: 1000,
      plan: { periodDays: 30, monthlyTokenLimit: 1_000_000 },
    } as never);

    const res = await ensureQuotaPeriod('u1');
    expect(res.planStartedAt?.getTime()).toBe(started.getTime());
    expect(res.planTokenQuota).toBe(1000);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('plan tanpa kuota: tidak ada yang diubah', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      planExpiresAt: null,
      planStartedAt: null,
      planTokenQuota: null,
      plan: { periodDays: 30, monthlyTokenLimit: null },
    } as never);

    const res = await ensureQuotaPeriod('u1');
    expect(res).toEqual({ planStartedAt: null, planTokenQuota: null });
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('kalah balapan: pakai nilai yang menang (bukan nilai sendiri)', async () => {
    vi.mocked(db.user.findUnique)
      .mockResolvedValueOnce({
        planExpiresAt: null,
        planStartedAt: null,
        planTokenQuota: null,
        plan: { periodDays: 30, monthlyTokenLimit: 20_000_000 },
      } as never)
      .mockResolvedValueOnce({
        planStartedAt: new Date('2026-01-01T00:00:01.000Z'),
        planTokenQuota: 20_000_000,
      } as never);
    vi.mocked(db.user.updateMany).mockResolvedValue({ count: 0 } as never);

    const res = await ensureQuotaPeriod('u1', new Date('2026-01-01T00:00:00.000Z'));
    expect(res.planStartedAt?.toISOString()).toBe('2026-01-01T00:00:01.000Z');
    expect(res.planTokenQuota).toBe(20_000_000);
  });
});

describe('purchasePlan', () => {
  function mockPlan(over: Partial<Record<string, unknown>> = {}) {
    tx.plan.findUnique.mockResolvedValue({
      id: 'plan-pro',
      name: 'pro',
      displayName: 'Pro',
      monthlyPriceIdr: 100_000,
      monthlyTokenLimit: 1_000_000,
      periodDays: 30,
      billingMode: 'SUBSCRIPTION',
      isActive: true,
      ...over,
    } as never);
  }

  it('beli pertama: reset periode dari sekarang, durasi = plan.periodDays', async () => {
    mockPlan();
    tx.user.findUniqueOrThrow.mockResolvedValue({
      planId: 'plan-free',
      planExpiresAt: null,
      planStartedAt: null,
      planTokenQuota: null,
      balance: 500_000,
    } as never);
    tx.user.updateMany.mockResolvedValue({ count: 1 } as never);
    tx.subscription.create.mockResolvedValue({ id: 'sub-1', priceIdr: 100_000 } as never);
    tx.user.update.mockResolvedValue({ balance: 400_000 } as never);

    const now = new Date('2026-01-01T00:00:00.000Z');
    const res = await purchasePlan('u1', 'pro', now);

    expect(res.stacked).toBe(false);
    expect(res.planStartedAt.getTime()).toBe(now.getTime());
    expect(res.planExpiresAt.getTime()).toBe(now.getTime() + 30 * DAY);
    expect(res.planTokenQuota).toBe(1_000_000);
    expect(tx.balanceLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: 'PLAN', deltaIdr: -100_000 }) }),
    );
  });

  it('durasi periode mengikuti plan.periodDays, bukan hardcode 30', async () => {
    mockPlan({ periodDays: 7 });
    tx.user.findUniqueOrThrow.mockResolvedValue({
      planId: 'plan-free',
      planExpiresAt: null,
      planStartedAt: null,
      planTokenQuota: null,
      balance: 500_000,
    } as never);
    tx.user.updateMany.mockResolvedValue({ count: 1 } as never);
    tx.subscription.create.mockResolvedValue({ id: 'sub-7', priceIdr: 100_000 } as never);
    tx.user.update.mockResolvedValue({ balance: 400_000 } as never);

    const now = new Date('2026-01-01T00:00:00.000Z');
    const res = await purchasePlan('u1', 'pro', now);

    expect(res.planExpiresAt.getTime()).toBe(now.getTime() + 7 * DAY);
    // `Subscription.days` juga mencatat durasi plan ini.
    expect(tx.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ days: 7 }) }),
    );
  });

  it('beli lagi saat plan sama masih aktif: stack expiry & kuota', async () => {
    mockPlan();
    const expires = new Date('2026-01-10T00:00:00.000Z');
    const started = new Date('2025-12-15T00:00:00.000Z');
    tx.user.findUniqueOrThrow.mockResolvedValue({
      planId: 'plan-pro',
      planExpiresAt: expires,
      planStartedAt: started,
      planTokenQuota: 300_000,
      balance: 500_000,
    } as never);
    tx.user.updateMany.mockResolvedValue({ count: 1 } as never);
    tx.subscription.create.mockResolvedValue({ id: 'sub-2', priceIdr: 100_000 } as never);
    tx.user.update.mockResolvedValue({ balance: 400_000 } as never);

    const now = new Date('2026-01-05T00:00:00.000Z');
    const res = await purchasePlan('u1', 'pro', now);

    expect(res.stacked).toBe(true);
    // Masa aktif ditambah dari expiry lama, bukan dari sekarang.
    expect(res.planExpiresAt.getTime()).toBe(expires.getTime() + 30 * DAY);
    // Awal periode TIDAK direset (kuota & masa aktif sejajar).
    expect(res.planStartedAt.getTime()).toBe(started.getTime());
    // Kuota ditambah, bukan diganti.
    expect(res.planTokenQuota).toBe(300_000 + 1_000_000);
  });

  it('saldo kurang: lempar InsufficientBalanceError, tidak menulis apa pun', async () => {
    mockPlan();
    tx.user.findUniqueOrThrow.mockResolvedValue({
      planId: 'plan-free',
      planExpiresAt: null,
      planStartedAt: null,
      planTokenQuota: null,
      balance: 1_000,
    } as never);
    tx.user.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      purchasePlan('u1', 'pro', new Date('2026-01-01T00:00:00.000Z')),
    ).rejects.toMatchObject({ code: 'insufficient_balance' });
    expect(tx.subscription.create).not.toHaveBeenCalled();
  });

  it('plan gratis tidak bisa dibeli', async () => {
    mockPlan({ monthlyPriceIdr: 0 });
    await expect(
      purchasePlan('u1', 'pro', new Date('2026-01-01T00:00:00.000Z')),
    ).rejects.toMatchObject({ code: 'plan_not_purchasable' });
  });
});
