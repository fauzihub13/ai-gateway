import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { toErrorResponse, BadRequestError, NotFoundError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

/** Ambil ulang QR + detail transaksi QRIS yang masih PENDING. */
export async function GET(req: Request, { params }: { params: { orderId: string } }) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();

    const trx = await db.transaction.findUnique({ where: { orderId: params.orderId } });
    if (!trx || trx.userId !== s.sub || trx.provider !== 'QRIS_MANUAL' || !trx.qrisPayload) {
      throw new NotFoundError('transaction_not_found', 'Transaction not found.');
    }

    if (trx.status !== 'PENDING') {
      throw new BadRequestError('transaction_not_pending', `Transaksi sudah ${trx.status}.`);
    }

    if (trx.expiresAt && trx.expiresAt.getTime() < Date.now()) {
      await db.transaction.updateMany({
        where: { id: trx.id, status: 'PENDING' },
        data: { status: 'EXPIRED', payAmountKey: null },
      });
      throw new BadRequestError('transaction_expired', 'Transaksi sudah kedaluwarsa. Buat transaksi baru.');
    }

    const qrDataUrl = await QRCode.toDataURL(trx.qrisPayload, { width: 512, margin: 1 });

    return json(
      {
        orderId: trx.orderId,
        amountIdr: trx.amountIdr,
        uniqueCode: trx.uniqueCode,
        payAmountIdr: trx.payAmountIdr,
        qrDataUrl,
        expiresAt: trx.expiresAt,
        status: trx.status,
      },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
