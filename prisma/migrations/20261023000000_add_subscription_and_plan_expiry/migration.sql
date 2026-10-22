-- Pembelian plan berbayar dari saldo + expiry otomatis.
-- Aditif & aman untuk production: tidak ada kolom lama yang diubah/dihapus.

-- 1. `PLAN` sebagai alasan ledger (potong saldo saat beli plan).
ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'PLAN';

-- 2. Masa aktif plan berbayar. NULL = plan gratis tanpa expiry.
ALTER TABLE "User" ADD COLUMN "planExpiresAt" TIMESTAMPTZ;

-- 3. Riwayat pembelian plan (snapshot harga, siapa admin kalau gratis).
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "priceIdr" INTEGER NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 30,
    "source" TEXT NOT NULL DEFAULT 'BALANCE',
    "startsAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Subscription_userId_createdAt_idx" ON "Subscription"("userId", "createdAt");
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- Index untuk job auto-downgrade: cari user yang plan-nya sudah lewat tanggal.
CREATE INDEX "User_planExpiresAt_idx" ON "User"("planExpiresAt");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
