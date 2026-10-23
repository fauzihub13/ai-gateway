import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { formatIdr, formatNumber } from '@/lib/utils';
import { SiteNav } from '@/components/landing/site-nav';
import { RoutingDiagram } from '@/components/landing/routing-diagram';
import { ProviderStrip } from '@/components/landing/provider-strip';
import { RequestPlayground } from '@/components/landing/request-playground';
import { ModelCatalog, type CatalogModel } from '@/components/landing/model-catalog';
import { UsagePreview } from '@/components/landing/usage-preview';
import { Plate } from '@/components/landing/illustrations/plate';
import { IsometricStack } from '@/components/landing/illustrations/isometric-stack';
import { LifecycleMap } from '@/components/landing/illustrations/lifecycle-map';
import { StreamNormalizer } from '@/components/landing/illustrations/stream-normalizer';
import { FailoverTopology } from '@/components/landing/illustrations/failover-topology';
import { TokenMeter } from '@/components/landing/illustrations/token-meter';
import { KeyFingerprint } from '@/components/landing/illustrations/key-fingerprint';
import { Logo } from '@/components/logo';

export const dynamic = 'force-dynamic';

interface Caps {
  stream?: boolean;
  vision?: boolean;
  tools?: boolean;
  jsonMode?: boolean;
  embedding?: boolean;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-px w-6 bg-electric" />
      <span className="tech-label">{children}</span>
    </div>
  );
}

const FEATURES: { glyph: GlyphKind; title: string; desc: string }[] = [
  {
    glyph: 'unify',
    title: 'Unified API access',
    desc: 'Satu endpoint OpenAI-compatible untuk semua provider. Ganti model tanpa mengubah integrasi.',
  },
  {
    glyph: 'route',
    title: 'Model selection & routing',
    desc: 'Gateway memilih provider yang tepat berdasarkan nama model dan plan akun Anda.',
  },
  {
    glyph: 'key',
    title: 'Centralized key management',
    desc: 'Buat, batasi, dan cabut key per project. Scope model, rate limit, dan spending limit per key.',
  },
  {
    glyph: 'chart',
    title: 'Usage & cost analytics',
    desc: 'Request, token, dan biaya terperinci per key, per model, dan per hari.',
  },
  {
    glyph: 'pulse',
    title: 'Request monitoring',
    desc: 'Lacak status, latensi, dan error tiap request dengan request id yang konsisten.',
  },
  {
    glyph: 'wallet',
    title: 'Billing & usage limits',
    desc: 'Saldo prabayar, limit rate, dan kuota token bulanan mengikuti plan yang dipilih.',
  },
];

type GlyphKind = 'unify' | 'route' | 'key' | 'chart' | 'pulse' | 'wallet';

function Glyph({ kind }: { kind: GlyphKind }) {
  const common = {
    fill: 'none',
    stroke: 'hsl(var(--electric))',
    strokeWidth: 1.3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 56 40" className="h-10 w-14" aria-hidden="true">
      {kind === 'unify' && (
        <>
          <rect x="1" y="14" width="14" height="12" rx="1.5" {...common} />
          {[8, 16, 24].map((y) => (
            <rect key={y} x="41" y={y} width="14" height="8" rx="1.5" {...common} />
          ))}
          <path d="M15 20 H28 M28 20 V11 H41 M28 20 H41 M28 20 V28 H41" {...common} strokeOpacity="0.6" />
        </>
      )}
      {kind === 'route' && (
        <>
          <circle cx="7" cy="20" r="4" {...common} />
          <circle cx="49" cy="8" r="3" {...common} />
          <circle cx="49" cy="20" r="3" {...common} />
          <circle cx="49" cy="32" r="3" {...common} />
          <path d="M11 20 L32 20 M32 20 L46 8 M32 20 L46 20 M32 20 L46 32" {...common} strokeOpacity="0.65" />
          <circle cx="32" cy="20" r="0" fill="hsl(var(--electric))" />
        </>
      )}
      {kind === 'key' && (
        <>
          <circle cx="12" cy="18" r="6" {...common} />
          <circle cx="12" cy="18" r="1.6" fill="hsl(var(--electric))" stroke="none" />
          <path d="M18 18 H48 M41 18 V25 M47 18 V24" {...common} />
        </>
      )}
      {kind === 'chart' && (
        <>
          <path d="M3 34 H53 M3 34 V6" {...common} strokeOpacity="0.5" />
          <path d="M7 29 L18 20 L28 25 L39 12 L51 16" {...common} />
          {[
            [18, 20],
            [28, 25],
            [39, 12],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="2" fill="white" stroke="hsl(var(--electric))" strokeWidth="1.2" />
          ))}
        </>
      )}
      {kind === 'pulse' && (
        <>
          <path d="M3 20 H14 L18 10 L24 30 L29 20 H53" {...common} />
          <circle cx="24" cy="30" r="2" fill="hsl(var(--electric))" stroke="none" />
        </>
      )}
      {kind === 'wallet' && (
        <>
          <rect x="4" y="9" width="48" height="24" rx="2" {...common} />
          <path d="M4 17 H52" {...common} strokeOpacity="0.5" />
          <rect x="36" y="20" width="10" height="6" rx="1" {...common} />
          <circle cx="41" cy="23" r="1.2" fill="hsl(var(--electric))" stroke="none" />
        </>
      )}
    </svg>
  );
}

export default async function Home() {
  const [modelRows, planRows, liveStats, liveByModel, liveStatus, liveDaily] = await Promise.all([
    db.model.findMany({
      where: { isActive: true },
      orderBy: { priceInPer1MIdr: 'asc' },
      select: {
        publicName: true,
        displayName: true,
        contextWindow: true,
        priceInPer1MIdr: true,
        priceOutPer1MIdr: true,
        capabilities: true,
      },
    }),
    db.plan.findMany({
      where: { isActive: true },
      orderBy: { monthlyPriceIdr: 'asc' },
      include: { _count: { select: { models: true } } },
    }),
    // Observability section: agregat platform-wide (bukan per user), 14 hari terakhir.
    db.$queryRaw<
      Array<{ requests: bigint; promptTokens: bigint | null; completionTokens: bigint | null; cost: bigint | null }>
    >(Prisma.sql`
      SELECT count(*) AS requests,
             COALESCE(sum("promptTokens"), 0) AS "promptTokens",
             COALESCE(sum("completionTokens"), 0) AS "completionTokens",
             COALESCE(sum("costIdr"), 0) AS cost
      FROM "UsageLog"
      WHERE "createdAt" >= now() - interval '14 days'
        AND status <> 'REJECTED'::"UsageStatus"
    `),
    db.$queryRaw<Array<{ modelId: string | null; requests: bigint }>>(Prisma.sql`
      SELECT "modelId", count(*) AS requests
      FROM "UsageLog"
      WHERE "createdAt" >= now() - interval '14 days'
        AND status <> 'REJECTED'::"UsageStatus"
      GROUP BY 1
      ORDER BY 2 DESC
    `),
    db.$queryRaw<Array<{ status: string; requests: bigint }>>(Prisma.sql`
      SELECT status::text AS status, count(*) AS requests
      FROM "UsageLog"
      WHERE "createdAt" >= now() - interval '14 days'
      GROUP BY 1
    `),
    // Volume request + token per hari (14 hari) untuk chart.
    db.$queryRaw<Array<{ key: string; requests: bigint; tokens: bigint | null }>>(Prisma.sql`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS key,
             count(*) AS requests,
             COALESCE(sum("totalTokens"), 0) AS tokens
      FROM "UsageLog"
      WHERE "createdAt" >= now() - interval '14 days'
        AND status <> 'REJECTED'::"UsageStatus"
      GROUP BY 1
      ORDER BY 1 ASC
    `),
  ]);

  // Nama model publik untuk distribusi (jangan pernah expose internalName/provider).
  const [liveTotals] = liveStats;
  const byModelNames = await db.model.findMany({
    where: { id: { in: liveByModel.map((r) => r.modelId).filter((v): v is string => Boolean(v)) } },
    select: { id: true, publicName: true },
  });
  const modelNameById = Object.fromEntries(byModelNames.map((m) => [m.id, m.publicName]));

  const models: CatalogModel[] = modelRows.map((m) => ({
    publicName: m.publicName,
    displayName: m.displayName,
    contextWindow: m.contextWindow,
    priceInPer1MIdr: m.priceInPer1MIdr,
    priceOutPer1MIdr: m.priceOutPer1MIdr,
    capabilities: (m.capabilities as Caps) ?? {},
  }));

  // Data Observability landing: agregat platform-wide, hanya angka publik
  // (request/token/biaya/status). Tidak ada userId, key, atau provider internal.
  const byModelShare = liveByModel.slice(0, 5);
  const totalModelReq = byModelShare.reduce((a, b) => a + Number(b.requests), 0);
  const usagePreviewData = {
    days: 14,
    requests: Number(liveTotals?.requests ?? 0),
    tokens:
      Number(liveTotals?.promptTokens ?? 0) + Number(liveTotals?.completionTokens ?? 0),
    cost: Number(liveTotals?.cost ?? 0),
    volume: Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
      const found = liveDaily.find((r) => r.key === d);
      return { key: d, requests: Number(found?.requests ?? 0), tokens: Number(found?.tokens ?? 0) };
    }),
    byModel: byModelShare.map((r) => ({
      name: modelNameById[r.modelId ?? ''] ?? 'lainnya',
      share: totalModelReq > 0 ? Math.round((Number(r.requests) / totalModelReq) * 100) : 0,
    })),
    status: liveStatus.map((r) => ({
      label: r.status,
      count: Number(r.requests),
    })),
  };

  return (
    <div className="min-h-screen">
      <SiteNav />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="container grid items-center gap-12 py-16 lg:grid-cols-[1fr_1.05fr] lg:py-24">
          <div>
            <Eyebrow>Unified AI Provider Gateway</Eyebrow>
            <h1 className="mt-5 font-display text-[2.6rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl">
              One API.
              <br />
              Every AI Model.
            </h1>
            <p className="reading mt-6 max-w-lg">
              Mpruy AI menyatukan banyak provider AI di balik satu endpoint OpenAI-compatible. Pilih model, kelola key,
              dan pantau biaya dari satu dashboard — tanpa mengubah kode selain <span className="font-mono text-foreground">baseURL</span>.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-10 items-center gap-2 rounded-sm bg-electric px-5 text-sm font-medium text-white transition-colors hover:bg-electric/90"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-10 items-center gap-2 rounded-sm border border-hairline bg-card px-5 text-sm font-medium text-foreground transition-colors hover:border-electric hover:text-electric"
              >
                Read Documentation
              </Link>
            </div>

            <div className="mt-9 inline-flex items-center gap-3 rounded-sm border border-hairline bg-card px-3 py-2">
              <span className="h-1.5 w-1.5 animate-node-pulse rounded-full bg-electric" />
              <code className="font-mono text-[12.5px] text-foreground">POST /v1/chat/completions</code>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                OpenAI-compatible
              </span>
            </div>
          </div>

          <RoutingDiagram />
        </div>

        <div className="container">
          <div className="border-t border-hairline py-6">
            <p className="tech-label mb-4">routed providers</p>
            <ProviderStrip />
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 border-t border-hairline">
        <div className="container py-16 lg:py-20">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <Eyebrow>Platform</Eyebrow>
              <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Infrastruktur lengkap untuk mengirim request AI.
              </h2>
            </div>
            <p className="reading max-w-sm">
              Bukan sekadar proxy. Gateway ini menangani routing, autentikasi, limit, dan pencatatan biaya.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-sm border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="group bg-card p-6">
                <div className="flex items-start justify-between">
                  <Glyph kind={f.glyph} />
                  <span className="font-mono text-[10px] text-muted-foreground/70">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-[15px] font-semibold tracking-tight">{f.title}</h3>
                <p className="reading mt-2 text-[15px]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Anatomy showcase ─────────────────────────────────── */}
      <section id="anatomy" className="scroll-mt-20 border-t border-hairline">
        <div className="container py-16 lg:py-20">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <Eyebrow>Blueprint</Eyebrow>
              <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Anatomi gateway, lapis demi lapis.
              </h2>
            </div>
            <p className="reading max-w-sm">
              Enam diagram teknis — tiap satu menjelaskan bagian berbeda dari cara kerja gateway, bukan sekadar pola
              jaringan yang diulang.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Plate
              label="gateway.anatomy"
              index="01"
              title="Lapisan yang dilewati request"
              caption="Proyeksi isometrik: request turun melewati edge, auth, limit, router, lalu billing. Arahkan kursor ke sebuah lapisan untuk menyorotnya."
            >
              <IsometricStack />
            </Plate>

            <Plate
              label="request.lifecycle"
              index="02"
              title="Rute transit request"
              caption="Digambar seperti peta transit: auth → rate limit → resolve model → route → stream → settle usage. Hover stasiun untuk detail setiap tahap."
            >
              <LifecycleMap />
            </Plate>

            <Plate
              className="lg:col-span-2"
              label="stream.sse"
              index="03"
              title="Normalisasi streaming"
              caption="Chunk SSE upstream masuk satu per satu, melewati gerbang (normalize → inject [DONE] → usage), lalu keluar sebagai teks utuh di client. Tombol di kanan atas mengganti sumber usage: dari upstream atau hasil estimasi fallback."
            >
              <StreamNormalizer />
            </Plate>

            <Plate
              label="resilience.failover"
              index="04"
              title="Retry & failover"
              caption="Bila provider utama mengembalikan error, request dicoba ulang ke fallback. Perilaku retry diilustrasikan; ini bukan status upstream secara live."
            >
              <FailoverTopology />
            </Plate>

            <Plate
              label="billing.meter"
              index="05"
              title="Instrumen biaya"
              caption="Level meter token, odometer pemakaian bulan ini, dan saldo prabayar. Rumus biaya per request ditampilkan apa adanya."
            >
              <TokenMeter />
            </Plate>
          </div>
        </div>
      </section>

      {/* ── Playground ───────────────────────────────────────── */}
      <section className="border-t border-hairline">
        <div className="container py-16 lg:py-20">
          <div className="mb-8 max-w-2xl">
            <Eyebrow>Request lifecycle</Eyebrow>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Lihat request menempuh gateway.
            </h2>
            <p className="reading mt-4">
              Resolve model → route ke provider → stream balasan sebagai SSE. Contoh di bawah adalah simulasi, bukan
              panggilan API sungguhan.
            </p>
          </div>
          <RequestPlayground models={models.map((m) => ({ publicName: m.publicName, displayName: m.displayName }))} />
        </div>
      </section>

      {/* ── Model catalog ────────────────────────────────────── */}
      <section id="models" className="scroll-mt-20 border-t border-hairline">
        <div className="container py-16 lg:py-20">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <Eyebrow>Model catalog</Eyebrow>
              <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Model yang tersedia sekarang.
              </h2>
            </div>
            <Link href="/docs" className="link-rule self-start text-sm text-electric sm:self-auto">
              Lihat katalog lengkap <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <ModelCatalog models={models} />
        </div>
      </section>

      {/* ── Usage preview ────────────────────────────────────── */}
      <section className="border-t border-hairline">
        <div className="container py-16 lg:py-20">
          <div className="mb-8 max-w-2xl">
            <Eyebrow>Observability</Eyebrow>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Setiap token, terhitung dan terlihat.
            </h2>
            <p className="reading mt-4">
              Pantau volume request, konsumsi token, estimasi biaya, dan distribusi model. Angka di bawah adalah data
              pemakaian platform 14 hari terakhir — diperbarui setiap halaman dimuat.
            </p>
          </div>
          <UsagePreview data={usagePreviewData} />
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-20 border-t border-hairline">
        <div className="container py-16 lg:py-20">
          <div className="mb-8 max-w-2xl">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Satu plan, semua model. Bayar paket, bukan per token.
            </h2>
            <p className="reading mt-4">
              Setiap plan punya akses model, limit rate, dan kuota token sendiri. Harga di tabel model adalah harga
              resmi provider — dipakai untuk menghitung nilai pemakaian Anda, bukan tagihan tambahan.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-sm border border-hairline bg-hairline md:grid-cols-3">
            {planRows.map((p) => (
              <div key={p.id} className="flex flex-col bg-card p-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold tracking-tight">{p.displayName}</h3>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {p.name}
                  </span>
                </div>
                <div className="mt-4 flex items-end gap-1">
                  <span className="tabular font-display text-3xl tracking-tight">
                    {p.monthlyPriceIdr > 0 ? formatIdr(p.monthlyPriceIdr) : 'Gratis'}
                  </span>
                  {p.monthlyPriceIdr > 0 && (
                    <span className="pb-1 font-mono text-[11px] text-muted-foreground">/ {p.periodDays} hari</span>
                  )}
                </div>

                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  <li className="flex justify-between border-b border-hairline pb-2">
                    <span className="text-muted-foreground">Akses model</span>
                    <span className="tabular font-mono text-xs">{p._count.models}</span>
                  </li>
                  <li className="flex justify-between border-b border-hairline pb-2">
                    <span className="text-muted-foreground">Rate limit</span>
                    <span className="tabular font-mono text-xs">{formatNumber(p.rpmLimit)} rpm</span>
                  </li>
                  <li className="flex justify-between border-b border-hairline pb-2">
                    <span className="text-muted-foreground">Kuota token</span>
                    <span className="tabular font-mono text-xs">
                      {p.monthlyTokenLimit === null ? 'unlimited' : formatNumber(p.monthlyTokenLimit)}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Mode</span>
                    <span className="tabular font-mono text-xs">
                      {p.billingMode === 'SUBSCRIPTION' ? 'paket' : 'pay-as-you-go'}
                    </span>
                  </li>
                </ul>

                <Link
                  href="/register"
                  className="mt-6 inline-flex h-9 items-center justify-center rounded-sm border border-hairline text-sm font-medium transition-colors hover:border-electric hover:text-electric"
                >
                  Pilih {p.displayName}
                </Link>
              </div>
            ))}
            {planRows.length === 0 && (
              <div className="bg-card p-6">
                <p className="text-sm text-muted-foreground">Belum ada plan aktif.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <section className="border-t border-hairline">
        <div className="container grid items-center gap-10 py-16 lg:grid-cols-[1.2fr_1fr] lg:py-24">
          <div>
            <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              One endpoint. Your entire AI stack.
            </h2>
            <p className="reading mt-5 max-w-xl">
              Buat akun, generate API key, dan kirim request pertama dalam hitungan menit. Tanpa ganti SDK, tanpa
              kelola banyak provider.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-10 items-center gap-2 rounded-sm bg-electric px-5 text-sm font-medium text-white transition-colors hover:bg-electric/90"
              >
                Buat API Key
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/docs" className="link-rule text-sm text-electric">
                Baca dokumentasi <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="rounded-sm border border-hairline bg-card p-4">
            <KeyFingerprint />
          </div>
        </div>
      </section>

      <footer className="border-t border-hairline">
        <div className="container flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Logo className="h-5" />
            <span className="font-display text-sm font-semibold">
              Mpruy<span className="text-electric">AI</span>
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/#models" className="link-rule hover:text-foreground">Models</Link>
            <Link href="/#anatomy" className="link-rule hover:text-foreground">Blueprint</Link>
            <Link href="/#pricing" className="link-rule hover:text-foreground">Pricing</Link>
            <Link href="/docs" className="link-rule hover:text-foreground">Documentation</Link>
            <Link href="/disclaimer" className="link-rule hover:text-foreground">Disclaimer</Link>
            <Link href="/login" className="link-rule hover:text-foreground">Sign in</Link>
          </nav>
          <span className="font-mono text-[11px] text-muted-foreground">© {new Date().getFullYear()} Mpruy AI</span>
        </div>
      </footer>
    </div>
  );
}