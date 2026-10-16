'use client';

import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '../use-reduced-motion';

type Phase = 'primary' | 'fail' | 'secondary' | 'ok';

const GATEWAY = { x: 305, y: 120 };
const PROVIDERS = [
  { id: 'primary', label: 'primary', note: 'attempt 1', x: 520, y: 56 },
  { id: 'fallback-1', label: 'fallback-1', note: 'attempt 2', x: 520, y: 120 },
  { id: 'fallback-2', label: 'fallback-2', note: 'attempt 3', x: 520, y: 184 },
];

const PATHS: Record<string, string> = {
  primary: `M${GATEWAY.x},${GATEWAY.y} L520,56`,
  'fallback-1': `M${GATEWAY.x},${GATEWAY.y} L520,120`,
  'fallback-2': `M${GATEWAY.x},${GATEWAY.y} L520,184`,
};

const SEQ: { phase: Phase; ms: number }[] = [
  { phase: 'primary', ms: 900 },
  { phase: 'fail', ms: 700 },
  { phase: 'secondary', ms: 900 },
  { phase: 'ok', ms: 1400 },
];

/**
 * Topologi failover: request gagal di provider utama, lalu dicoba ulang ke
 * fallback. Metafora keandalan — bukan penggambaran "satu gateway ke banyak
 * provider" seperti hero.
 */
export function FailoverTopology({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(reduced ? 3 : 0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (reduced || !auto) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % SEQ.length), SEQ[step].ms);
    return () => clearTimeout(t);
  }, [step, auto, reduced]);

  const phase = SEQ[step].phase;
  const failed = phase === 'fail' || phase === 'secondary' || phase === 'ok';
  const recovered = phase === 'secondary' || phase === 'ok';
  const activePath = phase === 'primary' || phase === 'fail' ? PATHS.primary : PATHS['fallback-1'];

  return (
    <div className={cn('relative', className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="tech-label">resilience.failover</span>
        <button
          type="button"
          onClick={() => {
            setAuto(false);
            setStep((s) => (s + 1) % SEQ.length);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-hairline px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-electric hover:text-electric"
        >
          <RotateCcw className="h-3 w-3" />
          langkah
        </button>
      </div>

      <svg viewBox="0 0 700 240" className="h-auto w-full" role="img" aria-label="Ilustrasi failover request ke provider cadangan">
        {/* client */}
        <rect x="16" y="100" width="86" height="40" rx="2" fill="white" stroke="hsl(var(--hairline))" />
        <text x="59" y="118" textAnchor="middle" className="fill-foreground font-mono" fontSize="9.5" fontWeight="600">
          client
        </text>
        <text x="59" y="131" textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="7.5">
          sdk / http
        </text>
        <line x1="102" y1="120" x2="168" y2="120" stroke="hsl(var(--electric))" strokeWidth="1.1" strokeDasharray="3 6" className={reduced ? undefined : 'animate-dash'} />

        {/* gateway */}
        <rect x="168" y="98" width="137" height="44" rx="2" fill="white" stroke="hsl(var(--electric))" strokeWidth="1.2" />
        <rect x="168" y="98" width="4" height="44" fill="hsl(var(--electric))" />
        <text x="182" y="116" className="fill-foreground font-mono" fontSize="9.5" fontWeight="600">
          gateway
        </text>
        <text x="182" y="130" className="fill-muted-foreground font-mono" fontSize="7.5">
          retry + failover
        </text>

        {/* routes */}
        {PROVIDERS.map((p) => {
          const isPrimary = p.id === 'primary';
          const isFallback1 = p.id === 'fallback-1';
          const active = (isPrimary && (phase === 'primary' || phase === 'fail')) || (isFallback1 && (phase === 'secondary' || phase === 'ok'));
          const state = isPrimary
            ? failed
              ? 'error'
              : active
                ? 'active'
                : 'idle'
            : isFallback1
              ? recovered
                ? 'active'
                : active
                  ? 'active'
                  : 'idle'
              : 'idle';
          const stroke =
            state === 'error'
              ? 'hsl(var(--destructive))'
              : state === 'active'
                ? 'hsl(var(--electric))'
                : 'hsl(var(--electric-soft))';
          return (
            <g key={p.id}>
              <path
                d={PATHS[p.id]}
                fill="none"
                stroke={stroke}
                strokeWidth={state === 'active' ? 1.8 : 1}
                strokeOpacity={state === 'idle' ? 0.3 : 1}
                strokeDasharray={state === 'error' ? '5 5' : undefined}
              />

              {/* provider node */}
              <rect
                x={p.x}
                y={p.y - 20}
                width="150"
                height="40"
                rx="2"
                fill={state === 'active' ? 'hsl(var(--electric-pale))' : 'white'}
                stroke={stroke}
                strokeWidth={state === 'active' ? 1.4 : 1}
              />
              <circle cx={p.x + 14} cy={p.y} r="3.5" fill={stroke} className={cn(state === 'active' && !reduced && 'animate-node-pulse')} />
              <text x={p.x + 26} y={p.y - 1} className="fill-foreground font-mono" fontSize="9.5" fontWeight="600">
                {p.label}
              </text>
              <text x={p.x + 26} y={p.y + 11} className="fill-muted-foreground font-mono" fontSize="7.5">
                {p.note}
              </text>
              <text x={p.x + 142} y={p.y + 3.5} textAnchor="end" className="font-mono" fontSize="8" fill={stroke}>
                {isPrimary && failed ? '503' : isFallback1 && recovered ? '200' : state === 'active' ? '···' : 'idle'}
              </text>
            </g>
          );
        })}

        {/* error cross on failed primary */}
        {failed && (
          <g stroke="hsl(var(--destructive))" strokeWidth="1.6">
            <line x1="470" y1="46" x2="486" y2="66" />
            <line x1="486" y1="46" x2="470" y2="66" />
          </g>
        )}

        {/* request packet along active route */}
        {!reduced && (
          <circle key={`${phase}-packet`} r="4" fill="hsl(var(--electric))" stroke="white" strokeWidth="1.1">
            <animateMotion dur="0.85s" fill="freeze" path={activePath} />
          </circle>
        )}

        {/* attempt readout */}
        <text x="16" y="216" className="fill-muted-foreground font-mono" fontSize="9">
          {phase === 'primary'
            ? 'attempt 1 → primary'
            : phase === 'fail'
              ? 'primary gagal · 503 · memutuskan retry'
              : phase === 'secondary'
                ? 'attempt 2 → fallback-1'
                : 'fallback-1 200 ok · request selesai'}
        </text>
      </svg>

      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        ilustrasi perilaku retry — bukan live status upstream
      </p>
    </div>
  );
}