import { z } from 'zod';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/verification-token';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

const Schema = z.object({ token: z.string().min(10) });

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { token } = Schema.parse(await req.json());
    const record = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });

    if (!record || record.type !== 'EMAIL_VERIFY' || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestError('invalid_token', 'Verification link is invalid or expired.');
    }

    await db.$transaction([
      db.user.update({
        where: { id: record.userId },
        data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
      }),
      db.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    return json({ ok: true }, 200, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}