import QRCode from 'qrcode';
import { nanoid } from 'nanoid';
import type { Transaction } from '@prisma/client';
import { db } from './db';
import { AppError, InternalError } from './errors';
import { toDynamicQris, validateQris } from './qris';

/**
 * Top-up manual: QRIS statis milik merchant diubah jadi dinamis dengan nominal
 * `amountIdr + uniqueCode`. Admin memverifikasi sendiri setelah dana masuk.
 * Kode unik membuat tiap transaksi punya nominal bayar berbeda → mudah dicocokkan.
 */

export const QRIS_UNIQUE_CODE_MAX = 200;
export const QRIS_UNIQUE_CODE_MIN = 1;
// Kode diambil berurutan dari yang kosong (bukan acak) karena rentangnya cuma 200.
// Retry hanya untuk balapan dua request yang mengambil kode sama.
const MAX_ALLOCATE_ATTEMPTS = 5;

function qrisStaticPayload(): string {
  const payload = process.env.QRIS_STATIC_PAYLOAD?.trim();
  if (!payload) throw new InternalError('Top-up QRIS belum dikonfigurasi. Hubungi admin.');
  const check = validateQris(payload);
  if (!check.valid) throw new InternalError(`QRIS statis tidak valid: ${check.error}`);
  return payload;
}

export function qrisExpiryHours(): number {
  const n = Number(process.env.QRIS_EXPIRY_HOURS ?? 24);
  return Number.isFinite(n) && n > 0 ? n : 24;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/** Tandai transaksi QRIS pending yang lewat masa berlaku, supaya nominalnya bisa dipakai lagi. */
export async function expireStaleQris(now = new Date()): Promise<number> {
  const res = await db.transaction.updateMany({
    where: { provider: 'QRIS_MANUAL', status: 'PENDING', expiresAt: { lt: now } },
    // Lepas kunci nominal supaya kode unik itu bisa dipakai transaksi baru.
    data: { status: 'EXPIRED', payAmountKey: null },
  });
  return res.count;
}

export interface CreatedQrisTopup {
  transaction: Transaction;
  qrDataUrl: string;
}

/**
 * Kode unik yang masih bebas untuk nominal tertentu.
 * Rentangnya cuma 200 nilai, jadi acak-buta sering tabrakan; lebih murah ambil
 * sisa yang kosong lalu pilih acak dari situ.
 */
async function freeUniqueCodes(amountIdr: number): Promise<number[]> {
  const taken = await db.transaction.findMany({
    where: {
      provider: 'QRIS_MANUAL',
      status: 'PENDING',
      amountIdr,
      uniqueCode: { not: 0 },
    },
    select: { uniqueCode: true },
  });
  const used = new Set(taken.map((t) => t.uniqueCode));
  return Array.from(
    { length: QRIS_UNIQUE_CODE_MAX - QRIS_UNIQUE_CODE_MIN + 1 },
    (_, i) => QRIS_UNIQUE_CODE_MIN + i,
  ).filter((c) => !used.has(c));
}

export async function createQrisTopup(userId: string, amountIdr: number): Promise<CreatedQrisTopup> {
  const staticPayload = qrisStaticPayload();
  await expireStaleQris();

  const expiresAt = new Date(Date.now() + qrisExpiryHours() * 3600_000);

  for (let attempt = 0; attempt < MAX_ALLOCATE_ATTEMPTS; attempt++) {
    const free = await freeUniqueCodes(amountIdr);
    if (free.length === 0) break;

    const uniqueCode = free[Math.floor(Math.random() * free.length)];
    const payAmountIdr = amountIdr + uniqueCode;
    const qrisPayload = toDynamicQris(staticPayload, payAmountIdr);

    try {
      // payAmountKey unik menjamin dua transaksi pending tidak pernah punya nominal
      // bayar sama. Nilainya di-NULL-kan saat transaksi final, jadi bisa dipakai lagi.
      const transaction = await db.transaction.create({
        data: {
          orderId: `QR-${nanoid(16)}`,
          userId,
          amountIdr,
          payAmountIdr,
          payAmountKey: `qris:${payAmountIdr}`,
          uniqueCode,
          provider: 'QRIS_MANUAL',
          qrisPayload,
          status: 'PENDING',
          expiresAt,
        },
      });
      const qrDataUrl = await QRCode.toDataURL(qrisPayload, { width: 512, margin: 1 });
      return { transaction, qrDataUrl };
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }

  throw new AppError(
    'qris_code_exhausted',
    409,
    'invalid_request_error',
    'Semua kode unik untuk nominal ini sedang dipakai transaksi lain. Selesaikan atau tunggu kedaluwarsa.',
    null,
    true,
  );
}
