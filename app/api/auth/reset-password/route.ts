import { z } from 'zod';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/verification-token';
import { hashPassword } from '@/lib/password';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

const Schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const body = Schema.parse(await req.json());
    const record = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(body.token) } });

    if (!record || record.type !== 'PASSWORD_RESET' || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestError('invalid_token', 'Reset link is invalid or expired.');
    }

    await db.$transaction([
      db.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(body.password), sessionVersion: { increment: 1 } },
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