-- Top-up QRIS manual: QRIS statis diubah jadi dinamis + kode unik per transaksi.
-- Aditif dan aman untuk data production (semua kolom baru punya DEFAULT / NULL).

CREATE TYPE "PaymentProvider" AS ENUM ('MIDTRANS', 'QRIS_MANUAL');

ALTER TABLE "Transaction" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'MIDTRANS';
ALTER TABLE "Transaction" ADD COLUMN "uniqueCode" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "payAmountIdr" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "qrisPayload" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "expiresAt" TIMESTAMPTZ;

-- Satu nominal bayar hanya boleh dipakai satu transaksi QRIS yang masih PENDING.
-- Diisi "qris:<nominal>" saat PENDING, di-NULL-kan saat PAID/EXPIRED/FAILED.
-- NULL boleh berulang di unique index Postgres, jadi aman untuk transaksi final.
ALTER TABLE "Transaction" ADD COLUMN "payAmountKey" TEXT;
CREATE UNIQUE INDEX "Transaction_payAmountKey_key" ON "Transaction"("payAmountKey");

CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");
CREATE INDEX "Transaction_provider_status_idx" ON "Transaction"("provider", "status");
