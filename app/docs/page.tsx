import Link from 'next/link';
import { ArrowRight, Info, TriangleAlert } from 'lucide-react';
import { db } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CodeBlock } from '@/components/code-block';
import { formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-hairline pt-10 first:border-t-0 first:pt-0">
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
    "model": "gpt-4o",
    "messages": [
      { "role": "user", "content": "Halo, perkenalkan dirimu singkat." }
    ],
    "stream": false
  }'`;

  const chatResponse = `{
  "id": "chatcmpl_...",
  "object": "chat.completion",
  "created": 1792135393,
  "model": "gpt-4o",
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
  model: "gpt-4o",
  messages: [{ role: "user", content: "Halo!" }],
});

console.log(res.choices[0].message.content);`;

  const pythonSdk = `from openai import OpenAI

client = OpenAI(
    api_key="sk-mpruy-...",
    base_url="${api}",
)

res = client.chat.completions.create(
    model="gpt-4o",
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
    model: "gpt-4o",
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

  const streamRaw = `data: {"id":"chatcmpl_...","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"Ha"}}]}

data: {"id":"chatcmpl_...","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"lo!"}}]}

data: [DONE]`;

  const embedCurl = `curl ${api}/embeddings \\
  -H "Authorization: Bearer $MPRUY_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
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
            <strong>Top-up saldo</strong> via halaman Billing (Midtrans). Request akan ditolak jika saldo 0.
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
    </div>
  );
}