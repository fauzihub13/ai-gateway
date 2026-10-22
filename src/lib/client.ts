/**
 * Fetch wrapper untuk komponen client.
 * - Auto-inject header `X-CSRF-Token` (double-submit) untuk method mutasi.
 * - Kalau `csrf_token` cookie hilang (build-up bug lama / expired), refresh dulu
 *   lewat /api/auth/refresh, baru retry. Selama sesi masih valid ini self-healing.
 * - Bila server membalas 401, arahkan ke /login (bukan diam-diam gagal).
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

// Satu refresh in-flight untuk semua caller (hindari refresh berulang saat
// beberapa mutasi jalan paralel).
let csrfRefreshPromise: Promise<string> | null = null;

/** Pastikan ada csrf_token di cookie; kalau kosong, refresh dulu dan balikin nilainya. */
async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie('csrf_token');
  if (existing) return existing;

  // Tunggu refresh yang sedang jalan biar tidak dobel fetch.
  if (!csrfRefreshPromise) {
    csrfRefreshPromise = (async () => {
      const res = await fetch('/api/auth/refresh', { method: 'GET', credentials: 'same-origin' });
      if (!res.ok) return ''; // gagal refresh (mis. sesi mati) → biarkan request asli yang melempar 401
      return readCookie('csrf_token');
    })().finally(() => {
      csrfRefreshPromise = null;
    });
  }
  return csrfRefreshPromise;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();

  // Double-submit CSRF: kirim nilai cookie `csrf_token` sebagai header
  // untuk setiap request mutasi. Cookie ini non-httpOnly, jadi bisa dibaca JS.
  if (MUTATING_METHODS.has(method)) {
    let token = await ensureCsrfToken();
    if (token) {
      const headers = new Headers(init?.headers);
      // Override kalau header sudah diset page tapi nilainya kosong (cookie hilang),
      // supaya tetap pakai token hasil refresh.
      if (!headers.get('X-CSRF-Token')) headers.set('X-CSRF-Token', token);
      init = { ...init, headers };
    }
  }

  const res = await fetch(input, init);

  // Defense-in-depth: sesi lewat tapi CSRF masih gagal → coba refresh sekali lalu retry.
  // (Normalnya tidak terjadi karena ensureCsrfToken sudah jalan, tapi amankan race.)
  if (res.status === 403 && MUTATING_METHODS.has(method) && init) {
    const token = await ensureCsrfToken();
    if (token) {
      const headers = new Headers(init.headers);
      headers.set('X-CSRF-Token', token);
      return fetch(input, { ...init, headers });
    }
  }

  if (res.status === 401 && typeof window !== 'undefined') {
    if (!window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
  }

  return res;
}
