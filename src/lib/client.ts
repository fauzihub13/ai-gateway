/**
 * Fetch wrapper untuk komponen client.
 * - Auto-inject header `X-CSRF-Token` (double-submit) untuk method mutasi.
 * - Bila server membalas 401, arahkan ke /login (bukan diam-diam gagal).
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();

  // Double-submit CSRF: kirim nilai cookie `csrf_token` sebagai header
  // untuk setiap request mutasi. Cookie ini non-httpOnly, jadi bisa dibaca JS.
  if (MUTATING_METHODS.has(method)) {
    const token = readCookie('csrf_token');
    if (token) {
      const headers = new Headers(init?.headers);
      if (!headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', token);
      init = { ...init, headers };
    }
  }

  const res = await fetch(input, init);

  if (res.status === 401 && typeof window !== 'undefined') {
    if (!window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
  }

  return res;
}