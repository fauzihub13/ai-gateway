'use client';

import { useEffect, useState } from 'react';
import { cn, formatIdr, formatNumber } from '@/lib/utils';

/**
 * Observability preview di landing. Semua angka berasal dari agregat
 * platform-wide (14 hari terakhir) yang di-query di server component —
 * tidak ada data per-user, nama key, atau provider internal di sini.
 */

export interface UsagePreviewData {
  days: number;
  requests: number;
  tokens: number;
  cost: number;
  volume: Array<{ key: string; requests: number; tokens: number }>;
  byModel: Array<{ name: string; share: number }>;
  status: Array<{ label: string; count: number }>;
}

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'err'> = {
  COMPLETED: 'ok',
  PARTIAL: 'warn',
  ERROR: 'err',
  REJECTED: 'warn',
};

function shortDate(key: string): string {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

function LineChart({ volume }: { volume: UsagePreviewData['volume'] }) {
  const w = 520;
  const h = 120;
  const values = volume.map((v) => v.requests);
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [(i * step) as number, h - (v / max) * (h - 12) - 6] as const);
  const line = pts.length
    ? pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    : `M0,${h}`;
  const area = `${line} L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-28 w-full" aria-hidden="true">
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--electric))" stopOpacity="0.18" />
          <stop offset="100%" stopColor="hsl(var(--electric))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" y1={h * f} x2={w} y2={h * f} stroke="hsl(var(--hairline))" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#area-fill)" />
      <path d={line} fill="none" stroke="hsl(var(--electric))" strokeWidth="1.75" strokeLinejoin="round" />
      {pts.map(([x, y], i) =>
        i % Math.max(1, Math.ceil(pts.length / 5)) === 0 ? (
          <circle key={i} cx={x} cy={y} r="2.4" fill="white" stroke="hsl(var(--electric))" strokeWidth="1.4" />
        ) : null,
      )}
    </svg>
  );
}

function Bars({ volume }: { volume: UsagePreviewData['volume'] }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 120);
    return () => clearTimeout(t);
  }, []);
  const values = volume.map((v) => v.tokens);
  const max = Math.max(1, ...values);

  return (
    <div className="flex h-28 items-end gap-[3px]">
      {volume.map((v, i) => (
        <span
          key={v.key}
          title={`${shortDate(v.key)} · ${formatNumber(v.tokens)} token`}
          className={cn(
            'flex-1 rounded-t-[1px] bg-electric/80 transition-[height] duration-700 ease-out',
            i === volume.length - 1 && 'bg-electric',
          )}
          style={{
            height: on ? `${Math.max(v.tokens > 0 ? 3 : 1, (v.tokens / max) * 100)}%` : '2%',
            transitionDelay: `${i * 22}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function UsagePreview({ data }: { data: UsagePreviewData }) {
  const hasData = data.requests > 0;
  const dates = data.volume.map((v) => shortDate(v.key));

  return (
    <div className="overflow-hidden rounded-sm border border-hairline bg-card">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <span className="tech-label">usage.overview</span>
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span
            className={cn('h-1.5 w-1.5 rounded-full', hasData ? 'bg-electric' : 'bg-muted-foreground')}
          />
          {hasData ? 'data live' : 'belum ada data'}
        </span>
      </div>

      <div className="grid gap-px bg-hairline sm:grid-cols-3">
        {[
          { k: 'Requests', v: formatNumber(data.requests), s: `${data.days} hari` },
          { k: 'Tokens', v: formatNumber(data.tokens), s: 'input + output' },
          { k: 'Cost', v: formatIdr(data.cost), s: 'setelah markup' },
        ].map((m) => (
          <div key={m.k} className="bg-card px-4 py-4">
            <p className="tech-label">{m.k}</p>
            <p className="tabular mt-1.5 font-display text-2xl tracking-tight text-foreground">{m.v}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{m.s}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-px bg-hairline lg:grid-cols-[1.6fr_1fr]">
        <div className="bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="tech-label">request volume</span>
            <span className="font-mono text-[10px] text-muted-foreground">per hari</span>
          </div>
          <LineChart volume={data.volume} />
          <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
            {dates
              .filter((_, i) => i % 3 === 0 || i === dates.length - 1)
              .map((d, i) => (
                <span key={`${d}-${i}`}>{d}</span>
              ))}
          </div>
        </div>

        <div className="bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="tech-label">distribusi model</span>
          </div>
          {data.byModel.length > 0 ? (
            <ul className="space-y-2.5">
              {data.byModel.map((p) => (
                <li key={p.name}>
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-foreground">{p.name}</span>
                    <span className="tabular text-muted-foreground">{p.share}%</span>
                  </div>
                  <div className="mt-1 h-[3px] w-full bg-muted">
                    <div className="h-full bg-electric" style={{ width: `${p.share}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Belum ada request.</p>
          )}
        </div>
      </div>

      <div className="grid gap-px bg-hairline lg:grid-cols-[1fr_1.6fr]">
        <div className="bg-card p-4">
          <span className="tech-label">response status</span>
          <ul className="mt-3 space-y-2">
            {data.status.length > 0 ? (
              data.status.map((s) => (
                <li key={s.label} className="flex items-center justify-between font-mono text-[11px]">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        STATUS_TONE[s.label] === 'ok'
                          ? 'bg-success'
                          : STATUS_TONE[s.label] === 'warn'
                            ? 'bg-warning'
                            : 'bg-destructive',
                      )}
                    />
                    <span className="text-foreground">{s.label}</span>
                  </span>
                  <span className="tabular text-muted-foreground">{formatNumber(s.count)}</span>
                </li>
              ))
            ) : (
              <li className="font-mono text-[11px] text-muted-foreground">Belum ada request.</li>
            )}
          </ul>
        </div>
        <div className="bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="tech-label">token consumption</span>
            <span className="font-mono text-[10px] text-muted-foreground">request / hari</span>
          </div>
          <Bars volume={data.volume} />
        </div>
      </div>

      <div className="border-t border-hairline px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          agregat platform {data.days} hari terakhir — tanpa data akun individual
        </p>
      </div>
    </div>
  );
}
