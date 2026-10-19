-- Migration aditif: menambah kolom cached token & harga cached, plus index filter.
-- Aman untuk data production yang sudah ada (semua kolom baru punya DEFAULT / NULL).

-- Model: harga input untuk token cache hit. NULL = tanpa diskon (pakai priceInPer1kIdr).
ALTER TABLE "Model" ADD COLUMN "priceCachedInPer1kIdr" INTEGER;

-- UsageLog: jumlah token prompt yang dilaporkan upstream sebagai cache hit.
ALTER TABLE "UsageLog" ADD COLUMN "cachedPromptTokens" INTEGER NOT NULL DEFAULT 0;

-- Index untuk filter log per API key dan per waktu.
CREATE INDEX "UsageLog_apiKeyId_createdAt_idx" ON "UsageLog"("apiKeyId", "createdAt");
