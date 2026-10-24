import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { requireUser, assertCsrf, signSession, setSessionCookie, setCsrfCookie } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { checkLimit } from '@/lib/ratelimit';
import {
  toErrorResponse,
  BadRequestError,
  TooManyRequestsError,
} from '@/lib/errors';
import { getClientIp, getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

/** Maksimal percobaan ubah password per user dalam 15 menit (anti brute-force). */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;

const Schema = z.object({
  currentPassword: z.string().min(1, 'Password saat ini wajib diisi.').max(128),
  newPassword: z.string().min(8, 'Password baru minimal 8 karakter.').max(128, 'Password maksimal 128 karakter.'),
});

/**
 * Ganti password user yang sedang login.
 *
 * - Password lama diverifikasi dulu, salah → 400 (bukan 401, supaya client tidak
 *   mengira sesinya mati dan me-redirect ke /login).
 * - `sessionVersion` dinaikkan lalu sesi browser ini diterbitkan ulang dengan
 *   versi baru, sehingga sesi lain (kalau nanti ver divalidasi) ikut gugur.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    assertCsrf(req);

    const limit = checkLimit(`account:password:${s.sub}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!limit.success) {
      throw new TooManyRequestsError('rate_limit_exceeded', 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.');
    }

    const body = Schema.parse(await req.json());

    if (body.currentPassword === body.newPassword) {
      throw new BadRequestError('password_unchanged', 'Password baru harus berbeda dari password saat ini.', 'newPassword');
    }

    const user = await db.user.findUniqueOrThrow({
      where: { id: s.sub },
      select: { id: true, passwordHash: true },
    });

    const valid = await verifyPassword(user.passwordHash, body.currentPassword);
    if (!valid) {
      throw new BadRequestError('invalid_current_password', 'Password saat ini salah.', 'currentPassword');
    }

    const passwordHash = await hashPassword(body.newPassword);

    const updated = await db.user.update({
      where: { id: user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });

    // Terbitkan ulang sesi browser ini dengan versi baru supaya tidak ikut logout.
    const token = await signSession({ sub: s.sub, role: s.role, sid: s.sid, ver: updated.sessionVersion });
    setSessionCookie(token);
    setCsrfCookie(nanoid(24));

    // Audit trail — kegagalan pencatatan tidak boleh menggagalkan perubahan password.
    await db.adminAuditLog
      .create({
        data: {
          adminId: s.sub,
          action: 'account.password_change',
          targetType: 'User',
          targetId: s.sub,
          ip: getClientIp(req),
        },
      })
      .catch(() => undefined);

    return json({ ok: true }, 200, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(
        new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.', err.errors[0]?.path[0]?.toString()),
        requestId,
      );
    }
    return toErrorResponse(err, requestId);
  }
}
