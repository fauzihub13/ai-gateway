import { db } from './db';
import type { UsageStatus } from '@prisma/client';

export function computeCost(opts: {
  model: { priceInPer1kIdr: number; priceOutPer1kIdr: number };
  plan: { markup: number };
  promptTokens: number;
  completionTokens: number;
}): number {
  const { model, plan, promptTokens, completionTokens } = opts;
  const inCost = (promptTokens / 1000) * model.priceInPer1kIdr;
  const outCost = (completionTokens / 1000) * model.priceOutPer1kIdr;
  const raw = (inCost + outCost) * plan.markup;
  return Math.ceil(raw);
}

/**
 * Model dianggap gratis untuk plan tertentu bila harga efektif (harga model × markup plan)
 * nol untuk input maupun output. Dipakai agar user bersaldo 0 tetap boleh memakai model gratis.
 */
export function isFreeModel(
  model: { priceInPer1kIdr: number; priceOutPer1kIdr: number },
  plan: { markup: number },
): boolean {
  return model.priceInPer1kIdr * plan.markup <= 0 && model.priceOutPer1kIdr * plan.markup <= 0;
}

export interface SettleInput {
  requestId: string;
  userId: string;
  apiKeyId?: string | null;
  modelId: string;
  endpoint: string;
  promptTokens: number;
  completionTokens: number;
  costIdr: number;
  status: UsageStatus;
  streamed?: boolean;
  latencyMs?: number;
  upstreamLatencyMs?: number;
  errorCode?: string;
}

export interface SettleResult {
  duplicated: boolean;
  insufficient?: boolean;
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
      const updated = await tx.$executeRaw`
        UPDATE "User"
        SET balance = balance - ${input.costIdr}, "updatedAt" = now()
        WHERE id = ${input.userId} AND balance >= ${input.costIdr}
      `;
      if (updated === 0) {
        await tx.usageLog.update({
          where: { id: usage.id },
          data: { costIdr: 0, status: 'ERROR', errorCode: 'insufficient_balance_at_settle' },
        });
        return { duplicated: false, insufficient: true, usageId: usage.id } as SettleResult;
      }

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