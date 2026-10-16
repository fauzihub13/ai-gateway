# 10 — Billing & Usage

Konsep saldo, usage log, kalkulasi biaya, transaksi atomik, idempotency, pencegahan saldo negatif, refund/adjustment, report, quota, invoice.

---

## 1. Konsep saldo

- Saldo dalam **Rupiah bulat (Int)**. Tidak ada pecahan di level saldo.
- Sumber saldo: top-up (Midtrans), adjustment admin, refund.
- Saldo berkurang hanya karena usage (`UsageLog`) atau adjustment negatif.
- **Semua pergerakan dicatat di `BalanceLedger`** (append-only, menyimpan `balanceAfter` untuk audit).
- Saldo tidak boleh negatif (dicegah atomik, lihat §5).

`User.balance` adalah saldo berjalan (fast read). Kebenaran penuh = replay `BalanceLedger`. Job rekonsiliasi berkala memverifikasi `balance == sum(deltaIdr)`.

---

## 2. Struktur `UsageLog`

Tiap request tercatat satu baris (lihat [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md)):

```
requestId (unique)  → idempotency
userId, apiKeyId
modelId
endpoint            → chat.completions | embeddings | playground
promptTokens, completionTokens, totalTokens
costIdr             → biaya yang ditagih (sudah termasuk markup)
status              → COMPLETED | PARTIAL | ERROR | REJECTED
streamed, latencyMs, upstreamLatencyMs, errorCode
createdAt
```

Status: `REJECTED` = ditolak sebelum ke upstream (auth/limit/saldo) → `costIdr=0`. `ERROR` = gagal upstream tanpa token. `PARTIAL` = stream terputus setelah sebagian token.

---

## 3. Kalkulasi biaya

```ts
export function computeCost(opts: {
  model: { priceInPer1kIdr: number; priceOutPer1kIdr: number };
  plan: { markup: number };
  promptTokens: number;
  completionTokens: number;
}): number {
  const { model, plan, promptTokens, completionTokens } = opts;
  const inCost = (promptTokens / 1000) * model.priceInPer1kIdr;
  const outCost = (completionTokens / 1000) * model.priceOutPer1kIdr;
  const raw = (inCost + outCost) * plan.markup;
  return Math.ceil(raw); // ceil ke rupiah, arah aman (kami)
}
```

Contoh: gpt-4o, plan pro (×1.35), 1.200 prompt + 800 completion:
```
inCost  = 1.2 * 4 = 4.8
outCost = 0.8 * 12 = 9.6
raw = (4.8 + 9.6) * 1.35 = 19.44 → ceil = Rp20
```

---

## 4. Atomic settle (potong saldo + catat usage)

Satu transaksi DB. Cegah saldo negatif via `WHERE balance >= cost`.

```ts
// src/lib/billing.ts
export async function settleUsage(input: {
  requestId: string; userId: string; apiKeyId?: string; modelId: string;
  endpoint: string; promptTokens: number; completionTokens: number;
  costIdr: number; status: 'COMPLETED' | 'PARTIAL' | 'ERROR' | 'REJECTED';
  streamed?: boolean; latencyMs?: number; errorCode?: string;
}) {
  return db.$transaction(async (tx) => {
    // 1. idempotency: insert usage dulu
    const existing = await tx.usageLog.findUnique({ where: { requestId: input.requestId } });
    if (existing) return { duplicated: true, usage: existing };

    const usage = await tx.usageLog.create({
      data: {
        requestId: input.requestId,
        userId: input.userId,
        apiKeyId: input.apiKeyId ?? null,
        modelId: input.modelId,
        endpoint: input.endpoint,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: input.promptTokens + input.completionTokens,
        costIdr: input.costIdr,
        status: input.status,
        streamed: input.streamed ?? false,
        latencyMs: input.latencyMs,
        errorCode: input.errorCode,
      },
    });

    // 2. potong saldo atomic (hanya bila cost > 0)
    if (input.costIdr > 0) {
      const updated = await tx.$executeRaw`
        UPDATE "User"
        SET balance = balance - ${input.costIdr}, "updatedAt" = now()
        WHERE id = ${input.userId} AND balance >= ${input.costIdr}
      `;
      if (updated === 0) {
        // saldo tak cukup saat settle → catat sebagai ERROR, jangan potong
        await tx.usageLog.update({
          where: { id: usage.id },
          data: { costIdr: 0, status: 'ERROR', errorCode: 'insufficient_balance_at_settle' },
        });
        return { duplicated: false, insufficient: true, usage };
      }

      // 3. ledger
      const u = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { balance: true } });
      await tx.balanceLedger.create({
        data: {
          userId: input.userId, deltaIdr: -input.costIdr, balanceAfter: u.balance,
          reason: 'USAGE', referenceId: usage.id,
        },
      });
    }

    // 4. update lastUsedAt key (di luar transaksi idealnya)
    return { duplicated: false, usage };
  });
}
```

### 4.1 Idempotency

- `requestId` unique. Retry `settleUsage` dengan `requestId` sama → `duplicated: true`, tidak potong lagi.
- Untuk stream, `settle` dipanggil sekali di `flush`. Bila function retry (mis. crash), `findUnique` mencegah dobel.

---

## 5. Mencegah saldo negatif (concurrency)

```
Request masuk (sama user, paralel):
  1. FAST GUARD (Redis): cek saldo cache & decrement budget (lihat [12]).
        SET balance:{userId} ... ; DECRBY guard:{userId} budget
        bila guard < 0 → 402 SEBELUM ke upstream
  2. AUTHORITATIVE (DB): settle atomik (§4) dengan WHERE balance >= cost
        yang benar-benar terpotong; sisanya gagal → tetap tidak negatif
  3. RECONCILE: setelah settle, set ulang cache Redis = balance DB
```

Pre-flight check sebelum ke upstream (optimistik, mencegah kirim request yang pasti gagal):

```ts
async function assertBalance(userId: string, estimatedMinCost: number) {
  const cached = await redis.get<number>(`balance:${userId}`);
  const balance = cached ?? (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } })).balance;
  if (balance <= 0) throw new InsufficientBalanceError();
  if (balance < estimatedMinCost) throw new InsufficientBalanceError();
}
```

Catatan: karena biaya final tak diketahui sebelum respons, pre-flight hanya mencegah saldo 0. Penagihan sebenarnya di settle. Bila saldo tidak cukup saat settle → tagih 0 dan catat `ERROR` (bukan saldo negatif).

---

## 6. Refund & adjustment

### 6.1 Refund (usage gagal setelah ditagih)

```
Admin/user ajukan refund → buat BalanceLedger { deltaIdr: +X, reason: REFUND, referenceId: usageId }
                        → tambah User.balance
                        → tandai UsageLog (mis. errorCode: refunded, costIdr tetap untuk audit)
```

### 6.2 Adjustment (koreksi manual)

```bash
curl -X POST /api/admin/users/:id/balance \
  -d '{ "deltaIdr": 50000, "reason": "Manual transfer", "note": "INV-001" }'
```

```ts
await db.$transaction(async (tx) => {
  const u = await tx.user.update({ where: { id }, data: { balance: { increment: delta } }, select: { balance: true } });
  await tx.balanceLedger.create({ data: { userId: id, deltaIdr: delta, balanceAfter: u.balance, reason: 'ADJUSTMENT', note } });
});
```

Semua refund/adjustment wajib beralasan & tercatat di audit admin.

---

## 7. Usage report queries

### 7.1 Per user, per hari (30 hari)

```sql
SELECT date_trunc('day', "createdAt") AS day,
       SUM("totalTokens") AS tokens,
       SUM("costIdr")     AS cost,
       COUNT(*)           AS requests
FROM "UsageLog"
WHERE "userId" = $1
  AND "createdAt" >= now() - interval '30 days'
  AND status IN ('COMPLETED','PARTIAL')
GROUP BY 1 ORDER BY 1;
```

### 7.2 Per model

```sql
SELECT m."publicName", COUNT(*) req, SUM(l."costIdr") cost
FROM "UsageLog" l JOIN "Model" m ON m.id = l."modelId"
WHERE l."userId" = $1 AND l."createdAt" >= date_trunc('month', now())
GROUP BY 1 ORDER BY cost DESC;
```

### 7.3 Per API key

```sql
SELECT k.prefix, k.name, COUNT(*) req, SUM(l."costIdr") cost
FROM "UsageLog" l JOIN "ApiKey" k ON k.id = l."apiKeyId"
WHERE l."userId" = $1 AND l."createdAt" >= date_trunc('month', now())
GROUP BY 1,2 ORDER BY cost DESC;
```

### 7.4 Summary bulan ini

```sql
SELECT COUNT(*) requests, SUM("totalTokens") tokens, SUM("costIdr") cost
FROM "UsageLog"
WHERE "userId" = $1 AND "createdAt" >= date_trunc('month', now());
```

---

## 8. Quota & limit

Dua lapis:

1. **Saldo (pay-as-you-go):** habis → 402.
2. **Quota bulanan plan (subscription):** `monthlyTokenLimit` per bulan kalender.

```
pemakaian_bulan = SUM(totalTokens) Where userId AND createdAt >= date_trunc('month', now())
bila pemakaian_bulan >= plan.monthlyTokenLimit → 429 quota_exceeded
```

Cache counter bulanan di Redis (`quota:{userId}:{YYYY-MM}`), di-increment per settle, TTL akhir bulan. Fallback ke DB saat cache absen.

Per-key `monthlyLimitIdr`: batas belanja key per bulan → 429 `key_quota_exceeded`.

---

## 9. Invoice

- **Top-up:** invoice dibuat saat `Transaction` PAID. `GET /api/billing/invoices/:id` → JSON/PDF.
- **Bulanan (subscription):** job awal bulan generate invoice ringkas (langganan + usage), kirim via Resend.
- Nomor invoice: `INV-{YYYYMM}-{seq}`. Simpan nomor & snapshot total di `Transaction`/tabel invoice (fase awal: derive dari Transaction).

Contoh JSON invoice:

```json
{
  "invoiceNumber": "INV-202408-000123",
  "issuedAt": "2024-08-01T00:00:00Z",
  "user": { "email": "user@example.com", "name": "Budi" },
  "items": [{ "description": "Top-up saldo", "amountIdr": 100000 }],
  "totalIdr": 100000,
  "status": "PAID"
}
```

---

## 10. Rekonsiliasi saldo

Job harian:

```ts
async function reconcileBalances() {
  const users = await db.user.findMany({ select: { id: true, balance: true } });
  for (const u of users) {
    const agg = await db.balanceLedger.aggregate({ where: { userId: u.id }, _sum: { deltaIdr: true } });
    const expected = agg._sum.deltaIdr ?? 0;
    if (expected !== u.balance) {
      await alert('balance_mismatch', { userId: u.id, db: u.balance, ledger: expected });
      // koreksi otomatis opsional (buat entri ADJUSTMENT) — butuh review manual
    }
  }
}
```

Selisih menandakan bug; jangan auto-koreksi tanpa review, tapi alert keras.

---

## 11. Edge cases & failure modes

| Kasus | Penanganan |
|---|---|
| 9Router tidak kirim usage | fallback `estimateTokens` |
| Stream putus setelah sebagian | status `PARTIAL`, tagih token terkumpul |
| Settle gagal (DB down) | request balas sukses tapi **harus** masuk antrean retry; tulis ke Redis queue untuk settle ulang → JANGAN hilang (lihat [18-MONITORING.md](./18-MONITORING.md)) |
| Dobel settle (retry) | `requestId` unique mencegah |
| Saldo kurang saat settle | tagih 0, status ERROR, log; user tetap respons |
| Harga model berubah di tengah bulan | harga dibaca saat settle (real-time); dokumentasikan bahwa harga bisa berubah |
| Refund besar | butuh persetujuan admin + audit |

**Penting:** kegagalan settle (setelah user sudah dapat respons) harus tetap diproses lewat antrean. Data uang tidak boleh hilang. Implementasi minimal: tulis job ke Redis list; worker/cron memproses; alert bila antrean menumpuk.

---

## 12. Referensi

- Skema & ledger → [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md)
- Top-up & webhook → [11-PAYMENT-GATEWAY.md](./11-PAYMENT-GATEWAY.md)
- Rate limit & guard Redis → [12-RATE-LIMITING.md](./12-RATE-LIMITING.md)
- Stream settle → [09-STREAMING.md](./09-STREAMING.md)
- Monitoring & alert → [18-MONITORING.md](./18-MONITORING.md)