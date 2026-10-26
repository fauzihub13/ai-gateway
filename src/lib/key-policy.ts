/**
 * Batas maksimum API key aktif per user, berlaku untuk semua plan.
 *
 * "Aktif" = status selain REVOKED. Key yang sudah revoke tidak dihitung,
 * jadi user tetap bisa membuat key baru setelah revoke.
 *
 * Dipakai di:
 * - `app/api/keys/route.ts` (user membuat key sendiri)
 * - `app/api/admin/keys/route.ts` (admin membuat key untuk user)
 * - `app/dashboard/keys/page.tsx` (info & disable tombol saat limit tercapai)
 */
export const MAX_ACTIVE_KEYS_PER_USER = 10;
