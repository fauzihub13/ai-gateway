import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Tes unit untuk logika plan purchase/expiry tanpa DB.
 * Prisma di-mock supaya aturan bisnis (harga, expiry, guard saldo) bisa diuji cepat.
 *
 * Catatan produk: **tidak ada auto-downgrade**. `getPlanStatus` hanya membaca
 * dan menandai `expired`, tidak pernah mengubah plan user.
 */

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    plan: { findUnique: vi.fn(), findFirst: vi.fn() },
    subscription: { create: vi.fn() },
    balanceLedger: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/plans', () => ({
  getDefaultSignupPlan: vi.fn(async () => ({ id: 'plan-free', name: 'free' })),
}));

const { db } = await import('@/lib/db');
const { getPlanStatus, PLAN_PERIOD_DAYS } = await import('@/lib/subscription');

const DAY = 86_400_000;

describe('PLAN_PERIOD_DAYS', () => {
  it('adalah 30 hari', () => {
    expect(PLAN_PERIOD_DAYS).toBe(30);
  });
});

describe('getPlanStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plan gratis tanpa expiry: expired=false, daysLeft=null', async () => {
    vi.mocked(db.user.findUniqueOrThrow).mockResolvedValue({
      planId: 'plan-free',
      planExpiresAt: null,
      plan: { name: 'free' },
    } as never);

    const status = await getPlanStatus('u1');
    expect(status).toEqual({
      planId: 'plan-free',
      planName: 'free',
      expiresAt: null,
      daysLeft: null,
      expired: false,
    });
  });

  it('plan berbayar masih aktif: expired=false dengan sisa hari', async () => {
    const expires = new Date(Date.now() + 5 * DAY);
    vi.mocked(db.user.findUniqueOrThrow).mockResolvedValue({
      planId: 'plan-pro',
      planExpiresAt: expires,
      plan: { name: 'pro' },
    } as never);

    const status = await getPlanStatus('u1');
    expect(status.expired).toBe(false);
    expect(status.daysLeft).toBe(5);
    expect(status.planName).toBe('pro');
  });

  it('plan lewat tanggal: expired=true, tapi TIDAK mengubah plan user', async () => {
    vi.mocked(db.user.findUniqueOrThrow).mockResolvedValue({
      planId: 'plan-pro',
      planExpiresAt: new Date(Date.now() - DAY),
      plan: { name: 'pro' },
    } as never);

    const status = await getPlanStatus('u1');
    expect(status.expired).toBe(true);
    expect(status.daysLeft).toBe(0);
    // Plan tetap pro — penurunan hanya lewat aksi admin.
    expect(status.planId).toBe('plan-pro');

    // Tidak ada penulisan ke DB sama sekali.
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});
