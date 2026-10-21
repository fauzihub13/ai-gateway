'use client';

import { useMemo, useState } from 'react';
import { Search, Check, Copy } from 'lucide-react';
import { cn, formatIdr, formatNumber } from '@/lib/utils';

export interface CatalogModel {
  publicName: string;
  displayName: string;
  contextWindow: number;
  priceInPer1MIdr: number;
  priceOutPer1MIdr: number;
  capabilities: {
    stream?: boolean;
    vision?: boolean;
    tools?: boolean;
    jsonMode?: boolean;
    embedding?: boolean;
  };
}

const CAP_KEYS = ['stream', 'vision', 'tools', 'jsonMode'] as const;
type CapKey = (typeof CAP_KEYS)[number];

const CAP_LABEL: Record<CapKey, string> = {
  stream: 'stream',
  vision: 'vision',
  tools: 'tools',
  jsonMode: 'json',
};

export function ModelCatalog({ models }: { models: CatalogModel[] }) {
  const [q, setQ] = useState('');
  const [caps, setCaps] = useState<CapKey[]>([]);
  const [copied, setCopied] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return models.filter((m) => {
      const matchQ =
        !needle || m.publicName.toLowerCase().includes(needle) || m.displayName.toLowerCase().includes(needle);
      const matchCaps = caps.every((c) => Boolean(m.capabilities[c]));
      return matchQ && matchCaps;
    });
  }, [models, q, caps]);

  function toggleCap(c: CapKey) {
    setCaps((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function copyName(name: string) {
    navigator.clipboard.writeText(name);
    setCopied(name);
    setTimeout(() => setCopied(''), 1400);
  }

  return (
    <div className="overflow-hidden rounded-sm border border-hairline bg-card">
      <div className="flex flex-col gap-3 border-b border-hairline p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari model…"
            className="h-9 w-full rounded-sm border border-hairline bg-background pl-9 pr-3 text-sm outline-none transition-colors focus-visible:border-electric"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CAP_KEYS.map((c) => {
            const on = caps.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCap(c)}
                className={cn(
                  'rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors',
                  on
                    ? 'border-electric bg-electric-pale text-accent-foreground'
                    : 'border-hairline text-muted-foreground hover:text-foreground',
                )}
              >
                {CAP_LABEL[c]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="scrollbar-thin hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="px-4 py-3 tech-label font-normal">Model</th>
              <th className="px-4 py-3 tech-label font-normal">Context</th>
              <th className="px-4 py-3 tech-label font-normal">Capabilities</th>
              <th className="px-4 py-3 tech-label font-normal text-right">In / 1M</th>
              <th className="px-4 py-3 tech-label font-normal text-right">Out / 1M</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.publicName} className="group border-b border-hairline last:border-b-0 hover:bg-muted/50">
                <td className="px-4 py-3">
                  <div className="font-mono text-[12.5px] font-medium text-foreground">{m.publicName}</div>
                  <div className="text-xs text-muted-foreground">{m.displayName}</div>
                </td>
                <td className="tabular px-4 py-3 font-mono text-xs text-muted-foreground">
                  {formatNumber(m.contextWindow)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {CAP_KEYS.filter((c) => m.capabilities[c]).map((c) => (
                      <span
                        key={c}
                        className="rounded-sm border border-hairline px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground"
                      >
                        {CAP_LABEL[c]}
                      </span>
                    ))}
                    {CAP_KEYS.every((c) => !m.capabilities[c]) && (
                      <span className="font-mono text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                <td className="tabular px-4 py-3 text-right font-mono text-xs">{formatIdr(m.priceInPer1MIdr)}</td>
                <td className="tabular px-4 py-3 text-right font-mono text-xs">{formatIdr(m.priceOutPer1MIdr)}</td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => copyName(m.publicName)}
                    aria-label={`Copy nama model ${m.publicName}`}
                    className="grid h-7 w-7 place-items-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    {copied === m.publicName ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list (the wide table is desktop-only). */}
      <ul className="divide-y divide-hairline md:hidden">
        {filtered.map((m) => (
          <li key={m.publicName} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-[12.5px] font-medium text-foreground">{m.publicName}</div>
                <div className="truncate text-xs text-muted-foreground">{m.displayName}</div>
              </div>
              <button
                type="button"
                onClick={() => copyName(m.publicName)}
                aria-label={`Copy nama model ${m.publicName}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-sm border border-hairline text-muted-foreground transition-colors hover:border-electric hover:text-electric"
              >
                {copied === m.publicName ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {CAP_KEYS.filter((c) => m.capabilities[c]).map((c) => (
                <span
                  key={c}
                  className="rounded-sm border border-hairline px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {CAP_LABEL[c]}
                </span>
              ))}
              {CAP_KEYS.every((c) => !m.capabilities[c]) && (
                <span className="font-mono text-[10px] text-muted-foreground">—</span>
              )}
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-xs">
              <div>
                <dt className="tech-label text-[9px]">Context</dt>
                <dd className="tabular mt-0.5 font-mono text-foreground">{formatNumber(m.contextWindow)}</dd>
              </div>
              <div>
                <dt className="tech-label text-[9px]">In / 1M</dt>
                <dd className="tabular mt-0.5 font-mono text-foreground">{formatIdr(m.priceInPer1MIdr)}</dd>
              </div>
              <div>
                <dt className="tech-label text-[9px]">Out / 1K</dt>
                <dd className="tabular mt-0.5 font-mono text-foreground">{formatIdr(m.priceOutPer1MIdr)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <div className="px-4 py-12 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">no models matched</p>
          <p className="mt-1 text-sm text-muted-foreground">Ubah kata kunci atau hapus filter capability.</p>
        </div>
      )}

      <div className="border-t border-hairline px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          harga bersifat indikatif (base, sebelum markup plan) · provider upstream diabstraksi oleh gateway
        </p>
      </div>
    </div>
  );
}