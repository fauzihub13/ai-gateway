# 05 — API Contract

Kontrak API publik (OpenAI-compatible) dan internal platform. Format error sesuai spec OpenAI. Untuk auth detail → [06-AUTH-SYSTEM.md](./06-AUTH-SYSTEM.md).

---

## 1. Prinsip

1. **Publik `/v1/*` = semirip mungkin OpenAI** agar SDK OpenAI & LangChain bisa dipakai tanpa ubah kode selain `baseURL`.
2. **Internal `/api/*` = REST JSON**, auth via session cookie (dashboard).
3. **Semua error** dalam format OpenAI `{ error: { message, type, code, param } }`.
4. **Versioning:** path-based untuk publik (`/v1`). Internal menambah header `X-API-Version` bila perlu breaking change.
5. **Content-Type** selalu `application/json` (kecuali stream → `text/event-stream`).

---

## 2. Base URL

| Lingkungan | Base URL |
|---|---|
| Produksi | `https://api.mpruy.ai/v1` |
| Dashboard/internal | `https://app.mpruy.ai/api` (atau domain sama, path `/api`) |

---

## 3. API Publik (OpenAI-compatible)

### 3.1 `POST /v1/chat/completions`

**Headers**

| Header | Wajib | Nilai |
|---|---|---|
| `Authorization` | ya | `Bearer sk-mpruy-...` |
| `Content-Type` | ya | `application/json` |
| `Accept` | tidak | `application/json` atau `text/event-stream` |

**Request body**

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `model` | string | ya | public model (`gpt-4o`) |
| `messages` | array | ya | `[{ role, content }]` |
| `stream` | boolean | tidak | default `false` (platform selalu kirim eksplisit) |
| `temperature` | number | tidak | 0–2 |
| `top_p` | number | tidak | |
| `max_tokens` | number | tidak | |
| `stop` | string \| string[] | tidak | |
| `presence_penalty` | number | tidak | |
| `frequency_penalty` | number | tidak | |
| `tools` | array | tidak | bila model `capabilities.tools` |
| `tool_choice` | string \| object | tidak | |
| `response_format` | object | tidak | `{ type: "json_object" }` bila didukung |
| `user` | string | tidak | id tracking opsional |

**Contoh curl (non-stream)**

```bash
curl https://api.mpruy.ai/v1/chat/completions \
  -H "Authorization: Bearer sk-mpruy-xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Halo, apa kabar?" }
    ],
    "stream": false
  }'
```

**Response 200 (non-stream)**

```json
{
  "id": "chatcmpl-9f2a1b3c4d",
  "object": "chat.completion",
  "created": 1723802400,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Halo! Saya baik. Ada yang bisa saya bantu?" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 24, "completion_tokens": 18, "total_tokens": 42 }
}
```

**Response 200 (stream)** — lihat [09-STREAMING.md](./09-STREAMING.md).

**Response header (kedua mode)**

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
X-RateLimit-Reset: 1723802460
x-request-id: req_9f2a1b3c4d
```

### 3.2 `GET /v1/models`

```bash
curl https://api.mpruy.ai/v1/models \
  -H "Authorization: Bearer sk-mpruy-xxxx"
```

```json
{
  "object": "list",
  "data": [
    { "id": "gpt-4o", "object": "model", "created": 1723802400, "owned_by": "mpruy" },
    { "id": "gpt-4o-mini", "object": "model", "created": 1723802400, "owned_by": "mpruy" },
    { "id": "claude-sonnet-4.5", "object": "model", "created": 1723802400, "owned_by": "mpruy" }
  ]
}
```

> `owned_by` selalu `mpruy` — jangan bocorkan provider upstream.

### 3.3 `GET /v1/models/{model}`

```json
{
  "id": "gpt-4o",
  "object": "model",
  "created": 1723802400,
  "owned_by": "mpruy"
}
```

Model yang tidak boleh diakses plan → 404 (jangan ungkap keberadaan model di luar plan).

### 3.4 `POST /v1/embeddings`

```bash
curl https://api.mpruy.ai/v1/embeddings \
  -H "Authorization: Bearer sk-mpruy-xxxx" \
  -H "Content-Type: application/json" \
  -d '{ "model": "text-embedding-3-small", "input": "Halo dunia" }'
```

```json
{
  "object": "list",
  "data": [{ "object": "embedding", "index": 0, "embedding": [0.0023, -0.0091] }],
  "model": "text-embedding-3-small",
  "usage": { "prompt_tokens": 3, "total_tokens": 3 }
}
```

### 3.5 Auth cepat `GET /v1/auth/check` (opsional)

Berguna untuk SDK/tooling yang memverifikasi key.

```json
{ "valid": true, "plan": "pro", "balance_idr": 84200 }
```

---

## 4. Format error standard (OpenAI-compatible)

```json
{
  "error": {
    "message": "Insufficient balance to process this request.",
    "type": "insufficient_quota",
    "code": "insufficient_balance",
    "param": null
  }
}
```

| HTTP | `type` | `code` | Pesan user |
|---|---|---|---|
| 400 | `invalid_request_error` | `invalid_request_error` | detail field salah |
| 401 | `invalid_request_error` | `invalid_api_key` | "Incorrect API key provided." |
| 402 | `insufficient_quota` | `insufficient_balance` | "Insufficient balance." |
| 403 | `permission_error` | `model_not_allowed` | "You do not have access to model X." |
| 404 | `invalid_request_error` | `model_not_found` | "The model X does not exist." |
| 429 | `rate_limit_error` | `rate_limit_exceeded` | "Rate limit reached..." |
| 429 | `insufficient_quota` | `quota_exceeded` | "Monthly quota exceeded." |
| 503 | `api_error` | `upstream_unavailable` | "Service temporarily unavailable." |
| 502 | `api_error` | `upstream_error` | "Upstream provider error." |
| 500 | `api_error` | `internal_error` | "Internal server error." |

Aturan: **jangan pernah** menampilkan pesan/URL/detail 9Router atau provider upstream. Pesan mapping lengkap → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md).

---

## 5. Rate limit headers

Semua response `/v1/*` menyertakan:

```
X-RateLimit-Limit: 300          # batas untuk window saat ini
X-RateLimit-Remaining: 42       # sisa
X-RateLimit-Reset: 1723802460   # epoch detik saat window reset
Retry-After: 12                 # hanya pada 429 (detik)
```

Detail → [12-RATE-LIMITING.md](./12-RATE-LIMITING.md).

---

## 6. API Internal (dashboard)

Semua endpoint `/api/*` memakai session cookie (`auth_token`, httpOnly). Endpoint admin memerlukan role `ADMIN`.

### 6.1 Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password, name? }` | `{ ok: true }` |
| POST | `/api/auth/login` | `{ email, password }` | set-cookie + `{ user }` |
| POST | `/api/auth/logout` | — | clear cookie |
| POST | `/api/auth/verify-email` | `{ token }` | `{ ok: true }` |
| POST | `/api/auth/resend-verification` | `{ email }` | `{ ok: true }` |
| POST | `/api/auth/forgot-password` | `{ email }` | `{ ok: true }` |
| POST | `/api/auth/reset-password` | `{ token, password }` | `{ ok: true }` |
| GET | `/api/auth/me` | — | `{ user, plan, balance }` |
| POST | `/api/auth/sessions/rotate` | — | set-cookie baru (rotasi token) |

Contoh login:

```bash
curl -X POST https://app.mpruy.ai/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{ "email": "user@example.com", "password": "secret123" }'
```

```json
{
  "user": { "id": "usr_1", "email": "user@example.com", "name": "Budi", "role": "USER" },
  "plan": "pro",
  "balance": 84200
}
```

### 6.2 API Keys

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/keys` | — | `{ keys: [...] }` |
| POST | `/api/keys` | `{ name, scope?, models?, rpmLimit?, monthlyLimitIdr?, expiresAt? }` | `{ key, rawKey }` (rawKey sekali) |
| PATCH | `/api/keys/:id` | `{ name?, rpmLimit?, monthlyLimitIdr?, status? }` | `{ key }` |
| DELETE | `/api/keys/:id` | — | `{ ok: true }` (revoke, bukan hapus) |

```bash
curl -X POST https://app.mpruy.ai/api/keys \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{ "name": "Production", "scope": "MODELS", "models": ["gpt-4o"], "rpmLimit": 120 }'
```

```json
{
  "key": { "id": "key_1", "name": "Production", "prefix": "sk-mpruy-ab12", "last4": "cd34", "status": "ACTIVE" },
  "rawKey": "sk-mpruy-ab12cd34ef56gh78ij90kl12mn34op56"
}
```

### 6.3 Billing & Usage

| Method | Path | Query/Body | Response |
|---|---|---|---|
| GET | `/api/billing/balance` | — | `{ balance, currency: "IDR" }` |
| GET | `/api/billing/usage` | `?from&to&groupBy=day|model|key` | `{ items: [...] }` |
| GET | `/api/billing/transactions` | `?page&limit` | `{ items, total }` |
| POST | `/api/billing/topup` | `{ amountIdr }` | `{ redirectUrl, orderId }` |
| POST | `/api/billing/webhook` | (Midtrans) | `200` |
| GET | `/api/billing/invoices/:id` | — | PDF/JSON invoice |

### 6.4 Models (user view)

| Method | Path | Response |
|---|---|---|
| GET | `/api/models` | `{ models: [{ publicName, displayName, contextWindow, capabilities, priceInPer1kIdr, priceOutPer1kIdr }] }` |

> Harga yang ditampilkan = harga final untuk plan user (sudah termasuk markup).

### 6.5 Playground

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/playground/chat` | `{ model, messages, stream }` | Sama seperti `/v1/chat/completions` tapi via session |

> Playground memakai kredit user yang sama (memotong saldo). Ditandai `endpoint = "playground"` di UsageLog.

---

## 7. API Admin

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/admin/users` | list user (filter: status, plan, q) |
| GET | `/api/admin/users/:id` | detail user (keys, usage, txns) |
| PATCH | `/api/admin/users/:id` | ubah plan/status/balance (audit) |
| POST | `/api/admin/users/:id/balance` | adjust saldo (+/−) dengan alasan |
| POST | `/api/admin/users/:id/suspend` | suspend |
| POST | `/api/admin/users/:id/unsuspend` | unsuspend |
| GET | `/api/admin/models` | list model (termasuk internalName) |
| POST | `/api/admin/models` | buat model |
| PATCH | `/api/admin/models/:id` | ubah harga/capability/aktif |
| DELETE | `/api/admin/models/:id` | deprecate model |
| GET | `/api/admin/plans` | list plan |
| PATCH | `/api/admin/plans/:id` | ubah limit/markup/harga |
| GET | `/api/admin/transactions` | list transaksi (filter status/date/user) |
| POST | `/api/admin/transactions/:id/reconcile` | paksa cek status ke Midtrans |
| GET | `/api/admin/settings` | ambil AppSetting |
| PATCH | `/api/admin/settings` | ubah config (flag maintenance dll) |
| GET | `/api/admin/audit` | admin audit log |
| GET | `/api/admin/metrics` | ringkasan metrik (req, error, revenue) |
| POST | `/api/admin/emergency/disable-model` | matikan model segera |
| POST | `/api/admin/emergency/maintenance` | set maintenance mode |
| GET | `/api/admin/export/usage` | CSV export |
| GET | `/api/admin/export/transactions` | CSV export |

Contoh adjust saldo:

```bash
curl -X POST https://app.mpruy.ai/api/admin/users/usr_1/balance \
  -H "Content-Type: application/json" -b admin_cookies.txt \
  -d '{ "deltaIdr": 50000, "reason": "Manual top-up via transfer bank", "note": "INV-2024-001" }'
```

Detail admin → [16-ADMIN-PANEL.md](./16-ADMIN-PANEL.md).

---

## 8. Webhook (dari eksternal ke kami)

### 8.1 Midtrans payment notification

```
POST /api/billing/webhook
Content-Type: application/json

{
  "order_id": "TRX-ab12cd34",
  "status_code": "200",
  "gross_amount": "100000.00",
  "transaction_status": "settlement",
  "fraud_status": "accept",
  "signature_key": "<sha512>"
}
```

Verifikasi signature wajib. Detail → [11-PAYMENT-GATEWAY.md](./11-PAYMENT-GATEWAY.md).

---

## 9. Versioning strategy

- Publik: prefix `/v1` untuk OpenAI-compat. Perubahan breaking → `/v2`.
- Non-breaking (tambah field opsional, model baru) tidak menaikkan versi.
- Internal `/api`: breaking change diumumkan via `X-API-Version`; client dashboard bundled jadi tidak ada isu eksternal.
- **Deprecation:** model atau field ditandai `deprecated`, diumumkan ≥ 30 hari sebelum dihapus, tetap berfungsi selama masa deprecate.

---

## 10. Referensi

- Streaming → [09-STREAMING.md](./09-STREAMING.md)
- Error mapping → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)
- Auth detail → [06-AUTH-SYSTEM.md](./06-AUTH-SYSTEM.md)
- Model & harga → [08-MODEL-MAPPING.md](./08-MODEL-MAPPING.md)