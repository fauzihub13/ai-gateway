import { createHash } from 'node:crypto';
import { db } from './db';
import { mapMidtransStatus, type MappedStatus } from './midtrans';
import type { TrxnStatus, Prisma } from '@prisma/client';

interface Notification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  transaction_status: string;
  fraud_status?: string;
  transaction_id?: string;
  payment_type?: string;
  signature_key: string;
}

export function verifySignature(p: Notification): boolean {
  const raw = `${p.order_id}${p.status_code}${p.gross_amount}${process.env.MIDTRANS_SERVER_KEY ?? ''}`;
  const expected = createHash('sha512').update(raw).digest('hex');
  return expected === p.signature_key;
}

export function redactPayload(body: Record<string, unknown>): Prisma.InputJsonValue {
  const clone: Record<string, unknown> = { ...body };
  delete clone.signature_key;
  return clone as Prisma.InputJsonValue;
}

export async function applyStatus(
  orderId: string,
  newStatus: MappedStatus,
  meta: { transactionId?: string; paymentType?: string; raw: Record<string, unknown> },
): Promise<void> {
  const trx = await db.transaction.findUnique({ where: { orderId } });
  if (!trx) return;

  if (trx.status === 'PAID' || trx.status === 'REFUNDED') return;

  await db.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { orderId },
      data: {
        status: newStatus as TrxnStatus,
        // Transaksi sudah final → lepas kunci nominal bayar QRIS.
        payAmountKey: null,
        midtransTxnId: meta.transactionId ?? null,
        method: meta.paymentType ?? null,
        rawPayload: redactPayload(meta.raw),
        paidAt: newStatus === 'PAID' ? new Date() : null,
      },
    });

    if (newStatus === 'PAID') {
      const u = await tx.user.update({
        where: { id: trx.userId },
        data: { balance: { increment: trx.amountIdr } },
        select: { balance: true },
      });
      await tx.balanceLedger.create({
        data: {
          userId: trx.userId,
          deltaIdr: trx.amountIdr,
          balanceAfter: u.balance,
          reason: 'TOPUP',
          referenceId: trx.id,
        },
      });
    }
  });
}