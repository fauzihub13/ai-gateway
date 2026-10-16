import { db } from '@/lib/db';
import { requireAdmin, assertCsrf } from '@/lib/auth';
import { invalidateModelCache } from '@/lib/model-mapping';
import { toErrorResponse, BadRequestError, InternalError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';
import { z } from 'zod';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    await requireAdmin();
    const models = await db.model.findMany({
      include: { plans: { include: { plan: { select: { name: true } } } } },
      orderBy: { publicName: 'asc' },
    });
    return json({ models }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}

const CreateSchema = z.object({
  publicName: z.string().min(1).max(64),
  internalName: z.string().min(1).max(128),
  displayName: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  contextWindow: z.number().int().min(1),
  maxOutputTokens: z.number().int().min(1).optional(),
  priceInPer1kIdr: z.number().int().min(0),
  priceOutPer1kIdr: z.number().int().min(0),
  capabilities: z.record(z.boolean()).default({}),
  plans: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);
    const body = CreateSchema.parse(await req.json());

    const existing = await db.model.findUnique({ where: { publicName: body.publicName } });
    if (existing) throw new BadRequestError('invalid_request_error', 'Model publicName already exists.');

    const model = await db.model.create({
      data: {
        publicName: body.publicName,
        internalName: body.internalName,
        displayName: body.displayName,
        description: body.description,
        contextWindow: body.contextWindow,
        maxOutputTokens: body.maxOutputTokens,
        priceInPer1kIdr: body.priceInPer1kIdr,
        priceOutPer1kIdr: body.priceOutPer1kIdr,
        capabilities: body.capabilities,
      },
    });

    if (body.plans.length > 0) {
      const plans = await db.plan.findMany({ where: { name: { in: body.plans } } });
      for (const p of plans) {
        await db.planModel.upsert({
          where: { planId_modelId: { planId: p.id, modelId: model.id } },
          create: { planId: p.id, modelId: model.id },
          update: {},
        });
      }
    }

    await db.adminAuditLog.create({
      data: {
        adminId: admin.sub,
        action: 'model.create',
        targetType: 'Model',
        targetId: model.id,
        metadata: { publicName: model.publicName },
        ip: getClientIp(req),
      },
    });

    await invalidateModelCache().catch(() => undefined);
    return json({ model }, 201, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);
    const body = (await req.json()) as { publicName: string } & Record<string, unknown>;
    const model = await db.model.findUnique({ where: { publicName: body.publicName } });
    if (!model) throw new InternalError('model_not_found');

    const updated = await db.model.update({
      where: { id: model.id },
      data: {
        displayName: body.displayName as string | undefined,
        internalName: body.internalName as string | undefined,
        priceInPer1kIdr: body.priceInPer1kIdr as number | undefined,
        priceOutPer1kIdr: body.priceOutPer1kIdr as number | undefined,
        capabilities: body.capabilities as object | undefined,
        isActive: body.isActive as boolean | undefined,
        deprecatedAt: body.isActive === false ? new Date() : undefined,
      },
    });

    await db.adminAuditLog.create({
      data: {
        adminId: admin.sub,
        action: 'model.update',
        targetType: 'Model',
        targetId: model.id,
        metadata: { publicName: model.publicName },
        ip: getClientIp(req),
      },
    });

    await invalidateModelCache().catch(() => undefined);
    return json({ model: updated }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}