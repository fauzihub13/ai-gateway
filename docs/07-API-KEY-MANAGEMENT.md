# 07 — API Key Management

Format key, algoritma generate & hash, storage, lifecycle, multiple keys, limit per key, audit, dan edge cases. Ini kunci yang dipakai user di `/v1/*`.

---

## 1. Format user API key

```
sk-mpruy-<payload>
   │       └── 40 char base62 (≈ 32 byte entropi)
   └── prefix tetap, menandakan "milik platform Mpruy AI"
```

- Total panjang ≈ 48 char.
- `sk-mpruy-` sengaja mirip gaya OpenAI agar familiar, tapi **bukan** key OpenAI.
- Payload: `base62(randomBytes(32))` → entropi ~256 bit.

Contoh: `sk-mpruy-3f9aK2mQ...` (dipotong saat display).

---

## 2. Generation

```ts
import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

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

export function generateApiKey() {
  const raw = 'sk-mpruy-' + toBase62(randomBytes(32));
  return raw;
}
```

---

## 3. Hashing & storage

**Raw key TIDAK PERNAH disimpan.** Yang disimpan:

| Kolom | Isi | Kegunaan |
|---|---|---|
| `keyHash` | `sha256(raw + PEPPER)` hex | lookup & verifikasi |
| `prefix` | `raw.slice(0, 12)` (`sk-mpruy-ab12`) | ditampilkan di UI |
| `last4` | 4 char terakhir | ditampilkan (mis. `…cd34`) |

```ts
import { createHash, timingSafeEqual } from 'node:crypto';

const PEPPER = process.env.API_KEY_PEPPER!;

export function hashApiKey(raw: string) {
  return createHash('sha256').update(raw + PEPPER).digest('hex');
}
```

Kenapa SHA-256 + pepper (bukan argon2): key punya entropi tinggi (256 bit), jadi tidak rentan brute-force seperti password. Hash cepat mempercepat lookup di hot path. Pepper (rahasia di env, bukan DB) melindungi bila DB bocor tanpa pepper.

Verifikasi di hot path:

```
1. raw = header.replace(/^Bearer\s+/i, '').trim()
2. bila !raw.startsWith('sk-mpruy-') → 401 (cepat, tanpa DB)
3. hash = sha256(raw + PEPPER)
4. key = db.apiKey.findUnique({ where: { keyHash: hash } })
5. bila !key || status !== ACTIVE || (expiresAt < now) → 401
6. update lastUsedAt (async, tidak blocking; boleh di-throttle)
```

> Bandingkan hash dengan `timingSafeEqual` bila membandingkan string (opsional karena lookup via indeks unique).

---

## 4. Display strategy

```
create key → server balas rawKey SEKALI → UI modal:
   "Salin sekarang. Kunci ini tidak akan ditampilkan lagi."
   [sk-mpruy-3f9aK2mQ...xyz]  [Copy]   [Selesai]

setelah modal tutup → hanya tampil: sk-mpruy-ab12…cd34
```

Dashboard hanya menampilkan `prefix…last4`. Tidak ada endpoint untuk "lihat key lagi". Bila lupa → revoke & buat baru.

---

## 5. Lifecycle

```
create ──▶ ACTIVE ──revoke──▶ REVOKED (terminal)
              │
              └─expiresAt lewat──▶ EXPIRED ──revoke──▶ REVOKED
```

| Aksi | Efek |
|---|---|
| `POST /api/keys` | buat key baru ACTIVE |
| `PATCH /api/keys/:id` | ubah name/limit/status (aktifkan kembali hanya bila belum revoked) |
| `DELETE /api/keys/:id` | set REVOKED + revokedAt, tidak dihapus (audit) |
| otomatis | `expiresAt < now` → dianggap EXPIRED saat verifikasi |

Multiple keys: **satu user boleh punya banyak key** (mis. per lingkungan: dev/staging/prod). Batas jumlah key per plan (mis. basic 3, pro 10, enterprise 50).

---

## 6. Key-level limits

| Field | Fungsi | Bila null |
|---|---|---|
| `rpmLimit` | request/menit khusus key ini | pakai limit plan |
| `monthlyLimitIdr` | batas belanja key per bulan | tanpa batas key (batas user tetap berlaku) |
| `scope` | `FULL` (semua model plan) / `MODELS` (whitelist) | FULL |
| `allowedModels` | daftar public model (bila scope=MODELS) | — |

Cek saat request (urutan):

```
1. plan mengizinkan model? → else 403 model_not_allowed
2. scope key: FULL → lanjut; MODELS → model ∈ allowedModels? else 403 model_not_in_key_scope
3. rate limit key (rpmLimit ?? plan.rpmLimit)
4. bila monthlyLimitIdr: hitung pemakaian key bulan ini (Redis counter + fallback DB)
   → lewat batas → 429 key_quota_exceeded
```

---

## 7. Create key — validasi & pembatasan

```ts
const CreateKeySchema = z.object({
  name: z.string().min(1).max(50),
  scope: z.enum(['FULL', 'MODELS']).default('FULL'),
  models: z.array(z.string()).default([]),
  rpmLimit: z.number().int().min(1).max(10_000).optional(),
  monthlyLimitIdr: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().optional(),
});

async function createKey(userId: string, input: unknown) {
  const data = CreateKeySchema.parse(input);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { plan: true, apiKeys: true } });

  const MAX_KEYS: Record<string, number> = { basic: 3, pro: 10, enterprise: 50 };
  if (user.apiKeys.filter((k) => k.status !== 'REVOKED').length >= MAX_KEYS[user.plan.name]) {
    throw new ForbiddenError('key_limit_reached');
  }

  if (data.scope === 'MODELS') {
    const allowed = await db.planModel.findMany({
      where: { planId: user.planId }, include: { model: true },
    });
    const allowedNames = new Set(allowed.map((pm) => pm.model.publicName));
    if (data.models.length === 0 || data.models.some((m) => !allowedNames.has(m))) {
      throw new BadRequestError('invalid_models');
    }
  }

  let raw: string, hash: string;
  do {
    raw = generateApiKey();
    hash = hashApiKey(raw);
  } while (await db.apiKey.findUnique({ where: { keyHash: hash } }));

  const key = await db.apiKey.create({
    data: {
      userId, name: data.name, keyHash: hash,
      prefix: raw.slice(0, 12), last4: raw.slice(-4),
      scope: data.scope, allowedModels: data.scope === 'MODELS' ? data.models : [],
      rpmLimit: data.rpmLimit ?? null,
      monthlyLimitIdr: data.monthlyLimitIdr ?? null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
  });

  // audit
  await db.adminAuditLog.create({
    data: { adminId: userId, action: 'apikey.create', targetType: 'ApiKey', targetId: key.id,
      metadata: { name: key.name, prefix: key.prefix } },
  });

  return { key: publicKeyView(key), rawKey: raw };
}

const publicKeyView = (k: any) => ({
  id: k.id, name: k.name, prefix: k.prefix, last4: k.last4, status: k.status,
  scope: k.scope, allowedModels: k.allowedModels, rpmLimit: k.rpmLimit,
  monthlyLimitIdr: k.monthlyLimitIdr, expiresAt: k.expiresAt,
  lastUsedAt: k.lastUsedAt, createdAt: k.createdAt,
});
```

---

## 8. Audit log

Setiap perubahan key dicatat (via `AdminAuditLog` untuk admin, dan `AdminAuditLog`/event tersendiri untuk user):

```ts
await db.adminAuditLog.create({
  data: {
    adminId: actorId,
    action: 'apikey.revoke',
    targetType: 'ApiKey',
    targetId: key.id,
    metadata: { name: key.name, prefix: key.prefix },
    ip,
  },
});
```

Event yang dicatat: `apikey.create`, `apikey.revoke`, `apikey.update`, `apikey.expire`.

---

## 9. Edge cases & failure modes

| Kasus | Penanganan |
|---|---|
| **Collision hash** | astronomis kecil; saat create, bila `findUnique(keyHash)` ada → regenerate |
| **User lupa key** | tidak bisa diambil; harus bulan baru key |
| **Key bocor** | revoke; peringatkan user; lihat abuse detection [12](./12-RATE-LIMITING.md) |
| **Key dipakai lintas IP mencurigakan** | log + alert + opsi auto-suspend (configurable) |
| **User downgrade plan** | model di luar plan baru ditolak; key dengan allowedModels tetap cek plan |
| **Migrasi format key** | dukung dua prefix (`sk-mpruy-`, `sk-old-`) selama masa transisi; hash tetap sama |
| **Raw key ter-log tak sengaja** | redactor di logger menghapus pola `sk-[a-z]+-[A-Za-z0-9]+` |
| **Rate limit hot path** | hash itu O(1); DB lookup diindeks unique → cepat |

---

## 10. Migrasi & rotasi pepper

Bila `API_KEY_PEPPER` perlu diganti (mis. kebocoran env):

```
1. Simpan pepper baru + pepper lama (API_KEY_PEPPER_OLD).
2. Saat verifikasi: cari dengan hash(pepper baru); bila gagal, coba hash(pepper lama).
3. Bila cocok dengan pepper lama → rehash dengan pepper baru (lazy migration), update row.
4. Setelah semua key termigrasi (metrik), hapus pepper lama.
```

Konsekuensi: rotasi pepper butuh verifikasi ganda sementara. Dokumentasikan di runbook.

---

## 11. Referensi

- Kontrak endpoint → [05-API-CONTRACT.md](./05-API-CONTRACT.md)
- Auth user (dashboard) → [06-AUTH-SYSTEM.md](./06-AUTH-SYSTEM.md)
- Rate limit → [12-RATE-LIMITING.md](./12-RATE-LIMITING.md)
- Security → [13-SECURITY.md](./13-SECURITY.md)