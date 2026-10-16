import { hash, verify } from '@node-rs/argon2';

export function hashPassword(p: string): Promise<string> {
  return hash(p, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export function verifyPassword(h: string, p: string): Promise<boolean> {
  return verify(h, p).catch(() => false);
}