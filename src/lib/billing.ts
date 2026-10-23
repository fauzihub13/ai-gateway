import { db } from './db';
import type { UsageStatus } from '@prisma/client';

/**
 * ── Model biaya ────────────────────────────────────────────────────────────
 *
 * Harga model (`Model.priceInPer1MIdr` / `priceOutPer1MIdr`) adalah **harga
 * resmi provider** (official). Angka ini TIDAK dipakai untuk menagih user
 * secara langsung; fungsinya hanya untuk menghitung **nilai pemakaian**:
 * "kalau kamu bayar langsung ke provider resmi, segini biayanya".
 *
 * Dari situ diturunkan tiga angka per request (lihat `UsageLog`):
 *
 *   valueIdr    → costIdr    = harga resmi × token            (tanpa markup)
 *   markedIdr                = valueIdr × plan.markup          (harga retail)
 *   chargedIdr               = PAYG ? markedIdr : 0            (dipotong saldo)
 *   savedIdr                 = markedIdr − chargedIdr          (hemat user)
 *
 * Jadi:
 * - **PAYG**       → ditagih = retail, hemat = 0.
 * - **SUBSCRIPTION** → ditagih = 0 (sudah dibayar di muka lewat harga plan),
 *                      hemat = seluruh harga retail pemakaian.
 *
 * Kuota token (untuk plan berkuota) dihitung terpisah di `proxy.ts` dari
 * `UsageLog.totalTokens`, bukan dari angka rupiah.
 */

export interface CostModel {
  priceInPer1MIdr: number;
  priceOutPer1MIdr: number;
  priceCachedInPer1MIdr?: number | null;
}

export interface CostTokens {
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens?: number;
}

export interface CostBreakdown {
  /** Nilai pemakaian dengan harga resmi provider (tanpa markup). */
  valueIdr: number;
  /** Harga retail = nilai × markup plan. */
  markedIdr: number;
  /** Yang benar-benar ditagih ke saldo user (0 untuk SUBSCRIPTION). */
  chargedIdr: number;
  /** Hemat = marked − charged. */
  savedIdr: number;
}

/**
 * Hitung biaya resmi mentah (belum dibulatkan).
 *
 * Token cached dihargai `priceCachedInPer1MIdr` bila di-set; kalau null
 * fallback ke harga input normal — jadi model lama tidak berubah perilakunya.
 */
function rawOfficialCost(model: CostModel, t: CostTokens): number {
  const prompt = Math.max(t.promptTokens, 0);
  const completion = Math.max(t.completionTokens, 0);
  const cached = Math.min(Math.max(t.cachedPromptTokens ?? 0, 0), prompt);
  const nonCached = prompt - cached;
  const cachedPrice = model.priceCachedInPer1MIdr ?? model.priceInPer1MIdr;

  const inCost = (nonCached / 1_000_000) * model.priceInPer1MIdr;
  const cachedCost = (cached / 1_000_000) * cachedPrice;
  const outCost = (completion / 1_000_000) * model.priceOutPer1MIdr;
  return inCost + cachedCost + outCost;
}

/**
 * Nilai pemakaian murni: harga resmi provider, **tanpa** markup plan.
 * Dipakai untuk kolom `UsageLog.costIdr` dan tampilan "nilai pemakaian".
 */
export function computeUsageValue(model: CostModel, t: CostTokens): number {
  return Math.ceil(rawOfficialCost(model, t));
}

/**
 * Satu-satunya sumber perhitungan biaya per request. Mengembalikan tiga angka
 * yang langsung bisa dipakai untuk `settleUsage` dan dashboard.
 *
 * `plan.billingMode` menentukan apakah saldo dipotong; `plan.markup` hanya
 * memengaruhi harga retail (dan karenanya besaran "hemat" untuk SUBSCRIPTION).
 */
export function computeCostBreakdown(opts: {
  model: CostModel;
  plan: { markup: number; billingMode: string };
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens?: number;
}): CostBreakdown {
  const tokens: CostTokens = {
    promptTokens: opts.promptTokens,
    completionTokens: opts.completionTokens,
    cachedPromptTokens: opts.cachedPromptTokens,
  };

  const valueIdr = computeUsageValue(opts.model, tokens);
  // Retail dibulatkan terpisah supaya konsisten dengan yang ditagih.
  const markedIdr = Math.ceil(rawOfficialCost(opts.model, tokens) * opts.plan.markup);
  const chargedIdr = opts.plan.billingMode === 'SUBSCRIPTION' ? 0 : markedIdr;
  const savedIdr = Math.max(0, markedIdr - chargedIdr);

  return { valueIdr, markedIdr, chargedIdr, savedIdr };
}

/**
 * Model dianggap gratis untuk plan tertentu bila harga efektif (harga resmi ×
 * markup plan) nol untuk input maupun output. Dipakai agar user PAYG bersaldo 0
 * tetap boleh memakai model gratis.
 */
export function isFreeModel(
  model: { priceInPer1MIdr: number; priceOutPer1MIdr: number },
  plan: { markup: number },
): boolean {
  return model.priceInPer1MIdr * plan.markup <= 0 && model.priceOutPer1MIdr * plan.markup <= 0;
}

export interface SettleInput {
  requestId: string;
  userId: string;
  apiKeyId?: string | null;
  modelId: string;
  endpoint: string;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens?: number;
  /** Nilai pemakaian (harga resmi tanpa markup). */
  costIdr: number;
  /** Yang benar-benar ditagih ke saldo (0 untuk SUBSCRIPTION). Default = costIdr. */
  chargedIdr?: number;
  /** Hemat = retail − charged. Default 0. */
  savedIdr?: number;
  status: UsageStatus;
  streamed?: boolean;
  latencyMs?: number;
  upstreamLatencyMs?: number;
  errorCode?: string;
}

export interface SettleResult {
  duplicated: boolean;
  usageId?: string;
}

export async function settleUsage(input: SettleInput): Promise<SettleResult> {
  const charged = Math.max(0, input.chargedIdr ?? input.costIdr);
  const saved = Math.max(0, input.savedIdr ?? 0);

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.usageLog.findUnique({ where: { requestId: input.requestId } });
    if (existing) return { duplicated: true, usageId: existing.id } as SettleResult;

    const usage = await tx.usageLog.create({
      data: {
        requestId: input.requestId,
        userId: input.userId,
        apiKeyId: input.apiKeyId ?? null,
        modelId: input.modelId,
        endpoint: input.endpoint,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        cachedPromptTokens: input.cachedPromptTokens ?? 0,
        totalTokens: input.promptTokens + input.completionTokens,
        costIdr: input.costIdr,
        chargedIdr: charged,
        savedIdr: saved,
        status: input.status,
        streamed: input.streamed ?? false,
        latencyMs: input.latencyMs,
        upstreamLatencyMs: input.upstreamLatencyMs,
        errorCode: input.errorCode,
      },
    });

    if (charged > 0) {
      // Kebijakan: request yang sudah dikerjakan TIDAK dipotong di tengah karena
      // limit. Saldo boleh minus (overdraft) agar task in-flight selesai; request
      // berikutnya diblokir oleh preflight.assertBalance (balance <= 0 → 402).
      await tx.$executeRaw`
        UPDATE "User"
        SET balance = balance - ${charged}, "updatedAt" = now()
        WHERE id = ${input.userId}
      `;

      const u = await tx.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { balance: true },
      });
      await tx.balanceLedger.create({
        data: {
          userId: input.userId,
          deltaIdr: -charged,
          balanceAfter: u.balance,
          reason: 'USAGE',
          referenceId: usage.id,
        },
      });
    }

    return { duplicated: false, usageId: usage.id } as SettleResult;
  });

  return result;
}

export async function getBalance(userId: string): Promise<number> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } });
  return u.balance;
}
