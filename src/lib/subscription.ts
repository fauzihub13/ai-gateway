import { db } from './db';
import { BadRequestError, InsufficientBalanceError, NotFoundError } from './errors';
import type { Plan, Subscription } from '@prisma/client';

/**
 * Plan berbayar dibeli dari saldo (bukan payment gateway). Satu kali bayar =
 * satu periode (`Plan.monthlyPriceIdr` untuk `PLAN_PERIOD_DAYS` hari).
 *
 * Aturan yang disengaja:
 * - `User.planId` tetap satu sumber kebenaran plan aktif.
 * - `User.planExpiresAt` adalah penanda masa berlaku; NULL = plan gratis tanpa expiry.
 * - Beli plan baru = periode di-reset dari sekarang (sisa hari plan lama hangus).
 * - Beli plan yang sama saat masih aktif ditolak supaya user tidak kehilangan sisa hari.
 * - **Tidak ada auto-downgrade.** Lewat tanggal hanya ditandai `expired` dan
 *   ditampilkan di dashboard. Admin yang memutuskan kapan user diturunkan
 *   plan-nya lewat panel admin (`grantPlan`). Ini keputusan produk: kontrol
 *   manual, bukan job otomatis, supaya tidak ada user yang kehilangan akses
 *   tanpa diketahui admin.
 */

export const PLAN_PERIOD_DAYS = 30;

export type PlanSource = 'BALANCE' | 'ADMIN';

export interface PlanView {
  name: string;
  displayName: string;
  markup: number;
  rpmLimit: number;
  monthlyTokenLimit: number | null;
  monthlyPriceIdr: number;
  isActive: boolean;
  models: string[];
}

export interface PlanStatus {
  planId: string;
  planName: string;
  /** null = gratis / tanpa expiry. */
  expiresAt: string | null;
  daysLeft: number | null;
  /** true bila `planExpiresAt` sudah lewat (plan tetap aktif sampai admin menurunkan). */
  expired: boolean;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
}

export function toPlanView(plan: Plan & { models?: Array<{ model: { publicName: string } }> }): PlanView {
  return {
    name: plan.name,
    displayName: plan.displayName,
    markup: plan.markup,
    rpmLimit: plan.rpmLimit,
    monthlyTokenLimit: plan.monthlyTokenLimit,
    monthlyPriceIdr: plan.monthlyPriceIdr,
    isActive: plan.isActive,
    models: (plan.models ?? []).map((m) => m.model.publicName),
  };
}

/**
 * Status plan untuk dashboard. Murni baca — **tidak** mengubah plan user.
 * Bila masa aktif sudah lewat, `expired = true` dan `daysLeft = 0`, tapi plan
 * tetap seperti apa adanya sampai admin menurunkannya.
 */
export async function getPlanStatus(userId: string, now = new Date()): Promise<PlanStatus> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { planId: true, planExpiresAt: true, plan: { select: { name: true } } },
  });
  const expires = user.planExpiresAt;
  const expired = Boolean(expires && expires.getTime() <= now.getTime());
  return {
    planId: user.planId,
    planName: user.plan.name,
    expiresAt: expires?.toISOString() ?? null,
    daysLeft: expires ? daysBetween(now, expires) : null,
    expired,
  };
}

export interface PurchaseResult {
  subscription: Subscription;
  balanceAfter: number;
  planExpiresAt: Date;
}

/**
 * Beli / upgrade plan memakai saldo. Semua langkah dalam satu transaksi:
 * potong saldo → tulis ledger → catat Subscription → set plan aktif.
 */
export async function purchasePlan(
  userId: string,
  planName: string,
  now = new Date(),
): Promise<PurchaseResult> {
  return db.$transaction(async (tx) => {
    const plan = await tx.plan.findUnique({ where: { name: planName } });
    if (!plan || !plan.isActive) {
      throw new NotFoundError('plan_not_found', `Plan \`${planName}\` tidak tersedia.`);
    }
    if (plan.monthlyPriceIdr <= 0) {
      throw new BadRequestError(
        'plan_not_purchasable',
        `Plan \`${plan.name}\` gratis dan tidak perlu dibeli.`,
      );
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { planId: true, planExpiresAt: true, balance: true },
    });

    if (user.planId === plan.id && user.planExpiresAt && user.planExpiresAt.getTime() > now.getTime()) {
      throw new BadRequestError(
        'plan_already_active',
        `Plan \`${plan.name}\` masih aktif sampai ${user.planExpiresAt.toISOString()}. ` +
          'Beli lagi setelah masa aktifnya habis.',
      );
    }

    // Guard saldo di DB (bukan cuma cek di app) supaya dua pembelian paralel
    // tidak menghasilkan saldo negatif.
    const charged = await tx.user.updateMany({
      where: { id: userId, balance: { gte: plan.monthlyPriceIdr } },
      data: { balance: { decrement: plan.monthlyPriceIdr } },
    });
    if (charged.count === 0) {
      throw new InsufficientBalanceError(
        `Saldo tidak cukup. Harga plan ${plan.displayName}: Rp${plan.monthlyPriceIdr.toLocaleString('id-ID')}.`,
      );
    }

    const expiresAt = new Date(now.getTime() + PLAN_PERIOD_DAYS * 86_400_000);

    const subscription = await tx.subscription.create({
      data: {
        userId,
        planId: plan.id,
        priceIdr: plan.monthlyPriceIdr,
        days: PLAN_PERIOD_DAYS,
        source: 'BALANCE',
        startsAt: now,
        expiresAt,
      },
    });

    const updated = await tx.user.update({
      where: { id: userId },
      data: { planId: plan.id, planExpiresAt: expiresAt },
      select: { balance: true },
    });

    await tx.balanceLedger.create({
      data: {
        userId,
        deltaIdr: -plan.monthlyPriceIdr,
        balanceAfter: updated.balance,
        reason: 'PLAN',
        referenceId: subscription.id,
        note: `Plan ${plan.name} (${PLAN_PERIOD_DAYS} hari)`,
      },
    });

    return { subscription, balanceAfter: updated.balance, planExpiresAt: expiresAt };
  });
}

export interface GrantResult {
  planExpiresAt: Date | null;
  subscription: Subscription | null;
}

/**
 * Admin memberi / mengganti / menurunkan plan TANPA memotong saldo.
 * `days = 0` atau plan gratis → langsung set plan tanpa expiry.
 *
 * Ini satu-satunya jalur penurunan plan: admin menurunkan user yang masa
 * aktifnya sudah lewat (atau berhenti berlangganan) secara manual dari
 * dashboard. Tidak ada job otomatis yang menurunkan plan.
 */
export async function grantPlan(
  userId: string,
  planName: string,
  days = PLAN_PERIOD_DAYS,
  now = new Date(),
): Promise<GrantResult> {
  const plan = await db.plan.findUnique({ where: { name: planName } });
  if (!plan) throw new NotFoundError('plan_not_found', `Plan \`${planName}\` tidak ditemukan.`);

  const isFree = plan.monthlyPriceIdr <= 0 || days <= 0;
  const expiresAt = isFree ? null : new Date(now.getTime() + days * 86_400_000);

  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { planId: plan.id, planExpiresAt: expiresAt },
    });

    if (!expiresAt) return { planExpiresAt: null, subscription: null };

    const subscription = await tx.subscription.create({
      data: {
        userId,
        planId: plan.id,
        priceIdr: 0,
        days,
        source: 'ADMIN',
        startsAt: now,
        expiresAt,
      },
    });

    return { planExpiresAt: expiresAt, subscription };
  });
}
