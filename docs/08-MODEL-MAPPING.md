# 08 — Model Mapping

Konsep abstraksi public vs internal model, struktur tabel mapping, cara kelola model, strategi harga, capability flags, versioning & deprecation, sinkronisasi dengan 9Router.

---

## 1. Konsep abstraksi

```
User kirim:      model = "mimo"           ← PUBLIC (yang user tahu)
Platform map:    publicName → internalName
Platform kirim:  model = "mimo-free"      ← INTERNAL (id model di 9Router)
```

Manfaat:
1. **Menyembunyikan provider upstream** (id model di 9Router bisa berprefiks seperti `ag/`, `tbr/`, `bzr/`).
2. **Stabilkan nama** — provider bisa ganti routing tanpa ubah API kami.
3. **Kontrol harga & akses per plan** di satu tempat.
4. **Deprecation terkendali** tanpa menyentuh user.

Aturan: **nama internal tidak boleh pernah keluar** dari server. Rewrite di response stream & non-stream (lihat [09-STREAMING.md](./09-STREAMING.md)).

---

## 2. Prefiks internal (9Router) — RAHASIA

| Prefiks/id | Upstream | Contoh internal |
|---|---|---|
| `ag/` | upstream #1 (rahasia) | `ag/gemini-3.8-flash` |
| `tbr/` | upstream #2 (rahasia) | `tbr/mimo-v2.5` |
| `bzr/` | upstream #3 (rahasia) | `bzr/deepseek-v4-pro` |
| `gcli/` | upstream #4 (rahasia) | `gcli/grok-4.5` |
| (tanpa prefiks) | model combo 9Router | `mimo-free` |

Daftar prefiks di atas adalah contoh dari 9Router dan bisa bertambah/berubah. `internalName` di tabel `Model` **harus persis** sama dengan `id` yang dikembalikan `GET {9Router}/v1/models`.

Tabel ini **tidak pernah** ditampilkan ke user, tidak masuk API response, tidak masuk dokumentasi publik.

---

## 3. Struktur tabel `Model`

| Kolom | Fungsi |
|---|---|
| `publicName` | id yang user kirim (`mimo`), UNIQUE |
| `internalName` | yang dikirim ke 9Router (`mimo-free`) |
| `displayName` | label UI ("MiMo") |
| `description` | deskripsi singkat untuk docs/UI |
| `contextWindow` | maks token konteks |
| `maxOutputTokens` | maks output |
| `priceInPer1MIdr` | harga dasar input per 1 juta token (IDR) |
| `priceOutPer1MIdr` | harga dasar output per 1 juta token (IDR) |
| `capabilities` | JSON flags (stream/vision/tools/jsonMode) |
| `isActive` | model tersedia? |
| `deprecatedAt` | tanggal deprecate |

Detail kolom → [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md).

---

## 4. Pricing strategy

Harga final ke user = `harga dasar × markup plan`, dibulatkan ceil ke rupiah.

```
cost_idr = ceil( (promptTokens/1_000_000) × priceInPer1MIdr × plan.markup
               + (completionTokens/1_000_000) × priceOutPer1MIdr × plan.markup )
```

Satuan harga **per 1 juta token** dipilih karena sama dengan satuan yang dipakai provider
upstream, sehingga angka bisa dibaca langsung tanpa konversi mental.

### 4.1 Contoh harga

| Model | In/1M (dasar) | Out/1M (dasar) | free (×1) |
|---|---|---|---|
| mimo | Rp4.000 | Rp12.000 | Rp4.000 / Rp12.000 |

> Harga dasar `priceInPer1MIdr`/`priceOutPer1MIdr` diset **di atas cost upstream**. Markup plan menambah margin. Simpan harga dasar sebagai angka bulat (IDR). Untuk model sangat murah, harga per 1M tetap bilangan bulat (mis. Rp500/1M) sehingga biaya satu request kecil dibulatkan ceil ke Rp1.

### 4.2 Alternatif pricing (per-plan eksklusif)

Bila tiap plan butuh harga final berbeda yang tidak linear, tambahkan tabel `PlanModelPrice { planId, modelId, priceInPer1MIdr, priceOutPer1MIdr }` dan gunakan bila ada; fallback ke markup × harga dasar. (Fase awal: markup cukup.)

### 4.3 Display harga ke user

`GET /api/models` mengembalikan **harga final sudah termasuk markup plan user**. Jangan pernah kirim `priceInPer1MIdr` dasar mentah ke user.

```json
{
  "publicName": "mimo",
  "displayName": "MiMo",
  "contextWindow": 1048576,
  "priceInPer1MIdr": 4000,
  "priceOutPer1MIdr": 12000,
  "capabilities": { "stream": true, "vision": true, "tools": true, "jsonMode": true }
}
```

---

## 5. Capability flags

```json
{
  "stream": true,
  "vision": true,
  "tools": true,
  "jsonMode": true,
  "embedding": false
}
```

| Flag | Arti | Efek |
|---|---|---|
| `stream` | dukung SSE | bila false dan user minta stream → 400 |
| `vision` | terima image input | validasi content array |
| `tools` | function calling | teruskan `tools`, validasi |
| `jsonMode` | `response_format: json_object` | teruskan |
| `embedding` | model embedding | rute ke `/v1/embeddings` |

Validasi request: bila user kirim `tools` tapi model `tools=false` → 400 `invalid_request_error`.

---

## 6. Versioning model

Dukung dua tipe:

1. **Alias** (disarankan): `mimo` selalu menunjuk versi terbaik. `internalName` boleh diubah admin tanpa breaking API.
2. **Pinned version**: mis. `mimo-v2.5` sebagai publicName terpisah dengan `internalName` `tbr/mimo-v2.5`. Berguna untuk user yang butuh stabilitas.

```
publicName        internalName
mimo        →     mimo-free        (alias, ikut model combo 9Router)
mimo-v2.5   →     tbr/mimo-v2.5    (pinned ke upstream tertentu)
```

Aturan: **jangan ubah `publicName`** (breaking). Boleh ubah `internalName` (transparan).

---

## 7. Menambah / update / menghapus model

### 7.1 Tambah model

1. Pastikan model sudah ada di 9Router (cek `GET {9Router}/v1/models` dengan gateway key).
2. Catat `internalName` + prefiks provider.
3. Admin: `POST /api/admin/models`:

```bash
curl -X POST https://app.mpruy.ai/api/admin/models \
  -H "Content-Type: application/json" -b admin_cookies.txt \
  -d '{
    "publicName": "mimo",
    "internalName": "mimo-free",
    "displayName": "MiMo",
    "contextWindow": 1048576,
    "maxOutputTokens": 131072,
    "priceInPer1MIdr": 4000,
    "priceOutPer1MIdr": 12000,
    "capabilities": { "stream": true, "vision": true, "tools": true, "jsonMode": true }
  }'
```

4. Tambahkan ke plan via `PlanModel` (set akses).

### 7.2 Update

`PATCH /api/admin/models/:id` — boleh ubah harga, capability, displayName, internalName, isActive. Perubahan berlaku segera (harga dibaca per-request dari DB/cache).

### 7.3 Hapus / deprecate

**Jangan hapus baris** (UsageLog masih FK). Set `isActive=false` + `deprecatedAt=now`:

- Model hilang dari `GET /v1/models` untuk user.
- Request ke model tsb → 404 `model_not_found` (atau pesan deprecation bila disediakan alias pengganti).

```json
{ "error": { "message": "Model mimo-v1 has been deprecated. Use mimo instead.", "type": "invalid_request_error", "code": "model_deprecated" } }
```

---

## 8. Sinkronisasi dengan 9Router

9Router menyediakan `GET /v1/models` (dengan gateway key). Job berkala (cron harian) membandingkan:

```
9Router models ─────┐
                     ├─▶ diff ──▶ laporan ke admin:
DB publicName set ───┘            - model di 9Router tapi belum di DB (kandidat tambah)
                                  - model di DB tapi hilang di 9Router (kandidat deprecate)
```

```ts
async function syncModels() {
  const res = await nineRouterFetch('/v1/models');
  const upstream = (await res.json()).data.map((m: any) => m.id); // ex: mimo-free, tbr/mimo-v2.5
  const local = await db.model.findMany({ where: { isActive: true } });
  const known = new Set(local.map((m) => m.internalName));

  const missing = upstream.filter((id: string) => !known.has(id));
  const stale = local.filter((m) => !upstream.includes(m.internalName));

  return { missing, stale }; // admin review, JANGAN auto-tambah (butuh tetapkan harga)
}
```

Kebijakan: **tidak auto-tambah** model (harga & akses harus diputuskan manusia). Sync hanya memberi sinyal.

---

## 9. Cache

Model jarang berubah tapi dibaca setiap request → cache di Redis (TTL 60s) atau in-memory Next.js:

```ts
async function getModelMap() {
  const cached = await redis.get<Record<string, ModelRow>>('models:map');
  if (cached) return cached;
  const rows = await db.model.findMany({ where: { isActive: true } });
  const map = Object.fromEntries(rows.map((m) => [m.publicName, m]));
  await redis.set('models:map', map, { ex: 60 });
  return map;
}
```

Invalidasi cache saat admin ubah model (`redis.del('models:map')`).

---

## 10. Edge cases

| Kasus | Penanganan |
|---|---|
| User kirim `internalName` langsung (`mimo-free`) | tidak ada di map → 404 `model_not_found` (internal tak bocor) |
| internalName berubah tapi user pakai alias | transparan |
| 9Router tolak internal model | 502 `upstream_error` (jangan bocorkan internal) |
| Harga dasar 0 (gratis) | tetap valid, markup tidak berpengaruh |
| Model embedding dipanggil via chat | 400 `invalid_request_error` |
| Model tanpa `maxOutputTokens` | tidak kirim `max_tokens` ke upstream |

---

## 11. Referensi

- Skema `Model`/`Plan`/`PlanModel` → [04-DATABASE-SCHEMA.md](./04-DATABASE-SCHEMA.md)
- Billing pakai harga → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md)
- Rewrite nama di stream → [09-STREAMING.md](./09-STREAMING.md)
- Admin kelola model → [16-ADMIN-PANEL.md](./16-ADMIN-PANEL.md)