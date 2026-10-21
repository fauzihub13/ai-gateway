import { z } from 'zod';
import { requireUser, assertCsrf } from '@/lib/auth';
import { createQrisTopup } from '@/lib/qris-topup';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';
import { TOPUP_MAX_IDR, TOPUP_MIN_IDR, TOPUP_STEP_IDR } from '@/lib/topup';

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
    const s = await requireUser();
    assertCsrf(req);
    const { amountIdr } = Schema.parse(await req.json());

    const { transaction, qrDataUrl } = await createQrisTopup(s.sub, amountIdr);

    return json(
      {
        orderId: transaction.orderId,
        amountIdr: transaction.amountIdr,
        uniqueCode: transaction.uniqueCode,
        payAmountIdr: transaction.payAmountIdr,
        qrisPayload: transaction.qrisPayload,
        qrDataUrl,
        expiresAt: transaction.expiresAt,
        status: transaction.status,
      },
      201,
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
