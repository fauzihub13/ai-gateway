import { db } from './db';
import { NotFoundError, ForbiddenError } from './errors';
import type { Model, Plan } from '@prisma/client';

export interface ModelCapabilities {
  stream?: boolean;
  vision?: boolean;
  tools?: boolean;
  jsonMode?: boolean;
  embedding?: boolean;
}

export interface PublicModel {
  publicName: string;
  displayName: string;
  contextWindow: number;
  priceInPer1MIdr: number;
  priceOutPer1MIdr: number;
  capabilities: ModelCapabilities;
}

type ResolvedModel = Omit<Model, 'capabilities'> & { capabilities: ModelCapabilities };

export async function getModelMap(): Promise<Record<string, ResolvedModel>> {
  const rows = await db.model.findMany({ where: { isActive: true } });
  const map: Record<string, ResolvedModel> = {};
  for (const m of rows) {
    map[m.publicName] = { ...m, capabilities: (m.capabilities as ModelCapabilities) ?? {} };
  }
  return map;
}

export async function invalidateModelCache(): Promise<void> {
  // no-op: model read langsung dari DB (Redis tidak dipakai di fase ini)
}

export async function resolveModel(
  publicName: string,
  planId: string,
  keyModels: string[] | null,
): Promise<ResolvedModel> {
  const map = await getModelMap();
  const model = map[publicName];
  if (!model) throw new NotFoundError('model_not_found', `The model \`${publicName}\` does not exist.`);

  const access = await db.planModel.findUnique({
    where: { planId_modelId: { planId, modelId: model.id } },
  });
  if (!access) {
    throw new ForbiddenError('model_not_allowed', `You do not have access to model \`${publicName}\`.`);
  }

  if (keyModels !== null && !keyModels.includes(publicName)) {
    throw new ForbiddenError('model_not_in_key_scope', `This API key is not permitted to use \`${publicName}\`.`);
  }

  return model;
}

export function publicModelView(model: Model, plan: Pick<Plan, 'markup'>): PublicModel {
  const caps = (model.capabilities as ModelCapabilities) ?? {};
  return {
    publicName: model.publicName,
    displayName: model.displayName,
    contextWindow: model.contextWindow,
    priceInPer1MIdr: Math.ceil(model.priceInPer1MIdr * plan.markup),
    priceOutPer1MIdr: Math.ceil(model.priceOutPer1MIdr * plan.markup),
    capabilities: caps,
  };
}

export function openAiModelView(model: Model): {
  id: string;
  object: 'model';
  created: number;
  owned_by: 'mpruy';
} {
  return {
    id: model.publicName,
    object: 'model',
    created: Math.floor(model.createdAt.getTime() / 1000),
    owned_by: 'mpruy',
  };
}