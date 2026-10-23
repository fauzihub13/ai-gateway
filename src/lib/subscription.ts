import { db } from './db';
import { BadRequestError, InsufficientBalanceError, NotFoundError } from './errors';
import type { Plan, Subscription } from '@prisma/client';

/**
 * Plan berbayar dibeli dari saldo (bukan payment gateway). Satu kali bayar =
 * satu periode sepanjang `Plan.periodDays` hari (diatur admin per plan).
 *
 * Model yang disengaja:
 * - `User.planId` tetap satu sumber kebenaran plan aktif.
 * - `User.planStartedAt` + `User.planExpiresAt` = **periode berjalan**.
 *   Kuota token dihitung dari `planStartedAt` → akhir periode, bukan bulan kalender.
 * - `User.planTokenQuota` = total kuota token periode berjalan.
 * - Beli lagi **saat masih aktif** → stack: `planExpiresAt += periodDays` dan
 *   `planTokenQuota += Plan.monthlyTokenLimit` (periode & kuota bertambah).
 * - Beli lagi **setelah expired** (atau ganti tier) → reset periode dari sekarang.
 * - **PAYG**: potong saldo per token × markup. Saldo = pembatas utama.
 * - **SUBSCRIPTION**: plan murni — tidak potong saldo; hanya dibatasi kuota token.
 * - Lewat `planExpiresAt` → request **ditolak** (`plan_expired`) sampai beli lagi.
 *   Plan tetap menempel di user (tidak auto-downgrade); admin bisa menurunkannya
 *   manual dari dashboard bila perlu.
 */

/** Mode penagihan plan. `PAYG` = potong saldo; `SUBSCRIPTION` = kuota token. */
export type PlanBillingMode = 'PAYG' | 'SUBSCRIPTION';

export type PlanSource = 'BALANCE' | 'ADMIN';

export interface PlanView {
  name: string;
  displayName: string;
  markup: number;
  rpmLimit: number;
  monthlyTokenLimit: number | null;
  monthlyPriceIdr: number;
  /** Panjang satu periode plan dalam hari (diatur admin per plan). */
  periodDays: number;
  billingMode: PlanBillingMode;
  isActive: boolean;
  models: string[];
}

export interface PlanStatus {
  planId: string;
  planName: string;
  billingMode: PlanBillingMode;
  /** Awal periode kuota berjalan (tanggal beli/perpanjang terakhir). */
  startedAt: string | null;
  /** null = gratis / tanpa expiry. */
  expiresAt: string | null;
  daysLeft: number | null;
  /** true bila `planExpiresAt` sudah lewat (request ditolak sampai beli lagi). */
  expired: boolean;
  /** Total kuota token periode berjalan; null = tanpa kuota. */
  tokenQuota: number | null;
  /** Token terpakai sejak `startedAt`. */
  tokensUsed: number;
  /** Sisa kuota; null bila tanpa kuota. Bisa 0 (habis). */
  tokensRemaining: number | null;
  /** true bila kuota habis (tokensRemaining <= 0) dan plan punya kuota. */
  quotaExhausted: boolean;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
}

function toBillingMode(mode: string | null | undefined): PlanBillingMode {
  return mode === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'PAYG';
}

export function toPlanView(
  plan: Plan & { models?: Array<{ model: { publicName: string } }> },
): PlanView {
  return {
    name: plan.name,
    displayName: plan.displayName,
    markup: plan.markup,
    rpmLimit: plan.rpmLimit,
    monthlyTokenLimit: plan.monthlyTokenLimit,
    monthlyPriceIdr: plan.monthlyPriceIdr,
    periodDays: plan.periodDays,
    billingMode: toBillingMode(plan.billingMode),
    isActive: plan.isActive,
    models: (plan.models ?? []).map((m) => m.model.publicName),
  };
}

/**
 * Token terpakai sejak `startedAt` (awal periode kuota). Hanya hitung request
 * yang benar-benar diproses (bukan REJECTED).
 */
async function tokensUsedSince(userId: string, startedAt: Date): Promise<number> {
  const agg = await db.usageLog.aggregate({
    where: { userId, createdAt: { gte: startedAt }, status: { not: 'REJECTED' } },
    _sum: { totalTokens: true },
  });
  return agg._sum.totalTokens ?? 0;
}

/**
 * Pastikan periode kuota plan berjalan ada & belum kedaluwarsa.
 *
 * Dua kasus:
 * 1. **Plan tanpa expiry (gratis)**: kuota berjalan bergulir otomatis. Bila
 *    `planStartedAt` kosong atau sudah lewat `Plan.periodDays`, periode
 *    di-reset dari sekarang dan kuota diisi ulang dari `Plan.monthlyTokenLimit`.
 * 2. **Plan berbayar (expiry != null)**: periode dikelola `purchasePlan` /
 *    `grantPlan` — tidak boleh di-roll di sini, karena reset otomatis akan
 *    memberi kuota gratis setelah masa aktif habis.
 *
 * Mengembalikan nilai **efektif** (`planStartedAt` + `planTokenQuota`) supaya
 * pemanggil bisa langsung memakai hasilnya tanpa query ulang.
 *
 * Dipanggil sebelum gerbang kuota (preflight/playground) dan sebelum membaca
 * status plan di dashboard, sehingga user lama yang belum punya
 * `planStartedAt`/`planTokenQuota` langsung mendapat periode berjalan.
 */
export async function ensureQuotaPeriod(
  userId: string,
  now = new Date(),
): Promise<{ planStartedAt: Date | null; planTokenQuota: number | null }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      planExpiresAt: true,
      planStartedAt: true,
      planTokenQuota: true,
      plan: { select: { periodDays: true, monthlyTokenLimit: true } },
    },
  });
  if (!user) return { planStartedAt: null, planTokenQuota: null };

  // Tanpa kuota, atau plan berbayar (periode dikelola pembelian): pakai apa adanya.
  const limit = user.plan.monthlyTokenLimit;
  if (limit == null || user.planExpiresAt != null) {
    return { planStartedAt: user.planStartedAt, planTokenQuota: user.planTokenQuota };
  }

  const started = user.planStartedAt;
  const stale = started == null || now.getTime() - started.getTime() >= user.plan.periodDays * 86_400_000;
  if (!stale) return { planStartedAt: started, planTokenQuota: user.planTokenQuota };

  // Guard di DB: hanya menulis bila `planStartedAt` masih sama dengan yang dibaca,
  // supaya dua request paralel tidak saling menimpa periode.
  const updated = await db.user.updateMany({
    where: { id: userId, planStartedAt: started },
    data: { planStartedAt: now, planTokenQuota: limit },
  });
  if (updated.count === 0) {
    // Kalah balapan: baca ulang nilai yang menang.
    const fresh = await db.user.findUnique({
      where: { id: userId },
      select: { planStartedAt: true, planTokenQuota: true },
    });
    return { planStartedAt: fresh?.planStartedAt ?? started, planTokenQuota: fresh?.planTokenQuota ?? limit };
  }

  return { planStartedAt: now, planTokenQuota: limit };
}

/**
 * Status plan untuk dashboard. **Tidak** mengubah plan user (tidak ada
 * auto-downgrade) — tetapi memanggil `ensureQuotaPeriod` agar kuota plan
 * gratis yang bergulir tampil akurat.
 */
export async function getPlanStatus(userId: string, now = new Date()): Promise<PlanStatus> {
  // Kuota plan bergulir (plan tanpa expiry) di-refresh dulu supaya status akurat.
  await ensureQuotaPeriod(userId, now);

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      planId: true,
      planExpiresAt: true,
      planStartedAt: true,
      planTokenQuota: true,
      plan: { select: { name: true, billingMode: true } },
    },
  });

  const expires = user.planExpiresAt;
  const expired = Boolean(expires && expires.getTime() <= now.getTime());
  const started = user.planStartedAt;
  const quota = user.planTokenQuota;

  let used = 0;
  if (started && quota != null) {
    used = await tokensUsedSince(userId, started);
  }
  const remaining = quota == null ? null : Math.max(0, quota - used);

  return {
    planId: user.planId,
    planName: user.plan.name,
    billingMode: toBillingMode(user.plan.billingMode),
    startedAt: started?.toISOString() ?? null,
    expiresAt: expires?.toISOString() ?? null,
    daysLeft: expires ? daysBetween(now, expires) : null,
    expired,
    tokenQuota: quota,
    tokensUsed: used,
    tokensRemaining: remaining,
    quotaExhausted: remaining != null && remaining <= 0,
  };
}

export interface PurchaseResult {
  subscription: Subscription;
  balanceAfter: number;
  planExpiresAt: Date;
  planStartedAt: Date;
  planTokenQuota: number | null;
  /** true bila pembelian memperpanjang periode yang masih aktif (bukan reset). */
  stacked: boolean;
}

/**
 * Beli / upgrade / perpanjang plan memakai saldo. Semua langkah dalam satu transaksi:
 * potong saldo → tulis ledger → catat Subscription → set plan aktif + periode + kuota.
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
      select: {
        planId: true,
        planExpiresAt: true,
        planStartedAt: true,
        planTokenQuota: true,
        balance: true,
      },
    });

    const sameActivePlan =
      user.planId === plan.id &&
      user.planExpiresAt != null &&
      user.planExpiresAt.getTime() > now.getTime();

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

    // Stack bila sama-sama plan yang sama & masih aktif; selain itu reset periode.
    const startsAt = sameActivePlan && user.planStartedAt ? user.planStartedAt : now;
    const baseExpiry =
      sameActivePlan && user.planExpiresAt ? user.planExpiresAt.getTime() : now.getTime();
    const expiresAt = new Date(baseExpiry + plan.periodDays * 86_400_000);

    const addedQuota = plan.monthlyTokenLimit;
    const baseQuota = sameActivePlan ? (user.planTokenQuota ?? 0) : 0;
    const planTokenQuota =
      addedQuota == null ? null : baseQuota + addedQuota;

    const subscription = await tx.subscription.create({
      data: {
        userId,
        planId: plan.id,
        priceIdr: plan.monthlyPriceIdr,
        days: plan.periodDays,
        billingMode: plan.billingMode,
        tokenQuota: plan.monthlyTokenLimit,
        source: 'BALANCE',
        startsAt: now,
        expiresAt,
      },
    });

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        planId: plan.id,
        planStartedAt: startsAt,
        planExpiresAt: expiresAt,
        planTokenQuota,
      },
      select: { balance: true },
    });

    await tx.balanceLedger.create({
      data: {
        userId,
        deltaIdr: -plan.monthlyPriceIdr,
        balanceAfter: updated.balance,
        reason: 'PLAN',
        referenceId: subscription.id,
        note: sameActivePlan
          ? `Plan ${plan.name} diperpanjang (+${plan.periodDays} hari)`
          : `Plan ${plan.name} (${plan.periodDays} hari)`,
      },
    });

    return {
      subscription,
      balanceAfter: updated.balance,
      planExpiresAt: expiresAt,
      planStartedAt: startsAt,
      planTokenQuota,
      stacked: sameActivePlan,
    };
  });
}

export interface GrantResult {
  planExpiresAt: Date | null;
  planStartedAt: Date | null;
  planTokenQuota: number | null;
  subscription: Subscription | null;
}

/**
 * Admin memberi / mengganti / menurunkan plan TANPA memotong saldo.
 * `days = 0` atau plan gratis → plan tanpa expiry & tanpa kuota.
 *
 * `days` default mengikuti `Plan.periodDays` (diatur admin per plan).
 *
 * Ini jalur penurunan plan manual: admin menurunkan user yang sudah berhenti
 * berlangganan. Tidak ada job otomatis yang menurunkan plan.
 */
export async function grantPlan(
  userId: string,
  planName: string,
  days?: number,
  now = new Date(),
): Promise<GrantResult> {
  const plan = await db.plan.findUnique({ where: { name: planName } });
  if (!plan) throw new NotFoundError('plan_not_found', `Plan \`${planName}\` tidak ditemukan.`);
  const periodDays = days ?? plan.periodDays;

  const isFree = plan.monthlyPriceIdr <= 0 || periodDays <= 0;
  const expiresAt = isFree ? null : new Date(now.getTime() + periodDays * 86_400_000);
  const startedAt = isFree ? null : now;
  const tokenQuota = isFree ? null : plan.monthlyTokenLimit;

  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        planId: plan.id,
        planStartedAt: startedAt,
        planExpiresAt: expiresAt,
        planTokenQuota: tokenQuota,
      },
    });

    if (!expiresAt) {
      return { planExpiresAt: null, planStartedAt: null, planTokenQuota: null, subscription: null };
    }

    const subscription = await tx.subscription.create({
      data: {
        userId,
        planId: plan.id,
        priceIdr: 0,
        days: periodDays,
        billingMode: plan.billingMode,
        tokenQuota: plan.monthlyTokenLimit,
        source: 'ADMIN',
        startsAt: now,
        expiresAt,
      },
    });

    return { planExpiresAt: expiresAt, planStartedAt: startedAt, planTokenQuota: tokenQuota, subscription };
  });
}

