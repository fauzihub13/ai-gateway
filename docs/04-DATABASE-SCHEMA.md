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
User 1───* Subscription (riwayat pembelian plan; plan aktif ada di User.planId)
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
│        │────<┌──────────────┐ └───┬────┘
│        │     │ Subscription │     │ *
│        │     └──────┬───────┘     │
│        │            │        ┌────▼─────┐
│        │            └───────<│ UsageLog │
└────────┘                     └──────────┘
     │ User.planId (plan AKTIF) ──> Plan
     └ User.planExpiresAt = masa aktif (NULL = gratis)
```

Catatan: `Subscription` adalah **riwayat** pembelian plan (snapshot harga, sumber
dana `BALANCE`/`ADMIN`). Plan yang benar-benar aktif tetap dibaca dari
`User.planId` + `User.planExpiresAt`, bukan dari baris `Subscription` terakhir.
Lihat [03-FLOW-LOGIC.md §1.5](./03-FLOW-LOGIC.md).

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
| planId | String | FK → Plan | plan aktif (satu sumber kebenaran) |
| planExpiresAt | DateTime? | | batas masa aktif plan berbayar; `NULL` = plan tanpa expiry (gratis) |
| planStartedAt | DateTime? | | awal periode kuota berjalan (tanggal beli/perpanjang terakhir) |
| planTokenQuota | Int? | | total kuota token periode berjalan; `NULL` = tanpa kuota |
| sessionVersion | Int | not null, default 0 | naikkan untuk memaksa logout semua sesi user |
| emailVerifiedAt | DateTime? | | |
| lastLoginAt | DateTime? | | |
| createdAt | DateTime | not null | |
| updatedAt | DateTime | not null | |
| deletedAt | DateTime? | | soft delete |

Index: `email` (unique), `status`, `role`, `planExpiresAt` (dipakai dashboard admin untuk menandai plan yang lewat masa aktif).

**Aturan bisnis masa aktif (`planExpiresAt`) & periode kuota (`planStartedAt`, `planTokenQuota`):**

- Satu pembelian plan = satu periode sepanjang `Plan.periodDays` hari (diatur admin per plan, bukan konstanta global). Saat beli: `planExpiresAt = basis + periodDays`.
- Plan tanpa harga (`monthlyPriceIdr = 0`) selalu punya batas **kuota bergulir**: bila `planStartedAt` kosong atau sudah lewat `periodDays`, periode di-reset dari sekarang dan `planTokenQuota` diisi dari `Plan.monthlyTokenLimit` (lihat `ensureQuotaPeriod()` di [`src/lib/subscription.ts`](../src/lib/subscription.ts)).
- **Beli lagi saat plan yang sama masih aktif** → **stack**: `planExpiresAt += periodDays` dan `planTokenQuota += Plan.monthlyTokenLimit`. `planStartedAt` **tidak** direset supaya pemakaian & masa aktif tetap sejajar.
- **Beli tier berbeda, atau membeli setelah expired** → reset periode dari sekarang, kuota = `Plan.monthlyTokenLimit`.
- Bila `planExpiresAt <= now()` → **request ditolak** (`plan_expired`, HTTP 402) sampai user membeli lagi. Plan **tidak** diturunkan otomatis; dashboard menandai `expired: true` dan admin menurunkannya manual.
- Penurunan plan **manual** oleh admin: `POST /api/admin/users/:id/plan` → `grantPlan()` (tanpa potong saldo, tercatat di `Subscription` + `AdminAuditLog`). **Tidak ada cron maupun auto-downgrade di jalur request.**
- `User.planId` tetap satu-satunya sumber kebenaran plan aktif. Tabel `Subscription` hanya riwayat, **tidak** dipakai untuk mengecek validitas plan.

### 3.2 `ApiKey`

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK | |
| userId | String | FK → User, index | |
| name | String | not null | label user |
| keyHash | String | UNIQUE, not null | sha256(raw+pepper) |
| keyCiphertext | String? | nullable | AES-256-GCM(raw); null untuk key lama yang tidak bisa dipulihkan |
| prefix | String | not null | 12 char pertama (display) |
| last4 | String | not null | 4 char terakhir |
| scope | KeyScope | not null, default `FULL` | FULL / MODELS |
| allowedModels | String[] | default [] | public model names (bila scope=MODELS) |
| rpmLimit | Int? | | override rate limit per key |
| monthlyLimitIdr | Int? | | batas belanja key per **periode plan berjalan**; dihitung dari `chargedIdr` (lihat [10-BILLING-USAGE.md](./10-BILLING-USAGE.md)) |
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
| publicName | String | UNIQUE, not null | mis. `mimo` |
| internalName | String | not null | mis. `mimo-free` (RAHASIA) |
| displayName | String | not null | mis. "MiMo" |
| description | String? | | |
| contextWindow | Int | not null | token |
| maxOutputTokens | Int? | | |
| priceInPer1MIdr | Int | not null | **harga resmi provider** per 1 juta input (IDR) |
| priceOutPer1MIdr | Int | not null | **harga resmi provider** per 1 juta output (IDR) |
| priceCachedInPer1MIdr | Int? | | harga input cache-hit; NULL = pakai priceInPer1MIdr |
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
| name | String | UNIQUE, not null | mis. `free`, `pro` |
| displayName | String | not null | |
| markup | Float | not null, default 1.5 | faktor harga jual per token (dipakai menghitung harga retail & besaran "hemat") |
| rpmLimit | Int | not null | request/menit |
| monthlyTokenLimit | Int? | | kuota token per periode `periodDays`. `NULL` = tanpa kuota — **wajib diisi** bila `billingMode = SUBSCRIPTION` (divalidasi di API) |
| monthlyPriceIdr | Int | not null, default 0 | **harga beli plan per `periodDays` hari** (0 = gratis / tidak bisa dibeli) |
| periodDays | Int | not null | panjang satu periode plan (hari) — **wajib diisi per plan**; tidak ada default global |
| billingMode | PlanBillingMode | not null, default `PAYG` | `PAYG` = potong saldo per token; `SUBSCRIPTION` = kuota token, tanpa potong saldo |
| isActive | Boolean | not null, default true | plan non-aktif tidak muncul di katalog & tidak bisa dibeli |
| createdAt | DateTime | not null | |

**Aturan bisnis:**

- **Semua plan berbasis plan**: tiap plan menentukan akses model (`PlanModel`), `rpmLimit`, kuota token, `periodDays`, dan `billingMode` sendiri. Model yang tidak terhubung ke plan → `403 model_not_allowed`.
- `billingMode = PAYG` → tiap request memotong saldo sebesar `harga resmi × markup`. Saldo = pembatas utama; gerbang `balance <= 0` → 402.
- `billingMode = SUBSCRIPTION` → **tidak** memotong saldo; dibatasi `monthlyTokenLimit`. Habis → 429 `quota_exceeded`.
- `monthlyPriceIdr > 0` → plan berbayar, dibeli user dari **saldo** (`POST /api/billing/plans/purchase`). Tidak ada recurring/tagihan otomatis; satu pembelian = `periodDays` hari.
- `monthlyPriceIdr = 0` → plan gratis/default, tidak bisa dibeli (`plan_not_purchasable`). Kuotanya bergulir otomatis (lihat §3.1).
- Beli plan yang **sama** saat masih aktif → **stack**: `planExpiresAt += periodDays`, `planTokenQuota += monthlyTokenLimit`, `planStartedAt` tetap. Bukan ditolak.
- Beli tier **berbeda** saat plan lain masih aktif → periode di-reset dari sekarang (sisa hari plan lama hangus).
- `markup` berbeda per plan → harga jual per token & besaran "hemat" berbeda meski model sama. Lihat [08-MODEL-MAPPING.md](./08-MODEL-MAPPING.md).

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
| cachedPromptTokens | Int | not null, default 0 | bagian promptTokens yang cache-hit |
| totalTokens | Int | not null, default 0 | |
| costIdr | Int | not null, default 0 | **nilai pemakaian** = harga resmi provider × token, TANPA markup (untuk analitik & label "nilai pemakaian") |
| chargedIdr | Int | not null, default 0 | yang **benar-benar ditagih** ke saldo: PAYG = resmi × markup; SUBSCRIPTION = 0 |
| savedIdr | Int | not null, default 0 | **hemat** = (resmi × markup) − `chargedIdr`: PAYG = 0; SUBSCRIPTION = penuh |
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
| amountIdr | Int | not null | nominal saldo yang dikreditkan saat PAID |
| status | TrxnStatus | not null, default `PENDING` | PENDING/PAID/FAILED/EXPIRED/REFUNDED |
| provider | PaymentProvider | not null, default `MIDTRANS` | MIDTRANS / QRIS_MANUAL |
| uniqueCode | Int | not null, default 0 | QRIS manual: 1..999, pembeda nominal |
| payAmountIdr | Int? | | QRIS manual: `amountIdr + uniqueCode` |
| qrisPayload | String? | | snapshot payload QRIS dinamis |
| payAmountKey | String? | UNIQUE | `qris:<payAmountIdr>` selama PENDING, NULL setelah final |
| expiresAt | DateTime? | | QRIS manual: batas bayar |
| method | String? | | midtrans channel / `QRIS_MANUAL` |
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
| reason | LedgerReason | not null | TOPUP/USAGE/REFUND/PLAN/ADJUSTMENT |
| referenceId | String? | | UsageLog.id / Transaction.id / Subscription.id |
| note | String? | | |
| createdAt | DateTime | not null, index | |

`reason = PLAN` dipakai saat user membeli plan berbayar dari saldo (`deltaIdr` negatif, `referenceId` = `Subscription.id`). Adjust/refund manual tetap memakai `ADJUSTMENT`/`REFUND`.

### 3.9 `Subscription` (riwayat plan)

Append-only. Satu baris = satu pembelian/pemberian plan.

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK, cuid | |
| userId | String | FK → User, `onDelete: Cascade`, index | |
| planId | String | FK → Plan, `onDelete: Restrict`, index | |
| priceIdr | Int | not null | snapshot harga yang dibayar (harga plan bisa berubah) |
| days | Int | not null, default 30 | panjang periode saat transaksi |
| billingMode | String | not null, default `PAYG` | snapshot mode penagihan plan saat transaksi |
| tokenQuota | Int? | | snapshot kuota token plan saat transaksi |
| source | String | not null, default `BALANCE` | `BALANCE` (potong saldo) / `ADMIN` (gratis) |
| startsAt | DateTime | not null, default now | |
| expiresAt | DateTime | not null | `startsAt + days` |
| createdAt | DateTime | not null | |

Index: `(userId, createdAt)`, `planId`.

**Aturan bisnis:**

- `source = BALANCE` dibuat oleh `purchasePlan()` — satu transaksi DB: potong saldo (guard `balance >= price`) → catat `BalanceLedger(reason=PLAN)` → buat `Subscription` → set `User.planId` + `User.planExpiresAt` + `User.planStartedAt` + `User.planTokenQuota`.
- `source = ADMIN` dibuat oleh `grantPlan()` — tanpa potong saldo, dipakai untuk kompensasi/hadiah/migrasi manual. `priceIdr = 0`. Juga dicatat di `AdminAuditLog` (`action = user.plan.grant`).
- **Beli plan yang sama saat masih aktif → stack** (perpanjang): `planExpiresAt += periodDays` dan `planTokenQuota += Plan.monthlyTokenLimit`; ini bukan lagi error. Ganti tier atau beli setelah expired → reset periode.
- `billingMode`/`tokenQuota` di sini adalah **snapshot historis** untuk audit & invoice; nilai efektif selalu dibaca dari `Plan` + `User`.
- `expiresAt` di tabel ini **tidak** dipakai untuk cek validitas; yang dipakai `User.planExpiresAt`. Tabel ini murni riwayat & dasar invoice/audit.

### 3.10 `VerificationToken`

| Kolom | Tipe | Constraint | Catatan |
|---|---|---|---|
| id | String | PK | |
| userId | String | FK → User | |
| tokenHash | String | UNIQUE | hash token (jangan simpan mentah) |
| type | TokenType | not null | EMAIL_VERIFY / PASSWORD_RESET |
| expiresAt | DateTime | not null | |
| usedAt | DateTime? | | |
| createdAt | DateTime | not null | |

### 3.11 `AdminAuditLog`

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

### 3.12 `AppSetting` (key-value config)

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
enum LedgerReason{ TOPUP USAGE REFUND ADJUSTMENT PLAN }
enum TokenType   { EMAIL_VERIFY PASSWORD_RESET }
enum PlanBillingMode { PAYG SUBSCRIPTION }
enum PaymentProvider { MIDTRANS QRIS_MANUAL }

model User {
  id              String       @id @default(cuid())
  email           String       @unique
  passwordHash    String
  name            String?
  role            Role         @default(USER)
  status          UserStatus   @default(PENDING_EMAIL)
  balance         Int          @default(0)
  sessionVersion  Int          @default(0)
  planId          String
  plan            Plan         @relation(fields: [planId], references: [id])
  planExpiresAt   DateTime?    @db.Timestamptz
  planStartedAt   DateTime?    @db.Timestamptz
  planTokenQuota  Int?
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
  subscriptions   Subscription[]

  @@index([status])
  @@index([role])
  @@index([planExpiresAt])
}

model ApiKey {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name            String
  keyHash         String    @unique
  // Salinan terenkripsi (AES-256-GCM) untuk fitur copy ulang key.
  // Null = key lama yang tidak bisa ditampilkan lagi.
  keyCiphertext   String?
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
  priceInPer1MIdr  Int
  priceOutPer1MIdr Int
  priceCachedInPer1MIdr Int?
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
  periodDays        Int
  billingMode       PlanBillingMode @default(PAYG)
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
  provider     PaymentProvider @default(MIDTRANS)
  uniqueCode   Int        @default(0)
  payAmountIdr Int?
  qrisPayload  String?
  // Kunci unik sementara: "qris:<payAmountIdr>" selama PENDING, NULL setelah final.
  payAmountKey String?    @unique
  method       String?
  snapToken    String?
  redirectUrl  String?
  midtransTxnId String?
  expiresAt    DateTime?  @db.Timestamptz
  paidAt       DateTime?  @db.Timestamptz
  rawPayload   Json?
  createdAt    DateTime   @default(now()) @db.Timestamptz
  updatedAt    DateTime   @updatedAt @db.Timestamptz

  @@index([userId, status])
  @@index([userId, createdAt])
  @@index([provider, status])
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

Seeder membuat **dua plan (`free`, `pro`)** dan **satu model (`mimo`)**, lalu menautkan keduanya ke seluruh model yang di-seed. Admin (`admin@mpruy.ai`) ditempatkan di plan `free`. Plan default untuk user baru diatur di [`src/lib/plans.ts`](../src/lib/plans.ts) (env `SIGNUP_PLAN`, default `free`).

Bedanya: `free` memakai mode **PAYG** (potong saldo per token, markup 1×), `pro` memakai mode **SUBSCRIPTION** (kuota token, tanpa potong saldo, markup 1,2×). Keduanya punya `periodDays: 30`.

```ts
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const db = new PrismaClient();

async function main() {
  const plans = [
    // Plan gratis adalah tier default untuk user baru (lihat src/lib/plans.ts).
    // Mode PAYG: model gratis tetap bisa dipakai walau saldo 0.
    { name: 'free', displayName: 'Free', markup: 1, rpmLimit: 100, monthlyTokenLimit: 20_000_000, monthlyPriceIdr: 0, periodDays: 30, billingMode: 'PAYG' as const },
    // Plan berbayar: dibeli user dari saldo, bukan tagihan berulang.
    // Harga & periodDays di sini contoh; ubah lewat /admin/plans.
    { name: 'pro', displayName: 'Pro', markup: 1.2, rpmLimit: 300, monthlyTokenLimit: 100_000_000, monthlyPriceIdr: 100_000, periodDays: 30, billingMode: 'SUBSCRIPTION' as const },
  ];
  for (const p of plans) {
    await db.plan.upsert({ where: { name: p.name }, create: p, update: p });
  }

  const models = [
    { publicName: 'mimo', internalName: 'mimo-free', displayName: 'MiMo', contextWindow: 1_048_576, maxOutputTokens: 131_072, priceInPer1MIdr: 4_000, priceOutPer1MIdr: 12_000, capabilities: { stream: true, vision: true, tools: true, jsonMode: true } },
  ];
  for (const m of models) {
    await db.model.upsert({ where: { publicName: m.publicName }, create: m, update: m });
  }

  const free = await db.plan.findUniqueOrThrow({ where: { name: 'free' } });
  const pro = await db.plan.findUniqueOrThrow({ where: { name: 'pro' } });
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
  // Free akses semua model; pro juga semua model (markup lebih rendah).
  await link(free.id);
  await link(pro.id);

  await db.user.upsert({
    where: { email: 'admin@mpruy.ai' },
    create: {
      email: 'admin@mpruy.ai',
      passwordHash: await hash('ChangeMe!123'),
      role: 'ADMIN',
      status: 'ACTIVE',
      planId: free.id,
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

### 7.4 Settle saldo (atomic decrement, boleh minus)

```ts
const updated = await db.$executeRaw`
  UPDATE "User"
  SET balance = balance - ${cost}, "updatedAt" = now()
  WHERE id = ${userId}
`;
```

Tanpa `AND balance >= cost`: request yang sudah dikerjakan tidak dibatalkan di tengah (kebijakan overdraft). Gerbang saldo ada di preflight (`balance <= 0 → 402`). Lihat [10-BILLING-USAGE.md §4](./10-BILLING-USAGE.md).

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