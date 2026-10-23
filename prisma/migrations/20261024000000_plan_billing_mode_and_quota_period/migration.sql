-- CreateEnum
CREATE TYPE "PlanBillingMode" AS ENUM ('PAYG', 'SUBSCRIPTION');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "billingMode" "PlanBillingMode" NOT NULL DEFAULT 'PAYG';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingMode" TEXT NOT NULL DEFAULT 'PAYG',
ADD COLUMN     "tokenQuota" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "planStartedAt" TIMESTAMPTZ,
ADD COLUMN     "planTokenQuota" INTEGER;

-- AlterTable: panjang periode plan (hari). Wajib diisi; backfill 30 hari untuk
-- baris lama supaya perilaku lama (30 hari) tetap sama.
ALTER TABLE "Plan" ADD COLUMN "periodDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Plan" ALTER COLUMN "periodDays" DROP DEFAULT;

-- AlterTable: pemisahan tiga angka biaya per request.
--   costIdr    = nilai pemakaian (harga resmi official, tanpa markup)
--   chargedIdr = yang benar-benar ditagih (PAYG: resmi×markup, SUBSCRIPTION: 0)
--   savedIdr   = hemat = (resmi×markup) - chargedIdr
ALTER TABLE "UsageLog" ADD COLUMN "chargedIdr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UsageLog" ADD COLUMN "savedIdr" INTEGER NOT NULL DEFAULT 0;

-- Backfill data historis. Semua baris lama berasal dari era PAYG murni
-- (harga resmi × markup, karena saat itu satu-satunya nilai biaya).
--   costIdr lama = resmi × markup  →  anggap sebagai chargedIdr
--   costIdr baru = resmi (tanpa markup) → tidak bisa direkonstruksi persis
--     karena markup plan bisa berubah; pakai chargedIdr lama sebagai proksi
--     terbaik (nilai pemakaian ≈ yang dibayar).
--
-- `AND "costIdr" > 0` sengaja dipakai supaya baris tanpa biaya (REJECTED/ERROR,
-- costIdr = 0) tidak ikut ditulis ulang — menghindari dead tuple & UPDATE besar
-- di production tanpa mengubah hasil akhir.
-- `savedIdr` tidak perlu di-backfill: default kolomnya sudah 0 (benar untuk era
-- PAYG, di mana tidak ada hemat).
UPDATE "UsageLog" SET "chargedIdr" = "costIdr" WHERE "costIdr" > 0;
