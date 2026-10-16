import { db } from '@/lib/db';
import { requireAdmin, assertCsrf } from '@/lib/auth';
import { toErrorResponse, BadRequestError, NotFoundError } from '@/lib/errors';
import { getRequestId, getClientIp, json } from '@/lib/http';
import { z } from 'zod';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  name: z.string().min(1).max(64),
  displayName: z.string().min(1).max(80).optional(),
  markup: z.number().min(1).max(10).optional(),
  rpmLimit: z.number().int().min(1).max(100_000).optional(),
  monthlyTokenLimit: z.number().int().min(0).nullable().optional(),
  monthlyPriceIdr: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  models: z.array(z.string()).optional(),
});

const CreateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'name harus lowercase, huruf/angka/dash (mis. "starter")'),
  displayName: z.string().min(1).max(80),
  markup: z.number().min(1).max(10).default(1.5),
  rpmLimit: z.number().int().min(1).max(100_000).default(60),
  monthlyTokenLimit: z.number().int().min(0).nullable().optional(),
  monthlyPriceIdr: z.number().int().min(0).default(0),
  models: z.array(z.string()).default([]),
});

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    await requireAdmin();
    const plans = await db.plan.findMany({
      orderBy: { monthlyPriceIdr: 'asc' },
      include: { models: { include: { model: { select: { publicName: true } } } } },
    });
    const allModels = await db.model.findMany({
      where: { isActive: true },
      select: { publicName: true, displayName: true },
      orderBy: { publicName: 'asc' },
    });
    return json(
      {
        plans: plans.map((p) => ({
          id: p.id, name: p.name, displayName: p.displayName, markup: p.markup,
          rpmLimit: p.rpmLimit, monthlyTokenLimit: p.monthlyTokenLimit,
          monthlyPriceIdr: p.monthlyPriceIdr, isActive: p.isActive,
          models: p.models.map((m) => m.model.publicName),
        })),
        allModels,
      },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);
    const body = PatchSchema.parse(await req.json());

    const plan = await db.plan.findUnique({ where: { name: body.name } });
    if (!plan) throw new BadRequestError('invalid_request_error', 'Plan not found.');

    await db.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id: plan.id },
        data: {
          displayName: body.displayName,
          markup: body.markup,
          rpmLimit: body.rpmLimit,
          monthlyTokenLimit: body.monthlyTokenLimit === undefined ? undefined : body.monthlyTokenLimit,
          monthlyPriceIdr: body.monthlyPriceIdr,
          isActive: body.isActive,
        },
      });

      if (body.models) {
        await tx.planModel.deleteMany({ where: { planId: plan.id } });
        const models = await tx.model.findMany({ where: { publicName: { in: body.models } } });
        for (const m of models) {
          await tx.planModel.create({ data: { planId: plan.id, modelId: m.id } });
        }
      }

      await tx.adminAuditLog.create({
        data: {
          adminId: admin.sub,
          action: 'plan.update',
          targetType: 'Plan',
          targetId: plan.id,
          metadata: { name: plan.name },
          ip: getClientIp(req),
        },
      });
    });

    return json({ ok: true }, 200, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);
    const body = CreateSchema.parse(await req.json());

    const existing = await db.plan.findUnique({ where: { name: body.name } });
    if (existing) throw new BadRequestError('invalid_request_error', `Plan \`${body.name}\` sudah ada.`);

    const plan = await db.plan.create({
      data: {
        name: body.name,
        displayName: body.displayName,
        markup: body.markup,
        rpmLimit: body.rpmLimit,
        monthlyTokenLimit: body.monthlyTokenLimit ?? null,
        monthlyPriceIdr: body.monthlyPriceIdr,
      },
    });

    if (body.models.length > 0) {
      const models = await db.model.findMany({ where: { publicName: { in: body.models } } });
      for (const m of models) {
        await db.planModel.create({ data: { planId: plan.id, modelId: m.id } });
      }
    }

    await db.adminAuditLog.create({
      data: {
        adminId: admin.sub,
        action: 'plan.create',
        targetType: 'Plan',
        targetId: plan.id,
        metadata: { name: plan.name },
        ip: getClientIp(req),
      },
    });

    return json({ plan }, 201, { 'x-request-id': requestId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return toErrorResponse(new BadRequestError('invalid_request_error', err.errors[0]?.message ?? 'Invalid body.'), requestId);
    }
    return toErrorResponse(err, requestId);
  }
}

export async function DELETE(req: Request) {
  const requestId = getRequestId(req);
  try {
    const admin = await requireAdmin();
    assertCsrf(req);

    const { searchParams } = new URL(req.url);
    let name = searchParams.get('name');
    if (!name) {
      const b = (await req.json().catch(() => ({}))) as { name?: string };
      name = b.name ?? null;
    }
    if (!name) throw new BadRequestError('invalid_request_error', 'name is required.');

    const plan = await db.plan.findUnique({ where: { name } });
    if (!plan) throw new NotFoundError('plan_not_found', `Plan \`${name}\` tidak ditemukan.`);

    const usersOnPlan = await db.user.count({ where: { planId: plan.id } });
    if (usersOnPlan > 0) {
      throw new BadRequestError(
        'plan_in_use',
        `Plan \`${name}\` masih dipakai oleh ${usersOnPlan} user. Pindahkan user ke plan lain dulu.`,
      );
    }

    await db.plan.delete({ where: { id: plan.id } });

    await db.adminAuditLog.create({
      data: {
        adminId: admin.sub,
        action: 'plan.delete',
        targetType: 'Plan',
        targetId: plan.id,
        metadata: { name: plan.name },
        ip: getClientIp(req),
      },
    });

    return json({ ok: true, deleted: plan.name }, 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}