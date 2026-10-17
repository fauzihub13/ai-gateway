# 02 — Tech Stack

Stack per layer, alasan pemilihan, versi minimum, alternatif, serta `package.json` siap pakai.

---

## 1. Ringkasan stack per layer

| Layer | Pilihan | Versi min | Alasan | Alternatif |
|---|---|---|---|---|
| Bahasa | TypeScript | 5.4 | Type-safety, satu bahasa FE/BE | JavaScript (ditolak: rawan bug) |
| Framework | Next.js (App Router) | 14.2 | RSC, Route Handlers, satu codebase, deploy Vercel | Remix, SvelteKit, Express+React |
| Runtime | Node.js | 20 LTS | Stream SSE stabil, ekosistem | Bun (belum stabil utk prod), Edge (tidak cocok stream panjang) |
| UI | React | 18.3 | Dasar Next.js | — |
| Styling | Tailwind CSS | 3.4 | Cepat, konsisten | CSS Modules, styled-components |
| Komponen UI | shadcn/ui (Radix) | latest | Aksesibel, dapat di-copy, tanpa lock-in | MUI, Chakra |
| Chart | Recharts | 2.12 | Ringan, kompatibel React 18 | Chart.js, visx |
| ORM | Prisma | 5.14 | Type-safe, migrasi baik | Drizzle, Kysely |
| Database | PostgreSQL | 15 | Handal, JSONB, transaksional | MySQL (ditolak: fitur kurang) |
| Cache/Rate limit | Redis (Upstash) | REST/Redis 7 | Serverless, atomik, TTL | ioredis self-host |
| Validasi | Zod | 3.23 | Skema runtime + tipe | Yup, io-ts |
| Auth | JWT (jose) + httpOnly cookie | jose 5 | Ringan, edge-compatible | next-auth (berat untuk kasus ini) |
| Password hashing | argon2 | 0.40 | Standar modern | bcrypt |
| Payment | Midtrans (midtrans-client) | 1.4 | Populer di ID, Snap mudah | Xendit, Stripe (kurang lokal) |
| Email | Resend (SMTP `smtp.resend.com`) | 3.4 | API sederhana + dukungan SMTP, deliverability baik | SendGrid, Postmark, Amazon SES |
| Error tracking | Sentry | 8.x | Tracing + error | Axiom, Highlight |
| Token estimator | gpt-tokenizer | 2.x | Estimasi token offline | tiktoken (butuh WASM) |
| Testing unit/integ | Vitest | 1.6 | Cepat, ESM native | Jest |
| Testing E2E | Playwright | 1.45 | Multi-browser, andal | Cypress |
| Load test | k6 | 0.50 | Skrip JS, hasil bagus | artillery |
| Cron | Vercel Cron | — | Sederhana, tanpa infra | GitHub Actions schedule |

---

## 2. Batasan versi penting

| Paket | Batasan | Sebab |
|---|---|---|
| `next` | `>=14.2 <15` | App Router stabil; hindari breaking change mayor saat produksi |
| `node` | `>=20.0.0` | `fetch` native + stream Web API stabil |
| `@prisma/client` & `prisma` | versi sama persis | Hindari mismatch engine |
| `react` | `18.3.x` | Kompatibel Next 14 |
| `jose` | `>=5` | API baru (`SignJWT`) |
| `argon2` | butuh native build | Pastikan build image punya toolchain, atau pakai `@node-rs/argon2` (prebuilt) |

Catatan runtime: **Route Handler `/v1/chat/completions` wajib Node runtime**, bukan Edge, karena butuh stream panjang, crypto/argon2, dan koneksi TCP ke 9Router.

```ts
// app/v1/chat/completions/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // detik; sesuaikan plan Vercel
```

---

## 3. `package.json` siap pakai

```json
{
  "name": "mpruy-ai",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:studio": "prisma studio",
    "db:seed": "prisma db seed",
    "load:test": "k6 run tests/load/chat.js"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "5.14.0",
    "@node-rs/argon2": "1.8.3",
    "jose": "5.4.0",
    "zod": "3.23.8",
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "tailwindcss": "3.4.7",
    "class-variance-authority": "0.7.0",
    "clsx": "2.1.1",
    "tailwind-merge": "2.4.0",
    "lucide-react": "0.417.0",
    "recharts": "2.12.7",
    "@radix-ui/react-dialog": "1.1.1",
    "@radix-ui/react-dropdown-menu": "2.1.1",
    "@radix-ui/react-tabs": "1.1.0",
    "@radix-ui/react-tooltip": "1.1.2",
    "midtrans-client": "1.4.2",
    "resend": "3.4.0",
    "gpt-tokenizer": "2.5.0",
    "@upstash/redis": "1.34.0",
    "@upstash/ratelimit": "2.0.1",
    "@sentry/nextjs": "8.25.0",
    "nanoid": "5.0.7",
    "date-fns": "3.6.0"
  },
  "devDependencies": {
    "prisma": "5.14.0",
    "typescript": "5.4.5",
    "@types/node": "20.14.12",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "eslint": "8.57.0",
    "eslint-config-next": "14.2.5",
    "prettier": "3.3.3",
    "prettier-plugin-tailwindcss": "0.6.5",
    "tsx": "4.16.2",
    "vitest": "1.6.0",
    "@vitejs/plugin-react": "4.3.1",
    "@playwright/test": "1.45.3",
    "msw": "2.3.4",
    "dotenv": "16.4.5"
  }
}
```

---

## 4. Struktur direktori

```
mpruy-ai/
├── app/
│   ├── (marketing)/            # landing, pricing, docs publik
│   ├── (dashboard)/            # area login user: keys, usage, billing, playground
│   ├── (admin)/                # admin panel
│   ├── api/                    # auth, keys, billing, admin
│   └── v1/                     # PROXY OpenAI-compatible
│       ├── chat/completions/route.ts
│       ├── models/route.ts
│       └── embeddings/route.ts
├── src/
│   ├── lib/
│   │   ├── db.ts               # Prisma client singleton
│   │   ├── redis.ts            # Upstash client
│   │   ├── auth.ts             # JWT, session
│   │   ├── apikey.ts           # generate/hash/verify user API key
│   │   ├── ninerouter.ts       # client ke 9Router (gateway key)
│   │   ├── model-mapping.ts    # public → internal model
│   │   ├── billing.ts          # kalkulasi & potong saldo
│   │   ├── ratelimit.ts        # multi-level limiter
│   │   ├── stream.ts           # TransformStream normalisasi SSE
│   │   └── errors.ts           # error hierarchy + mapping
│   ├── components/             # UI reusable
│   └── middleware.ts           # proteksi route dashboard/admin
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── load/                   # k6 scripts
├── .env.example
├── next.config.mjs
├── tailwind.config.ts
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

---

## 5. Konfigurasi kunci

### 5.1 `next.config.mjs`

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};
export default nextConfig;
```

### 5.2 `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```

---

## 6. Utilitas inti (client penting)

### 6.1 Prisma client singleton — `src/lib/db.ts`

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

### 6.2 Redis (Upstash) — `src/lib/redis.ts`

```ts
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

### 6.3 Client 9Router — `src/lib/ninerouter.ts`

```ts
const BASE = process.env.NINE_ROUTER_URL!;          // mis. http://10.0.0.5:8080
const GATEWAY_KEY = process.env.NINE_ROUTER_API_KEY!;

export function nineRouterFetch(path: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GATEWAY_KEY}`,
      ...(init.headers ?? {}),
    },
  });
}
```

> **Jangan pernah** log `GATEWAY_KEY`. Redact di semua logger (lihat [13-SECURITY.md](./13-SECURITY.md)).

---

## 7. Alternatif yang dipertimbangkan (dan ditolak)

| Keputusan | Alternatif | Alasan ditolak |
|---|---|---|
| Next.js monolith | Service proxy terpisah (Go) | Ops overhead; volume awal belum butuh |
| Upstash Redis | Redis self-host | Perlu infra & HA; Upstash cukup di awal |
| argon2 | bcrypt | argon2 lebih modern; bcrypt OK bila build native bermasalah |
| Midtrans | Xendit | Midtrans dominan & Snap lebih cepat integrasi |
| JWT custom | next-auth | next-auth berat & kurang fleksibel untuk API-key-first |
| Vercel Cron | GitHub Actions | Cron Vercel satu config, tanpa secret CI |

---

## 8. Referensi

- Deploy & env → [17-DEPLOYMENT.md](./17-DEPLOYMENT.md)
- Skema DB → [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md)
- Rate limit impl → [12-RATE-LIMITING.md](./12-RATE-LIMITING.md)