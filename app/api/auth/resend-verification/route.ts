import { z } from 'zod';
import { db } from '@/lib/db';
import { generateVerificationToken } from '@/lib/verification-token';
import { sendVerifyEmail } from '@/lib/email';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';
import { checkLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const Schema = z.object({ email: z.string().email().max(255) });

/**
 * Kirim ulang tautan verifikasi email.
 *
 * Selalu membalas `{ ok: true }` (kecuali `throttled`) supaya tidak membocorkan
 * apakah sebuah email terdaftar atau tidak.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const headers = { 'x-request-id': requestId };

  try {
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return json({ ok: true }, 200, headers);

    const email = parsed.data.email.toLowerCase();
    const byIp = checkLimit(`resend-verify:ip:${getClientIp(req)}`, 10, 15 * 60_000);
    const byEmail = checkLimit(`resend-verify:email:${email}`, 3, 15 * 60_000);
    if (!byIp.success || !byEmail.success) return json({ ok: true, throttled: true }, 200, headers);

    const user = await db.user.findUnique({ where: { email } });
    if (user && user.status !== 'ACTIVE') {
      const { raw, hash } = generateVerificationToken();
      await db.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hash,
          type: 'EMAIL_VERIFY',
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        },
      });
      // Token EMAIL_VERIFY lama yang belum terpakai dimatikan agar hanya tautan terbaru yang valid.
      await db.verificationToken.updateMany({
        where: { userId: user.id, type: 'EMAIL_VERIFY', usedAt: null, tokenHash: { not: hash } },
        data: { usedAt: new Date() },
      });
      await sendVerifyEmail(email, raw).catch((err) => {
        console.error('send_verify_email_failed', {
          requestId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return json({ ok: true }, 200, headers);
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}