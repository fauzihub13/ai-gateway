import { randomBytes, createHash } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const KEY_PREFIX = 'sk-mpruy-';

function toBase62(buf: Buffer): string {
  let num = BigInt('0x' + buf.toString('hex'));
  let out = '';
  const base = BigInt(62);
  while (num > 0n) {
    out = ALPHABET[Number(num % base)] + out;
    num /= base;
  }
  return out.padStart(43, 'A');
}

export function generateApiKey(): string {
  return KEY_PREFIX + toBase62(randomBytes(32));
}

function pepper(): string {
  return process.env.API_KEY_PEPPER!;
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw + pepper()).digest('hex');
}

export function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

export function looksLikeApiKey(raw: string): boolean {
  return raw.startsWith(KEY_PREFIX);
}