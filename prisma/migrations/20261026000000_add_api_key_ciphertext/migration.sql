-- AlterTable
-- Salinan terenkripsi API key supaya user bisa copy ulang dari dashboard.
-- Baris lama tetap NULL dan tidak bisa dipulihkan (harus revoke & buat baru).
ALTER TABLE "ApiKey" ADD COLUMN "keyCiphertext" TEXT;
