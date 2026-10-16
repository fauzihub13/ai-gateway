'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '../use-reduced-motion';

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

const MASKED = `sk-mpruy-${'•'.repeat(12)}4f2a`;

/**
 * "Fingerprint" kunci API: ridge konsentris + scan line + digest, menjelaskan
 * bagaimana key di-hash dan tidak pernah disimpan sebagai plaintext.
 */
export function KeyFingerprint({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [scan, setScan] = useState(false);
  const [digestHover, setDigestHover] = useState(false);

  const ridges = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = 18 + i * 8;
      const base = -Math.PI * 0.92 + (i % 2) * 0.28;
      const span = Math.PI * 1.5 - (i % 3) * 0.18;
      out.push(arc(150, 116, r, base, base + span * 0.42));
      out.push(arc(150, 116, r, base + span * 0.56, base + span));
    }
    return out;
  }, []);

  const FLOW = ['input key', 'hash + pepper', 'digest', 'lookup prefix', 'match'];

  return (
    <div className={cn('relative', className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="tech-label">auth.key fingerprint</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {scan ? 'scanning…' : 'idle'}
        </span>
      </div>

      <svg viewBox="0 0 700 240" className="h-auto w-full" role="img" aria-label="Ilustrasi fingerprint kunci API dan proses hashing">
        <defs>
          <clipPath id="fp-clip">
            <circle cx="150" cy="116" r="86" />
          </clipPath>
        </defs>

        {/* fingerprint ridges */}
        <g
          onMouseEnter={() => setScan(true)}
          onMouseLeave={() => setScan(false)}
          className={cn(reduced ? undefined : 'transition-transform duration-500')}
          style={!reduced && scan ? { transform: 'rotate(2deg)', transformOrigin: '150px 116px' } : undefined}
        >
          {ridges.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={scan ? 'hsl(var(--electric))' : 'hsl(var(--electric-soft))'}
              strokeWidth={i % 2 === 0 ? 1.3 : 1}
              strokeOpacity={scan ? 0.95 : 0.6}
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* scan sweep */}
        {!reduced && (
          <rect x="64" y="42" width="172" height="4" fill="hsl(var(--electric))" opacity="0.28" clipPath="url(#fp-clip)">
            <animate attributeName="y" values="42;190;42" dur="3.6s" repeatCount="indefinite" />
          </rect>
        )}
        <circle cx="150" cy="116" r="86" fill="none" stroke="hsl(var(--hairline))" />
        <text x="150" y="222" textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="8">
          key fingerprint
        </text>

        {/* divider */}
        <line x1="286" y1="24" x2="286" y2="216" stroke="hsl(var(--hairline))" />

        {/* masked key */}
        <text x="314" y="42" className="fill-muted-foreground font-mono" fontSize="8.5">
          key (ditampilkan sekali)
        </text>
        <rect x="314" y="50" width="356" height="42" rx="2" fill="white" stroke="hsl(var(--electric))" strokeWidth="1.1" />
        <text x="330" y="77" className="fill-foreground font-mono" fontSize="14" fontWeight="600">
          {MASKED}
        </text>

        {/* digest */}
        <text x="314" y="120" className="fill-muted-foreground font-mono" fontSize="8.5">
          disimpan
        </text>
        <g onMouseEnter={() => setDigestHover(true)} onMouseLeave={() => setDigestHover(false)} className="cursor-help">
          <text x="374" y="120" className="fill-foreground font-mono" fontSize="11">
            sha256(pepper + key)
          </text>
          <line x1="374" y1="124" x2="512" y2="124" stroke="hsl(var(--hairline))" />
        </g>
        {digestHover && (
          <text x="314" y="140" className="fill-electric font-mono" fontSize="8.5">
            hanya digest + prefix tersimpan — plaintext tidak pernah ditulis ke DB
          </text>
        )}

        {/* annotations */}
        <text x="314" y="160" className="fill-muted-foreground font-mono" fontSize="8.5">
          · prefix + last4 untuk identifikasi tanpa membuka key
        </text>
        <text x="314" y="174" className="fill-muted-foreground font-mono" fontSize="8.5">
          · revoke per key, audit tercatat
        </text>

        {/* validation flow */}
        <line x1="314" y1="196" x2="670" y2="196" stroke="hsl(var(--hairline))" />
        {FLOW.map((f, i) => {
          const x = 314 + i * 74;
          const on = scan;
          return (
            <g key={f}>
              <rect x={x} y="204" width="62" height="22" rx="1.5" fill="white" stroke={on ? 'hsl(var(--electric))' : 'hsl(var(--hairline))'} />
              <text x={x + 31} y="218" textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="7">
                {f}
              </text>
              {i < FLOW.length - 1 && <path d={`M${x + 62},215 L${x + 74},215`} stroke="hsl(var(--hairline))" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}