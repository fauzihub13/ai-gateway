import { db } from './db';
import { InternalError } from './errors';
import type { Plan } from '@prisma/client';

/**
 * Plan yang diberikan ke user baru saat register.
 * Bisa dioverride lewat env `SIGNUP_PLAN` (default `free`).
 *
 * Urutan resolusi:
 *   1. plan bernama SIGNUP_PLAN yang aktif
 *   2. plan aktif termurah (fallback bila plan tersebut dihapus/dinonaktifkan)
 *   3. plan apa pun yang ada
 * Tujuannya agar pendaftaran tidak pernah gagal hanya karena plan default
 * tidak ditemukan.
 */
const SIGNUP_PLAN = process.env.SIGNUP_PLAN?.trim() || 'free';

export async function getDefaultSignupPlan(): Promise<Plan> {
  const preferred = await db.plan.findFirst({
    where: { name: SIGNUP_PLAN, isActive: true },
  });
  if (preferred) return preferred;

  const cheapest = await db.plan.findFirst({
    where: { isActive: true },
    orderBy: { monthlyPriceIdr: 'asc' },
  });
  if (cheapest) return cheapest;

  const anyPlan = await db.plan.findFirst();
  if (anyPlan) return anyPlan;

  throw new InternalError(
    `Tidak ada plan yang tersedia untuk pendaftaran (dicari: "${SIGNUP_PLAN}"). Jalankan seeder atau buat plan lebih dulu.`,
  );
}