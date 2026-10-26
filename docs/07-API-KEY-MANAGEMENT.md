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

**Raw key tidak pernah disimpan sebagai plaintext.** Yang disimpan:

| Kolom | Isi | Kegunaan |
|---|---|---|
| `keyHash` | `sha256(raw + PEPPER)` hex | lookup & verifikasi request |
| `keyCiphertext` | AES-256-GCM(`raw`, `API_KEY_ENCRYPTION_KEY`) | copy ulang dari dashboard |
| `prefix` | `raw.slice(0, 12)` (`sk-mpruy-ab12`) | ditampilkan di UI |
| `last4` | 4 char terakhir | ditampilkan (mis. `…cd34`) |

`keyCiphertext` **nullable**: key yang dibuat sebelum fitur copy ulang ada tidak
punya ciphertext dan tidak bisa dipulihkan (harus revoke & buat baru).

```ts
import { createHash } from 'node:crypto';

const PEPPER = process.env.API_KEY_PEPPER!;

export function hashApiKey(raw: string) {
  return createHash('sha256').update(raw + PEPPER).digest('hex');
}
```

Enkripsi memakai AES-256-GCM dengan IV acak per key. Format yang disimpan:
`v1.<iv>.<authTag>.<ciphertext>` (base64url). Kunci enkripsi diambil dari
`API_KEY_ENCRYPTION_KEY` (base64 32 byte); bila kosong, diturunkan dari
`API_KEY_PEPPER`. Detail implementasi ada di `src/lib/key-crypto.ts`.

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
create key → server balas rawKey → UI modal:
   "Salin sekarang, atau copy ulang kapan saja dari daftar key."
   [sk-mpruy-3f9aK2mQ...xyz]  [Copy]   [Selesai]

setelah modal tutup → daftar menampilkan: sk-mpruy-ab12…cd34  [Copy]
```

Tombol **Copy** di setiap baris memanggil `POST /api/keys/:id/reveal`.
Endpoint ini:

- hanya bisa dipakai owner key (session login),
- wajib CSRF token (double-submit),
- mengembalikan `rawKey` dari `keyCiphertext` yang didekripsi server,
- mengirim `Cache-Control: no-store` dan mencatat audit `apikey.reveal`,
- dibatasi 30 reveal/menit per user.

Key lama tanpa `keyCiphertext` mengembalikan `409 key_not_recoverable`; UI
menyarankan revoke lalu buat key baru.

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

Multiple keys: **satu user boleh punya banyak key** (mis. per lingkungan: dev/staging/prod), dengan batas **10 key aktif per user** untuk semua plan. Key yang sudah `REVOKED` tidak dihitung. Konstanta: `MAX_ACTIVE_KEYS_PER_USER` di `src/lib/key-policy.ts`.

---

## 6. Key-level limits

| Field | Fungsi | Bila null |
|---|---|---|
| `rpmLimit` | request/menit khusus key ini | pakai limit plan |
| `monthlyLimitIdr` | batas belanja key **per periode plan berjalan** | tanpa batas key (batas user tetap berlaku) |
| `scope` | `FULL` (semua model plan) / `MODELS` (whitelist) | FULL |
| `allowedModels` | daftar public model (bila scope=MODELS) | — |

Cek saat request (urutan):

```
1. plan mengizinkan model? → else 403 model_not_allowed
2. scope key: FULL → lanjut; MODELS → model ∈ allowedModels? else 403 model_not_in_key_scope
3. rate limit key (rpmLimit ?? plan.rpmLimit)
4. bila monthlyLimitIdr: hitung SUM(chargedIdr) key sejak user.planStartedAt
   → lewat batas → 429 key_quota_exceeded
```

> Batas dihitung dari **`chargedIdr`** (yang benar-benar dipotong dari saldo), bukan
> `costIdr` (nilai pemakaian). Konsekuensinya plan **SUBSCRIPTION** (`chargedIdr = 0`)
> tidak pernah menyentuh batas ini — konsisten dengan "tanpa potong saldo". Lihat
> [10-BILLING-USAGE.md §8.2](./10-BILLING-USAGE.md).

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

  // Batas global: 10 key aktif per user (semua plan).
  const activeKeys = await db.apiKey.count({
    where: { userId, status: { not: 'REVOKED' } },
  });
  if (activeKeys >= MAX_ACTIVE_KEYS_PER_USER) {
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
      keyCiphertext: encryptApiKey(raw),
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
  recoverable: Boolean(k.keyCiphertext),
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

Event yang dicatat: `apikey.create`, `apikey.reveal`, `apikey.revoke`, `apikey.update`, `apikey.expire`.

---

## 9. Edge cases & failure modes

| Kasus | Penanganan |
|---|---|
| **Collision hash** | astronomis kecil; saat create, bila `findUnique(keyHash)` ada → regenerate |
| **User lupa key** | tombol Copy di dashboard memanggil reveal; bila key lama tanpa ciphertext → revoke & buat baru |
| **Reveal setelah env crypto berubah** | dekripsi gagal → `409 key_not_recoverable`; revoke & buat baru, atau pulihkan env lama |
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

> **Penting:** bila `API_KEY_ENCRYPTION_KEY` tidak diisi, ciphertext diturunkan
> dari `API_KEY_PEPPER`. Rotasi pepper akan membuat ciphertext lama tidak bisa
> didekripsi. Untuk produksi, isi `API_KEY_ENCRYPTION_KEY` terpisah dan jangan
> dirotasi tanpa re-enkripsi `ApiKey.keyCiphertext`.

---

## 11. Referensi

- Kontrak endpoint → [05-API-CONTRACT.md](./05-API-CONTRACT.md)
- Auth user (dashboard) → [06-AUTH-SYSTEM.md](./06-AUTH-SYSTEM.md)
- Rate limit → [12-RATE-LIMITING.md](./12-RATE-LIMITING.md)
- Security → [13-SECURITY.md](./13-SECURITY.md)