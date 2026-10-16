'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Illustrative dashboard preview. Numbers are static samples and are clearly
 * labelled as such — this is not live backend data.
 */

const DAYS = ['01', '03', '05', '07', '09', '11', '13', '15', '17', '19', '21', '23', '25', '27'];

// request volume per day (sample)
const VOLUME = [38, 52, 44, 61, 73, 58, 84, 96, 71, 88, 104, 92, 118, 131];
// token consumption per day in thousands (sample)
const TOKENS = [420, 610, 520, 700, 880, 640, 1020, 1180, 820, 1040, 1260, 1080, 1420, 1580];
const PROVIDERS = [
  { name: 'OpenAI', share: 46 },
  { name: 'Anthropic', share: 27 },
  { name: 'Google', share: 18 },
  { name: 'Meta', share: 9 },
];
const STATUS = [
  { label: '200', count: '128,402', tone: 'ok' as const },
  { label: '429', count: '1,204', tone: 'warn' as const },
  { label: '5xx', count: '38', tone: 'err' as const },
];

function LineChart() {
  const w = 520;
  const h = 120;
  const max = Math.max(...VOLUME);
  const pts = VOLUME.map((v, i) => {
    const x = (i / (VOLUME.length - 1)) * w;
    const y = h - (v / max) * (h - 12) - 6;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
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
      {pts.filter((_, i) => i % 3 === 0).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.4" fill="white" stroke="hsl(var(--electric))" strokeWidth="1.4" />
      ))}
    </svg>
  );
}

function Bars() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 120);
    return () => clearTimeout(t);
  }, []);
  const max = Math.max(...TOKENS);
  return (
    <div className="flex h-28 items-end gap-[3px]" aria-hidden="true">
      {TOKENS.map((v, i) => (
        <span
          key={i}
          className={cn(
            'flex-1 rounded-t-[1px] bg-electric/80 transition-[height] duration-700 ease-out',
            i === TOKENS.length - 1 && 'bg-electric',
          )}
          style={{ height: on ? `${(v / max) * 100}%` : '2%', transitionDelay: `${i * 22}ms` }}
        />
      ))}
    </div>
  );
}

export function UsagePreview() {
  const totalVolume = VOLUME.reduce((a, b) => a + b, 0);
  const totalTokens = TOKENS.reduce((a, b) => a + b, 0) * 1000;

  return (
    <div className="overflow-hidden rounded-sm border border-hairline bg-card">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <span className="tech-label">usage.overview</span>
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          sample data
        </span>
      </div>

      <div className="grid gap-px bg-hairline sm:grid-cols-3">
        {[
          { k: 'Requests', v: totalVolume.toLocaleString('en-US'), s: '14 hari' },
          { k: 'Tokens', v: `${(totalTokens / 1_000_000).toFixed(1)}M`, s: 'input + output' },
          { k: 'Est. cost', v: 'Rp3.418.000', s: 'setelah markup' },
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
          <LineChart />
          <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
            {DAYS.filter((_, i) => i % 3 === 0).map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>

        <div className="bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="tech-label">provider distribution</span>
          </div>
          <ul className="space-y-2.5">
            {PROVIDERS.map((p) => (
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
        </div>
      </div>

      <div className="grid gap-px bg-hairline lg:grid-cols-[1fr_1.6fr]">
        <div className="bg-card p-4">
          <span className="tech-label">response status</span>
          <ul className="mt-3 space-y-2">
            {STATUS.map((s) => (
              <li key={s.label} className="flex items-center justify-between font-mono text-[11px]">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      s.tone === 'ok' ? 'bg-success' : s.tone === 'warn' ? 'bg-warning' : 'bg-destructive',
                    )}
                  />
                  <span className="text-foreground">{s.label}</span>
                </span>
                <span className="tabular text-muted-foreground">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="tech-label">token consumption</span>
            <span className="font-mono text-[10px] text-muted-foreground">ribuan / hari</span>
          </div>
          <Bars />
        </div>
      </div>

      <div className="border-t border-hairline px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          contoh tampilan dashboard — metrik ilustratif, bukan data akun nyata
        </p>
      </div>
    </div>
  );
}