# 04 — Database Schema

Prinsip desain, ERD, detail tabel, Prisma schema siap pakai, seed, migrasi, dan query patterns.

---

## 1. Prinsip desain

1. **Nama tabel PascalCase singular**, kolom camelCase (lihat konvensi di [00-README.md](./00-README.md)).
2. **Uang disimpan sebagai `Int` dalam Rupiah bulat** (`balance`, `costIdr`, `amountIdr`). Tidak pakai float. Bila perlu presisi sub-rupiah di masa depan → migrasi ke BigInt satuan sen.
3. **Token sebagai `Int`** (`promptTokens`, `completionTokens`) — cukup untuk < 2^31 token per request.
4. **Soft delete** hanya untuk entity yang butuh audit (`User`). Data operasional immutable (UsageLog tidak dihapus).
5. **Immutable ledger** untuk pergerakan uang (`BalanceLedger` / `Transaction`) — append-only, koreksi lewat entri balik, bukan update.
6. **Idempotency lewat unique constraint** (`UsageLog.requestId`, `Transaction.orderId`).
7. **Semua timestamp `timestamptz`** (`DateTime` Prisma → `@db.Timestamptz`).
8. **Indeks eksplisit** untuk kolom yang sering difilter/di-join.

---

## 2. ERD ringkas

```
User 1───* ApiKey
User 1───1 Balance
User 1───* UsageLog
User 1───* Transaction
User 1───1 Subscription (opsional; plan aktif)
User *───1 Plan
ApiKey *─1 Plan (via User, tapi ada key-level override)
Plan 1──* PlanModel *──1 Model
Model 1──* UsageLog
Transaction 1──* BalanceLedger
User 1──* BalanceLedger
AdminAuditLog (writer = User admin)
VerificationToken *─1 User (email verify / reset)
Session (opsional, bila pakai server session; default JWT stateless)
```

```
┌────────┐     ┌────────┐     ┌─────────┐
│  User  │────<│ ApiKey │     │  Plan   │
│        │     └────────┘     └────┬────┘
│        │────<┌──────────┐         │ * 
│        │     │ UsageLog │         │
│        │     └──────────┘    ┌────▼──────┐
│        │────<┌────────────┐  │ PlanModel │
│        │     │Transaction │  └────┬──────┘
│        │     └─────┬──────┘       │ *
│        │           │              │
│        │────<┌─────▼────────┐ ┌───▼────┐
│        │     │BalanceLedger │ │ Model  │
└────────┘     └──────────────┘ └───┬────┘
                                     │ *
                                     │
                                ┌────▼─────┐
                                │ UsageLog │
                                └──────────┘
```

---

## 3. Detail tabel

### 3.1 `User`

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK, cuid | |
| email | String | UNIQUE, not null | lowercase |
| passwordHash | String | not null | argon2 |
| name | String? | | |
| role | Role | not null, default `USER` | enum USER/ADMIN |
| status | UserStatus | not null, default `PENDING_EMAIL` | enum |
| balance | Int | not null, default 0 | Rupiah bulat |
| planId | String | FK → Plan | plan aktif |
| emailVerifiedAt | DateTime? | | |
| lastLoginAt | DateTime? | | |
| createdAt | DateTime | not null | |
| updatedAt | DateTime | not null | |
| deletedAt | DateTime? | | soft delete |

Index: `email` (unique), `status`, `role`.

### 3.2 `ApiKey`

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK | |
| userId | String | FK → User, index | |
| name | String | not null | label user |
| keyHash | String | UNIQUE, not null | sha256(raw+pepper) |
| prefix | String | not null | 12 char pertama (display) |
| last4 | String | not null | 4 char terakhir |
| scope | KeyScope | not null, default `FULL` | FULL / MODELS |
| allowedModels | String[] | default [] | public model names (bila scope=MODELS) |
| rpmLimit | Int? | | override rate limit per key |
| monthlyLimitIdr | Int? | | batas belanja per bulan (opsional) |
| status | KeyStatus | not null, default `ACTIVE` | ACTIVE/REVOKED/EXPIRED |
| expiresAt | DateTime? | | |
| lastUsedAt | DateTime? | | |
| createdAt | DateTime | not null | |
| revokedAt | DateTime? | | |

Index: `keyHash` (unique), `userId`, `status`.

### 3.3 `Model`

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK | |
| publicName | String | UNIQUE, not null | mis. `gpt-4o` |
| internalName | String | not null | mis. `gh/gpt-4o` (RAHASIA) |
| displayName | String | not null | mis. "GPT-4o" |
| description | String? | | |
| contextWindow | Int | not null | token |
| maxOutputTokens | Int? | | |
| priceInPer1kIdr | Int | not null | harga dasar per 1k input (IDR) |
| priceOutPer1kIdr | Int | not null | harga dasar per 1k output (IDR) |
| capabilities | Json | default `{}` | `{ stream, vision, tools, jsonMode }` |
| isActive | Boolean | not null, default true | |
| deprecatedAt | DateTime? | | |
| createdAt | DateTime | not null | |
| updatedAt | DateTime | not null | |

Index: `publicName` (unique), `isActive`.

### 3.4 `Plan`

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK | |
| name | String | UNIQUE, not null | `basic` / `pro` / `enterprise` |
| displayName | String | not null | |
| markup | Float | not null, default 1.5 | faktor harga jual |
| rpmLimit | Int | not null | request/menit |
| monthlyTokenLimit | Int? | | null = unlimited |
| monthlyPriceIdr | Int | not null, default 0 | biaya langganan (0 = pay-as-you-go) |
| isActive | Boolean | not null, default true | |
| createdAt | DateTime | not null | |

### 3.5 `PlanModel` (join)

| Kolom | Tipe | Constraint |
|---|---|---|
| planId | String | FK → Plan |
| modelId | String | FK → Model |
| | | PK gabungan (planId, modelId) |

### 3.6 `UsageLog`

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK | |
| requestId | String | UNIQUE, not null | idempotency |
| userId | String | FK → User, index | |
| apiKeyId | String? | FK → ApiKey | |
| modelId | String | FK → Model | |
| endpoint | String | not null | `chat.completions` dll |
| promptTokens | Int | not null, default 0 | |
| completionTokens | Int | not null, default 0 | |
| totalTokens | Int | not null, default 0 | |
| costIdr | Int | not null, default 0 | biaya yang ditagih |
| status | UsageStatus | not null | completed/partial/error/rejected |
| streamed | Boolean | not null, default false | |
| latencyMs | Int? | | |
| upstreamLatencyMs | Int? | | |
| errorCode | String? | | |
| createdAt | DateTime | not null, index | |

Index: `requestId` (unique), `(userId, createdAt)`, `(modelId, createdAt)`.

> `UsageLog` **tidak** menyimpan isi pesan/konten user (privasi). Bila perlu audit konten, simpan terpisah dengan retensi pendek & enkripsi (di luar scope fase awal).

### 3.7 `Transaction`

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK | |
| orderId | String | UNIQUE, not null | `TRX-<nanoid>` |
| userId | String | FK → User, index | |
| amountIdr | Int | not null | nominal top-up |
| status | TrxnStatus | not null, default `PENDING` | PENDING/PAID/FAILED/EXPIRED/REFUNDED |
| method | String? | | midtrans channel |
| snapToken | String? | | |
| redirectUrl | String? | | |
| midtransTxnId | String? | | |
| paidAt | DateTime? | | |
| rawPayload | Json? | | webhook terakhir (redacted) |
| createdAt | DateTime | not null | |
| updatedAt | DateTime | not null | |

Index: `orderId` (unique), `(userId, status)`, `createdAt`.

### 3.8 `BalanceLedger` (append-only)

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK | |
| userId | String | FK → User, index | |
| deltaIdr | Int | not null | + top-up, − usage, + refund, ± adjust |
| balanceAfter | Int | not null | saldo setelah operasi (audit) |
| reason | LedgerReason | not null | TOPUP/USAGE/REFUND/ADJUSTMENT |
| referenceId | String? | | UsageLog.id / Transaction.id |
| note | String? | | |
| createdAt | DateTime | not null, index | |

### 3.9 `VerificationToken`

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK | |
| userId | String | FK → User | |
| tokenHash | String | UNIQUE | hash token (jangan simpan mentah) |
| type | TokenType | not null | EMAIL_VERIFY / PASSWORD_RESET |
| expiresAt | DateTime | not null | |
| usedAt | DateTime? | | |
| createdAt | DateTime | not null | |

### 3.10 `AdminAuditLog`

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK | |
| adminId | String | FK → User | |
| action | String | not null | mis. `user.suspend` |
| targetType | String? | | |
| targetId | String? | | |
| metadata | Json? | | |
| ip | String? | | |
| createdAt | DateTime | not null, index | |

### 3.11 `AppSetting` (key-value config)

| Kolom | Tipe | Constraint |
|---|---|---|
| key | String | PK |
| value | Json | not null |
| updatedAt | DateTime | not null |

Dipakai untuk config dinamis (mis. flag maintenance, markup global default, enable/disable model tanpa deploy).

---

## 4. Prisma schema lengkap

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role        { USER ADMIN }
enum UserStatus  { PENDING_EMAIL ACTIVE SUSPENDED DEACTIVATED }
enum KeyScope    { FULL MODELS }
enum KeyStatus   { ACTIVE REVOKED EXPIRED }
enum UsageStatus { COMPLETED PARTIAL ERROR REJECTED }
enum TrxnStatus  { PENDING PAID FAILED EXPIRED REFUNDED }
enum LedgerReason{ TOPUP USAGE REFUND ADJUSTMENT }
enum TokenType   { EMAIL_VERIFY PASSWORD_RESET }

model User {
  id              String       @id @default(cuid())
  email           String       @unique
  passwordHash    String
  name            String?
  role            Role         @default(USER)
  status          UserStatus   @default(PENDING_EMAIL)
  balance         Int          @default(0)
  planId          String
  plan            Plan         @relation(fields: [planId], references: [id])
  emailVerifiedAt DateTime?    @db.Timestamptz
  lastLoginAt     DateTime?    @db.Timestamptz
  createdAt       DateTime     @default(now()) @db.Timestamptz
  updatedAt       DateTime     @updatedAt @db.Timestamptz
  deletedAt       DateTime?    @db.Timestamptz

  apiKeys         ApiKey[]
  usageLogs       UsageLog[]
  transactions    Transaction[]
  ledger          BalanceLedger[]
  tokens          VerificationToken[]
  audits          AdminAuditLog[]

  @@index([status])
  @@index([role])
}

model ApiKey {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name            String
  keyHash         String    @unique
  prefix          String
  last4           String
  scope           KeyScope  @default(FULL)
  allowedModels   String[]  @default([])
  rpmLimit        Int?
  monthlyLimitIdr Int?
  status          KeyStatus @default(ACTIVE)
  expiresAt       DateTime? @db.Timestamptz
  lastUsedAt      DateTime? @db.Timestamptz
  createdAt       DateTime  @default(now()) @db.Timestamptz
  revokedAt       DateTime? @db.Timestamptz

  usageLogs       UsageLog[]

  @@index([userId])
  @@index([status])
}

model Model {
  id              String    @id @default(cuid())
  publicName      String    @unique
  internalName    String
  displayName     String
  description     String?
  contextWindow   Int
  maxOutputTokens Int?
  priceInPer1kIdr Int
  priceOutPer1kIdr Int
  capabilities    Json      @default("{}")
  isActive        Boolean   @default(true)
  deprecatedAt    DateTime? @db.Timestamptz
  createdAt       DateTime  @default(now()) @db.Timestamptz
  updatedAt       DateTime  @updatedAt @db.Timestamptz

  plans           PlanModel[]
  usageLogs       UsageLog[]

  @@index([isActive])
}

model Plan {
  id                String   @id @default(cuid())
  name              String   @unique
  displayName       String
  markup            Float    @default(1.5)
  rpmLimit          Int
  monthlyTokenLimit Int?
  monthlyPriceIdr   Int      @default(0)
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now()) @db.Timestamptz

  users             User[]
  models            PlanModel[]
}

model PlanModel {
  planId  String
  modelId String
  plan    Plan   @relation(fields: [planId], references: [id], onDelete: Cascade)
  model   Model  @relation(fields: [modelId], references: [id], onDelete: Cascade)

  @@id([planId, modelId])
}

model UsageLog {
  id               String      @id @default(cuid())
  requestId        String      @unique
  userId           String
  user             User        @relation(fields: [userId], references: [id])
  apiKeyId         String?
  apiKey           ApiKey?     @relation(fields: [apiKeyId], references: [id])
  modelId          String
  model            Model       @relation(fields: [modelId], references: [id])
  endpoint         String
  promptTokens     Int         @default(0)
  completionTokens Int         @default(0)
  totalTokens      Int         @default(0)
  costIdr          Int         @default(0)
  status           UsageStatus
  streamed         Boolean     @default(false)
  latencyMs        Int?
  upstreamLatencyMs Int?
  errorCode        String?
  createdAt        DateTime    @default(now()) @db.Timestamptz

  @@index([userId, createdAt])
  @@index([modelId, createdAt])
  @@index([createdAt])
}

model Transaction {
  id           String     @id @default(cuid())
  orderId      String     @unique
  userId       String
  user         User       @relation(fields: [userId], references: [id])
  amountIdr    Int
  status       TrxnStatus @default(PENDING)
  method       String?
  snapToken    String?
  redirectUrl  String?
  midtransTxnId String?
  paidAt       DateTime?  @db.Timestamptz
  rawPayload   Json?
  createdAt    DateTime   @default(now()) @db.Timestamptz
  updatedAt    DateTime   @updatedAt @db.Timestamptz

  @@index([userId, status])
  @@index([createdAt])
}

model BalanceLedger {
  id           String       @id @default(cuid())
  userId       String
  user         User         @relation(fields: [userId], references: [id])
  deltaIdr     Int
  balanceAfter Int
  reason       LedgerReason
  referenceId  String?
  note         String?
  createdAt    DateTime     @default(now()) @db.Timestamptz

  @@index([userId, createdAt])
}

model VerificationToken {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  type      TokenType
  expiresAt DateTime  @db.Timestamptz
  usedAt    DateTime? @db.Timestamptz
  createdAt DateTime  @default(now()) @db.Timestamptz

  @@index([userId, type])
}

model AdminAuditLog {
  id         String   @id @default(cuid())
  adminId    String
  admin      User     @relation(fields: [adminId], references: [id])
  action     String
  targetType String?
  targetId   String?
  metadata   Json?
  ip         String?
  createdAt  DateTime @default(now()) @db.Timestamptz

  @@index([adminId, createdAt])
  @@index([action])
}

model AppSetting {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt @db.Timestamptz
}
```

---

## 5. Seed data awal

```ts
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const db = new PrismaClient();

async function main() {
  const plans = [
    { name: 'basic', displayName: 'Basic', markup: 1.5, rpmLimit: 60, monthlyTokenLimit: 5_000_000, monthlyPriceIdr: 0 },
    { name: 'pro', displayName: 'Pro', markup: 1.35, rpmLimit: 300, monthlyTokenLimit: 50_000_000, monthlyPriceIdr: 199_000 },
    { name: 'enterprise', displayName: 'Enterprise', markup: 1.2, rpmLimit: 1200, monthlyTokenLimit: null, monthlyPriceIdr: 999_000 },
  ];
  for (const p of plans) {
    await db.plan.upsert({ where: { name: p.name }, create: p, update: p });
  }

  const models = [
    { publicName: 'gpt-4o', internalName: 'gh/gpt-4o', displayName: 'GPT-4o', contextWindow: 128_000, priceInPer1kIdr: 4, priceOutPer1kIdr: 12, capabilities: { stream: true, vision: true, tools: true, jsonMode: true } },
    { publicName: 'gpt-4o-mini', internalName: 'gh/gpt-4o-mini', displayName: 'GPT-4o mini', contextWindow: 128_000, priceInPer1kIdr: 1, priceOutPer1kIdr: 3, capabilities: { stream: true, vision: true, tools: true, jsonMode: true } },
    { publicName: 'claude-sonnet-4.5', internalName: 'kr/claude-sonnet-4.5', displayName: 'Claude Sonnet 4.5', contextWindow: 200_000, priceInPer1kIdr: 5, priceOutPer1kIdr: 18, capabilities: { stream: true, vision: true, tools: true } },
    { publicName: 'gemini-1.5-pro', internalName: 'gm/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', contextWindow: 1_000_000, priceInPer1kIdr: 3, priceOutPer1kIdr: 10, capabilities: { stream: true, vision: true, tools: true } },
  ];
  for (const m of models) {
    await db.model.upsert({ where: { publicName: m.publicName }, create: m, update: m });
  }

  const basic = await db.plan.findUniqueOrThrow({ where: { name: 'basic' } });
  const pro = await db.plan.findUniqueOrThrow({ where: { name: 'pro' } });
  const ent = await db.plan.findUniqueOrThrow({ where: { name: 'enterprise' } });
  const allModels = await db.model.findMany();

  const link = async (planId: string, subset?: string[]) => {
    const list = subset ? allModels.filter((m) => subset.includes(m.publicName)) : allModels;
    for (const m of list) {
      await db.planModel.upsert({
        where: { planId_modelId: { planId, modelId: m.id } },
        create: { planId, modelId: m.id },
        update: {},
      });
    }
  };
  await link(basic.id, ['gpt-4o-mini']);
  await link(pro.id, ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4.5']);
  await link(ent.id); // semua

  await db.user.upsert({
    where: { email: 'admin@mpruy.ai' },
    create: {
      email: 'admin@mpruy.ai',
      passwordHash: await hash('ChangeMe!123'),
      role: 'ADMIN',
      status: 'ACTIVE',
      planId: ent.id,
      balance: 0,
      emailVerifiedAt: new Date(),
    },
    update: {},
  });

  await db.appSetting.upsert({
    where: { key: 'maintenance' },
    create: { key: 'maintenance', value: { enabled: false, message: '' } },
    update: {},
  });

  console.log('Seed selesai.');
}

main().finally(() => db.$disconnect());
```

---

## 6. Strategi migrasi

- Dev: `npx prisma migrate dev --name <desc>`.
- Prod: `npx prisma migrate deploy` (bagian dari build/deploy; lihat [17-DEPLOYMENT.md](./17-DEPLOYMENT.md)).
- **Migrasi harus backward-compatible** (tambah kolom nullable dulu → backfill → jadikan required). Hindari rename destruktif dalam satu langkah.
- Rename kolom: pakai `@map` untuk transisi, atau 2 fase (add new → copy → drop old).
- Jangan commit `.env`. `.env.example` selalu diperbarui saat menambah env var.
- Untuk perubahan indeks besar di tabel `UsageLog`, gunakan `CREATE INDEX CONCURRENTLY` manual via SQL migration bila volume besar.

Contoh migrasi manual (buat file SQL di `prisma/migrations`):

```sql
-- partial index hanya untuk transaksi pending (mempercepat reconciliation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_pending
  ON "Transaction" ("createdAt")
  WHERE status = 'PENDING';
```

---

## 7. Query patterns

### 7.1 Usage report per user (30 hari)

```ts
const rows = await db.$queryRaw<{ day: Date; tokens: bigint; cost: bigint }[]>`
  SELECT date_trunc('day', "createdAt") AS day,
         SUM("totalTokens")::bigint AS tokens,
         SUM("costIdr")::bigint AS cost
  FROM "UsageLog"
  WHERE "userId" = ${userId}
    AND "createdAt" >= now() - interval '30 days'
    AND status <> 'rejected'
  GROUP BY 1
  ORDER BY 1;
`;
```

### 7.2 Top user by spend (bulan ini)

```sql
SELECT u.id, u.email, SUM(l."costIdr") AS spend
FROM "UsageLog" l
JOIN "User" u ON u.id = l."userId"
WHERE l."createdAt" >= date_trunc('month', now())
GROUP BY u.id, u.email
ORDER BY spend DESC
LIMIT 20;
```

### 7.3 Distribusi model (admin)

```sql
SELECT m."publicName", COUNT(*) AS requests, SUM(l."totalTokens") AS tokens
FROM "UsageLog" l
JOIN "Model" m ON m.id = l."modelId"
WHERE l."createdAt" >= now() - interval '7 days'
GROUP BY m."publicName"
ORDER BY requests DESC;
```

### 7.4 Cek saldo aman (atomic decrement)

```ts
const updated = await db.$executeRaw`
  UPDATE "User"
  SET balance = balance - ${cost}, "updatedAt" = now()
  WHERE id = ${userId} AND balance >= ${cost}
`;
if (updated === 0) throw new InsufficientBalance();
```

### 7.5 Idempotent usage insert

```ts
await db.usageLog.createMany({
  data: [{ requestId, userId, modelId, endpoint, /* ... */ }],
  skipDuplicates: true, // bergantung pada unique(requestId)
});
```

### 7.6 Keys user (dashboard)

```ts
const keys = await db.apiKey.findMany({
  where: { userId, status: { not: 'REVOKED' } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, name: true, prefix: true, last4: true, status: true, lastUsedAt: true, createdAt: true, rpmLimit: true },
});
```

---

## 8. Retensi & arsip

| Tabel | Retensi | Catatan |
|---|---|---|
| UsageLog | 24 bulan aktif, lalu arsip | Partition per bulan bila besar |
| Transaction | permanen | data keuangan/pajak |
| BalanceLedger | permanen | audit uang |
| AdminAuditLog | 24 bulan | |
| VerificationToken | hapus setelah 30 hari expand | job cleanup |
| User (deletedAt) | anonimisasi setelah 30 hari | GDPR/UU PDP |

---

## 9. Referensi

- Billing & ledger → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md)
- API key → [07-API-KEY-MANAGEMENT.md](./07-API-KEY-MANAGEMENT.md)
- Model mapping → [08-MODEL-MAPPING.md](./08-MODEL-MAPPING.md)