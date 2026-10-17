'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink, KeyRound, Terminal } from 'lucide-react';
import { PageHeader } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from '@/components/code-block';
import {
  apiBase,
  buildOpenCodeV1,
  buildOpenCodeV2,
  DEFAULT_THINKING_LEVELS,
  OPENCODE_GLOBAL_CONFIG_PATH,
  type OpenCodeModel,
} from '@/lib/opencode-config';

const API_KEY_PLACEHOLDER = 'sk-mpruy-YOUR_KEY';

export function IntegrationClient({
  models,
  baseUrl,
}: {
  models: OpenCodeModel[];
  baseUrl: string;
}) {
  const [model, setModel] = React.useState(models[0]?.publicName ?? '');
  const [onlySelected, setOnlySelected] = React.useState(false);
  const [useEnv, setUseEnv] = React.useState(false);
  const [includeVariants, setIncludeVariants] = React.useState(true);

  const selectedModels = onlySelected && model ? models.filter((m) => m.publicName === model) : models;
  const selected = models.find((m) => m.publicName === model);

  const shared = {
    baseUrl,
    models: selectedModels,
    defaultModel: model || models[0]?.publicName || 'model',
    apiKey: API_KEY_PLACEHOLDER,
    useEnv,
    includeVariants,
  };

  const configV2 = buildOpenCodeV2(shared);
  const configV1 = buildOpenCodeV1(shared);
  const v1Base = apiBase(baseUrl);

  const envSnippet = `export MPRUY_API_KEY="${API_KEY_PLACEHOLDER}"`;

  return (
    <div>
      <PageHeader
        title="Integration"
        description="Generate config siap tempel untuk editor/agent favorit Anda. Salin, tempel, jalankan."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/docs">
            Dokumentasi <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </PageHeader>

      {/* Connection facts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Koneksi</CardTitle>
          <CardDescription>Dua nilai ini dipakai oleh semua integrasi.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Base URL</div>
            <code className="block break-all rounded-sm border border-hairline bg-muted/40 px-2 py-1.5 text-xs">
              {v1Base}
            </code>
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Auth header</div>
            <code className="block break-all rounded-sm border border-hairline bg-muted/40 px-2 py-1.5 text-xs">
              Authorization: Bearer {API_KEY_PLACEHOLDER}
            </code>
          </div>
        </CardContent>
      </Card>

      {models.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Belum ada model tersedia untuk plan Anda.</p>
              <p className="text-sm text-muted-foreground">
                Hubungi admin atau tingkatkan plan Anda untuk membuka model.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Options */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Model & opsi</CardTitle>
              <CardDescription>
                Config dibuat sesuai model yang Anda pilih. Ganti kapan saja lewat <code>/models</code> di OpenCode.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Model default</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Pilih model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.publicName} value={m.publicName}>
                        {m.displayName} · {m.publicName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-start justify-between gap-6">
                <div className="space-y-0.5">
                  <Label htmlFor="only-selected">Hanya model ini</Label>
                  <p className="text-xs text-muted-foreground">
                    Jika aktif, config hanya memuat model yang dipilih. Jika nonaktif, semua model plan Anda
                    didaftarkan agar bisa diganti lewat <code>/models</code>.
                  </p>
                </div>
                <Switch id="only-selected" checked={onlySelected} onCheckedChange={setOnlySelected} />
              </div>

              <div className="flex items-start justify-between gap-6">
                <div className="space-y-0.5">
                  <Label htmlFor="use-env">Baca key dari environment variable</Label>
                  <p className="text-xs text-muted-foreground">
                    Config memakai <code>{'{env:MPRUY_API_KEY}'}</code> dan tidak menyimpan key dalam file.
                    Disarankan bila file config ikut ter-commit.
                  </p>
                </div>
                <Switch id="use-env" checked={useEnv} onCheckedChange={setUseEnv} />
              </div>

              <div className="flex items-start justify-between gap-6">
                <div className="space-y-0.5">
                  <Label htmlFor="variants">Sertakan variants (thinking level)</Label>
                  <p className="text-xs text-muted-foreground">
                    Menambahkan <code>variants</code> per model berisi thinking level{' '}
                    <code>{DEFAULT_THINKING_LEVELS.join(' → ')}</code>, dipakai lewat <code>#variant</code>.{' '}
                    <code>capabilities</code> selalu disertakan.
                  </p>
                </div>
                <Switch id="variants" checked={includeVariants} onCheckedChange={setIncludeVariants} />
              </div>
            </CardContent>
          </Card>

          {/* Generated configs */}
          <Tabs defaultValue="v2" className="mt-6">
            <TabsList>
              <TabsTrigger value="v2">OpenCode V2</TabsTrigger>
              <TabsTrigger value="v1">OpenCode V1</TabsTrigger>
            </TabsList>

            <TabsContent value="v2">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">Rekomendasi</Badge>
                  <span>
                    Pakai <code>providers</code> + <code>package</code>. Baca{' '}
                    <Link href="/docs#opencode-v2" className="text-primary hover:underline">
                      panduan V2
                    </Link>
                    .
                  </span>
                </div>

                <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>
                    Buat (atau buka) file global <code>{OPENCODE_GLOBAL_CONFIG_PATH}</code>, atau{' '}
                    <code>opencode.jsonc</code> di root project.
                  </li>
                  <li>Tempel config berikut, ganti {API_KEY_PLACEHOLDER} dengan API key Anda.</li>
                  <li>
                    Jalankan <code>opencode</code>, lalu <code>/models</code> dan pilih{' '}
                    <code>mpruy/{model}</code>.
                  </li>
                </ol>

                <CodeBlock filename={OPENCODE_GLOBAL_CONFIG_PATH} code={configV2} />

                {useEnv && <CodeBlock filename="shell · set key sekali" code={envSnippet} />}

                <div className="rounded-sm border border-hairline bg-muted/40 p-4 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <Terminal className="h-4 w-4" /> Verifikasi
                  </p>
                  <p className="mt-1">
                    Di dalam OpenCode jalankan <code>/models</code>. Model akan muncul dengan prefix{' '}
                    <code>mpruy/</code>. Jika belum muncul, restart OpenCode agar config dibaca ulang.
                  </p>
                </div>

                <div className="rounded-sm border border-hairline bg-muted/40 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">capabilities</p>
                  <p className="mt-1">
                    Setiap model menuliskan <code>capabilities</code> agar OpenCode tahu kemampuannya:{' '}
                    <code>tools</code> (function calling), <code>input</code> (
                    <code>text</code>
                    {selected?.vision ? (
                      <>
                        {' '}
                        dan <code>image</code>
                      </>
                    ) : null}
                    ), dan <code>output</code> (<code>text</code>). Nilai ini berasal dari kapabilitas model di
                    Mpruy, jadi tidak perlu diubah manual.
                  </p>
                </div>

                {includeVariants && (
                  <div className="rounded-sm border border-hairline bg-muted/40 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">variants (thinking level)</p>
                    <p className="mb-2 mt-1">
                      Setiap model mendapat variant thinking level:{' '}
                      {DEFAULT_THINKING_LEVELS.map((lvl, i) => (
                        <React.Fragment key={lvl}>
                          {i > 0 ? ', ' : ''}
                          <code>{lvl}</code>
                        </React.Fragment>
                      ))}
                      . Pilih dengan menambahkan <code>#{'<level>'}</code> pada model:
                    </p>
                    <CodeBlock
                      filename="bash · pakai variant"
                      code={`opencode run --model mpruy/${model}#high "Refactor fungsi ini dan jelaskan."`}
                    />
                    <p className="mt-2">
                      Di dalam TUI, gabungkan dengan keybind <code>variant_cycle</code> untuk berpindah thinking
                      level tanpa mengedit config.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="v1">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">Legacy</Badge>
                  <span>
                    Pakai <code>provider</code> + <code>npm</code>. Untuk OpenCode V1, atau V2 dengan config lama.
                    Baca{' '}
                    <Link href="/docs#opencode-v1" className="text-primary hover:underline">
                      panduan V1
                    </Link>
                    .
                  </span>
                </div>

                <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>
                    Buat (atau buka) file global <code>{OPENCODE_GLOBAL_CONFIG_PATH}</code>, atau{' '}
                    <code>opencode.json</code> di root project.
                  </li>
                  <li>Tempel config berikut, ganti {API_KEY_PLACEHOLDER} dengan API key Anda.</li>
                  <li>
                    Jalankan <code>opencode</code>, lalu <code>/models</code> dan pilih{' '}
                    <code>mpruy/{model}</code>.
                  </li>
                </ol>

                <CodeBlock filename={OPENCODE_GLOBAL_CONFIG_PATH} code={configV1} />

                {useEnv && <CodeBlock filename="shell · set key sekali" code={envSnippet} />}

                <div className="rounded-sm border border-hairline bg-muted/40 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Catatan V1</p>
                  <p className="mt-1">
                    V1 tidak punya field <code>capabilities</code> (itu field V2 dengan shape models.dev). V1 tetap
                    menyetel <code>limit</code> dan <code>variants</code> — namun bentuk <code>variants</code> berbeda:
                    objek dengan nama variant sebagai key, bukan array. Pakai <code>#variant</code> untuk memilihnya.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Next steps */}
          <Card className="mt-6">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Belum punya API key?</p>
                <p className="text-xs text-muted-foreground">
                  Buat key di halaman API Keys. Key hanya ditampilkan sekali.
                </p>
              </div>
              <Button asChild>
                <Link href="/dashboard/keys">
                  <KeyRound className="h-4 w-4" /> API Keys <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}