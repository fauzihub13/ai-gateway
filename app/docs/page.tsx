import Link from 'next/link';
import { ArrowRight, Info, TriangleAlert } from 'lucide-react';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CodeBlock } from '@/components/code-block';
import { buildOpenCodeV1, buildOpenCodeV2, OPENCODE_GLOBAL_CONFIG_PATH, type OpenCodeModel } from '@/lib/opencode-config';
import { formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 border-t border-hairline pt-10 first:border-t-0 first:pt-0">
      <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function Note({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warn' }) {
  const Icon = variant === 'warn' ? TriangleAlert : Info;
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/40 p-4">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export default async function DocsPage() {
  const base = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const api = `${base}/v1`;
  const models = await db.model.findMany({ where: { isActive: true }, orderBy: { publicName: 'asc' } });

  const chatCurl = `curl ${api}/chat/completions \\
  -H "Authorization: Bearer $MPRUY_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "mimo",
    "messages": [
      { "role": "user", "content": "Halo, perkenalkan dirimu singkat." }
    ],
    "stream": false
  }'`;

  const chatResponse = `{
  "id": "chatcmpl_...",
  "object": "chat.completion",
  "created": 1792135393,
  "model": "mimo",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Halo! Saya asisten AI..." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 12, "completion_tokens": 20, "total_tokens": 32 }
}`;

  const nodeSdk = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.MPRUY_KEY,        // sk-mpruy-...
  baseURL: "${api}",
});

const res = await client.chat.completions.create({
  model: "mimo",
  messages: [{ role: "user", content: "Halo!" }],
});

console.log(res.choices[0].message.content);`;

  const pythonSdk = `from openai import OpenAI

client = OpenAI(
    api_key="sk-mpruy-...",
    base_url="${api}",
)

res = client.chat.completions.create(
    model="mimo",
    messages=[{"role": "user", "content": "Halo!"}],
)

print(res.choices[0].message.content)`;

  const streamNode = `const res = await fetch("${api}/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.MPRUY_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "mimo",
    messages: [{ role: "user", content: "Tulis puisi pendek." }],
    stream: true,
  }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  for (const line of chunk.split("\\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") continue;
    const json = JSON.parse(payload);
    process.stdout.write(json.choices[0]?.delta?.content ?? "");
  }
}`;

  const streamRaw = `data: {"id":"chatcmpl_...","object":"chat.completion.chunk","model":"mimo","choices":[{"index":0,"delta":{"role":"assistant","content":"Ha"}}]}

data: {"id":"chatcmpl_...","object":"chat.completion.chunk","model":"mimo","choices":[{"index":0,"delta":{"content":"lo!"}}]}

data: [DONE]`;

  const embedCurl = `curl ${api}/embeddings \\
  -H "Authorization: Bearer $MPRUY_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "mimo",
    "input": "teks yang ingin di-embed"
  }'`;

  const errorBody = `{
  "error": {
    "message": "Incorrect API key provided.",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_api_key"
  }
}`;

  // OpenCode integration: generate ready-to-paste configs from the live model list.
  const openCodeModels = models.map((m) => {
    const caps = (m.capabilities as Record<string, unknown>) ?? {};
    return {
      publicName: m.publicName,
      displayName: m.displayName,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      vision: caps.vision === true,
      tools: caps.tools === true,
      reasoning: caps.reasoning as OpenCodeModel['reasoning'],
    };
  });
  const defaultModel = models[0]?.publicName ?? 'mimo';
  const openCodeArgs = {
    baseUrl: base,
    models: openCodeModels,
    defaultModel,
    apiKey: 'sk-mpruy-YOUR_KEY',
  };
  const openCodeV2Config = buildOpenCodeV2(openCodeArgs);
  const openCodeV2EnvConfig = buildOpenCodeV2({ ...openCodeArgs, useEnv: true });
  const openCodeV1Config = buildOpenCodeV1(openCodeArgs);

  const openCodeModelsList = `curl ${api}/models \\
  -H "Authorization: Bearer $MPRUY_API_KEY"`;

  const openCodeEnv = `export MPRUY_API_KEY="sk-mpruy-YOUR_KEY"`;

  const openCodeRun = `# jalankan OpenCode dari project mana pun
opencode

# di dalam TUI, pilih model:
/models`;

  const openCodeVariantRun = `# pilih thinking level lewat suffix #variant
opencode run --model mpruy/${defaultModel}#high "Refactor fungsi ini dan jelaskan."`;

  const openCodeCapabilities = `{
  "capabilities": {
    "tools": true,
    "input": ["text", "image"],
    "output": ["text"]
  },
  "limit": { "context": 1048576, "output": 131072 },
  "variants": [
    { "id": "low", "settings": { "reasoningEffort": "low" } },
    { "id": "medium", "settings": { "reasoningEffort": "medium" } },
    { "id": "high", "settings": { "reasoningEffort": "high" } },
    { "id": "max", "settings": { "reasoningEffort": "max" } }
  ]
}`;

  const openCodeV1Variants = `{
  "limit": { "context": 1048576, "output": 131072 },
  "variants": {
    "low": { "reasoningEffort": "low" },
    "medium": { "reasoningEffort": "medium" },
    "high": { "reasoningEffort": "high" },
    "max": { "reasoningEffort": "max" }
  }
}`;

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <Badge className="mb-3">REST API · OpenAI-compatible</Badge>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Integrasi API</h1>
        <p className="mt-2 text-muted-foreground">
          Panggil Mpruy AI dari aplikasi apa pun yang mendukung OpenAI SDK. Hanya perlu
          ganti <code className="rounded bg-muted px-1.5 py-0.5 text-xs">baseURL</code> dan API key.
        </p>
        <div className="mt-4 flex gap-2">
          <Button asChild>
            <Link href="/register">
              Buat akun <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Masuk</Link>
          </Button>
        </div>
        <Card className="mt-6">
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Base URL</div>
              <code className="text-xs">{api}</code>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Auth header</div>
              <code className="text-xs">Authorization: Bearer sk-mpruy-...</code>
            </div>
          </CardContent>
        </Card>
      </div>

      <Section id="quickstart" title="Quickstart">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Daftar</strong> di{' '}
            <Link href="/register" className="text-primary hover:underline">
              /register
            </Link>{' '}
            dan verifikasi email.
          </li>
          <li>
            <strong>Top-up saldo</strong> via halaman Billing (Midtrans). Request akan ditolak jika saldo 0 dan model berbayar (model gratis tetap bisa dipakai).
          </li>
          <li>
            <strong>Buat API key</strong> di halaman{' '}
            <Link href="/dashboard/keys" className="text-primary hover:underline">
              API Keys
            </Link>
            . Kunci hanya ditampilkan sekali — salin dan simpan.
          </li>
          <li>
            <strong>Kirim request</strong> ke <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{api}/chat/completions</code>.
          </li>
        </ol>
        <Note>
          Simpan API key di environment variable (mis. <code>MPRUY_KEY</code>). Jangan pernah
          hardcode di client-side atau commit ke repo.
        </Note>
      </Section>

      <Section id="authentication" title="Autentikasi">
        <p>
          Semua request ke <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/v1/*</code> wajib menyertakan
          API key di header <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Authorization</code> dengan skema
          Bearer.
        </p>
        <CodeBlock filename="header" code={`Authorization: Bearer sk-mpruy-xxxxxxxx...`} />
        <ul className="list-disc space-y-1 pl-5">
          <li>Format key: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">sk-mpruy-{'<random>'}</code></li>
          <li>Setiap key punya scope, rate limit (RPM), dan batas belanja sendiri.</li>
          <li>Key bisa di-revoke kapan saja dari dashboard; key yang di-revoke langsung tidak valid.</li>
        </ul>
      </Section>

      <Section id="chat" title="Chat Completions">
        <p>
          Endpoint utama: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">POST {api}/chat/completions</code>.
          Body dan response mengikuti spesifikasi OpenAI.
        </p>
        <CodeBlock filename="curl" code={chatCurl} />
        <p className="font-medium text-foreground">Parameter utama</p>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell><code>model</code></TableCell>
                <TableCell>string</TableCell>
                <TableCell>Nama model publik (lihat daftar Model).</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code>messages</code></TableCell>
                <TableCell>array</TableCell>
                <TableCell>Wajib. Objek <code>role</code> + <code>content</code>.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code>stream</code></TableCell>
                <TableCell>boolean</TableCell>
                <TableCell>Default <code>false</code>. Set <code>true</code> untuk SSE.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code>temperature</code></TableCell>
                <TableCell>number</TableCell>
                <TableCell>0–2.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code>max_tokens</code></TableCell>
                <TableCell>integer</TableCell>
                <TableCell>Batas token output.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="font-medium text-foreground">Contoh response</p>
        <CodeBlock filename="json" code={chatResponse} />
      </Section>

      <Section id="streaming" title="Streaming">
        <p>
          Set <code className="rounded bg-muted px-1.5 py-0.5 text-xs">stream: true</code> untuk menerima token
          secara bertahap lewat Server-Sent Events (SSE). Stream selalu diakhiri sentinel{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">data: [DONE]</code>.
        </p>
        <CodeBlock filename="bash · event stream" code={streamRaw} />
        <CodeBlock filename="node · fetch" code={streamNode} />
        <Note>
          Usage token pada stream bisa tidak tersedia di setiap chunk. Total biaya dihitung server-side saat
          stream selesai dan muncul di halaman Usage.
        </Note>
      </Section>

      <Section id="models" title="Models">
        <p>
          Daftar model: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GET {api}/models</code>. Gunakan
          nilai <code>id</code> sebagai parameter <code>model</code>.
        </p>
        <CodeBlock
          filename="curl"
          code={`curl ${api}/models \\
  -H "Authorization: Bearer $MPRUY_KEY"`}
        />
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model ID</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>Kapabilitas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => {
                const caps = (m.capabilities as Record<string, boolean>) ?? {};
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-foreground">
                      {m.publicName}
                      <div className="text-xs text-muted-foreground">{m.displayName}</div>
                    </TableCell>
                    <TableCell>{formatNumber(m.contextWindow)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(caps)
                          .filter(([, v]) => v)
                          .map(([k]) => (
                            <Badge key={k} variant="secondary" className="text-[10px]">
                              {k}
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {models.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Belum ada model aktif.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs">
          Akses model tergantung plan Anda. Model di luar plan akan ditolak dengan{' '}
          <code className="rounded bg-muted px-1.5 py-0.5">model_not_allowed</code>.
        </p>
      </Section>

      <Section id="embeddings" title="Embeddings">
        <p>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">POST {api}/embeddings</code> untuk menghasilkan
          vektor embedding dari teks.
        </p>
        <CodeBlock filename="curl" code={embedCurl} />
        <Note>
          Embeddings hanya tersedia untuk model yang mendukung kapabilitas embedding. Cek{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GET {api}/models</code> untuk model yang tersedia.
        </Note>
      </Section>

      <Section id="errors" title="Error">
        <p>Semua error memakai format konsisten berikut:</p>
        <CodeBlock filename="json" code={errorBody} />
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>HTTP</TableHead>
                <TableHead>code</TableHead>
                <TableHead>Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ['401', 'invalid_api_key', 'API key tidak valid / di-revoke.'],
                ['402', 'insufficient_balance', 'Saldo habis. Top-up dulu.'],
                ['403', 'model_not_allowed', 'Model tidak tersedia di plan Anda.'],
                ['404', 'model_not_found', 'Model tidak ada.'],
                ['429', 'rate_limit_exceeded', 'Melebihi batas request per menit.'],
                ['503', 'maintenance', 'Platform sedang maintenance.'],
              ].map(([http, code, desc]) => (
                <TableRow key={code}>
                  <TableCell><code>{http}</code></TableCell>
                  <TableCell><code>{code}</code></TableCell>
                  <TableCell>{desc}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section id="ratelimits" title="Rate Limit">
        <p>Setiap response menyertakan header rate limit:</p>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Header</TableHead>
                <TableHead>Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ['X-RateLimit-Limit', 'Jumlah request maksimum per menit.'],
                ['X-RateLimit-Remaining', 'Sisa request pada window berjalan.'],
                ['X-RateLimit-Reset', 'Unix timestamp reset window.'],
                ['Retry-After', 'Detik tunggu sebelum retry (saat 429).'],
              ].map(([h, d]) => (
                <TableRow key={h}>
                  <TableCell><code className="text-xs">{h}</code></TableCell>
                  <TableCell>{d}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Note variant="warn">
          Saat menerima 429, backoff eksponensial dengan menghormati header <code>Retry-After</code>.
        </Note>
      </Section>

      <Section id="sdks" title="SDK & Library">
        <p>OpenAI SDK resmi bekerja langsung — cukup set <code>baseURL</code>:</p>
        <CodeBlock filename="node · openai" code={nodeSdk} />
        <CodeBlock filename="python · openai" code={pythonSdk} />
        <Note>
          Library lain (LangChain, Vercel AI SDK, LlamaIndex) yang mendukung OpenAI-compatible endpoint juga
          bisa diarahkan ke <code>{api}</code>.
        </Note>
      </Section>

      <Section id="opencode-v2" title="OpenCode — V2">
        <p>
          <strong>OpenCode</strong> adalah AI coding agent di terminal. Mpruy AI dipakai sebagai{' '}
          <em>custom provider</em> yang OpenAI-compatible, jadi seluruh model Anda langsung tersedia hanya
          dengan menempel satu blok config.
        </p>
        <p>
          Bagian ini untuk <strong>OpenCode V2</strong> — format <code>providers</code> +{' '}
          <code>package</code> + <code>settings</code>. Untuk versi lama, lihat{' '}
          <a href="#opencode-v1" className="text-primary hover:underline">
            OpenCode V1
          </a>{' '}
          di bawah.
        </p>

        <p className="font-medium text-foreground">Prasyarat</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            OpenCode V2 terpasang (<code>opencode --version</code>).
          </li>
          <li>
            API key Mpruy: <code>sk-mpruy-...</code> dari halaman{' '}
            <Link href="/dashboard/keys" className="text-primary hover:underline">
              API Keys
            </Link>
            .
          </li>
          <li>
            Base URL: <code>{api}</code>.
          </li>
        </ul>

        <p className="font-medium text-foreground">1. Pilih lokasi config</p>
        <p>Config global berlaku untuk semua project; config project hanya untuk repo itu.</p>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Path</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium text-foreground">Global</TableCell>
                <TableCell>
                  <code className="text-xs">{OPENCODE_GLOBAL_CONFIG_PATH}</code>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Project</TableCell>
                <TableCell>
                  <code className="text-xs">opencode.jsonc</code> atau{' '}
                  <code className="text-xs">.opencode/opencode.jsonc</code> di root repo
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <CodeBlock
          filename="bash"
          code={`mkdir -p ~/.config/opencode
# lalu buat file opencode.jsonc di dalamnya`}
        />

        <p className="font-medium text-foreground">2. Tempel config</p>
        <CodeBlock filename={OPENCODE_GLOBAL_CONFIG_PATH} code={openCodeV2Config} />
        <Note>
          Ganti <code>sk-mpruy-YOUR_KEY</code> dengan API key asli Anda. Model default diambil dari{' '}
          <code>{defaultModel}</code> — ganti kapan saja lewat <code>/models</code>.
        </Note>
        <p>
          Alternatif lebih aman: simpan key sebagai environment variable, lalu pakai substitusi{' '}
          <code>{'{env:MPRUY_API_KEY}'}</code> agar key tidak ikut ter-commit.
        </p>
        <CodeBlock filename="shell · set sekali" code={openCodeEnv} />
        <CodeBlock filename={OPENCODE_GLOBAL_CONFIG_PATH} code={openCodeV2EnvConfig} />

        <p className="font-medium text-foreground">Capabilities, limit & variants</p>
        <p>
          Tiap entri model menyertakan tiga blok opsional yang membuat OpenCode tahu kemampuan model. Semuanya
          diisi otomatis dari kapabilitas model di Mpruy:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>capabilities</strong> (shape <a href="https://models.dev" className="text-primary hover:underline">models.dev</a> v2):
            <code>tools</code> (function calling), <code>input</code> (media diterima), dan <code>output</code>{' '}
            (media dihasilkan).
          </li>
          <li>
            <strong>limit</strong>: <code>context</code> dan <code>output</code> (token maksimum).
          </li>
          <li>
            <strong>variants</strong>: thinking level per model — <code>low</code>, <code>medium</code>,{' '}
            <code>high</code>, <code>max</code>.
          </li>
        </ul>
        <CodeBlock filename="contoh entri model (V2)" code={openCodeCapabilities} />
        <p>
          Model tanpa <code>tools</code> ditulis <code>&quot;tools&quot;: false</code> supaya OpenCode tidak
          menawarkan function calling yang akan gagal di upstream.
        </p>
        <p className="font-medium text-foreground">Memakai variant (thinking level)</p>
        <p>
          Pilih thinking level dengan menambahkan <code>#level</code> pada model. Di dalam TUI gunakan keybind{' '}
          <code>variant_cycle</code>.
        </p>
        <CodeBlock filename="bash" code={openCodeVariantRun} />
        <Note variant="warn">
          Thinking level hanya berpengaruh bila upstream mendukung parameternya (mis.{' '}
          <code>reasoning_effort</code>). Field yang tidak dikenali bisa ditolak dengan 400 — uji dulu via
          Playground sebelum dipakai luas.
        </Note>

        <p className="font-medium text-foreground">3. Jalankan</p>
        <CodeBlock filename="bash" code={openCodeRun} />

        <p className="font-medium text-foreground">Referensi field</p>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Nilai</TableHead>
                <TableHead>Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <code>providers.mpruy.name</code>
                </TableCell>
                <TableCell>
                  <code>Mpruy AI</code>
                </TableCell>
                <TableCell>Nama tampilan di UI.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>providers.mpruy.package</code>
                </TableCell>
                <TableCell>
                  <code>@opencode/ai/providers/openai-compatible</code>
                </TableCell>
                <TableCell>Runtime untuk API bergaya OpenAI.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>settings.baseURL</code>
                </TableCell>
                <TableCell>
                  <code>{api}</code>
                </TableCell>
                <TableCell>Endpoint OpenAI-compatible Mpruy.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>settings.apiKey</code>
                </TableCell>
                <TableCell>
                  <code>sk-mpruy-...</code>
                </TableCell>
                <TableCell>Kredensial, atau <code>{'{env:MPRUY_API_KEY}'}</code>.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>providers.mpruy.models</code>
                </TableCell>
                <TableCell>map</TableCell>
                <TableCell>Key = nama model publik, mis. <code>{defaultModel}</code>.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>models.*.capabilities</code>
                </TableCell>
                <TableCell>
                  <code>tools</code>, <code>input</code>, <code>output</code>
                </TableCell>
                <TableCell>Kemampuan model (shape models.dev v2).</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>models.*.limit</code>
                </TableCell>
                <TableCell>
                  <code>context</code>, <code>output</code>
                </TableCell>
                <TableCell>Batas token konteks dan output.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>models.*.variants</code>
                </TableCell>
                <TableCell>array of objects</TableCell>
                <TableCell>
                  Thinking level per model (<code>id</code> + <code>settings.reasoningEffort</code>). Dipakai
                  lewat <code>#id</code>.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <code>model</code>
                </TableCell>
                <TableCell>
                  <code>mpruy/{defaultModel}</code>
                </TableCell>
                <TableCell>Model default saat sesi dibuka.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <p className="font-medium text-foreground">Catatan</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Streaming SSE ditangani otomatis oleh OpenCode; Anda tidak perlu set <code>stream</code> manual.</li>
          <li>
            <strong>Tool calling</strong> (edit file, jalankan shell) hanya jalan pada model dengan kapabilitas{' '}
            <code>tools</code>. Model tanpa <code>tools</code> tetap bisa chat, tapi tidak agentic.
          </li>
          <li>
            <strong>Vision</strong> hanya untuk model dengan kapabilitas <code>vision</code> (lihat tabel Model).
          </li>
          <li>
            Biaya tiap request OpenCode masuk ke saldo Mpruy Anda dan terlihat di halaman{' '}
            <Link href="/dashboard/usage" className="text-primary hover:underline">
              Usage
            </Link>
            .
          </li>
        </ul>

        <p className="font-medium text-foreground">Troubleshooting</p>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gejala</TableHead>
                <TableHead>Penyebab & perbaikan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Model tidak muncul di <code>/models</code></TableCell>
                <TableCell>Config belum dibaca. Restart OpenCode, cek <code>$schema</code>, dan pastikan key model = nama publik.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code>Model unavailable: mpruy/...</code></TableCell>
                <TableCell>Model di luar plan Anda, atau key API key scope-nya dibatasi. Cek halaman Usage/Keys.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>401 <code>invalid_api_key</code></TableCell>
                <TableCell>Key salah/ter-revoke, atau env var belum di-export di shell yang menjalankan OpenCode.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>402 <code>insufficient_balance</code></TableCell>
                <TableCell>Saldo habis. Top-up di halaman Billing.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Tool call tidak jalan</TableCell>
                <TableCell>Model upstream tidak mendukung tools. Pilih model dengan kapabilitas <code>tools</code>.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <Note>
          Config siap tempel yang sudah menyesuaikan model Anda tersedia di{' '}
          <Link href="/dashboard/integration" className="text-primary hover:underline">
            Dashboard → Integration
          </Link>
          .
        </Note>
      </Section>

      <Section id="opencode-v1" title="OpenCode — V1">
        <p>
          Untuk <strong>OpenCode V1</strong>, atau V2 yang masih memakai config lama, gunakan bentuk{' '}
          <code>provider</code> (singular) + <code>npm</code> + <code>options</code>. Fungsinya sama: Mpruy
          sebagai provider OpenAI-compatible.
        </p>
        <p>
          OpenCode V2 tetap membaca config V1 selama tidak memakai field yang ditandai deprecated, jadi config
          jenis ini aman untuk kompatibilitas. Untuk instalasi baru, ikuti bagian{' '}
          <a href="#opencode-v2" className="text-primary hover:underline">
            OpenCode V2
          </a>
          .
        </p>

        <p className="font-medium text-foreground">Prasyarat</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            OpenCode terpasang (V1 atau V2). Cek versi: <code>opencode --version</code>.
          </li>
          <li>
            API key Mpruy (<code>sk-mpruy-...</code>) dan Base URL <code>{api}</code>.
          </li>
        </ul>

        <p className="font-medium text-foreground">1. Buat file config</p>
        <CodeBlock
          filename="bash"
          code={`mkdir -p ~/.config/opencode
# buat opencode.json (atau opencode.jsonc) di dalamnya`}
        />

        <p className="font-medium text-foreground">2. Tempel config</p>
        <CodeBlock filename={OPENCODE_GLOBAL_CONFIG_PATH} code={openCodeV1Config} />
        <Note>
          Ganti <code>sk-mpruy-YOUR_KEY</code>. Nama provider (<code>mpruy</code>) juga jadi prefix model:
          <code>mpruy/{defaultModel}</code>.
        </Note>
        <p>
          Bila ingin key dari environment variable, isi <code>options.apiKey</code> dengan{' '}
          <code>{'{env:MPRUY_API_KEY}'}</code> dan export variabelnya:
        </p>
        <CodeBlock filename="shell · set sekali" code={openCodeEnv} />

        <p className="font-medium text-foreground">Limit & variants (thinking level)</p>
        <p>
          V1 menyetel <code>limit</code> dan <code>variants</code> pada entri model. Berbeda dari V2,{' '}
          <code>variants</code> di V1 berupa objek dengan nama variant sebagai key, dan V1 tidak memakai field{' '}
          <code>capabilities</code>. Thinking level default: <code>low</code> → <code>max</code>.
        </p>
        <CodeBlock filename="contoh entri model (V1)" code={openCodeV1Variants} />
        <p>
          Pakai variant lewat suffix <code>#level</code>, mis.{' '}
          <code>mpruy/{defaultModel}#high</code>.
        </p>
        <Note variant="warn">
          Thinking level hanya berlaku bila upstream menerima parameternya. Field tak dikenal bisa ditolak 400.
        </Note>

        <p className="font-medium text-foreground">3. Jalankan</p>
        <CodeBlock filename="bash" code={openCodeRun} />

        <p className="font-medium text-foreground">Verifikasi koneksi</p>
        <CodeBlock filename="curl" code={openCodeModelsList} />

        <p className="font-medium text-foreground">Perbedaan V1 vs V2</p>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aspek</TableHead>
                <TableHead>V1</TableHead>
                <TableHead>V2</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium text-foreground">Key provider</TableCell>
                <TableCell><code>provider</code></TableCell>
                <TableCell><code>providers</code></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Runtime</TableCell>
                <TableCell><code>npm</code></TableCell>
                <TableCell><code>package</code></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Endpoint & key</TableCell>
                <TableCell><code>options.baseURL</code> / <code>options.apiKey</code></TableCell>
                <TableCell><code>settings.baseURL</code> / <code>settings.apiKey</code></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Env kredensial</TableCell>
                <TableCell>via <code>{'{env:...}'}</code> di options</TableCell>
                <TableCell>array <code>env</code> atau <code>{'{env:...}'}</code></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Model id override</TableCell>
                <TableCell><code>id</code></TableCell>
                <TableCell><code>modelID</code></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Capabilities</TableCell>
                <TableCell>tidak ada</TableCell>
                <TableCell>
                  <code>capabilities</code> (tools / input / output)
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Variants</TableCell>
                <TableCell>objek (key = nama variant)</TableCell>
                <TableCell>
                  array of objects (<code>id</code>)
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <p className="font-medium text-foreground">Troubleshooting</p>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gejala</TableHead>
                <TableHead>Perbaikan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Provider tidak dikenali</TableCell>
                <TableCell>Pastikan <code>npm</code> = <code>@ai-sdk/openai-compatible</code> dan JSON valid (tanpa trailing comma jika <code>.json</code>).</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Peringatan field deprecated (V2)</TableCell>
                <TableCell>Pindah ke bentuk V2 (<a href="#opencode-v2" className="text-primary hover:underline">lihat bagian V2</a>).</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>401 / 402 / 429</TableCell>
                <TableCell>Sama seperti V2: cek key, saldo, dan rate limit di halaman Error & Rate Limit.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}