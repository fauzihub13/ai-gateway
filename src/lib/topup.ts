/**
 * Batas nominal top-up. Dipakai server (validasi Zod) dan client (UI).
 * Pakai prefix NEXT_PUBLIC_ supaya nilai yang sama terbaca di kedua sisi.
 */
function positive(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const TOPUP_MIN_IDR = positive(process.env.NEXT_PUBLIC_TOPUP_MIN_IDR, 10_000);
export const TOPUP_MAX_IDR = positive(process.env.NEXT_PUBLIC_TOPUP_MAX_IDR, 50_000_000);
export const TOPUP_STEP_IDR = positive(process.env.NEXT_PUBLIC_TOPUP_STEP_IDR, 1_000);

/** Top-up otomatis via Midtrans. Default mati — cukup QRIS manual. */
export const MIDTRANS_ENABLED = process.env.NEXT_PUBLIC_MIDTRANS_ENABLED === 'true';
