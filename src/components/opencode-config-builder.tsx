'use client';

import * as React from 'react';
import { Check, Copy, ListChecks, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CodeBlock } from '@/components/code-block';
import { JsonTree } from '@/components/json-tree';
import {
  buildOpenCodeV1Object,
  buildOpenCodeV2Object,
  OPENCODE_GLOBAL_CONFIG_PATH,
  type OpenCodeModel,
} from '@/lib/opencode-config';
import { cn } from '@/lib/utils';

const API_KEY_PLACEHOLDER = 'sk-mpruy-YOUR_KEY';

type ConfigVersion = 'v2' | 'v1';
type ConfigView = 'tree' | 'raw';

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center rounded-sm border border-hairline bg-background p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'rounded-sm px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors',
            value === option.value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Generator config OpenCode interaktif: user mencentang model yang ingin
 * dimasukkan, lalu config dirender sebagai JSON tree yang bisa dibuka/tutup
 * per object (mirip folding di VS Code).
 */
export function OpenCodeConfigBuilder({
  baseUrl,
  models,
}: {
  baseUrl: string;
  models: OpenCodeModel[];
}) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState('');
  const [defaultModel, setDefaultModel] = React.useState('');
  const [useEnv, setUseEnv] = React.useState(false);
  const [includeVariants, setIncludeVariants] = React.useState(true);
  const [version, setVersion] = React.useState<ConfigVersion>('v2');
  const [view, setView] = React.useState<ConfigView>('tree');
  const [copied, setCopied] = React.useState(false);

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const selectedModels = React.useMemo(
    () => models.filter((model) => selectedSet.has(model.publicName)),
    [models, selectedSet],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (model) =>
        model.publicName.toLowerCase().includes(q) ||
        model.displayName.toLowerCase().includes(q),
    );
  }, [models, query]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((model) => selectedSet.has(model.publicName));

  const effectiveDefault = selectedSet.has(defaultModel)
    ? defaultModel
    : (selectedModels[0]?.publicName ?? '');

  const configObject = React.useMemo(() => {
    if (selectedModels.length === 0) return null;
    const args = {
      baseUrl,
      models: selectedModels,
      defaultModel: effectiveDefault || selectedModels[0].publicName,
      apiKey: API_KEY_PLACEHOLDER,
      useEnv,
      includeVariants,
      // Setup di dokumentasi tidak menampilkan limit context.
      includeLimit: false,
    };
    return version === 'v2' ? buildOpenCodeV2Object(args) : buildOpenCodeV1Object(args);
  }, [baseUrl, selectedModels, effectiveDefault, useEnv, includeVariants, version]);

  const rawConfig = React.useMemo(
    () => (configObject ? JSON.stringify(configObject, null, 2) : ''),
    [configObject],
  );

  function toggleModel(publicName: string) {
    setSelected((prev) =>
      prev.includes(publicName)
        ? prev.filter((name) => name !== publicName)
        : [...prev, publicName],
    );
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      const visible = new Set(filtered.map((model) => model.publicName));
      setSelected((prev) => prev.filter((name) => !visible.has(name)));
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const model of filtered) next.add(model.publicName);
        return Array.from(next);
      });
    }
  }

  function copyConfig() {
    if (!rawConfig) return;
    navigator.clipboard.writeText(rawConfig);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      {/* Model picker */}
      <div className="overflow-hidden rounded-sm border border-hairline bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-muted/30 px-4 py-2.5">
          <div>
            <p className="font-medium text-foreground">Pilih model</p>
            <p className="text-xs text-muted-foreground">
              Hanya model yang dicentang yang dimasukkan ke config.
            </p>
          </div>
          <Badge variant={selectedModels.length ? 'success' : 'secondary'}>
            {selectedModels.length} / {models.length} dipilih
          </Badge>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari model…"
                aria-label="Cari model"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={toggleAllFiltered}>
                {allFilteredSelected ? 'Batalkan pilihan' : 'Pilih semua'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelected([])}
                disabled={selected.length === 0}
              >
                Kosongkan
              </Button>
            </div>
          </div>

          <div className="scrollbar-thin max-h-60 overflow-auto rounded-sm border border-hairline">
            {filtered.map((model) => {
              const checked = selectedSet.has(model.publicName);
              return (
                <label
                  key={model.publicName}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 border-b border-hairline px-3 py-2 transition-colors last:border-b-0',
                    checked ? 'bg-accent/40' : 'hover:bg-muted/40',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModel(model.publicName)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--electric))]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-foreground">{model.displayName}</span>
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {model.publicName}
                      </code>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                      {model.tools && <Badge variant="secondary">tools</Badge>}
                      {model.vision && <Badge variant="secondary">vision</Badge>}
                    </div>
                  </div>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                Tidak ada model yang cocok dengan &quot;{query}&quot;.
              </div>
            )}
          </div>

          <div className="grid gap-3 border-t border-hairline pt-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="opencode-default-model" className="text-xs text-muted-foreground">
                Model default
              </Label>
              <Select
                value={effectiveDefault}
                onValueChange={setDefaultModel}
                disabled={selectedModels.length === 0}
              >
                <SelectTrigger id="opencode-default-model" className="h-8 text-xs">
                  <SelectValue placeholder="Pilih model dulu" />
                </SelectTrigger>
                <SelectContent>
                  {selectedModels.map((model) => (
                    <SelectItem key={model.publicName} value={model.publicName}>
                      {model.publicName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="opencode-use-env" className="text-xs font-normal text-muted-foreground">
                  Baca key dari <code className="rounded bg-muted px-1 py-0.5">{'{env:MPRUY_API_KEY}'}</code>
                </Label>
                <Switch id="opencode-use-env" checked={useEnv} onCheckedChange={setUseEnv} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label
                  htmlFor="opencode-variants"
                  className="text-xs font-normal text-muted-foreground"
                >
                  Sertakan variants (thinking level)
                </Label>
                <Switch
                  id="opencode-variants"
                  checked={includeVariants}
                  onCheckedChange={setIncludeVariants}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Generated config */}
      <div className="overflow-hidden rounded-sm border border-hairline bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {OPENCODE_GLOBAL_CONFIG_PATH}
            </span>
            <Badge variant="outline">{version}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Segmented
              label="Versi config"
              value={version}
              onChange={setVersion}
              options={[
                { value: 'v2', label: 'V2' },
                { value: 'v1', label: 'V1' },
              ]}
            />
            <Segmented
              label="Tampilan config"
              value={view}
              onChange={setView}
              options={[
                { value: 'tree', label: 'Pohon' },
                { value: 'raw', label: 'JSON' },
              ]}
            />
            <button
              type="button"
              onClick={copyConfig}
              disabled={!rawConfig}
              className="flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Tersalin' : 'Copy'}
            </button>
          </div>
        </div>

        {configObject && view === 'tree' ? (
          <JsonTree data={configObject} defaultExpandDepth={4} maxHeight={440} className="rounded-none border-0" />
        ) : null}

        {configObject && view === 'raw' ? (
          <pre
            tabIndex={0}
            style={{ maxHeight: 440 }}
            className="scrollbar-thin overflow-auto overscroll-contain p-4 font-mono text-xs leading-relaxed"
          >
            <code>{rawConfig}</code>
          </pre>
        ) : null}

        {!configObject ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <ListChecks className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Belum ada model dipilih</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Centang minimal satu model di atas. Config akan dibuat otomatis hanya dari model yang
              Anda pilih.
            </p>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {useEnv ? (
          <>
            Config memakai <code className="rounded bg-muted px-1 py-0.5">{'{env:MPRUY_API_KEY}'}</code>.
            Export key sekali di shell: <code className="rounded bg-muted px-1 py-0.5">export MPRUY_API_KEY=&quot;sk-mpruy-...&quot;</code>.
          </>
        ) : (
          <>
            Ganti <code className="rounded bg-muted px-1 py-0.5">{API_KEY_PLACEHOLDER}</code> dengan API
            key asli Anda sebelum menyimpan file.
          </>
        )}{' '}
        Model default:{' '}
        <code className="rounded bg-muted px-1 py-0.5">
          {effectiveDefault ? `mpruy/${effectiveDefault}` : '—'}
        </code>
        .
      </p>
    </div>
  );
}
