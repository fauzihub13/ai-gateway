import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { signSession, setSessionCookie, setCsrfCookie } from '@/lib/auth';
import { toErrorResponse, BadRequestError, UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';
import { enforceLoginLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const body = Schema.parse(await req.json());
    const email = body.email.toLowerCase();
    await enforceLoginLimit(getClientIp(req), email);

    const user = await db.user.findUnique({ where: { email }, include: { plan: true } });

    if (!user) {
      await verifyPassword(DUMMY_HASH, body.password);
      throw new UnauthorizedError('invalid_credentials', 'Invalid email or password.');
    }

    const ok = await verifyPassword(user.passwordHash, body.password);
    if (!ok) throw new UnauthorizedError('invalid_credentials', 'Invalid email or password.');

    if (user.status === 'SUSPENDED') throw new ForbiddenError('account_suspended', 'Your account is suspended.');
    if (user.status === 'DEACTIVATED') throw new UnauthorizedError('invalid_credentials', 'Invalid email or password.');

    const sid = nanoid();
    const token = await signSession({ sub: user.id, role: user.role, sid, ver: user.sessionVersion });
    setSessionCookie(token);
    setCsrfCookie(nanoid(24));

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return json(
      {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        plan: user.plan.name,
        balance: user.balance,
      },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}