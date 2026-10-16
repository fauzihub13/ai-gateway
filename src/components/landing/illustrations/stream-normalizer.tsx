'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '../use-reduced-motion';

/** Deltas as they would arrive, one SSE event each. Output = joined deltas. */
const DELTAS = ['Gateway', ' menerima', ' request', ' OpenAI-compatible', ' lalu', ' menormalkan', ' stream '];
const OUTPUT = `${DELTAS.join('')}ke client.`;
const STEP_MS = 300;

const GATE_STEPS = [
  { id: 'normalize', label: 'normalize', note: '→ spec OpenAI' },
  { id: 'done', label: 'inject', note: '→ [DONE]' },
  { id: 'usage', label: 'usage', note: '→ meter' },
];

/**
 * Streaming sebagai jalur pipa: chunk `data:` upstream masuk satu per satu,
 * melewati gerbang normalisasi, lalu keluar sebagai teks utuh + badge [DONE]
 * dan chip usage. Menggantikan timeline sumbu-waktu yang padat.
 */
export function StreamNormalizer({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [emitted, setEmitted] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fromUpstream, setFromUpstream] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = DELTAS.length;
  const done = emitted >= total;

  useEffect(() => {
    if (reduced) {
      setEmitted(total);
      return;
    }
    setEmitted(0);
    setPlaying(true);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  useEffect(() => {
    if (reduced || !playing) return;
    timer.current = setInterval(() => {
      setEmitted((n) => {
        if (n >= total) {
          setPlaying(false);
          return n;
        }
        const next = n + 1;
        if (next >= total) setPlaying(false);
        return next;
      });
    }, STEP_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, reduced, total]);

  const gateOn = (id: string) =>
    id === 'normalize' ? emitted >= 1 : id === 'done' ? done : done;

  return (
    <div className={cn('relative', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="tech-label">stream.sse normalizer</span>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-sm border border-hairline">
            <button
              type="button"
              onClick={() => setFromUpstream(true)}
              className={cn(
                'px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors',
                fromUpstream ? 'bg-electric text-white' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              usage upstream
            </button>
            <button
              type="button"
              onClick={() => setFromUpstream(false)}
              className={cn(
                'border-l border-hairline px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors',
                !fromUpstream ? 'bg-electric text-white' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              fallback
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setEmitted(0);
              setPlaying(true);
            }}
            disabled={playing}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-hairline px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-electric hover:text-electric disabled:opacity-50"
          >
            {playing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            replay
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_168px_1fr]">
        {/* upstream chunks */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-sm border border-hairline bg-background">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              upstream · text/event-stream
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', done ? 'bg-hairline' : 'bg-electric animate-node-pulse')} />
              {done ? 'closed' : 'open'}
            </span>
          </div>

          <ul className="scrollbar-thin max-h-[210px] space-y-1 overflow-hidden p-2">
            {DELTAS.map((d, i) => {
              const on = i < emitted;
              const isLast = i === emitted - 1;
              return (
                <li
                  key={i}
                  className={cn(
                    'flex items-center gap-2 rounded-sm px-2 py-1 font-mono text-[11px] transition-all duration-200',
                    on ? 'bg-accent/60 text-foreground' : 'text-muted-foreground/40',
                    isLast && !done && 'ring-1 ring-electric/50',
                  )}
                >
                  <span className="shrink-0 text-muted-foreground/60">data:</span>
                  <code className="min-w-0 truncate">
                    {'{"choices":[{"delta":{"content":"'}
                    <span className={on ? 'text-electric' : undefined}>{d}</span>
                    {'"}}]}'}
                  </code>
                </li>
              );
            })}
          </ul>

          <div className="mt-auto flex items-center justify-between border-t border-hairline px-3 py-2">
            <code className={cn('font-mono text-[11px] transition-colors', done ? 'text-electric' : 'text-muted-foreground/40')}>
              data: [DONE]
            </code>
            <span className="font-mono text-[10px] text-muted-foreground">{emitted}/{total} events</span>
          </div>
        </div>

        {/* normalizer gate */}
        <div className="flex flex-col overflow-hidden rounded-sm border border-hairline bg-card">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">gate</span>
            <ArrowRight className="h-3.5 w-3.5 text-electric" />
          </div>
          <ul className="flex-1 space-y-1 p-2">
            {GATE_STEPS.map((s) => {
              const on = gateOn(s.id);
              const label = s.id === 'usage' ? (fromUpstream ? 'usage upstream' : 'estimate usage') : s.label;
              return (
                <li key={s.id} className="flex items-center gap-2 rounded-sm px-1.5 py-1">
                  <span
                    className={cn(
                      'grid h-4 w-4 shrink-0 place-items-center rounded-sm border transition-colors',
                      on ? 'border-electric bg-electric text-white' : 'border-hairline text-muted-foreground/40',
                    )}
                  >
                    {on && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block font-mono text-[10.5px]', on ? 'text-foreground' : 'text-muted-foreground/50')}>
                      {label}
                    </span>
                    <span className="block font-mono text-[9px] text-muted-foreground/70">{s.note}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* client output */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-sm border border-hairline bg-background">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              client · ReadableStream
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
              <span className={cn('h-1.5 w-1.5 rounded-sm', done ? 'bg-electric' : 'bg-hairline')} />
              <span className={cn(done ? 'text-electric' : 'text-muted-foreground')}>{done ? 'complete' : 'receiving'}</span>
            </span>
          </div>

          <div className="flex-1 p-3">
            <p className="reading text-[15px] text-foreground">
              {DELTAS.slice(0, emitted).join('')}
              {done && OUTPUT.slice(DELTAS.join('').length)}
              {!done && <span className="ml-0.5 inline-block h-4 w-[2px] animate-node-pulse bg-electric align-middle" />}
            </p>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2">
            <span
              className={cn(
                'font-mono text-[10px]',
                done ? 'text-electric' : 'text-muted-foreground/40',
              )}
            >
              [DONE]
            </span>
            <span className="h-3 w-px bg-hairline" />
            <span
              className={cn(
                'rounded-sm border px-1.5 py-0.5 font-mono text-[9.5px]',
                fromUpstream ? 'border-hairline text-foreground' : 'border-dashed border-electric-soft text-muted-foreground',
              )}
            >
              prompt 42 tok
            </span>
            <span
              className={cn(
                'rounded-sm border px-1.5 py-0.5 font-mono text-[9.5px]',
                fromUpstream ? 'border-hairline text-foreground' : 'border-dashed border-electric-soft text-muted-foreground',
              )}
            >
              completion 318 tok
            </span>
            {!fromUpstream && (
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-warning">estimated</span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        stream selalu dikirim eksplisit · gateway menjamin [DONE] · usage diestimasi bila upstream tidak mengirimnya
      </p>
    </div>
  );
}