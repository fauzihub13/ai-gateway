import { db } from '@/lib/db';
import { verifySignature, applyStatus } from '@/lib/webhook';
import { mapMidtransStatus } from '@/lib/midtrans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response('invalid body', { status: 400 });
  }

  const notification = body as unknown as Parameters<typeof verifySignature>[0];

  if (!verifySignature(notification)) {
    return new Response('invalid signature', { status: 401 });
  }

  const trx = await db.transaction.findUnique({ where: { orderId: notification.order_id } });
  if (!trx) return new Response('unknown order', { status: 404 });

  const expectedAmount = Math.round(parseFloat(notification.gross_amount));
  if (expectedAmount !== trx.amountIdr) {
    return new Response('amount mismatch', { status: 400 });
  }

  const newStatus = mapMidtransStatus(notification.transaction_status, notification.fraud_status);

  await applyStatus(notification.order_id, newStatus, {
    transactionId: notification.transaction_id,
    paymentType: notification.payment_type,
    raw: body,
  });

  return new Response('ok', { status: 200 });
}