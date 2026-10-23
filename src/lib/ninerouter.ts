import { upstreamAgent } from './undici-agent';

const BASE = () => process.env.NINE_ROUTER_URL!;
const API_KEY = () => process.env.NINE_ROUTER_API_KEY!;

export function nineRouterFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const requestInit: RequestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY()}`,
      ...(init.headers as Record<string, string> | undefined ?? {}),
    },
  };

  // `dispatcher` adalah opsi runtime undici (fetch Node), bukan bagian dari tipe
  // DOM `RequestInit`. Dipasang hanya bila paket `undici` tersedia — lihat
  // `src/lib/undici-agent.ts`. Tanpa dispatcher, fetch tetap berfungsi normal.
  if (upstreamAgent) {
    // @ts-expect-error dispatcher bukan properti RequestInit (opsi undici).
    requestInit.dispatcher = upstreamAgent;
  }

  return fetch(`${BASE()}${path}`, requestInit);
}
