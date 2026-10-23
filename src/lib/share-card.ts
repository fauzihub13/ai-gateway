import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { computeCacheHitPct } from './share-card-format';

/**
 * Agregasi data untuk "Usage Wrapped" share card (server-side).
 * Semua metrik dihitung di Postgres supaya traffic tinggi tidak ditarik ke Node.
 * Konsisten dengan `summarizeUsage` (usage-query.ts): REJECTED dikecualikan.
 */

export interface ShareCardData {
  /** Jumlah hari rentang; null = semua waktu sejak awal. */
  days: number | null;
  from: string | null;
  to: string;
  /** Semua request kecuali REJECTED (seiring definisi usage di tempat lain). */
  requests: number;
  /** Total token gabungan in+out (kolom totalTokens UsageLog). */
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  /**
   * % prompt token yang dilayani dari cache upstream (cached / prompt — cache
   * hanya menghemat bagian input). null bila belum ada token prompt sama sekali.
   */
  cachedHitPct: number | null;
  /** Jumlah model berbeda yang benar-benar dipakai dalam rentang ini. */
  distinctModels: number;
  /** Top 3 model berdasarkan jumlah request (terurut desc). Bisa kosong. */
  topModels: Array<{ name: string; requests: number; pct: number }>;
  /** Nilai pemakaian terhadap harga resmi provider (tanpa markup) — bukan tagihan. */
  valueIdr: number;
  /** Yang benar-benar dipotong dari saldo (0 untuk SUBSCRIPTION). */
  chargedIdr: number;
}

export interface ShareCardOpts {
  /** Batas bawah rentang; null = sejak awal (semua waktu). */
  from: Date | null;
  to: Date;
  /** Label jumlah hari untuk kartu; null = semua waktu. */
  days: number | null;
}

export async function buildShareCardData(
  userId: string,
  opts: ShareCardOpts,
): Promise<ShareCardData> {
  const where: Prisma.UsageLogWhereInput = {
    userId,
    createdAt: { ...(opts.from ? { gte: opts.from } : {}), lte: opts.to },
    status: { not: 'REJECTED' },
  };

  // Dua query paralel: aggregate total + groupBy per model. GroupBy lengkap
  // (tanpa take) memberi dua hal sekaligus: baris terurut count desc (top
  // model = baris pertama) dan panjang array = jumlah model berbeda.
  const [totals, byModel] = await Promise.all([
    db.usageLog.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        cachedPromptTokens: true,
        totalTokens: true,
        costIdr: true,
        chargedIdr: true,
      },
    }),
    db.usageLog.groupBy({
      by: ['modelId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { modelId: 'desc' } },
    }),
  ]);

  const requests = totals._count._all;
  const promptTokens = totals._sum.promptTokens ?? 0;
  const completionTokens = totals._sum.completionTokens ?? 0;
  const totalTokens = totals._sum.totalTokens ?? promptTokens + completionTokens;

  // Nama untuk top 3 model — satu findMany, diurut sesuai urutan count desc.
  const topIds = byModel.slice(0, 3).map((r) => r.modelId);
  const topNames = topIds.length
    ? await db.model.findMany({ where: { id: { in: topIds } }, select: { id: true, publicName: true } })
    : [];
  const nameOf = Object.fromEntries(topNames.map((m) => [m.id, m.publicName]));
  const topModels = byModel.slice(0, 3).map((r) => ({
    name: nameOf[r.modelId] ?? r.modelId,
    requests: r._count?._all ?? 0,
    pct: requests > 0 && r._count ? round1((r._count._all / requests) * 100) : 0,
  }));

  return {
    days: opts.days,
    from: opts.from ? opts.from.toISOString() : null,
    to: opts.to.toISOString(),
    requests,
    totalTokens,
    promptTokens,
    completionTokens,
    cachedPromptTokens: totals._sum.cachedPromptTokens ?? 0,
    cachedHitPct: computeCacheHitPct(totals._sum.cachedPromptTokens ?? 0, promptTokens),
    distinctModels: byModel.length,
    topModels,
    valueIdr: totals._sum.costIdr ?? 0,
    chargedIdr: totals._sum.chargedIdr ?? 0,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
