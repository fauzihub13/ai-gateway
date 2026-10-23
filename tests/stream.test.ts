import { describe, it, expect } from 'vitest';
import { createNormalizer, type StreamState } from '@/lib/stream';

interface RunOptions {
  /** ms; default 4000 supaya heartbeat/watchdog tidak ikut jalan. */
  heartbeatMs?: number;
  idleTimeoutMs?: number;
  /** Jeda sebelum menutup writer (untuk memicu heartbeat/watchdog). */
  delayBeforeCloseMs?: number;
}

/**
 * Jalankan normalizer seperti pipe asli: baca output secara paralel sambil
 * menulis chunk. Parameter `timing` dipakai untuk memicu timer dengan cepat
 * tanpa membuat test lambat.
 */
function runStream(
  chunks: string[],
  opts: RunOptions = {},
): Promise<{ out: string; settled: StreamState }> {
  return new Promise(async (resolve) => {
    let settled!: StreamState;
    const ts = createNormalizer(
      'gpt-4o',
      'gh/gpt-4o',
      'hi',
      async (s) => {
        settled = s;
      },
      {
        heartbeatMs: opts.heartbeatMs ?? 4_000,
        idleTimeoutMs: opts.idleTimeoutMs ?? 4_000,
      },
    );
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const out: string[] = [];

    const reader = ts.readable.getReader();
    const pump = (async () => {
      for (;;) {
        const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
        if (done) break;
        if (value) out.push(dec.decode(value));
      }
    })();

    const writer = ts.writable.getWriter();
    for (const c of chunks) await writer.write(enc.encode(c));
    if (opts.delayBeforeCloseMs) {
      await new Promise((r) => setTimeout(r, opts.delayBeforeCloseMs));
    }
    await writer.close().catch(() => undefined);
    await pump;
    resolve({ out: out.join(''), settled });
  });
}

const delta = (content: string) =>
  `data: {"model":"gh/gpt-4o","choices":[{"delta":{"content":${JSON.stringify(content)}},"finish_reason":null}]}\n\n`;

const finish = (reason: string, usage?: string) =>
  `data: {"model":"gh/gpt-4o","choices":[{"delta":{},"finish_reason":"${reason}"}]${
    usage ? `,${usage}` : ''
  }}\n\n`;

describe('stream normalizer', () => {
  it('rewrite model internal -> public, inject [DONE], akumulasi usage', async () => {
    const { out, settled } = await runStream([
      delta('Ha'),
      finish('stop', '"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}'),
    ]);

    expect(out).toContain('"model":"gpt-4o"');
    expect(out).not.toContain('gh/gpt-4o');
    expect(out).toContain('data: [DONE]\n\n');
    expect(settled.usage?.total_tokens).toBe(7);
    expect(settled.finishReason).toBe('stop');
    // Stream normal: tidak boleh ada event error.
    expect(out).not.toContain('event: error');
  });

  it('estimasi usage bila upstream tidak mengirim', async () => {
    const { settled } = await runStream([delta('Halo dunia'), finish('stop')]);
    expect(settled.usage?.completion_tokens).toBeGreaterThan(0);
    expect(settled.usage?.prompt_tokens).toBeGreaterThan(0);
  });

  it('tidak mengirim [DONE] dua kali', async () => {
    const { out } = await runStream([delta('x'), 'data: [DONE]\n\n']);
    expect(out.match(/data: \[DONE\]/g)?.length).toBe(1);
  });

  it('menandai stream terpotong (tanpa finish_reason/[DONE]) sebagai error', async () => {
    // Simulasi: model sudah mengeluarkan teks lalu koneksi ditutup sepihak.
    const { out, settled } = await runStream([delta('langkah A'), delta('langkah B')]);

    expect(out).toContain('event: error');
    expect(out).toContain('upstream_stream_truncated');
    expect(settled.errorCode).toBe('upstream_stream_truncated');
    // Klien tetap menerima [DONE] supaya bisa menutup turn dengan rapi.
    expect(out).toContain('data: [DONE]\n\n');
  });

  it('TIDAK menandai terpotong bila chunk hanya role pembuka (belum ada delta)', async () => {
    const { out } = await runStream([
      'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
      finish('stop'),
    ]);
    expect(out).not.toContain('upstream_stream_truncated');
  });

  it('mendeteksi delta reasoning & tool_calls sebagai aktivitas jawaban', async () => {
    // Model reasoning hanya mengirim reasoning_content, tanpa content.
    const reasoningOnly = await runStream([
      'data: {"choices":[{"delta":{"reasoning_content":"berpikir..."},"finish_reason":null}]}\n\n',
    ]);
    expect(reasoningOnly.out).toContain('upstream_stream_truncated');

    const toolOnly = await runStream([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1"}]},"finish_reason":null}]}\n\n',
    ]);
    expect(toolOnly.out).toContain('upstream_stream_truncated');
  });

  it('menangani CRLF dan event terakhir tanpa penutup \\n\\n', async () => {
    const crlf = await runStream([
      'data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\r\n\r\n',
      // Event terakhir tanpa pembatas penutup sama sekali.
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    ]);

    expect(crlf.out).toContain('"content":"A"');
    expect(crlf.out).toContain('"finish_reason":"stop"');
    expect(crlf.settled.finishReason).toBe('stop');
    // finish_reason terdeteksi → bukan truncation.
    expect(crlf.out).not.toContain('upstream_stream_truncated');
  });

  it('mengirim heartbeat `: ping` saat upstream diam', async () => {
    const { out } = await runStream([delta('A')], {
      heartbeatMs: 30,
      idleTimeoutMs: 5_000,
      delayBeforeCloseMs: 120,
    });
    expect(out).toContain(': ping');
  });

  it('watchdog mengirim event error + [DONE] lalu menutup stream', async () => {
    const { out, settled } = await runStream([delta('A')], {
      heartbeatMs: 5_000,
      idleTimeoutMs: 80,
      delayBeforeCloseMs: 400,
    });
    expect(out).toContain('event: error');
    expect(out).toContain('upstream_idle_timeout');
    expect(out).toContain('data: [DONE]\n\n');
    expect(settled.errorCode).toBe('upstream_idle_timeout');
  });

  it('tidak pernah memanggil onSettle dua kali (watchdog lalu close)', async () => {
    let calls = 0;
    const ts = createNormalizer(
      'gpt-4o',
      'gh/gpt-4o',
      'hi',
      async () => {
        calls += 1;
      },
      { heartbeatMs: 5_000, idleTimeoutMs: 60 },
    );

    const reader = ts.readable.getReader();
    const pump = (async () => {
      for (;;) {
        const { done } = await reader.read().catch(() => ({ done: true }));
        if (done) break;
      }
    })();

    const writer = ts.writable.getWriter();
    await writer.write(new TextEncoder().encode(delta('A')));
    await new Promise((r) => setTimeout(r, 250));
    await writer.close().catch(() => undefined);
    await pump;

    expect(calls).toBe(1);
  });
});
