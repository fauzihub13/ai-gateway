'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface RoutingProvider {
  id: string;
  name: string;
  /** Short technical annotation, e.g. a model family or region. */
  note: string;
  x: number;
  y: number;
}

/**
 * Provider nodes shown in the blueprint. Positions are fixed so the diagram
 * composition is deterministic and printable. Only providers the gateway
 * actually routes to are listed.
 */
const PROVIDERS: RoutingProvider[] = [
  { id: 'openai', name: 'OpenAI', note: 'gpt-*', x: 360, y: 72 },
  { id: 'anthropic', name: 'Anthropic', note: 'claude-*', x: 636, y: 196 },
  { id: 'google', name: 'Google', note: 'gemini-*', x: 636, y: 404 },
  { id: 'meta', name: 'Meta', note: 'llama-*', x: 104, y: 428 },
];

const GATEWAY = { x: 360, y: 300 };

const OUT_MS = 720;
const HOLD_MS = 520;
const BACK_MS = 720;
const GAP_MS = 900;

type Phase = 'out' | 'hold' | 'back' | 'gap';

interface Packet {
  provider: string;
  phase: Phase;
  t: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function RoutingDiagram({ className }: { className?: string }) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [latency, setLatency] = useState(418);
  const lastTs = useRef<number | null>(null);
  const elapsed = useRef(0);
  const cycle = useRef(0);

  // External highlight bridge: provider ecosystem section dispatches this event.
  useEffect(() => {
    function onHover(e: Event) {
      const detail = (e as CustomEvent<{ id: string | null }>).detail;
      setHighlight(detail?.id ?? null);
    }
    window.addEventListener('mpruy:provider-hover', onHover as EventListener);
    return () => window.removeEventListener('mpruy:provider-hover', onHover as EventListener);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Request-routing animation: gateway -> provider -> gateway on a loop.
  useEffect(() => {
    if (reduced) {
      setPacket(null);
      return;
    }
    let raf = 0;
    const step = (ts: number) => {
      if (lastTs.current === null) lastTs.current = ts;
      const dt = ts - lastTs.current;
      lastTs.current = ts;
      elapsed.current += dt;

      const provider = PROVIDERS[cycle.current % PROVIDERS.length].id;

      if (elapsed.current < OUT_MS) {
        setPacket({ provider, phase: 'out', t: elapsed.current / OUT_MS });
      } else if (elapsed.current < OUT_MS + HOLD_MS) {
        setPacket({ provider, phase: 'hold', t: 1 });
      } else if (elapsed.current < OUT_MS + HOLD_MS + BACK_MS) {
        const t = (elapsed.current - OUT_MS - HOLD_MS) / BACK_MS;
        setPacket({ provider, phase: 'back', t: 1 - t });
      } else if (elapsed.current >= OUT_MS + HOLD_MS + BACK_MS + GAP_MS) {
        elapsed.current = 0;
        cycle.current += 1;
        setLatency(280 + Math.floor(Math.random() * 320));
        setPacket({ provider: PROVIDERS[cycle.current % PROVIDERS.length].id, phase: 'out', t: 0 });
      } else {
        setPacket({ provider, phase: 'gap', t: 0 });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const activeId = highlight ?? packet?.provider ?? null;

  const packetPos = useMemo(() => {
    if (!packet) return null;
    const p = PROVIDERS.find((n) => n.id === packet.provider);
    if (!p) return null;
    return { x: lerp(GATEWAY.x, p.x, packet.t), y: lerp(GATEWAY.y, p.y, packet.t) };
  }, [packet]);

  const statusText = reduced
    ? 'idle'
    : packet?.phase === 'out'
      ? 'routing'
      : packet?.phase === 'hold'
        ? 'upstream'
        : packet?.phase === 'back'
          ? 'streaming'
          : 'idle';

  const onNodeEnter = useCallback((id: string) => setHighlight(id), []);
  const onNodeLeave = useCallback(() => setHighlight(null), []);

  return (
    <div className={cn('relative', className)}>
      {/* Blueprint canvas */}
      <div className="grid-canvas absolute inset-0 -z-10" aria-hidden="true" />

      <div className="relative overflow-hidden rounded-sm border border-hairline bg-white/70 backdrop-blur-[1px]">
        {/* Panel chrome: coordinate ticks + status readout */}
        <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
          <span className="tech-label">gateway.blueprint</span>
          <span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  statusText === 'idle' ? 'bg-hairline' : 'bg-electric animate-node-pulse',
                )}
              />
              {statusText}
            </span>
            <span className="tabular">{reduced ? '—' : `${latency}ms`}</span>
          </span>
        </div>

        <svg
          viewBox="0 0 720 520"
          role="img"
          aria-label="Diagram alur request dari gateway ke provider AI dan kembali"
          className="block h-auto w-full"
        >
          <defs>
            <pattern id="bp-dots" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.75" fill="hsl(var(--hairline))" />
            </pattern>
            <linearGradient id="bp-beam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--electric))" stopOpacity="0.9" />
              <stop offset="100%" stopColor="hsl(var(--electric))" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="720" height="520" fill="url(#bp-dots)" opacity="0.55" />

          {/* coordinate ticks along edges */}
          {[80, 200, 320, 440, 560, 680].map((x) => (
            <g key={`tx${x}`}>
              <line x1={x} y1="0" x2={x} y2="8" stroke="hsl(var(--hairline))" />
              <text x={x + 3} y="20" className="fill-muted-foreground font-mono" fontSize="8">
                {x}
              </text>
            </g>
          ))}
          {[80, 200, 320, 440].map((y) => (
            <g key={`ty${y}`}>
              <line x1="0" y1={y} x2="8" y2={y} stroke="hsl(var(--hairline))" />
              <text x="12" y={y - 3} className="fill-muted-foreground font-mono" fontSize="8">
                {y}
              </text>
            </g>
          ))}

          {/* connection lines */}
          {PROVIDERS.map((p) => {
            const on = activeId === p.id;
            return (
              <g key={`line-${p.id}`}>
                <line
                  x1={GATEWAY.x}
                  y1={GATEWAY.y}
                  x2={p.x}
                  y2={p.y}
                  stroke={on ? 'hsl(var(--electric))' : 'hsl(var(--electric-soft))'}
                  strokeWidth={on ? 1.6 : 1}
                  strokeOpacity={on ? 1 : 0.4}
                />
                {/* animated dashes: data flowing while idle keeps the diagram alive */}
                <line
                  x1={GATEWAY.x}
                  y1={GATEWAY.y}
                  x2={p.x}
                  y2={p.y}
                  stroke="hsl(var(--electric))"
                  strokeWidth="1.4"
                  strokeDasharray="3 9"
                  strokeOpacity={on ? 0.95 : 0.35}
                  className={reduced ? undefined : on ? 'animate-dash' : 'animate-dash-slow'}
                />
              </g>
            );
          })}

          {/* gateway node */}
          <g>
            <rect
              x={GATEWAY.x - 92}
              y={GATEWAY.y - 30}
              width="184"
              height="60"
              rx="3"
              fill="white"
              stroke="hsl(var(--electric))"
              strokeWidth="1.2"
            />
            <rect x={GATEWAY.x - 92} y={GATEWAY.y - 30} width="4" height="60" fill="hsl(var(--electric))" />
            <text x={GATEWAY.x - 78} y={GATEWAY.y - 8} className="fill-foreground font-mono" fontSize="11" fontWeight="600">
              gateway
            </text>
            <text x={GATEWAY.x - 78} y={GATEWAY.y + 8} className="fill-muted-foreground font-mono" fontSize="9">
              /v1/chat/completions
            </text>
            <text x={GATEWAY.x - 78} y={GATEWAY.y + 22} className="fill-muted-foreground font-mono" fontSize="8" letterSpacing="0.5">
              mpruy.ai · unified
            </text>
          </g>

          {/* provider nodes */}
          {PROVIDERS.map((p) => {
            const on = activeId === p.id;
            const w = 132;
            const h = 46;
            return (
              <g
                key={p.id}
                onMouseEnter={() => onNodeEnter(p.id)}
                onMouseLeave={onNodeLeave}
                onFocus={() => onNodeEnter(p.id)}
                onBlur={onNodeLeave}
                tabIndex={0}
                role="button"
                aria-label={`Provider ${p.name}`}
                className="cursor-pointer outline-none"
              >
                <rect
                  x={p.x - w / 2}
                  y={p.y - h / 2}
                  width={w}
                  height={h}
                  rx="3"
                  fill={on ? 'hsl(var(--electric-pale))' : 'white'}
                  stroke={on ? 'hsl(var(--electric))' : 'hsl(var(--hairline))'}
                  strokeWidth={on ? 1.3 : 1}
                />
                <circle
                  cx={p.x - w / 2 + 16}
                  cy={p.y}
                  r="4"
                  fill={on ? 'hsl(var(--electric))' : 'hsl(var(--electric-soft))'}
                  className={cn(on && !reduced && 'animate-node-pulse')}
                />
                <text x={p.x - w / 2 + 28} y={p.y - 2} className="fill-foreground font-mono" fontSize="10.5" fontWeight="600">
                  {p.name}
                </text>
                <text x={p.x - w / 2 + 28} y={p.y + 11} className="fill-muted-foreground font-mono" fontSize="8.5">
                  {p.note}
                </text>
                {/* status tick */}
                <text x={p.x + w / 2 - 12} y={p.y + 3} className="fill-muted-foreground font-mono" fontSize="8" textAnchor="end">
                  {on ? 'ACTIVE' : 'IDLE'}
                </text>
              </g>
            );
          })}

          {/* request packet */}
          {packetPos && (
            <g>
              <circle cx={packetPos.x} cy={packetPos.y} r="9" fill="hsl(var(--electric))" opacity="0.14" />
              <circle cx={packetPos.x} cy={packetPos.y} r="4" fill="hsl(var(--electric))" />
              <circle cx={packetPos.x} cy={packetPos.y} r="4" fill="none" stroke="white" strokeWidth="1.2" />
            </g>
          )}

          {/* annotation near gateway */}
          <text x="12" y="500" className="fill-muted-foreground font-mono" fontSize="8.5" letterSpacing="0.6">
            {reduced ? 'prefers-reduced-motion: static diagram' : 'request → route → stream → settle'}
          </text>
        </svg>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Illustrasi arsitektur routing — animasi, bukan request API nyata.
      </p>
    </div>
  );
}

export { PROVIDERS };