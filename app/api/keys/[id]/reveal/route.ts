import { db } from '@/lib/db';
import { requireUser, assertCsrf } from '@/lib/auth';
import { decryptApiKey } from '@/lib/key-crypto';
import { AppError, NotFoundError, toErrorResponse, TooManyRequestsError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';
import { checkLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const REVEAL_LIMIT = 30;
const REVEAL_WINDOW_MS = 60_000;

/**
 * Kembalikan raw API key milik user yang sedang login.
 *
 * - POST (bukan GET) supaya tidak di-cache browser/proxy dan tetap kena CSRF.
 * - Hanya owner yang bisa reveal; admin tidak memakai endpoint ini.
 * - Setiap reveal dicatat di audit log.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    assertCsrf(req);

    const limit = checkLimit(`key-reveal:${s.sub}`, REVEAL_LIMIT, REVEAL_WINDOW_MS);
    if (!limit.success) {
      throw new TooManyRequestsError('rate_limit_exceeded', 'Too many key reveal attempts. Try again later.');
    }

    const key = await db.apiKey.findFirst({
      where: { id: params.id, userId: s.sub },
    });
    if (!key) throw new NotFoundError('key_not_found', 'API key not found.');

    if (key.status !== 'ACTIVE' || (key.expiresAt && key.expiresAt.getTime() <= Date.now())) {
      throw new AppError(
        'key_not_active',
        409,
        'invalid_request_error',
        'This API key is no longer active. Create a new key instead.',
      );
    }

    if (!key.keyCiphertext) {
      throw new AppError(
        'key_not_recoverable',
        409,
        'invalid_request_error',
        'This key was created before key recovery was enabled. Revoke it and create a new key.',
      );
    }

    let rawKey: string;
    try {
      rawKey = decryptApiKey(key.keyCiphertext);
    } catch (err) {
      // Jangan bocorkan detail crypto ke client. Bisa terjadi bila
      // API_KEY_ENCRYPTION_KEY / API_KEY_PEPPER berubah tanpa re-enkripsi.
      console.error('Failed to decrypt API key', { requestId, keyId: key.id, error: String(err) });
      throw new AppError(
        'key_not_recoverable',
        409,
        'invalid_request_error',
        'This key cannot be recovered. Revoke it and create a new key.',
      );
    }

    await db.adminAuditLog.create({
      data: {
        adminId: s.sub,
        action: 'apikey.reveal',
        targetType: 'ApiKey',
        targetId: key.id,
        metadata: { name: key.name, prefix: key.prefix },
        ip: getClientIp(req),
      },
    });

    return json(
      { rawKey },
      200,
      {
        'x-request-id': requestId,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
      },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
