import { describe, it, expect } from 'vitest';
import { createNormalizer } from '@/lib/stream';

function runStream(chunks: string[]): Promise<{ out: string; settled: import('@/lib/stream').StreamState }> {
  return new Promise(async (resolve) => {
    let settled!: import('@/lib/stream').StreamState;
    const ts = createNormalizer('gpt-4o', 'gh/gpt-4o', 'hi', async (s) => {
      settled = s;
    });
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const out: string[] = [];

    const reader = ts.readable.getReader();
    const pump = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        out.push(dec.decode(value));
      }
    })();

    const writer = ts.writable.getWriter();
    for (const c of chunks) await writer.write(enc.encode(c));
    await writer.close();
    await pump;
    resolve({ out: out.join(''), settled });
  });
}

describe('stream normalizer', () => {
  it('rewrite model internal -> public, inject [DONE], akumulasi usage', async () => {
    const { out, settled } = await runStream([
      'data: {"model":"gh/gpt-4o","choices":[{"delta":{"content":"Ha"},"finish_reason":null}]}\n\n',
      'data: {"model":"gh/gpt-4o","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
    ]);

    expect(out).toContain('"model":"gpt-4o"');
    expect(out).not.toContain('gh/gpt-4o');
    expect(out).toContain('data: [DONE]\n\n');
    expect(settled.usage?.total_tokens).toBe(7);
    expect(settled.finishReason).toBe('stop');
  });

  it('estimasi usage bila upstream tidak mengirim', async () => {
    const { settled } = await runStream([
      'data: {"model":"gh/gpt-4o","choices":[{"delta":{"content":"Halo dunia"},"finish_reason":null}]}\n\n',
      'data: {"model":"gh/gpt-4o","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
    ]);
    expect(settled.usage?.completion_tokens).toBeGreaterThan(0);
    expect(settled.usage?.prompt_tokens).toBeGreaterThan(0);
  });

  it('tidak mengirim [DONE] dua kali', async () => {
    const { out } = await runStream([
      'data: {"choices":[{"delta":{"content":"x"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    expect(out.match(/data: \[DONE\]/g)?.length).toBe(1);
  });
});