import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import type { OpenCodeModel } from '@/lib/opencode-config';
import { IntegrationClient } from './integration-client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Integration · Mpruy AI' };

export default async function IntegrationPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/dashboard/integration');

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { planId: true },
  });
  if (!user) redirect('/login?next=/dashboard/integration');

  const planModels = await db.planModel.findMany({
    where: { planId: user.planId },
    include: { model: true },
  });

  const models: OpenCodeModel[] = planModels
    .map((pm) => pm.model)
    .filter((m) => m.isActive)
    .map((m) => {
      const caps = (m.capabilities as Record<string, unknown>) ?? {};
      return {
        publicName: m.publicName,
        displayName: m.displayName,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        vision: caps.vision === true,
        tools: caps.tools === true,
        reasoning: caps.reasoning as OpenCodeModel['reasoning'],
      };
    })
    .sort((a, b) => a.publicName.localeCompare(b.publicName));

  const baseUrl = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

  return <IntegrationClient models={models} baseUrl={baseUrl} />;
}