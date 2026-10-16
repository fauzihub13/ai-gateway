'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '../use-reduced-motion';

const PATH = 'M40,120 L150,120 L174,96 L320,96 L344,120 L500,120 L524,96 L680,96';

const STATIONS = [
  {
    id: 'auth',
    x: 90,
    y: 120,
    title: 'auth',
    detail:
      'Verifikasi Authorization: Bearer sk-mpruy-… . Key di-hash lalu dicocokkan — plaintext tidak pernah disimpan.',
  },
  {
    id: 'limit',
    x: 162,
    y: 108,
    title: 'rate limit',
    detail: 'Sliding window per key (RPM) plus pengecekan kuota token bulanan milik plan.',
  },
  {
    id: 'resolve',
    x: 250,
    y: 96,
    title: 'resolve model',
    detail: 'Nama model publik dipetakan ke target internal. Model di luar akses plan ditolak dengan 403.',
  },
  {
    id: 'route',
    x: 390,
    y: 120,
    title: 'route',
    detail: 'Request diteruskan ke provider melalui gateway internal, dengan stream selalu dikirim eksplisit.',
  },
  {
    id: 'stream',
    x: 512,
    y: 108,
    title: 'stream',
    detail: 'Respons SSE dinormalisasi ke spec OpenAI. Sentinel [DONE] dijamin meski upstream tidak mengirimnya.',
  },
  {
    id: 'settle',
    x: 620,
    y: 96,
    title: 'settle usage',
    detail: 'Usage dihitung, saldo dipotong secara atomik, dan UsageLog dicatat idempotent.',
  },
];

/**
 * Lifecycle request digambar seperti peta transit: jalur dengan belokan 45°,
 * stasiun, dan paket yang bergerak. Metafora berbeda dari node graph biasa.
 */
export function LifecycleMap({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  const current = STATIONS.find((s) => s.id === active) ?? null;

  return (
    <div className={cn('relative', className)}>
      <svg viewBox="0 0 720 200" className="h-auto w-full" role="img" aria-label="Peta lifecycle request melalui gateway">
        {/* baseline grid */}
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={i} x1={40 + i * 91} y1="8" x2={40 + i * 91} y2="192" stroke="hsl(var(--hairline))" strokeOpacity="0.5" />
        ))}

        {/* route */}
        <path d={PATH} fill="none" stroke="hsl(var(--electric))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path
          d={PATH}
          fill="none"
          stroke="hsl(var(--electric-soft))"
          strokeWidth="1"
          strokeDasharray="2 10"
          className={reduced ? undefined : 'animate-dash-slow'}
          strokeOpacity="0.7"
        />

        {/* terminal markers */}
        <text x="40" y="150" textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="8.5">
          client
        </text>
        <circle cx="40" cy="120" r="3.5" fill="hsl(var(--electric))" />
        <circle cx="684" cy="96" r="3.5" fill="none" stroke="hsl(var(--electric))" strokeWidth="1.4" />

        {STATIONS.map((s, i) => {
          const on = active === s.id;
          return (
            <g
              key={s.id}
              onMouseEnter={() => setActive(s.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.id)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              role="button"
              aria-label={`Tahap ${s.title}`}
              className="cursor-pointer outline-none"
            >
              <circle cx={s.x} cy={s.y} r={on ? 11 : 9} fill="white" stroke={on ? 'hsl(var(--electric))' : 'hsl(var(--hairline))'} strokeWidth={on ? 1.6 : 1.1} />
              <circle cx={s.x} cy={s.y} r="3.5" fill={on ? 'hsl(var(--electric))' : 'hsl(var(--electric-soft))'} />
              <text
                x={s.x}
                y={s.y - 15}
                textAnchor="middle"
                className={cn('font-mono uppercase', on ? 'fill-electric' : 'fill-muted-foreground')}
                fontSize="8.5"
                letterSpacing="0.5"
              >
                {s.title}
              </text>
              <text x={s.x} y={s.y + 22} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="7.5">
                {String(i + 1).padStart(2, '0')}
              </text>
            </g>
          );
        })}

        {/* travelling request packet */}
        {!reduced && (
          <circle r="4" fill="hsl(var(--electric))" stroke="white" strokeWidth="1.2">
            <animateMotion dur="5s" repeatCount="indefinite" path={PATH} />
          </circle>
        )}
      </svg>

      <div className="mt-3 min-h-[64px] rounded-sm border border-hairline bg-background px-4 py-3">
        {current ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-electric">{current.title}</p>
            <p className="reading mt-1 text-[14px]">{current.detail}</p>
          </>
        ) : (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            hover / fokus stasiun untuk detail tahap
          </p>
        )}
      </div>
    </div>
  );
}