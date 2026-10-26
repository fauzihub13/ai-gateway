export function publicKeyView(k: {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  status: string;
  scope: string;
  allowedModels: string[];
  rpmLimit: number | null;
  monthlyLimitIdr: number | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  keyCiphertext?: string | null;
}) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    last4: k.last4,
    status: k.status,
    scope: k.scope,
    allowedModels: k.allowedModels,
    rpmLimit: k.rpmLimit,
    monthlyLimitIdr: k.monthlyLimitIdr,
    expiresAt: k.expiresAt,
    lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt,
    // Key lama (sebelum fitur copy ulang) tidak punya ciphertext.
    recoverable: Boolean(k.keyCiphertext),
  };
}