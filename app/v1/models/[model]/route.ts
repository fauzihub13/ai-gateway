import { authenticateApiKey } from '@/lib/proxy';
import { db } from '@/lib/db';
import { openAiModelView } from '@/lib/model-mapping';
import { toErrorResponse, NotFoundError } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { model: string } }) {
  const requestId = getRequestId(req);
  try {
    const auth = await authenticateApiKey(req);

    const model = await db.model.findUnique({ where: { publicName: params.model } });
    if (!model || !model.isActive) throw new NotFoundError('model_not_found', `The model \`${params.model}\` does not exist.`);

    const access = await db.planModel.findUnique({
      where: { planId_modelId: { planId: auth.planId, modelId: model.id } },
    });
    if (!access) throw new NotFoundError('model_not_found', `The model \`${params.model}\` does not exist.`);

    return json(openAiModelView(model), 200, { 'x-request-id': requestId });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}