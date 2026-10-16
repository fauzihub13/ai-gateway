import { db } from '@/lib/db';
import { nineRouterFetch } from '@/lib/ninerouter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, boolean> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch {
    checks.db = false;
  }

  try {
    const r = await nineRouterFetch('/v1/models', { signal: AbortSignal.timeout(2000) });
    checks.upstream = r.ok;
  } catch {
    checks.upstream = false;
  }

  const ok = checks.db;
  return Response.json({ status: ok ? 'ok' : 'degraded', checks }, { status: ok ? 200 : 503 });
}