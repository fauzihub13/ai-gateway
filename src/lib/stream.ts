import { estimateTokens } from './tokens';

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  cachedPromptTokens?: number;
  total_tokens: number;
}

/**
 * Ambil jumlah token cache-hit dari payload usage upstream.
 * 9Router OpenAI-compatible biasanya kirim `prompt_tokens_details.cached_tokens`;
 * sebagian provider (Anthropic dkk lewat gateway) pakai `cache_read_input_tokens`.
 */
export function extractCachedTokens(usage: Record<string, unknown> | undefined): number {
  if (!usage) return 0;
  const details = usage.prompt_tokens_details as { cached_tokens?: number } | undefined;
  if (typeof details?.cached_tokens === 'number') return Math.max(0, details.cached_tokens);
  if (typeof usage.cached_tokens === 'number') return Math.max(0, usage.cached_tokens);
  if (typeof usage.cache_read_input_tokens === 'number') return Math.max(0, usage.cache_read_input_tokens);
  return 0;
}

export interface StreamState {
  publicModel: string;
  internalModel: string;
  contentBuffer: string[];
  usage?: Usage;
  finishReason: string | null;
  sawDone: boolean;
  receivedFirstChunk: boolean;
  aborted: boolean;
  errorCode?: string;
}

export type SettleFn = (state: StreamState) => Promise<void>;

/**
 * Setelan timing stream. Semua opsional supaya pemanggil lama tetap kompatibel.
 */
export interface NormalizerTiming {
  /** Interval komentar SSE `: ping` saat upstream diam. Default 15 dtk. */
  heartbeatMs?: number;
  /** Batas idle sebelum watchdog mengirim `event: error` lalu menutup stream. Default 120 dtk. */
  idleTimeoutMs?: number;
}

const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

/**
 * Komentar SSE untuk "memanaskan" koneksi. Cloudflare/Nginx melihat byte pertama
 * segera setelah header, sehingga koneksi tidak dianggap idle sejak awal.
 */
export const SSE_CONNECTED_COMMENT = ': connected\n\n';

/** Komentar SSE heartbeat. Valid menurut spec SSE dan diabaikan parser klien. */
export const SSE_PING_COMMENT = ': ping\n\n';

/**
 * Bangun event error SSE. Format mengikuti kontrak error OpenAI agar klien bisa
 * menampilkannya, dengan tambahan `event: error` supaya mudah dideteksi.
 */
export function buildSseErrorEvent(message: string, type: string): string {
  return `event: error\ndata: ${JSON.stringify({ error: { message, type } })}\n\n`;
}

/**
 * Event error yang dikirim saat upstream benar-benar macet (bukan sekadar lambat).
 */
export const SSE_IDLE_ERROR_EVENT = buildSseErrorEvent(
  'Model tidak merespons dalam batas waktu. Silakan coba lagi atau pecah tugas menjadi lebih kecil.',
  'upstream_idle_timeout',
);

/**
 * Normalizer SSE upstream → kontrak publik platform.
 *
 * Tanggung jawab:
 * - rewrite `model` internal → publik,
 * - akumulasi `usage` & isi jawaban (untuk billing/estimasi),
 * - inject `[DONE]` bila upstream tidak mengirimnya,
 * - heartbeat `: ping` saat upstream diam (menahan idle timeout Cloudflare/Nginx),
 * - watchdog: kirim `event: error` lalu tutup bila upstream macet,
 * - tandai stream yang TERPOTONG (tanpa `finish_reason`/`[DONE]`) sebagai error,
 *   bukan sebagai "selesai normal".
 *
 * Catatan penting: deteksi truncation di sini HANYA untuk akurasi status
 * billing (`PARTIAL`). Tidak ada `event: error` yang di-inject ke stream untuk
 * `finish_reason: "length"` maupun stream terputus, karena banyak client
 * OpenAI-compatible menganggap `event: error` sebagai kegagalan turn dan
 * menghentikan agent di tengah task. Gateway tidak boleh memotong atau
 * "mengoreksi" turn yang sudah berjalan.
 */
export function createNormalizer(
  publicModel: string,
  internalModel: string,
  promptText: string,
  onSettle: SettleFn,
  timing: NormalizerTiming = {},
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const heartbeatMs = timing.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const idleTimeoutMs = timing.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  // Cek watchdog cukup sering supaya batas idle tidak meleset jauh, tapi tetap
  // murah: 5 dtk (atau seperempat batas idle bila batasnya lebih kecil).
  // Floor kecil (bukan 1 dtk) supaya konfigurasi idle pendek — mis. di test —
  // tetap terdeteksi tepat waktu, tanpa membuat produksi lebih rakus CPU.
  const watchdogTickMs = Math.max(10, Math.min(5_000, Math.floor(idleTimeoutMs / 4)));

  const state: StreamState = {
    publicModel,
    internalModel,
    contentBuffer: [],
    usage: undefined,
    finishReason: null,
    sawDone: false,
    receivedFirstChunk: false,
    aborted: false,
  };

  let buffer = '';

  // ── State timer & lifecycle ────────────────────────────────────────────
  let lastActivity = Date.now();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * Apakah upstream pernah mengirim delta yang berarti (teks, reasoning, atau
   * tool_calls). Dipakai mendeteksi stream yang terpotong: model yang sudah
   * mulai menjawab lalu koneksi ditutup tanpa `finish_reason` berarti belum
   * selesai. Delta kosong (chunk `role` pembuka saja) tidak dihitung.
   */
  let sawDelta = false;
  /** Stream sudah selesai/ditutup: jangan enqueue apa pun lagi. */
  let closed = false;
  /** onSettle hanya boleh jalan sekali (flush vs watchdog). */
  let settled = false;

  const clearTimers = (): void => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  };

  /**
   * Enqueue yang tahan terhadap stream yang sudah tertutup/dibatalkan klien.
   * Return false bila stream sudah tidak bisa menerima data (timer lalu dimatikan
   * supaya tidak ada memory leak dari interval yang terus jalan).
   */
  const safeEnqueue = (
    controller: TransformStreamDefaultController<Uint8Array>,
    bytes: Uint8Array,
    /** Lewati guard `closed` — dipakai `flush()` yang memang menutup stream. */
    force = false,
  ): boolean => {
    if (closed && !force) return false;
    try {
      controller.enqueue(bytes);
      return true;
    } catch {
      closed = true;
      clearTimers();
      return false;
    }
  };

  const finalize = async (): Promise<void> => {
    if (settled) return;
    settled = true;
    try {
      await onSettle(state);
    } catch (e) {
      console.error('stream_settle_failed', { error: String(e) });
    }
  };

  /**
   * Satu event SSE mentah (tanpa pembatas `\n\n`) → nol atau lebih event publik.
   * Dipakai baik oleh `transform` maupun oleh sisa buffer di `flush`.
   */
  const emitEvent = (
    rawEvent: string,
    controller: TransformStreamDefaultController<Uint8Array>,
  ): void => {
    const lines = rawEvent.split('\n');

    // Pertahankan nama event bila upstream mengirimnya (mis. `event: error`
    // dari lapisan guard). Tanpa ini, event error berubah jadi `data:` biasa
    // dan klien yang memfilter berdasarkan nama event tidak melihatnya.
    const eventLine = lines.find((l) => l.startsWith('event:'));
    const eventName = eventLine ? eventLine.slice(6).trim() : '';

    const dataLines = lines
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim());
    if (dataLines.length === 0) return;

    const dataPayload = dataLines.join('\n');

    if (dataPayload === '[DONE]') {
      // Teruskan SEGERA. Menundanya sampai `flush()` membuat client menggantung
      // bila upstream mengirim `[DONE]` lalu mempertahankan koneksi (keep-alive)
      // tanpa menutup body.
      //
      // Dedupe: 9Router terbukti bisa mengirim `[DONE]` DUA kali. Jangan
      // meneruskan yang kedua — sebagian client menganggap sentinel ganda
      // sebagai event tak terduga.
      if (!state.sawDone) {
        state.sawDone = true;
        safeEnqueue(controller, encoder.encode('data: [DONE]\n\n'));
      }
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(dataPayload);
    } catch {
      // Chunk korup / bukan JSON: teruskan apa adanya.
      const prefix = eventName ? `event: ${eventName}\n` : '';
      safeEnqueue(controller, encoder.encode(`${prefix}data: ${dataPayload}\n\n`));
      return;
    }

    state.receivedFirstChunk = true;

    if (typeof parsed.model === 'string') parsed.model = publicModel;

    const usage = parsed.usage as Usage | undefined;
    if (usage) {
      state.usage = {
        prompt_tokens: usage.prompt_tokens ?? 0,
        completion_tokens: usage.completion_tokens ?? 0,
        cachedPromptTokens: extractCachedTokens(parsed.usage as Record<string, unknown> | undefined),
        total_tokens:
          usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
      };
    }

    const choices = parsed.choices as
      | Array<{
          delta?: {
            content?: string;
            reasoning_content?: string;
            reasoning?: string;
            tool_calls?: unknown[];
          };
          finish_reason?: string | null;
        }>
      | undefined;
    const choice = choices?.[0];
    const delta = choice?.delta;

    if (delta?.content) {
      state.contentBuffer.push(delta.content);
      sawDelta = true;
    }
    // Model reasoning & tool-calling TIDAK mengirim `content` di setiap chunk.
    // Kalau hanya `content` yang dihitung, stream yang isinya reasoning/tool_calls
    // dianggap "tidak pernah mulai" sehingga truncation tidak terdeteksi.
    if (delta?.reasoning_content || delta?.reasoning) sawDelta = true;
    if (Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0) sawDelta = true;

    if (choice?.finish_reason) state.finishReason = choice.finish_reason;

    const prefix = eventName ? `event: ${eventName}\n` : '';
    safeEnqueue(controller, encoder.encode(`${prefix}data: ${JSON.stringify(parsed)}\n\n`));
  };

  /**
   * Pastikan `state.usage` selalu terisi. Dipakai `flush()` dan juga watchdog:
   * dulu watchdog memanggil `finalize()` sebelum estimasi usage dijalankan,
   * sehingga `onSettle` menerima `usage === undefined` dan pencatatan billing
   * gagal dengan "Cannot read properties of undefined (reading 'prompt_tokens')".
   */
  const ensureUsage = (): void => {
    if (state.usage) return;
    const completion = estimateTokens(state.contentBuffer.join(''));
    const prompt = estimateTokens(promptText);
    state.usage = {
      prompt_tokens: prompt,
      completion_tokens: completion,
      cachedPromptTokens: 0,
      total_tokens: prompt + completion,
    };
  };

  /**
   * Watchdog: upstream diam lebih lama dari `idleTimeoutMs`.
   * Kirim event error + [DONE], catat pemakaian parsial, lalu tutup stream.
   * Ini yang menggantikan perilaku lama "stream menggantung lalu hilang tanpa pesan".
   */
  const onIdleTimeout = (controller: TransformStreamDefaultController<Uint8Array>): void => {
    if (closed) return;

    state.aborted = true;
    state.errorCode = 'upstream_idle_timeout';

    safeEnqueue(controller, encoder.encode(SSE_IDLE_ERROR_EVENT));
    // Tetap kirim sentinel supaya klien OpenAI-compatible menutup langkahnya dengan rapi.
    safeEnqueue(controller, encoder.encode('data: [DONE]\n\n'));
    closed = true;
    clearTimers();

    // Estimasi dulu supaya onSettle tidak menerima usage undefined.
    ensureUsage();

    // Tunggu settle selesai sebelum terminate agar pencatatan usage tidak ikut
    // mati bersama response (best-effort, tidak pernah membatalkan apa pun).
    void finalize().finally(() => {
      try {
        controller.terminate();
      } catch {
        // stream sudah tertutup — tidak masalah
      }
    });
  };

  const transformer: Transformer<Uint8Array, Uint8Array> & {
    cancel?: (reason?: unknown) => void;
  } = {
    start(controller) {
      lastActivity = Date.now();

      heartbeatTimer = setInterval(() => {
        if (closed) {
          clearTimers();
          return;
        }
        // Hanya kirim ping bila memang tidak ada aktivitas dari upstream.
        if (Date.now() - lastActivity < heartbeatMs) return;
        // PENTING: jangan pernah meng-update `lastActivity` di sini. Ping adalah
        // buatan kita sendiri, bukan bukti upstream masih hidup. Kalau diperbarui,
        // watchdog tidak akan pernah menembak dan stream yang benar-benar macet
        // akan menggantung selamanya — persis bug yang ingin kita hilangkan.
        safeEnqueue(controller, encoder.encode(SSE_PING_COMMENT));
      }, heartbeatMs);

      watchdogTimer = setInterval(() => {
        if (closed) {
          clearTimers();
          return;
        }
        if (Date.now() - lastActivity < idleTimeoutMs) return;
        onIdleTimeout(controller);
      }, watchdogTickMs);
    },

    transform(chunk, controller) {
      lastActivity = Date.now();

      buffer += decoder.decode(chunk, { stream: true });

      // Sebagian provider/gateway memakai CRLF. Tanpa normalisasi ini, pembatas
      // event `\r\n\r\n` tidak pernah cocok dengan `indexOf('\n\n')` sehingga
      // SEMUA event tertahan di buffer sampai stream tutup — klien melihat
      // stream diam lalu berhenti tanpa satu pun token.
      if (buffer.includes('\r')) buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        emitEvent(rawEvent, controller);
      }
    },

    async flush(controller) {
      clearTimers();

      // Event terakhir bisa belum punya penutup `\n\n` (upstream menutup koneksi
      // tepat setelah payload). Dulu sisa buffer ini dibuang, sehingga
      // `finish_reason`/`usage` hilang dan turn yang sebenarnya selesai
      // dilaporkan sebagai terpotong (atau sebaliknya).
      //
      // Penting: `closed` BELUM di-set di sini. `emitEvent` memakai `safeEnqueue`
      // yang menolak menulis saat `closed` true — kalau ditutup lebih dulu, event
      // terakhir (yang biasanya berisi `finish_reason`/`usage`) hilang tanpa jejak.
      if (buffer.trim().length > 0) {
        emitEvent(buffer, controller);
        buffer = '';
      }
      closed = true;

      /**
       * `finish_reason: "length"` = model berhenti karena menyentuh batas token
       * output, BUKAN karena jawabannya selesai.
       *
       * Inilah penyebab paling umum keluhan "task berhenti di langkah C tanpa
       * pesan error": upstream mengirim penutup turn yang sah (`finish_reason`
       * ada, kadang `[DONE]` juga ada), jadi klien menganggap turn selesai dan
       * berhenti. Padahal output-nya terpotong di tengah.
       *
       * Kita kirim event error eksplisit supaya klien/user tahu harus lanjut,
       * dan menandai usage sebagai PARTIAL (tidak dihitung "selesai").
       */
      // `finish_reason: "length"` hanya dicatat untuk status billing (PARTIAL).
      // TIDAK ada event error yang di-inject ke stream: banyak client
      // OpenAI-compatible memperlakukan `event: error` sebagai kegagalan turn
      // dan menghentikan agent di tengah task. Provider tetap mengirim
      // `finish_reason: "length"` apa adanya, jadi client yang peduli bisa
      // membacanya sendiri.
      if (state.finishReason === 'length') {
        state.aborted = true;
        state.errorCode = state.errorCode ?? 'max_output_tokens_reached';
      }

      {
        /**
         * Stream dianggap TERPOTONG hanya bila TIDAK ada `finish_reason` DAN
         * TIDAK ada `[DONE]` — dua-duanya penanda sah bahwa turn selesai.
         *
         * Versi sebelumnya hanya mengecek `finish_reason`, sehingga provider
         * yang mengirim `[DONE]` tanpa chunk `finish_reason` selalu salah
         * ditandai terpotong. Itu penyebab respons normal ikut "berhenti".
         *
         * Kondisi ini hanya dicatat untuk status billing. TIDAK ada event error
         * yang di-inject ke stream, supaya client tidak menghentikan turn.
         */
        const truncated = !state.finishReason && !state.sawDone && sawDelta;

        if (truncated) {
          state.aborted = true;
          state.errorCode = 'upstream_stream_truncated';
        }

        // `[DONE]` mungkin sudah diteruskan lebih awal oleh `emitEvent`.
        if (!state.sawDone) {
          state.sawDone = true;
          try {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } catch {
            // stream sudah tertutup di sisi klien
          }
        }
      }

      ensureUsage();

      await finalize();
    },

    /**
     * Node memanggil hook ini saat sisi readable dibatalkan (klien disconnect atau
     * upstream abort). Tidak wajib ada di spec Transformer, jadi tipenya opsional.
     */
    cancel() {
      closed = true;
      clearTimers();
    },
  };

  return new TransformStream(transformer);
}

export function streamErrorChunk(controller: TransformStreamDefaultController<Uint8Array>, code: string): void {
  const enc = new TextEncoder();
  controller.enqueue(
    enc.encode(
      `data: ${JSON.stringify({ error: { message: 'Upstream error.', type: 'api_error', code } })}\n\n`,
    ),
  );
  controller.enqueue(enc.encode('data: [DONE]\n\n'));
}
