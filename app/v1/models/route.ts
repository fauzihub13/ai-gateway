import { authenticateApiKey } from '@/lib/proxy';
import { db } from '@/lib/db';
import { openAiModelView } from '@/lib/model-mapping';
import { toErrorResponse } from '@/lib/errors';
import { getRequestId, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const auth = await authenticateApiKey(req);

    const planModels = await db.planModel.findMany({
      where: { planId: auth.planId },
      include: { model: true },
    });

    let models = planModels.map((pm) => pm.model).filter((m) => m.isActive);

    if (auth.keyModels !== null) {
      models = models.filter((m) => auth.keyModels!.includes(m.publicName));
    }

    return json(
      { object: 'list', data: models.map(openAiModelView) },
      200,
      { 'x-request-id': requestId },
    );
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}