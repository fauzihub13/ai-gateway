import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatIdr(v: number): string {
  return `Rp${v.toLocaleString('id-ID')}`;
}

export function formatNumber(v: number): string {
  return v.toLocaleString('id-ID');
}

const COMPACT_DECIMALS = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Ringkas angka besar agar tidak overflow di card:
 * 1.234.567 → `1,23M`, 1.234.567.890 → `1,23B`.
 * Di bawah 1 juta tetap pakai pemisah ribuan biasa.
 */
export function formatCompactNumber(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  // 999.995 sudah dibulatkan jadi 1.000,00 → naikkan ke satuan berikutnya
  // supaya tidak muncul "1.000,00M".
  if (abs >= 999_995_000) return `${sign}${COMPACT_DECIMALS.format(abs / 1_000_000_000)}B`;
  if (abs >= 999_995) return `${sign}${COMPACT_DECIMALS.format(abs / 1_000_000)}M`;
  return formatNumber(v);
}

/** Versi rupiah dari formatCompactNumber: 1.234.567 → `Rp1,23M`. */
export function formatCompactIdr(v: number): string {
  return `Rp${formatCompactNumber(v)}`;
}