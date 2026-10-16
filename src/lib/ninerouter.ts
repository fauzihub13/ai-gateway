const BASE = () => process.env.NINE_ROUTER_URL!;
const API_KEY = () => process.env.NINE_ROUTER_API_KEY!;

export function nineRouterFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY()}`,
      ...(init.headers as Record<string, string> | undefined ?? {}),
    },
  });
}