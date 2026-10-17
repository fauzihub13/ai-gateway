import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { generateVerificationToken } from '@/lib/verification-token';
import { sendVerifyEmail } from '@/lib/email';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';
import { checkLimit } from '@/lib/ratelimit';
import { getDefaultSignupPlan } from '@/lib/plans';

export const runtime = 'nodejs';

const Schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const ip = getClientIp(req);
    const rl = checkLimit(`register:${ip}`, 10, 15 * 60_000);
    if (!rl.success) throw new BadRequestError('rate_limit_exceeded', 'Too many attempts.');

    const body = Schema.parse(await req.json());
    const email = body.email.toLowerCase();

    const existing = await db.user.findUnique({ where: { email } });
    if (!existing) {
      const plan = await getDefaultSignupPlan();
      const user = await db.user.create({
        data: {
          email,
          passwordHash: await hashPassword(body.password),
          name: body.name ?? null,
          status: 'PENDING_EMAIL',
          planId: plan.id,
        },
      });
      const { raw, hash } = generateVerificationToken();
      await db.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hash,
          type: 'EMAIL_VERIFY',
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        },
      });
      await sendVerifyEmail(email, raw).catch(() => undefined);
    }

    return json({ ok: true }, 201, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(
        new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.', err.errors[0]?.path.join('.') ?? null),
        requestId,
      );
    }
    return toErrorResponse(err, requestId);
  }
}