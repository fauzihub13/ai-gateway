import { db } from './db';
import type { UsageStatus } from '@prisma/client';

export function computeCost(opts: {
  model: { priceInPer1MIdr: number; priceOutPer1MIdr: number; priceCachedInPer1MIdr?: number | null };
  plan: { markup: number };
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens?: number;
}): number {
  const { model, plan, promptTokens, completionTokens } = opts;

  // Token cached dihargai priceCachedInPer1MIdr bila di-set, kalau tidak (null/undefined)
  // fallback ke harga input normal — jadi model lama tidak berubah biayanya.
  const cached = Math.min(Math.max(opts.cachedPromptTokens ?? 0, 0), Math.max(promptTokens, 0));
  const nonCached = Math.max(promptTokens - cached, 0);
  const cachedInPrice = model.priceCachedInPer1MIdr ?? model.priceInPer1MIdr;

  const inCost = (nonCached / 1_000_000) * model.priceInPer1MIdr + (cached / 1_000_000) * cachedInPrice;
  const outCost = (completionTokens / 1_000_000) * model.priceOutPer1MIdr;
  const raw = (inCost + outCost) * plan.markup;
  return Math.ceil(raw);
}

/**
 * Model dianggap gratis untuk plan tertentu bila harga efektif (harga model × markup plan)
 * nol untuk input maupun output. Dipakai agar user bersaldo 0 tetap boleh memakai model gratis.
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
  costIdr: number;
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
        status: input.status,
        streamed: input.streamed ?? false,
        latencyMs: input.latencyMs,
        upstreamLatencyMs: input.upstreamLatencyMs,
        errorCode: input.errorCode,
      },
    });

    if (input.costIdr > 0) {
      // Kebijakan: stream/permintaan yang sudah dikerjakan TIDAK dipotong di tengah karena limit.
      // Saldo boleh minus (overdraft) agar task in-flight selesai; request berikutnya diblokir
      // oleh preflight.assertBalance (balance <= 0 → 402). Bukan kehilangan pendapatan.
      await tx.$executeRaw`
        UPDATE "User"
        SET balance = balance - ${input.costIdr}, "updatedAt" = now()
        WHERE id = ${input.userId}
      `;

      const u = await tx.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { balance: true },
      });
      await tx.balanceLedger.create({
        data: {
          userId: input.userId,
          deltaIdr: -input.costIdr,
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