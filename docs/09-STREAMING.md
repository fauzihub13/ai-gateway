# 09 — Streaming

SSE spec, quirk 9Router, strategi handling, TransformStream, akumulasi usage, deteksi akhir stream, error mid-stream, konsumsi client. Ini bagian paling rawan — baca teliti.

---

## 1. Kenapa streaming penting

- **UX:** first token < 1s vs tunggu seluruh respons. Krusial untuk chat.
- **Biaya:** respons panjang tanpa stream memakan function timeout & memori.
- **Kompatibilitas:** SDK OpenAI/LangChain mengharap format SSE OpenAI.

---

## 2. SSE format spec (OpenAI-compatible)

Non-stream response dipecah jadi banyak chunk:

```
data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1723802400,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1723802400,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Halo"},"finish_reason":null}]}

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1723802400,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" dunia"},"finish_reason":null}]}

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1723802400,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

Aturan:
- Setiap event diakhiri `\n\n`.
- Baris diawali `data: `.
- Chunk JSON boleh menumpuk; parser harus buffer sampai `\n\n`.
- Sentinel akhir wajib: `data: [DONE]`.

**Response header streaming:**

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

---

## 3. Quirk 9Router & penanganan

| Quirk | Risiko | Penanganan platform |
|---|---|---|
| `stream` default `true` (beda OpenAI) | request non-stream jadi stream | **selalu** kirim `stream` eksplisit (`true`/`false`) |
| `[DONE]` sentinel kadang hilang | client gantung / error | deteksi akhir → inject `data: [DONE]\n\n` |
| `model` di chunk masih internal (`gh/gpt-4o`) | bocor provider | rewrite tiap chunk ke publicName |
| `usage` mungkin hanya di chunk terakhir, kadang absen | billing tak akurat | akumulasi + fallback estimasi token |
| Chunk bisa berisi `finish_reason` tanpa `usage` | settle tanpa usage | estimasi bila usage absen |
| Provider upstream beda format delta | parse gagal | normalisasi ke shape OpenAI |
| Koneksi bisa terputus tanpa `[DONE]` | stream menggantung | timeout idle → tutup + settle `partial` |

---

## 4. Alur stream di proxy

```
Client ──▶ /v1/chat/completions (stream:true)
               │  pre-flight: auth, plan, limit, saldo, resolve model
               ▼
          fetch 9Router (stream:true)  ← ReadableStream body
               │
               ▼
        TransformStream (normalisasi)   ──▶ SSE ke client
               │  tiap chunk:
               │    - parse "data: ..."
               │    - skip/forward [DONE] (catat selesai)
               │    - rewrite model internal → public
               │    - forward delta
               │    - akumulasi content + usage
               ▼
        on close:
               - bila belum lihat [DONE] → enqueue "data: [DONE]\n\n"
               - usage = collected.usage ?? estimate()
               - settle: potong saldo + UsageLog (completed/partial)
```

---

## 5. Transformer implementation

```ts
// src/lib/stream.ts
import { estimateTokens } from './tokens';

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

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

export function createNormalizer(
  publicModel: string,
  internalModel: string,
  promptText: string,
  onSettle: (state: StreamState) => Promise<void>,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const state: StreamState = {
    publicModel, internalModel,
    contentBuffer: [], usage: undefined, finishReason: null,
    sawDone: false, receivedFirstChunk: false, aborted: false,
  };

  let buffer = '';

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        // event bisa multi-line; ambil semua baris data:
        const dataLines = rawEvent
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const dataPayload = dataLines.join('\n');

        if (dataPayload === '[DONE]') {
          state.sawDone = true;
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(dataPayload);
        } catch {
          // chunk korup → teruskan apa adanya (jarang)
          controller.enqueue(encoder.encode(`data: ${dataPayload}\n\n`));
          continue;
        }

        state.receivedFirstChunk = true;

        // rewrite model
        if (parsed.model) parsed.model = publicModel;

        // akumulasi usage bila ada
        if (parsed.usage) {
          state.usage = {
            prompt_tokens: parsed.usage.prompt_tokens ?? 0,
            completion_tokens: parsed.usage.completion_tokens ?? 0,
            total_tokens: parsed.usage.total_tokens
              ?? (parsed.usage.prompt_tokens ?? 0) + (parsed.usage.completion_tokens ?? 0),
          };
        }

        // akumulasi delta content + finish_reason
        const choice = parsed.choices?.[0];
        if (choice?.delta?.content) state.contentBuffer.push(choice.delta.content);
        if (choice?.finish_reason) state.finishReason = choice.finish_reason;

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
      }
    },

    async flush(controller) {
      // flush sisa buffer (bukan event lengkap) — opsional diabaikan
      // inject [DONE] bila upstream tidak mengirim
      if (!state.sawDone) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      }

      // finalisasi usage
      if (!state.usage) {
        const completion = estimateTokens(state.contentBuffer.join(''));
        const prompt = estimateTokens(promptText);
        state.usage = {
          prompt_tokens: prompt,
          completion_tokens: completion,
          total_tokens: prompt + completion,
        };
      }

      await onSettle(state);
    },
  });
}
```

### 5.1 Estimasi token — `src/lib/tokens.ts`

```ts
import { encode } from 'gpt-tokenizer';

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}

export function estimatePromptTokens(messages: Array<{ role: string; content: unknown }>): number {
  // ~4 token per message overhead + konten
  let total = 0;
  for (const m of messages) {
    total += 4;
    if (typeof m.content === 'string') total += estimateTokens(m.content);
    else if (Array.isArray(m.content)) {
      for (const part of m.content as any[]) {
        if (part?.type === 'text') total += estimateTokens(part.text ?? '');
        if (part?.type === 'image_url') total += 85; // perkiraan kasar image
      }
    }
  }
  return total + 2;
}
```

---

## 6. Membership & settle saat stream

`onSettle` dipanggil saat stream ditutup (normal atau error). Isi:

```ts
async function onSettle(state: StreamState) {
  if (state.aborted && !state.receivedFirstChunk) return; // tidak ada token → tidak menagih

  const usage = state.usage!;
  const cost = computeCost({
    model: modelRow, plan,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
  });

  await settleUsage({
    requestId, userId, apiKeyId, modelId: modelRow.id,
    endpoint: 'chat.completions',
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    costIdr: cost,
    status: state.finishReason === 'stop' || state.sawDone ? 'COMPLETED' : 'PARTIAL',
    streamed: true,
  });
}
```

Endpoint route streaming:

```ts
// app/v1/chat/completions/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const ctx = await preflight(req); // auth, plan, limit, saldo, model map
  const { publicModel, internalModel, modelRow, plan, userId, apiKeyId, requestId } = ctx;
  const body = await req.json();
  const wantsStream = body.stream === true;

  const upstream = await nineRouterFetch('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ ...body, model: internalModel, stream: wantsStream }),
  });

  if (!upstream.ok) return mapUpstreamError(upstream, requestId);

  if (!wantsStream) {
    const data = await upstream.json();
    data.model = publicModel;
    const usage = data.usage ?? { prompt_tokens: estimatePromptTokens(body.messages), completion_tokens: estimateTokens(data.choices?.[0]?.message?.content ?? ''), total_tokens: 0 };
    if (!usage.total_tokens) usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
    await settleUsage({ requestId, userId, apiKeyId, modelId: modelRow.id, endpoint: 'chat.completions',
      promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
      costIdr: computeCost({ model: modelRow, plan, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens }),
      status: 'COMPLETED', streamed: false });
    return Response.json(data, { headers: rateLimitHeaders(ctx) });
  }

  const normalized = upstream.body!.pipeThrough(
    createNormalizer(publicModel, internalModel, promptToText(body.messages), onSettle),
  );

  return new Response(normalized, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...rateLimitHeaders(ctx),
    },
  });
}
```

---

## 7. Deteksi akhir stream

Tiga kondisi stream berakhir:

| Kondisi | Deteksi | Aksi |
|---|---|---|
| Normal | menerima `[DONE]` | settle `completed` |
| Upstream `finish_reason` ada tapi tanpa `[DONE]` | chunk terakhir punya `finish_reason`, lalu stream tutup | inject `[DONE]`, settle `completed` |
| Putus mendadak | `flush` tanpa `[DONE]`/`finish_reason` | inject `[DONE]`, settle `partial` |

Kasus khusus: klien membatalkan (`req.signal`). Tangkap `abort`:

```ts
req.signal.addEventListener('abort', () => {
  state.aborted = true;
  // settle dengan yang sudah terkumpul (bila ada token)
});
```

---

## 8. Error di tengah stream

HTTP status sudah terkirim 200 saat stream mulai; tidak bisa lagi ganti status. Jadi error dikirim sebagai **chunk error** OpenAI-style lalu tutup:

```json
data: {"error":{"message":"Upstream connection lost.","type":"api_error","code":"upstream_error"}}

data: [DONE]
```

```ts
function enqueueStreamError(controller: TransformStreamDefaultController<Uint8Array>, code: string) {
  const enc = new TextEncoder();
  controller.enqueue(enc.encode(
    `data: ${JSON.stringify({ error: { message: 'Upstream error.', type: 'api_error', code } })}\n\n`,
  ));
  controller.enqueue(enc.encode('data: [DONE]\n\n'));
}
```

Bila error terjadi **sebelum** byte pertama (upstream langsung 4xx/5xx), boleh kirim HTTP status normal (belum mulai stream) → gunakan `mapUpstreamError`.

---

## 9. Konsumsi client

### 9.1 fetch + ReadableStream

```ts
const res = await fetch('https://api.mpruy.ai/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Halo' }], stream: true }),
});

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  let i;
  while ((i = buffer.indexOf('\n\n')) !== -1) {
    const evt = buffer.slice(0, i); buffer = buffer.slice(i + 2);
    const line = evt.split('\n').find((l) => l.startsWith('data:'));
    if (!line) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') { console.log('selesai'); return; }
    const json = JSON.parse(payload);
    const delta = json.choices?.[0]?.delta?.content ?? '';
    process.stdout.write(delta);
  }
}
```

### 9.2 SDK OpenAI (drop-in)

```ts
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.MPRUY_KEY, baseURL: 'https://api.mpruy.ai/v1' });

const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Halo' }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

---

## 10. Testing streaming

| Test | Cara |
|---|---|
| Format SSE valid | Unit: jalankan chunk lewat normalizer, assert output `data: ...\n\n` |
| Inject `[DONE]` | Feed stream tanpa `[DONE]`, assert output berakhir `data: [DONE]\n\n` |
| Rewrite model | Feed chunk `model:"gh/gpt-4o"`, assert output `gpt-4o` |
| Akumulasi usage | Feed chunk usage → assert settle dipanggil dengan angka benar |
| Fallback estimate | Feed chunk tanpa usage → assert estimate dipakai |
| Mid-stream error | Feed error chunk → assert error chunk + `[DONE]` |
| Integrasi | MSW mock 9Router streaming; assert urutan & billing |

Contoh unit:

```ts
import { describe, it, expect } from 'vitest';
import { createNormalizer } from '@/lib/stream';

it('injects [DONE] and rewrites model', async () => {
  let settled: any;
  const ts = createNormalizer('gpt-4o', 'gh/gpt-4o', 'hi', async (s) => { settled = s; });
  const enc = new TextEncoder(), dec = new TextDecoder();
  const w = ts.writable.getWriter();
  const r = ts.readable.getReader();

  const chunks = [
    'data: {"model":"gh/gpt-4o","choices":[{"delta":{"content":"Ha"},"finish_reason":null}]}\n\n',
    'data: {"model":"gh/gpt-4o","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
  ];
  const out: string[] = [];
  const pump = (async () => {
    while (true) { const { done, value } = await r.read(); if (done) break; out.push(dec.decode(value)); }
  })();
  for (const c of chunks) await w.write(enc.encode(c));
  await w.close();
  await pump;

  const text = out.join('');
  expect(text).toContain('"model":"gpt-4o"');
  expect(text).toContain('data: [DONE]\n\n');
  expect(settled.usage.total_tokens).toBe(7);
});
```

---

## 11. Referensi

- Billing settle → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md)
- Error mapping → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)
- Testing → [19-TESTING.md](./19-TESTING.md)
- Contract → [05-API-CONTRACT.md](./05-API-CONTRACT.md)