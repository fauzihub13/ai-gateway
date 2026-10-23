import { createRequire } from 'node:module';

/**
 * Undici dispatcher kustom untuk **semua** request ke upstream (9Router).
 *
 * Kenapa perlu:
 * - `fetch` bawaan Node memakai undici dengan `headersTimeout`/`bodyTimeout`
 *   default **300 detik**. Timeout ini menghitung jarak antar-chunk, jadi model
 *   reasoning yang "diam" lama sebelum token pertama bisa diputus lebih awal
 *   dari yang kita inginkan — dan pemutusan itu terjadi di lapisan socket
 *   (tanpa pesan error yang informatif ke klien).
 * - Kita butuh budget yang jauh lebih longgar untuk upstream, lalu menegakkan
 *   batas idle sendiri di level aplikasi (lihat `createNormalizer` di
 *   `src/lib/stream.ts` dan `app/v1/chat/completions/route.ts`) supaya saat
 *   upstream benar-benar macet klien menerima `event: error`, bukan stream
 *   yang menggantung lalu hilang.
 *
 * Catatan penting soal ketersediaan modul:
 * - Node.js **tidak** mengekspos `undici` sebagai modul publik (`node:undici`
 *   tidak ada). Dispatcher hanya bisa dibuat bila paket `undici` terpasang.
 * - Karena aturan proyek melarang menambah dependency baru, modul ini memuat
 *   `undici` secara **opsional**. Bila tidak terpasang, `upstreamAgent`
 *   bernilai `undefined` dan `nineRouterFetch` berjalan seperti biasa.
 *   Perlindungan utama tetap berjalan: idle timeout di level aplikasi.
 * - Untuk mengaktifkan budget upstream 30 menit: `npm i undici`. Tidak ada
 *   perubahan kode lain yang diperlukan.
 */

/** Batas waktu pembentukan koneksi TCP/TLS ke upstream. */
const CONNECT_TIMEOUT_MS = 30_000;
/**
 * Batas waktu menunggu header respons. Dinaikkan ke 30 menit karena model
 * reasoning bisa memproses prompt panjang sebelum mengirim header apa pun.
 */
const HEADERS_TIMEOUT_MS = 30 * 60_000;
/**
 * Batas waktu antar-chunk body. 30 menit memberi ruang untuk "thinking" panjang;
 * deteksi macet yang sebenarnya dilakukan watchdog aplikasi (120 dtk).
 */
const BODY_TIMEOUT_MS = 30 * 60_000;
const KEEP_ALIVE_TIMEOUT_MS = 60_000;
const KEEP_ALIVE_MAX_TIMEOUT_MS = 120_000;

interface UndiciAgentCtor {
  new (options: Record<string, unknown>): unknown;
}

interface UndiciModule {
  Agent?: UndiciAgentCtor;
}

/**
 * Ambil `require` native Node. Dipakai agar pemuatan `undici` tidak ikut
 * di-resolve oleh bundler (Next/webpack) saat paket tersebut tidak terpasang —
 * kalau di-resolve statis, build gagal dengan "Module not found".
 */
function nativeRequire(): NodeRequire | null {
  if (typeof require === 'function') return require;
  try {
    return createRequire(`${process.cwd()}/package.json`);
  } catch {
    return null;
  }
}

function createUpstreamAgent(): unknown | undefined {
  const req = nativeRequire();
  if (!req) return undefined;

  let undici: UndiciModule;
  try {
    undici = req('undici') as UndiciModule;
  } catch {
    return undefined; // paket opsional tidak terpasang
  }

  if (typeof undici?.Agent !== 'function') return undefined;

  return new undici.Agent({
    connect: { timeout: CONNECT_TIMEOUT_MS },
    headersTimeout: HEADERS_TIMEOUT_MS,
    bodyTimeout: BODY_TIMEOUT_MS,
    keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
    keepAliveMaxTimeout: KEEP_ALIVE_MAX_TIMEOUT_MS,
    pipelining: 1,
  });
}

/**
 * Dispatcher upstream (shared, satu instance per proses).
 * `undefined` berarti `undici` tidak terpasang → pakai dispatcher default Node.
 */
export const upstreamAgent: unknown | undefined = createUpstreamAgent();
