# 19 — Testing

Testing pyramid, tools, coverage, contoh test kritikal path, mocking 9Router & Midtrans, load testing, security testing, test data management, CI integration.

---

## 1. Testing pyramid

```
        ▲  E2E (Playwright)         sedikit, jalur bisnis kritis
       ╱ ╲
      ╱   ╲  Integration (Vitest)   sedang, endpoint + DB
     ╱     ╲
    ╱       ╲ Unit (Vitest)         banyak, pure logic
   ╱─────────╲
```

| Level | Tool | Target coverage | Fokus |
|---|---|---|---|
| Unit | Vitest | 80%+ pada lib inti | billing, mapping model, apikey hash, stream parse |
| Integration | Vitest + DB test | endpoint kritikal | auth, keys, /v1 proxy, webhook |
| E2E | Playwright | jalur utama | register→key→chat, top-up→saldo |
| Load | k6 | — | throughput & latency `/v1` |
| Security | manual + tooling | — | OWASP top 10 |

---

## 2. Prioritas test (kritikal path)

1. **Billing calculation** — kebenaran uang.
2. **Settle idempotent** — cegah dobel tagih.
3. **API key hash & verify** — auth.
4. **Model mapping** (public→internal, jangan bocor internal).
5. **Stream normalizer** (rewrite model, inject [DONE], akumulasi usage).
6. **Webhook Midtrans** (signature, idempotency).
7. **Rate limit** (header, 429).
8. **Error mapping** (jangan bocorkan internal).

---

## 3. Contoh unit test

### 3.1 Billing

```ts
import { describe, it, expect } from 'vitest';
import { computeCostBreakdown, computeUsageValue, isFreeModel } from '@/lib/billing';

describe('computeCostBreakdown', () => {
  const model = { priceInPer1MIdr: 4000, priceOutPer1MIdr: 12000 };
  const payg = { markup: 1.35, billingMode: 'PAYG' };
  const sub = { markup: 1.35, billingMode: 'SUBSCRIPTION' };

  it('PAYG: ditagih = harga resmi × markup, hemat 0', () => {
    const c = computeCostBreakdown({ model, plan: payg, promptTokens: 1200, completionTokens: 800 });
    // raw resmi = 4.8 + 9.6 = 14.4 → value 15; 14.4*1.35 = 19.44 → marked 20
    expect(c.valueIdr).toBe(15);
    expect(c.markedIdr).toBe(20);
    expect(c.chargedIdr).toBe(20);
    expect(c.savedIdr).toBe(0);
  });

  it('SUBSCRIPTION: ditagih 0, hemat = harga retail penuh', () => {
    const c = computeCostBreakdown({ model, plan: sub, promptTokens: 1200, completionTokens: 800 });
    expect(c.valueIdr).toBe(15);
    expect(c.chargedIdr).toBe(0);
    expect(c.savedIdr).toBe(20);
  });

  it('valueIdr tidak terpengaruh markup plan', () => {
    const cheap = computeCostBreakdown({ model, plan: { markup: 1, billingMode: 'PAYG' }, promptTokens: 1000, completionTokens: 0 });
    const pricey = computeCostBreakdown({ model, plan: { markup: 3, billingMode: 'PAYG' }, promptTokens: 1000, completionTokens: 0 });
    expect(cheap.valueIdr).toBe(pricey.valueIdr);
    expect(pricey.markedIdr).toBeGreaterThan(cheap.markedIdr);
  });

  it('nol token → semua nol', () => {
    expect(computeCostBreakdown({ model, plan: payg, promptTokens: 0, completionTokens: 0 }))
      .toEqual({ valueIdr: 0, markedIdr: 0, chargedIdr: 0, savedIdr: 0 });
  });
});

describe('isFreeModel', () => {
  it('markup 0 → efektif gratis walau harga > 0', () => {
    expect(isFreeModel({ priceInPer1MIdr: 4000, priceOutPer1MIdr: 12000 }, { markup: 0 })).toBe(true);
  });
});
```

### 3.2 API key

```ts
import { generateApiKey, hashApiKey } from '@/lib/apikey';

it('format key benar & hash deterministik dengan pepper', () => {
  const raw = generateApiKey();
  expect(raw).toMatch(/^sk-mpruy-[A-Za-z0-9]{40,}$/);
  const h1 = hashApiKey(raw);
  const h2 = hashApiKey(raw);
  expect(h1).toBe(h2);
  expect(h1).toHaveLength(64);
});
```

### 3.3 Model mapping

```ts
it('tidak pernah mengembalikan internalName ke publik', async () => {
  const v = publicModelView({ publicName: 'mimo', internalName: 'mimo-free' });
  expect(JSON.stringify(v)).not.toContain('mimo-free');
});
```

---

## 4. Contoh integration test

### 4.1 Auth + keys + chat (end-to-end API)

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const mock9Router = setupServer(
  http.post(`${process.env.NINE_ROUTER_URL}/v1/chat/completions`, async ({ request }) => {
    const body: any = await request.json();
    // assert platform selalu kirim stream eksplisit
    expect(body.stream).toBe(false);
    expect(body.model).toBe('mimo-free'); // internal
    return HttpResponse.json({
      id: 'chatcmpl-1', object: 'chat.completion', created: 1, model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content: 'Halo!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  }),
);

beforeAll(() => mock9Router.listen());
afterEach(() => mock9Router.resetHandlers());
afterAll(() => mock9Router.close());

it('chat completion memotong saldo & catat usage', async () => {
  const { rawKey } = await createTestKey({ balance: 1000 });
  const res = await POST('/v1/chat/completions', {
    headers: { Authorization: `Bearer ${rawKey}` },
    body: { model: 'mimo', messages: [{ role: 'user', content: 'Halo' }], stream: false },
  });
  expect(res.status).toBe(200);
  const user = await db.user.findFirstOrThrow();
  expect(user.balance).toBeLessThan(1000);
  const usage = await db.usageLog.findFirstOrThrow();
  expect(usage.status).toBe('COMPLETED');
  expect(usage.promptTokens).toBe(10);
});
```

### 4.2 Webhook idempotent

```ts
it('webhook dobel tidak menambah saldo dua kali', async () => {
  const trx = await createPendingTransaction({ amountIdr: 100000 });
  const body = signedWebhook({ order_id: trx.orderId, transaction_status: 'settlement', gross_amount: '100000.00' });

  await POST('/api/billing/webhook', { body });
  const after1 = (await db.user.findUniqueOrThrow({ where: { id: trx.userId } })).balance;

  await POST('/api/billing/webhook', { body }); // dobel
  const after2 = (await db.user.findUniqueOrThrow({ where: { id: trx.userId } })).balance;

  expect(after2).toBe(after1);
});
```

### 4.3 Error tidak bocorkan internal

```ts
it('error upstream tidak bocorkan nama internal', async () => {
  mock9Router.use(http.post('*/v1/chat/completions', () =>
    HttpResponse.json({ error: { message: 'model mimo-free not found' } }, { status: 404 })));
  const res = await POST('/v1/chat/completions', { headers: auth(), body: { model: 'mimo', messages: [], stream: false } });
  const text = await res.text();
  expect(text).not.toContain('mimo-free');
});
```

---

## 5. Mocking

### 5.1 9Router (MSW)

Lihat contoh §4. MSW mencegat `fetch` ke `NINE_ROUTER_URL`. Handler menegaskan platform mengirim `stream` eksplisit dan `internalName`.

Mock stream SSE:

```ts
http.post('*/v1/chat/completions', () => {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode('data: {"model":"mimo-free","choices":[{"delta":{"content":"Ha"},"finish_reason":null}]}\n\n'));
      c.enqueue(enc.encode('data: {"model":"mimo-free","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}\n\n'));
      // sengaja TANPA [DONE] untuk menguji inject
      c.close();
    },
  });
  return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
});
```

### 5.2 Midtrans

Mock `snap.createTransaction` & `snap.transaction.status` via `vi.mock` atau MSW ke API Midtrans. Untuk webhook, buat helper yang menghitung signature valid dengan server key test.

```ts
import { createHash } from 'node:crypto';
export function signedWebhook(p: { order_id: string; gross_amount: string; transaction_status: string }) {
  const status_code = '200';
  const raw = `${p.order_id}${status_code}${p.gross_amount}${process.env.MIDTRANS_SERVER_KEY}`;
  return { ...p, status_code, transaction_status: p.transaction_status,
    signature_key: createHash('sha512').update(raw).digest('hex') };
}
```

---

## 6. E2E (Playwright)

```ts
import { test, expect } from '@playwright/test';

test('alur user baru: register → verify → key → chat', async ({ page }) => {
  await page.goto('/register');
  await page.fill('[name=email]', `u${Date.now()}@test.com`);
  await page.fill('[name=password]', 'Password123');
  await page.click('button[type=submit]');

  // verify via token (test helper ambil dari DB)
  const token = await getLatestVerifyToken(page);
  await page.goto(`/verify?token=${token}`);

  await page.goto('/login');
  await page.fill('[name=email]', `u${Date.now()}@test.com`);
  // ... login, buat key, pakai playground, assert respons
});
```

E2E fokus: register/login, buat key, playground chat, top-up (sandbox), admin suspend.

---

## 7. Load testing (k6)

```js
// tests/load/chat.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const KEY = __ENV.MPRUY_KEY;

export default function () {
  const res = http.post('https://api.mpruy.ai/v1/chat/completions', JSON.stringify({
    model: 'mimo',
    messages: [{ role: 'user', content: 'ping' }],
    stream: false,
  }), { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` } });

  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
```

Jalankan: `MPRUY_KEY=sk-mpruy-... npm run load:test`. Fokus juga uji streaming (k6 `http.get` dengan `responseType` streaming terbatas; streaming load sering lebih baik diuji internal).

---

## 8. Security testing

| Area | Uji |
|---|---|
| OWASP A01 (access control) | user tidak bisa akses key/usage user lain |
| A02 (crypto) | password ter-hash, key tidak plaintext |
| A03 (injection) | fuzz input, pastikan Prisma parametrized |
| A05 (misconfig) | header keamanan ada, debug off |
| A07 (auth) | brute force terbatas, session rotate |
| A09 (logging) | tidak ada secret di log |
| A10 (SSRF) | platform hanya fetch 9Router (URL tetap), bukan URL dari user |

Tool: `npm audit`, `gitleaks`, ZAP scan opsional pada staging.

---

## 9. Test data management

- DB test terpisah (`TEST_DATABASE_URL`). Reset antar suite (`truncate` atau transaksi rollback).
- Factory helper (`createTestUser`, `createTestKey`, `createPendingTransaction`).
- Jangan pakai data produksi. Jangan pakai key/kredensial nyata di test.
- Seed minimal untuk test.

```ts
export async function createTestUser(overrides: Partial<any> = {}) {
  const plan = await db.plan.findFirstOrThrow({ where: { name: 'free' } });
  return db.user.create({ data: {
    email: `t${Date.now()}${Math.random()}@test.com`,
    passwordHash: await hashPassword('Password123'),
    status: 'ACTIVE', planId: plan.id, balance: 0, emailVerifiedAt: new Date(),
    ...overrides,
  }});
}
```

---

## 10. CI integration

Lihat [17 §7](./17-DEPLOYMENT.md). Gate: typecheck, lint, unit+integration, e2e (subset), gitleaks. Coverage minimum untuk `src/lib/*` (billing, apikey, stream, model-mapping).

```bash
npm run typecheck && npm run lint && npm run test && npm run test:e2e
```

---

## 11. Coverage target

| Modul | Target |
|---|---|
| billing | 95% |
| apikey | 95% |
| stream normalizer | 90% |
| model-mapping | 90% |
| auth | 85% |
| endpoints lain | 70% |

Coverage bukan tujuan akhir; fokus pada **jalur uang & auth**.

---

## 12. Referensi

- Flow logic (untuk skenario test) → [03-FLOW-LOGIC.md](./03-FLOW-LOGIC.md)
- Error mapping (untuk assert) → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)
- Streaming (untuk test stream) → [09-STREAMING.md](./09-STREAMING.md)
- Deployment CI → [17-DEPLOYMENT.md](./17-DEPLOYMENT.md)