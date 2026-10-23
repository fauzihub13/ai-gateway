/**
 * Helper murni (tanpa import DB / server-only) untuk kartu share usage.
 * Dipakai bersama oleh route API (`src/lib/share-card.ts`) dan komponen
 * client (`src/components/usage-share-card.tsx`), jadi file ini WAJIB
 * tetap bebas side-effect & import node.
 */

export type ShareRange = '7' | '30' | '90' | 'all';

/** Nilai tak dikenal → '30'. Hanya menerima 7 | 30 | 90 | all. */
export function parseShareRange(raw: string | null): ShareRange {
  return raw === '7' || raw === '90' || raw === 'all' ? raw : '30';
}

export function rangeDays(range: ShareRange): number | null {
  return range === 'all' ? null : Number(range);
}

export const RANGE_OPTIONS: Array<{ value: ShareRange; label: string }> = [
  { value: '7', label: '7 hari' },
  { value: '30', label: '30 hari' },
  { value: '90', label: '90 hari' },
  { value: 'all', label: 'Semua waktu' },
];

export function rangeLabel(range: ShareRange): string {
  return RANGE_OPTIONS.find((r) => r.value === range)?.label ?? '30 hari';
}

/**
 * Persentase cache hit = token prompt yang kena cache / total token prompt.
 * `null` bila tidak ada token prompt (belum ada pemakaian) — bukan 0%, agar
 * kartu menampilkan "—" dan bukan klaim palsu.
 * Dibulatkan 1 desimal (mis. 37,4).
 */
export function computeCacheHitPct(cachedPromptTokens: number, promptTokens: number): number | null {
  if (!Number.isFinite(cachedPromptTokens) || !Number.isFinite(promptTokens) || promptTokens <= 0) {
    return null;
  }
  return Math.round((cachedPromptTokens / promptTokens) * 1000) / 10;
}

/** Format angka ringkas gaya id-ID: 12.345 → "12,3 rb", 12.345.678 → "12,3 jt". */
export function compactId(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const abs = Math.abs(v);
  if (abs < 1_000) return String(Math.round(v));
  const f = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
  // Intl memakai narrow no-break space (U+202F) sebelum satuan — normalisasi
  // ke spasi biasa supaya aman di canvas, clipboard, dan string literal test.
  return f.format(v).replace(/[\u202F\u00A0]/g, ' ');
}

/** Format angka penuh gaya id-ID: 1234567 → "1.234.567". */
export function fullId(v: number): string {
  return Math.round(v).toLocaleString('id-ID');
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function fullDate(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Label periode untuk kartu, mis. "1 Okt – 23 Okt 2026" / "s.d. 23 Okt 2026". */
export function periodLabel(from: Date | null, to: Date): string {
  if (!from) return `s.d. ${fullDate(to)}`;
  const sameYear = from.getFullYear() === to.getFullYear();
  const left = sameYear ? shortDate(from) : fullDate(from);
  return `${left} – ${fullDate(to)}`;
}
