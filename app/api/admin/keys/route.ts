import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, assertCsrf } from '@/lib/auth';
import { generateApiKey, hashApiKey, KEY_PREFIX } from '@/lib/apikey';
import { publicKeyView } from '@/lib/key-view';
import { toErrorResponse, BadRequestError, NotFoundError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';

export const runtime = 'nodejs';

const Schema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(50).default('admin-generated'),
  scope: z.enum(['FULL', 'MODELS']).default('FULL'),
  models: z.array(z.string()).default([]),
  rpmLimit: z.number().int().min(1).max(10_000).optional(),
  monthlyLimitIdr: z.number().int().min(0).optional(),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);
    const data = Schema.parse(await req.json());

    const user = await db.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('user_not_found', 'User not found.');

    let raw: string;
    let hash: string;
    do {
      raw = generateApiKey();
      hash = hashApiKey(raw);
    } while (await db.apiKey.findUnique({ where: { keyHash: hash } }));

    const key = await db.apiKey.create({
      data: {
        userId: user.id,
        name: data.name,
        keyHash: hash,
        prefix: raw.slice(0, KEY_PREFIX.length + 4),
        last4: raw.slice(-4),
        scope: data.scope,
        allowedModels: data.scope === 'MODELS' ? data.models : [],
        rpmLimit: data.rpmLimit ?? null,
        monthlyLimitIdr: data.monthlyLimitIdr ?? null,
      },
    });

    await db.adminAuditLog.create({
      data: {
        adminId: admin.sub,
        action: 'apikey.create_for_user',
        targetType: 'ApiKey',
        targetId: key.id,
        metadata: { userId: user.id, name: key.name },
        ip: getClientIp(req),
      },
    });

    return json({ key: publicKeyView(key), rawKey: raw }, 201, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}