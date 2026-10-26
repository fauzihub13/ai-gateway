import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, assertCsrf } from '@/lib/auth';
import { generateApiKey, hashApiKey, KEY_PREFIX } from '@/lib/apikey';
import { encryptApiKey } from '@/lib/key-crypto';
import { MAX_ACTIVE_KEYS_PER_USER } from '@/lib/key-policy';
import { publicKeyView } from '@/lib/key-view';
import { toErrorResponse, BadRequestError, ForbiddenError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';

// Batas maksimum API key aktif per user ada di `src/lib/key-policy.ts`.

const CreateSchema = z.object({
  name: z.string().min(1).max(50),
  scope: z.enum(['FULL', 'MODELS']).default('FULL'),
  models: z.array(z.string()).default([]),
  rpmLimit: z.number().int().min(1).max(10_000).optional(),
  monthlyLimitIdr: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    const keys = await db.apiKey.findMany({
      where: { userId: s.sub, status: { not: 'REVOKED' } },
      orderBy: { createdAt: 'desc' },
    });
    return json({ keys: keys.map(publicKeyView) }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const s = await requireUser();
    assertCsrf(req);
    const data = CreateSchema.parse(await req.json());

    // Batas key mengikuti plan aktif apa adanya. Plan yang lewat masa aktif
    // tidak diturunkan otomatis — admin yang menurunkannya manual.
    const user = await db.user.findUniqueOrThrow({
      where: { id: s.sub },
    });

    const active = await db.apiKey.count({
      where: { userId: user.id, status: { not: 'REVOKED' } },
    });
    if (active >= MAX_ACTIVE_KEYS_PER_USER) {
      throw new ForbiddenError(
        'key_limit_reached',
        `Maximum number of active API keys reached (${MAX_ACTIVE_KEYS_PER_USER} per user). Revoke an old key first.`,
      );
    }

    if (data.scope === 'MODELS') {
      const allowed = await db.planModel.findMany({
        where: { planId: user.planId },
        include: { model: true },
      });
      const allowedNames = new Set(allowed.map((pm) => pm.model.publicName));
      if (data.models.length === 0 || data.models.some((m) => !allowedNames.has(m))) {
        throw new BadRequestError('invalid_models', 'One or more models are not available on your plan.');
      }
    }

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
        keyCiphertext: encryptApiKey(raw),
        prefix: raw.slice(0, KEY_PREFIX.length + 4),
        last4: raw.slice(-4),
        scope: data.scope,
        allowedModels: data.scope === 'MODELS' ? data.models : [],
        rpmLimit: data.rpmLimit ?? null,
        monthlyLimitIdr: data.monthlyLimitIdr ?? null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });

    await db.adminAuditLog.create({
      data: {
        adminId: user.id,
        action: 'apikey.create',
        targetType: 'ApiKey',
        targetId: key.id,
        metadata: { name: key.name, prefix: key.prefix },
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