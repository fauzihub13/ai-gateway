import { randomBytes, createHash } from 'node:crypto';

export interface TokenPair {
  hash: string;
  raw: string;
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateVerificationToken(): TokenPair {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}