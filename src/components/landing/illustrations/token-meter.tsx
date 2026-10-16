'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

const SEGMENTS = 30;
const FILLED = 19; // sample

/**
 * "Instrumen" metering biaya: level meter tersegmen, odometer token, dan bar
 * saldo. Metafora alat ukur — berbeda dari ilustrasi jaringan.
 */
export function TokenMeter({ className }: { className?: string }) {
  const [seg, setSeg] = useState<number | null>(null);
  const [balanceHover, setBalanceHover] = useState(false);

  const segW = 18;
  const segGap = 1.6;
  const x0 = 46;

  return (
    <div className={cn('relative', className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="tech-label">billing.meter</span>
        <span className="rounded-sm border border-warning/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-warning">
          sample
        </span>
      </div>

      <svg viewBox="0 0 700 250" className="h-auto w-full" role="img" aria-label="Instrumen metering token dan saldo">
        {/* segmented level meter */}
        <text x="46" y="26" className="fill-muted-foreground font-mono" fontSize="8.5">
          token meter
        </text>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const filled = i < FILLED;
          const on = seg === i;
          const h = on ? 40 : 30;
          return (
            <g key={i} onMouseEnter={() => setSeg(i)} onMouseLeave={() => setSeg(null)} className="cursor-crosshair">
              <rect
                x={x0 + i * (segW + segGap)}
                y={44 + (on ? -5 : 0)}
                width={segW}
                height={h}
                rx="1"
                fill={filled ? 'hsl(var(--electric))' : 'white'}
                fillOpacity={filled ? (on ? 1 : 0.82) : 1}
                stroke={on ? 'hsl(var(--electric))' : 'hsl(var(--hairline))'}
                strokeWidth={on ? 1.4 : 1}
              />
            </g>
          );
        })}
        {/* threshold marker */}
        <line
          x1={x0 + FILLED * (segW + segGap) - segGap / 2}
          y1="34"
          x2={x0 + FILLED * (segW + segGap) - segGap / 2}
          y2="84"
          stroke="hsl(var(--electric))"
          strokeWidth="1.2"
        />
        <text x={x0} y="98" className="fill-muted-foreground font-mono" fontSize="8">
          0
        </text>
        <text x={x0 + SEGMENTS * (segW + segGap)} y="98" textAnchor="end" className="fill-muted-foreground font-mono" fontSize="8">
          {SEGMENTS}k
        </text>
        <text x={x0 + FILLED * (segW + segGap)} y="98" textAnchor="middle" className="fill-electric font-mono" fontSize="8">
          {seg === null ? `${FILLED}k` : `${seg + 1}k`}
        </text>

        {/* odometer */}
        <text x="46" y="132" className="fill-muted-foreground font-mono" fontSize="8.5">
          tokens bulan ini
        </text>
        {'0128402'.split('').map((d, i) => (
          <g key={i}>
            <rect x={46 + i * 30} y="140" width="24" height="34" rx="1.5" fill="white" stroke="hsl(var(--hairline))" />
            <text x={46 + i * 30 + 12} y="163" textAnchor="middle" className="fill-foreground font-mono" fontSize="15" fontWeight="600">
              {d}
            </text>
          </g>
        ))}
        <text x={46 + 7 * 30 + 8} y="163" className="fill-muted-foreground font-mono" fontSize="10">
          tokens
        </text>

        {/* balance bars */}
        <text x="380" y="132" className="fill-muted-foreground font-mono" fontSize="8.5">
          saldo
        </text>
        <g onMouseEnter={() => setBalanceHover(true)} onMouseLeave={() => setBalanceHover(false)}>
          <rect x="380" y="140" width="270" height="14" rx="1" fill="hsl(var(--muted))" />
          <rect x="380" y="140" width={balanceHover ? 176 : 168} height="14" rx="1" fill="hsl(var(--electric))" className="transition-[width] duration-300" />
          <line x1="380 + 78" y1="136" x2="380 + 78" y2="158" stroke="hsl(var(--warning))" strokeWidth="1.2" strokeDasharray="3 3" />
          <text x="380" y="172" className="fill-foreground font-mono" fontSize="10.5" fontWeight="600">
            Rp412.500
          </text>
          <text x="650" y="172" textAnchor="end" className="fill-muted-foreground font-mono" fontSize="8.5">
            low-balance @ Rp100.000
          </text>
        </g>

        {/* formula */}
        <line x1="46" y1="196" x2="650" y2="196" stroke="hsl(var(--hairline))" />
        <text x="46" y="216" className="fill-muted-foreground font-mono" fontSize="9">
          cost = (in ÷ 1000 × priceIn + out ÷ 1000 × priceOut) × markup
        </text>
        <text x="46" y="234" className="fill-muted-foreground font-mono" fontSize="8.5">
          dipotong atomik dari saldo setelah request selesai · negative balance dicegah
        </text>
      </svg>
    </div>
  );
}