import { z } from 'zod';
import { db } from '@/lib/db';
import { generateVerificationToken } from '@/lib/verification-token';
import { sendResetEmail } from '@/lib/email';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId } from '@/lib/http';
import { checkLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const Schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { email } = Schema.parse(await req.json());
    const lower = email.toLowerCase();
    const rl = checkLimit(`forgot:${lower}`, 3, 15 * 60_000);
    if (!rl.success) throw new BadRequestError('rate_limit_exceeded', 'Too many attempts.');

    const user = await db.user.findUnique({ where: { email: lower } });
    if (user) {
      const { raw, hash } = generateVerificationToken();
      await db.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hash,
          type: 'PASSWORD_RESET',
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      await sendResetEmail(lower, raw).catch((err) => {
        console.error('send_reset_email_failed', {
          requestId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
      });
    }
    return toErrorResponse(err, requestId);
  }
}