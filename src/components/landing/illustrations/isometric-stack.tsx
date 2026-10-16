'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '../use-reduced-motion';

const CX = 246;
const HALF_W = 96;
const HALF_D = 48;
const T = 8;
const GAP = 56;

const LAYERS = [
  { label: 'edge', note: 'waf · tls' },
  { label: 'auth', note: 'api key' },
  { label: 'limit', note: 'rpm · quota' },
  { label: 'router', note: 'model map' },
  { label: 'billing', note: 'usage · saldo' },
];

const TOP = 70;
const BOTTOM = TOP + (LAYERS.length - 1) * GAP;

function rhombus(cx: number, cy: number) {
  const n = { x: cx, y: cy };
  const e = { x: cx + HALF_W, y: cy + HALF_D / 2 };
  const s = { x: cx, y: cy + HALF_D };
  const w = { x: cx - HALF_W, y: cy + HALF_D / 2 };
  return { n, e, s, w };
}

/**
 * Isometric "anatomi gateway": request turun melewati lapisan-lapisan yang
 * ditumpuk (edge → auth → limit → router → billing). Bukan node graph.
 */
export function IsometricStack({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className={cn('relative', className)}>
      <svg viewBox="0 0 520 380" className="h-auto w-full" role="img" aria-label="Anatomi gateway berlapis secara isometrik">
        {/* blueprint ticks */}
        {[70, 126, 182, 238, 294].map((y) => (
          <text key={y} x="10" y={y + 22} className="fill-muted-foreground font-mono" fontSize="8">
            {String(y).padStart(3, '0')}
          </text>
        ))}

        {/* request beam */}
        <line
          x1={CX}
          y1={24}
          x2={CX}
          y2={BOTTOM + HALF_D + T + 6}
          stroke="hsl(var(--electric))"
          strokeWidth="1.2"
          strokeDasharray="3 8"
          strokeOpacity="0.55"
          className={reduced ? undefined : 'animate-dash'}
        />
        <line
          x1={CX + 10}
          y1={BOTTOM + HALF_D + T + 6}
          x2={CX + 10}
          y2={24}
          stroke="hsl(var(--electric-soft))"
          strokeWidth="1"
          strokeDasharray="2 10"
          strokeOpacity="0.4"
          className={reduced ? undefined : 'animate-dash-slow'}
        />
        <text x={CX - 6} y="18" textAnchor="end" className="fill-muted-foreground font-mono" fontSize="8">
          request
        </text>
        <text x={CX + 16} y="18" className="fill-muted-foreground font-mono" fontSize="8">
          response
        </text>

        {/* layers, painted bottom-up so upper plates overlap correctly */}
        {LAYERS.map((layer, i) => {
          const cy = TOP + i * GAP;
          const on = active === i;
          const { n, e, s, w } = rhombus(CX, cy);
          return (
            <g
              key={layer.label}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              role="button"
              aria-label={`Layer ${layer.label}`}
              className="cursor-pointer outline-none"
            >
              {/* side faces (extrusion) */}
              <polygon
                points={`${w.x},${w.y} ${s.x},${s.y} ${s.x},${s.y + T} ${w.x},${w.y + T}`}
                fill="hsl(var(--electric) / 0.08)"
                stroke="hsl(var(--hairline))"
                strokeWidth="0.8"
              />
              <polygon
                points={`${s.x},${s.y} ${e.x},${e.y} ${e.x},${e.y + T} ${s.x},${s.y + T}`}
                fill="hsl(var(--electric) / 0.14)"
                stroke="hsl(var(--hairline))"
                strokeWidth="0.8"
              />
              {/* top face */}
              <polygon
                points={`${n.x},${n.y} ${e.x},${e.y} ${s.x},${s.y} ${w.x},${w.y}`}
                fill={on ? 'hsl(var(--electric-pale))' : 'white'}
                stroke={on ? 'hsl(var(--electric))' : 'hsl(var(--hairline))'}
                strokeWidth={on ? 1.3 : 1}
              />
              {/* layer index at N vertex */}
              <text
                x={CX}
                y={cy + HALF_D / 2 + 3}
                textAnchor="middle"
                className={cn('font-mono', on ? 'fill-electric' : 'fill-muted-foreground')}
                fontSize="9"
              >
                {String(i + 1).padStart(2, '0')}
              </text>

              {/* leader + label */}
              <line
                x1={e.x}
                y1={e.y}
                x2={400}
                y2={e.y}
                stroke={on ? 'hsl(var(--electric))' : 'hsl(var(--hairline))'}
                strokeWidth="0.9"
              />
              <rect x="400" y={e.y - 11} width="112" height="22" rx="1.5" fill="white" stroke={on ? 'hsl(var(--electric))' : 'hsl(var(--hairline))'} />
              <text x="408" y={e.y - 1} className={cn('font-mono', on ? 'fill-electric' : 'fill-foreground')} fontSize="9.5" fontWeight="600">
                {layer.label}
              </text>
              <text x="408" y={e.y + 8} className="fill-muted-foreground font-mono" fontSize="8">
                {layer.note}
              </text>
            </g>
          );
        })}

        {/* travelling packet */}
        {!reduced && (
          <circle r="4" fill="hsl(var(--electric))" stroke="white" strokeWidth="1">
            <animateMotion dur="3.4s" repeatCount="indefinite" path={`M${CX},24 L${CX},${BOTTOM + HALF_D + T + 6}`} />
          </circle>
        )}
        {/* return packet */}
        {!reduced && (
          <circle r="3" fill="hsl(var(--electric-soft))" stroke="white" strokeWidth="1">
            <animateMotion dur="3.4s" begin="1.7s" repeatCount="indefinite" path={`M${CX + 10},${BOTTOM + HALF_D + T + 6} L${CX + 10},24`} />
          </circle>
        )}
      </svg>
    </div>
  );
}