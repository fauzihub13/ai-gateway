-- Harga model pindah dari satuan per 1.000 token ke per 1.000.000 token.
-- Nilai lama dikali 1000 supaya harga efektif per token TIDAK berubah.
-- Contoh: 4 IDR / 1k token  ->  4000 IDR / 1M token.

ALTER TABLE "Model" RENAME COLUMN "priceInPer1kIdr" TO "priceInPer1MIdr";
ALTER TABLE "Model" RENAME COLUMN "priceOutPer1kIdr" TO "priceOutPer1MIdr";
ALTER TABLE "Model" RENAME COLUMN "priceCachedInPer1kIdr" TO "priceCachedInPer1MIdr";

UPDATE "Model" SET "priceInPer1MIdr" = "priceInPer1MIdr" * 1000;
UPDATE "Model" SET "priceOutPer1MIdr" = "priceOutPer1MIdr" * 1000;
UPDATE "Model" SET "priceCachedInPer1MIdr" = "priceCachedInPer1MIdr" * 1000
  WHERE "priceCachedInPer1MIdr" IS NOT NULL;
