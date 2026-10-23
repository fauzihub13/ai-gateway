'use client';

/**
 * "Usage Wrapped" share card — merender kartu 1080×1350 (rasio 4:5) ke
 * <canvas> pada scale 2x supaya PNG-nya tajam di layar retina & sosmed.
 *
 * Aksi: Unduh PNG / Salin gambar ke clipboard / Share via Web Share API
 * Level 2 (native sheet di HP); fallback semua platform = unduh.
 *
 * Desain selaras design system web: electric blue #1E4DFF, ink, hairline,
 * mono (JetBrains/Departure), blueprint grid. Render via canvas (bukan
 * screenshot DOM) supaya hasilnya satu PNG utuh yang bisa diunggah ke
 * sosial media tanpa latar tembus pandang.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Check, Copy, Download, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/client';
import {
  compactId,
  fullId,
  parseShareRange,
  periodLabel,
  RANGE_OPTIONS,
  rangeDays,
  type ShareRange,
} from '@/lib/share-card-format';

// ── Warna brand (selaras globals.css) ──────────────────────────────────────
const C = {
  electric: '#1E4DFF',
  ink: '#0A0A0A',
  paper: '#FBFBFB',
  hairline: '#E5E7EB',
  muted: '#6B7280',
  white: '#FFFFFF',
};

/** Ukuran logis kartu; dirender 2x untuk ketajaman. */
const W = 1080;
const H = 1350;
const SCALE = 2;

interface CardData {
  days: number | null;
  from: string | null;
  to: string;
  requests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  cachedHitPct: number | null;
  distinctModels: number;
  topModels: Array<{ name: string; requests: number; pct: number }>;
  valueIdr: number;
  chargedIdr: number;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Potong teks dengan elipsis bila lebih lebar dari maxWidth. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/**
 * Render kartu lengkap. Semua koordinat dalam px logis; ctx sudah discale.
 *
 * Layout (1080×1350, margin 72):
 *   header    : periode (eyebrow) + judul "Mpruy AI Overview"
 *   hero      : TOKEN DIPROSES (angka terbesar) + in/out + total request
 *   row 2     : dua card — CACHE HIT | MODEL DIPAKAI
 *   top model : 3 baris nama + persentase bar
 *   bawah     : nilai pemakaian + footer (teks kiri, logo kanan — bebas tabrakan)
 */
function renderCard(
  ctx: CanvasRenderingContext2D,
  data: CardData,
  email: string,
  dark: boolean,
): void {
  const bg = dark ? C.ink : C.paper;
  const fg = dark ? C.white : C.ink;
  const hairline = dark ? 'rgba(255,255,255,0.16)' : C.hairline;
  const muted = dark ? 'rgba(255,255,255,0.55)' : C.muted;
  const panel = dark ? 'rgba(255,255,255,0.04)' : C.white;

  // ── Background + blueprint grid ──
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = hairline;
  ctx.lineWidth = 1;
  ctx.globalAlpha = dark ? 0.12 : 0.5;
  for (let x = 32; x < W; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 32; y < H; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  const setFont = (weight: string | number, px: number, mono = false): void => {
    ctx.font =
      `${weight} ${px}px ` +
      (mono
        ? "'JetBrains Mono', 'Departure Mono', ui-monospace, monospace"
        : "'Inter', ui-sans-serif, system-ui, sans-serif");
  };
  const pct = (v: number): string => `${String(v).replace('.', ',')}%`;

  // ── Header ──
  setFont(500, 14, true);
  ctx.fillStyle = C.electric;
  ctx.fillText(
    `PERIODE · ${periodLabel(data.from ? new Date(data.from) : null, new Date(data.to))}`.toUpperCase(),
    72,
    96,
  );

  setFont(700, 62);
  ctx.fillStyle = fg;
  ctx.fillText('Mpruy AI Overview', 72, 170);

  // ── Hero: TOKEN DIPROSES (angka terbesar di kartu) ──
  setFont(600, 15, true);
  ctx.fillStyle = muted;
  ctx.fillText('TOKEN DIPROSES', 72, 302);

  setFont(700, 122);
  ctx.fillStyle = C.electric;
  ctx.fillText(compactId(data.totalTokens), 72, 428);

  setFont(400, 20);
  ctx.fillStyle = muted;
  ctx.fillText(
    `in ${compactId(data.promptTokens)}  ·  out ${compactId(data.completionTokens)}`,
    72,
    472,
  );

  setFont(500, 18, true);
  ctx.fillStyle = muted;
  ctx.fillText(`${fullId(data.requests)} total request`, 72, 518);

  // ── Row 2: dua card — CACHE HIT | MODEL DIPAKAI ──
  const cardW = (W - 144 - 24) / 2; // 456
  const cardY = 568;
  const cards: Array<{ label: string; value: string; sub: string; accent: boolean }> = [
    {
      label: 'CACHE HIT',
      value: data.cachedHitPct == null ? '—' : pct(data.cachedHitPct),
      sub: `${compactId(data.cachedPromptTokens)} token dari cache`,
      accent: data.cachedHitPct != null && data.cachedHitPct > 0,
    },
    {
      label: 'MODEL DIPAKAI',
      value: String(data.distinctModels),
      sub: data.topModels[0]
        ? `favorit: ${data.topModels[0].name}`
        : 'belum ada pemakaian',
      accent: false,
    },
  ];
  cards.forEach((cd, i) => {
    const cx = 72 + i * (cardW + 24);
    ctx.fillStyle = panel;
    drawRoundedRect(ctx, cx, cardY, cardW, 150, 20);
    ctx.fill();
    ctx.strokeStyle = hairline;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = cd.accent ? C.electric : hairline;
    ctx.fillRect(cx, cardY + 28, 4, 94);

    setFont(600, 13, true);
    ctx.fillStyle = muted;
    ctx.fillText(cd.label, cx + 28, cardY + 46);

    setFont(700, 48);
    ctx.fillStyle = cd.accent ? C.electric : fg;
    ctx.fillText(cd.value, cx + 28, cardY + 106);

    setFont(400, 16);
    ctx.fillStyle = muted;
    ctx.fillText(fitText(ctx, cd.sub, cardW - 56), cx + 28, cardY + 132);
  });

  // ── Top 3 model dengan persentase bar ──
  setFont(600, 14, true);
  ctx.fillStyle = muted;
  ctx.fillText('TOP MODEL', 72, 792);

  if (data.topModels.length === 0) {
    setFont(400, 19);
    ctx.fillStyle = muted;
    ctx.fillText('Belum ada pemakaian pada periode ini.', 72, 832);
  } else {
    const rowH = 84;
    let ry = 824;
    for (const m of data.topModels) {
      setFont(600, 25, true);
      ctx.fillStyle = fg;
      ctx.fillText(fitText(ctx, m.name, 560), 72, ry + 28);

      setFont(500, 19, true);
      ctx.fillStyle = muted;
      const right = `${pct(m.pct)} · ${compactId(m.requests)} req`;
      const rw = ctx.measureText(right).width;
      ctx.fillText(right, W - 72 - rw, ry + 28);

      // Bar: latar hairline penuh, fill electric seproporsi pct.
      ctx.fillStyle = hairline;
      drawRoundedRect(ctx, 72, ry + 46, W - 144, 10, 5);
      ctx.fill();
      const fillW = Math.max(10, ((W - 144) * Math.min(100, m.pct)) / 100);
      ctx.fillStyle = C.electric;
      drawRoundedRect(ctx, 72, ry + 46, fillW, 10, 5);
      ctx.fill();

      ry += rowH;
    }
  }

  // ── Nilai pemakaian ──
  setFont(600, 14, true);
  ctx.fillStyle = muted;
  ctx.fillText('NILAI PEMAKAIAN (HARGA RESMI)', 72, 1110);
  setFont(700, 44);
  ctx.fillStyle = fg;
  ctx.fillText(`Rp${fullId(data.valueIdr)}`, 72, 1160);

  // ── Footer: teks di KIRI, logo di KANAN — tidak saling menimpa ──
  ctx.strokeStyle = hairline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, 1206);
  ctx.lineTo(W - 72, 1206);
  ctx.stroke();

  setFont(400, 15, true);
  ctx.fillStyle = muted;
  ctx.fillText(fitText(ctx, email, 560), 72, 1254);

  setFont(700, 22);
  ctx.fillStyle = fg;
  ctx.fillText('Mpruy AI', 72, 1296);
  const brandEnd = 72 + ctx.measureText('Mpruy AI').width + 18;
  setFont(400, 15, true);
  ctx.fillStyle = muted;
  // Domain mulai setelah teks brand terukur — tanpa perkiraan lebar.
  ctx.fillText('ai.mpruy.my.id', brandEnd, 1296);
}


/** Muat logo sekali; resolve tetap dipanggil walau gagal (kartu tanpa glyph). */
function loadLogo(dark: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dark ? '/mpruy-logo-white.png' : '/mpruy-logo-black.png';
  });
}

export function UsageShareCard({ email }: { email: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  const [data, setData] = useState<CardData | null>(null);
  const [range, setRange] = useState<ShareRange>('30');
  const [loading, setLoading] = useState(true);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiFetch(`/api/billing/share-card?days=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('gagal memuat'))))
      .then((d: CardData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Gagal memuat data kartu. Coba lagi.');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    loadLogo(dark).then((img) => {
      if (!cancelled) setLogo(img);
    });
    return () => {
      cancelled = true;
    };
  }, [dark]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    renderCard(ctx, data, email, dark);

    // Logo digambar terpisah (hasil load async); skip bila belum siap.
    if (logo && logo.complete && logo.naturalWidth > 0) {
      const h = 48;
      const w = (logo.naturalWidth / logo.naturalHeight) * h;
      ctx.drawImage(logo, W - 72 - w, 1264, w, h);
    }
  }, [data, email, dark, logo]);

  useEffect(() => {
    draw();
  }, [draw]);

  const toBlob = useCallback(async (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }, []);

  async function download(): Promise<void> {
    const b = await toBlob();
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mpruy-usage-${rangeDays(range) ?? 'all'}d-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy(): Promise<void> {
    const b = await toBlob();
    if (!b) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Browser tidak mendukung salin gambar — pakai Unduh PNG.');
      setTimeout(() => setError(''), 3000);
    }
  }

  async function share(): Promise<void> {
    const b = await toBlob();
    if (!b) return;
    const file = new File([b], 'mpruy-usage.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Mpruy AI — Usage Wrapped' });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // user membatalkan share sheet → diam saja
      }
      return;
    }
    await download();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={range} onValueChange={(v) => setRange(parseShareRange(v))}>
          <TabsList>
            {RANGE_OPTIONS.map((r) => (
              <TabsTrigger key={r.value} value={r.value}>
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copy} disabled={!data || loading}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Tersalin' : 'Salin'}
          </Button>
          <Button variant="outline" onClick={share} disabled={!data || loading}>
            {shared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {shared ? 'Dibagikan' : 'Bagikan'}
          </Button>
          <Button onClick={download} disabled={!data || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Unduh PNG
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && !data ? (
        <Card className="mx-auto w-full max-w-lg">
          <CardContent className="flex h-[420px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : data ? (
        <Card className="mx-auto w-full max-w-lg overflow-hidden p-0">
          <CardContent className="p-0">
            <canvas
              ref={canvasRef}
              width={W * SCALE}
              height={H * SCALE}
              className="block h-auto w-full"
              aria-label="Kartu ringkasan pemakaian Mpruy AI"
            />
          </CardContent>
        </Card>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        Kartu 1080×1350 (4:5) — pas untuk Instagram, X, WhatsApp Status.
      </p>
    </div>
  );
}
