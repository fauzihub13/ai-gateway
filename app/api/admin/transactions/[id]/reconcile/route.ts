import { db } from '@/lib/db';
import { applyStatus } from '@/lib/webhook';
import { mapMidtransStatus } from '@/lib/midtrans';
import { snap } from '@/lib/midtrans';
import { requireAdmin, assertCsrf } from '@/lib/auth';
import { toErrorResponse, NotFoundError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);

    const trx = await db.transaction.findUnique({ where: { id: params.id } });
    if (!trx) throw new NotFoundError('transaction_not_found', 'Transaction not found.');

    const status = await snap.transaction.status(trx.orderId);
    const newStatus = mapMidtransStatus(status.transaction_status, status.fraud_status);

    await applyStatus(trx.orderId, newStatus, {
      transactionId: status.order_id,
      raw: { source: 'admin_reconcile', transaction_status: status.transaction_status },
    });

    await db.adminAuditLog.create({
      data: {
        adminId: admin.sub,
        action: 'transaction.reconcile',
        targetType: 'Transaction',
        targetId: trx.id,
        metadata: { orderId: trx.orderId, newStatus },
        ip: getClientIp(req),
      },
    });

    return json({ ok: true, status: newStatus }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}