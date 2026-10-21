import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { requireUser, assertCsrf } from '@/lib/auth';
import { snap } from '@/lib/midtrans';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';
import { MIDTRANS_ENABLED, TOPUP_MAX_IDR, TOPUP_MIN_IDR, TOPUP_STEP_IDR } from '@/lib/topup';

export const runtime = 'nodejs';

const Schema = z.object({
  amountIdr: z
    .number()
    .int()
    .min(TOPUP_MIN_IDR)
    .max(TOPUP_MAX_IDR)
    .refine((v) => v % TOPUP_STEP_IDR === 0, `amount must be a multiple of ${TOPUP_STEP_IDR}`),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    if (!MIDTRANS_ENABLED) {
      throw new BadRequestError('midtrans_disabled', 'Top-up otomatis belum tersedia. Gunakan QRIS.');
    }

    const s = await requireUser();
    assertCsrf(req);
    const { amountIdr } = Schema.parse(await req.json());

    const orderId = `TRX-${nanoid(16)}`;
    const user = await db.user.findUniqueOrThrow({ where: { id: s.sub } });

    await db.transaction.create({ data: { orderId, userId: user.id, amountIdr, status: 'PENDING' } });

    const snapTrx = await snap.createTransaction({
      transaction_details: { order_id: orderId, gross_amount: amountIdr },
      customer_details: { first_name: user.name ?? 'User', email: user.email },
      callbacks: { finish: `${process.env.APP_BASE_URL}/dashboard/billing?order=${orderId}` },
      expiry: { unit: 'hours', duration: 24 },
    });

    await db.transaction.update({
      where: { orderId },
      data: { snapToken: snapTrx.token, redirectUrl: snapTrx.redirect_url },
    });

    return json({ redirectUrl: snapTrx.redirect_url, orderId }, 200, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}