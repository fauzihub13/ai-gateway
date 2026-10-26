import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Enkripsi simetris untuk raw API key yang disimpan di DB.
 *
 * Kenapa bukan hash saja? Hash dipakai untuk verifikasi request (`keyHash`),
 * tapi tidak bisa dibalik. Supaya user bisa copy ulang key dari dashboard,
 * kita simpan salinan terenkripsi yang hanya bisa dibuka server.
 *
 * Format ciphertext: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 * AES-256-GCM dipilih karena authenticated encryption: ciphertext yang diubah
 * akan gagal didekripsi, bukan menghasilkan key sampah.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Ambil kunci enkripsi 32 byte.
 *
 * Prioritas:
 * 1. `API_KEY_ENCRYPTION_KEY` (base64 32 byte) — disarankan di production.
 * 2. Turunan deterministik dari `API_KEY_PEPPER` — fallback supaya deployment
 *    lama tetap jalan tanpa env baru. Jangan ganti pepper tanpa re-enkripsi.
 */
function encryptionKey(): Buffer {
  const explicit = process.env.API_KEY_ENCRYPTION_KEY;
  if (explicit) {
    const key = Buffer.from(explicit, 'base64');
    if (key.length !== 32) {
      throw new Error('API_KEY_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    }
    return key;
  }

  const pepper = process.env.API_KEY_PEPPER;
  if (!pepper) {
    throw new Error('API_KEY_PEPPER or API_KEY_ENCRYPTION_KEY is required to encrypt API keys.');
  }

  return createHash('sha256')
    .update(`mpruy:api-key-ciphertext:v1:${pepper}`)
    .digest();
}

export function encryptApiKey(raw: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptApiKey(blob: string): string {
  const parts = blob.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported API key ciphertext format.');
  }

  const [, ivB64, tagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Invalid API key ciphertext.');
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
