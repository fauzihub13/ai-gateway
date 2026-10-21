import { z } from 'zod';
import { db } from '@/lib/db';
import { applyStatus } from '@/lib/webhook';
import { requireAdmin, assertCsrf } from '@/lib/auth';
import { toErrorResponse, BadRequestError, NotFoundError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';

export const runtime = 'nodejs';

// Verifikasi manual dana QRIS. Admin cek mutasi rekening, lalu approve/reject.
const Schema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().max(200).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);
    const { action, note } = Schema.parse(await req.json().catch(() => ({ action: 'approve' })));

    const trx = await db.transaction.findUnique({ where: { id: params.id } });
    if (!trx) throw new NotFoundError('transaction_not_found', 'Transaction not found.');
    if (trx.provider !== 'QRIS_MANUAL') {
      throw new BadRequestError('not_manual_qris', 'Transaction is not a manual QRIS top-up.');
    }
    if (trx.status === 'PAID' || trx.status === 'REFUNDED') {
      return json({ ok: true, status: trx.status, alreadyFinal: true }, 200, { 'x-request-id': requestId });
    }

    // Nominal transaksi kedaluwarsa sudah dilepas dan bisa dipakai transaksi lain.
    // Jangan pernah approve di sini — dana yang masuk harus dicek manual (refund/adj).
    if (trx.expiresAt && trx.expiresAt.getTime() < Date.now()) {
      if (trx.status === 'PENDING') {
        await db.transaction.update({ where: { id: trx.id }, data: { status: 'EXPIRED', payAmountKey: null } });
      }
      throw new BadRequestError(
        'transaction_expired',
        'Transaksi sudah kedaluwarsa. Buat transaksi baru atau sesuaikan saldo manual.',
      );
    }

    // applyStatus mengkredit saldo sebesar amountIdr (bukan payAmountIdr — kode unik
    // hanya untuk pencocokan mutasi, bukan saldo user).
    await applyStatus(trx.orderId, action === 'approve' ? 'PAID' : 'FAILED', {
      paymentType: 'QRIS_MANUAL',
      raw: { source: 'admin_verify', action, note, adminId: admin.sub },
    });

    await db.adminAuditLog.create({
      data: {
        adminId: admin.sub,
        action: action === 'approve' ? 'transaction.qris.approve' : 'transaction.qris.reject',
        targetType: 'Transaction',
        targetId: trx.id,
        metadata: { orderId: trx.orderId, amountIdr: trx.amountIdr, payAmountIdr: trx.payAmountIdr, note },
        ip: getClientIp(req),
      },
    });

    return json(
      { ok: true, status: action === 'approve' ? 'PAID' : 'FAILED' },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(
        new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.'),
        requestId,
      );
    }
    return toErrorResponse(err, requestId);
  }
}
