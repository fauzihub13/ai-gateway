import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, assertCsrf } from '@/lib/auth';
import { toErrorResponse, BadRequestError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

const Schema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi.').max(60, 'Nama maksimal 60 karakter.'),
});

/** Update profil user. Email sengaja tidak bisa diubah (identitas login). */
export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    assertCsrf(req);
    const body = Schema.parse(await req.json());

    const user = await db.user.update({
      where: { id: s.sub },
      data: { name: body.name },
      select: { id: true, email: true, name: true, role: true, status: true },
    });

    return json({ user }, 200, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(
        new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.', 'name'),
        requestId,
      );
    }
    return toErrorResponse(err, requestId);
  }
}
