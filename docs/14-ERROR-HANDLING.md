# 14 — Error Handling

Error hierarchy & codes, mapping error 9Router → publik, format standard OpenAI, HTTP mapping, retryable, pesan user, logging, alerting, error budget.

---

## 1. Prinsip

1. **User tidak pernah melihat detail internal** (URL 9Router, nama provider, stack, SQL).
2. **Format error = spec OpenAI** (lihat [05](./05-API-CONTRACT.md)).
3. **Mesin error hierarchy jelas** → mapping satu tempat.
4. **Retryable jelas** agar klien tahu kapan mengulang.
5. **Semua error 5xx di-log & sebagian di-alert.**

---

## 2. Error class hierarchy

```ts
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    public type: string = 'invalid_request_error',
    message?: string,
    public param: string | null = null,
    public retryable = false,
    public internal?: unknown,
  ) {
    super(message ?? code);
  }
}

export class BadRequestError extends AppError {
  constructor(code = 'invalid_request_error', message?: string, param: string | null = null) {
    super(code, 400, 'invalid_request_error', message, param);
  }
}
export class UnauthorizedError extends AppError {
  constructor(code = 'invalid_api_key', message?: string) {
    super(code, 401, 'invalid_request_error', message);
  }
}
export class ForbiddenError extends AppError {
  constructor(code = 'model_not_allowed', message?: string) {
    super(code, 403, 'permission_error', message);
  }
}
export class NotFoundError extends AppError {
  constructor(code = 'model_not_found', message?: string) {
    super(code, 404, 'invalid_request_error', message);
  }
}
export class InsufficientBalanceError extends AppError {
  constructor(message = 'Insufficient balance to process this request.') {
    super('insufficient_balance', 402, 'insufficient_quota', message);
  }
}
export class TooManyRequestsError extends AppError {
  constructor(code = 'rate_limit_exceeded', message = 'Rate limit exceeded.') {
    super(code, 429, code === 'quota_exceeded' ? 'insufficient_quota' : 'rate_limit_error', message, null, true);
  }
}
export class UpstreamUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable. Please retry.') {
    super('upstream_unavailable', 503, 'api_error', message, null, true);
  }
}
export class UpstreamError extends AppError {
  constructor(code = 'upstream_error', message = 'Upstream provider error.') {
    super(code, 502, 'api_error', message, null, false);
  }
}
export class InternalError extends AppError {
  constructor(message = 'Internal server error.') {
    super('internal_error', 500, 'api_error', message, null, true);
  }
}
```

---

## 3. Format response error

```ts
export function toErrorResponse(err: unknown, requestId: string): Response {
  const e = err instanceof AppError
    ? err
    : new InternalError();

  if (!(err instanceof AppError)) {
    // log internal untuk kasus tak terduga
    console.error(redact(String(err)), { requestId });
    captureException(err, { requestId });
  }

  return Response.json(
    {
      error: {
        message: e.message,
        type: e.type,
        code: e.code,
        param: e.param,
      },
    },
    { status: e.httpStatus, headers: { 'x-request-id': requestId } },
  );
}
```

Contoh:

```json
{
  "error": {
    "message": "Incorrect API key provided.",
    "type": "invalid_request_error",
    "code": "invalid_api_key",
    "param": null
  }
}
```

---

## 4. Mapping error 9Router → publik

9Router mengembalikan error OpenAI-style (karena kompatibel). Namun bisa mengandung detail internal (nama model seperti `mimo-free`, pesan provider). **Selalu sanitisasi.**

```ts
export async function mapUpstreamError(res: Response, requestId: string): Promise<Response> {
  let body: any = {};
  try { body = await res.json(); } catch { /* ignore */ }

  const status = res.status;
  const upstreamCode = body?.error?.code ?? '';

  // pesan generik, JANGAN teruskan pesan mentah
  if (status === 429) {
    return toErrorResponse(new TooManyRequestsError('upstream_rate_limited', 'Upstream rate limit reached. Please retry shortly.'), requestId);
  }
  if (status >= 500) {
    return toErrorResponse(new UpstreamUnavailableError(), requestId);
  }
  if (status === 404 || upstreamCode === 'model_not_found') {
    return toErrorResponse(new NotFoundError('model_not_found', 'The requested model is unavailable.'), requestId);
  }
  if (status === 400) {
    // kemungkinan model internal tak valid / payload tak didukung upstream
    return toErrorResponse(new UpstreamError('upstream_error', 'The request could not be processed by the provider.'), requestId);
  }
  return toErrorResponse(new UpstreamError(), requestId);
}
```

**Aturan kunci:** pesan dari upstream tidak pernah diteruskan apa adanya ke user (bisa bocorkan `mimo-free`, nama provider, dll).

---

## 5. HTTP status mapping (ringkas)

| HTTP | Kapan | code contoh |
|---|---|---|
| 400 | input invalid | `invalid_request_error` |
| 401 | key/session invalid | `invalid_api_key` |
| 402 | saldo kurang | `insufficient_balance` |
| 403 | akses model ditolak | `model_not_allowed`, `model_not_in_key_scope` |
| 404 | model tak ada | `model_not_found`, `model_deprecated` |
| 429 | rate/quota | `rate_limit_exceeded`, `quota_exceeded`, `key_quota_exceeded` |
| 500 | bug kami | `internal_error` |
| 502 | upstream error | `upstream_error` |
| 503 | upstream down | `upstream_unavailable` |
| 504 | timeout ke upstream | `upstream_timeout` |

Matrix lengkap → [03 §9](./03-FLOW-LOGIC.md).

---

## 6. Retryable vs non-retryable

| code | Retryable klien? | Panduan |
|---|---|---|
| `rate_limit_exceeded` | ya | tunggu `Retry-After` |
| `upstream_rate_limited` | ya | backoff |
| `upstream_unavailable` | ya | backoff eksponensial |
| `upstream_timeout` | ya | backoff |
| `internal_error` | ya | backoff (laporkan bila terus) |
| `insufficient_balance` | tidak | top-up dulu |
| `invalid_api_key` | tidak | perbaiki key |
| `invalid_request_error` | tidak | perbaiki request |
| `model_not_found` | tidak | ganti model |
| `model_not_allowed` | tidak | upgrade plan / ganti model |
| `quota_exceeded` | tidak | tunggu bulan/upgrade |

Sediakan helper client (opsional):

```ts
export function isRetryable(status: number, code: string): boolean {
  if ([500, 502, 503, 504, 429].includes(status)) return true;
  return ['rate_limit_exceeded', 'upstream_unavailable', 'upstream_timeout', 'internal_error'].includes(code);
}
```

---

## 7. Pesan user-facing (i18n-ready)

Simpan pesan default dalam kode `en` (konsisten dengan OpenAI). Untuk UI dashboard (i18n), map `code` → terjemahan:

```json
{
  "invalid_api_key": "Kunci API tidak valid.",
  "insufficient_balance": "Saldo tidak mencukupi. Silakan top-up.",
  "model_not_allowed": "Plan Anda tidak memiliki akses ke model ini.",
  "rate_limit_exceeded": "Terlalu banyak permintaan. Coba lagi setelah {retry}s.",
  "quota_exceeded": "Kuota bulanan habis. Upgrade plan atau tunggu bulan berikutnya."
}
```

Endpoint API publik tetap kirim pesan `en` (klien memetakan sendiri bila perlu).

---

## 8. Logging strategy

| Level | Yang di-log | Contoh |
|---|---|---|
| `error` | error 5xx, settle gagal, webhook gagal | stack + requestId |
| `warn` | 4xx tak terduga, redis down, reconcile mismatch | ringkas |
| `info` | request ringkas (tanpa konten), perubahan status | metadata |
| `debug` | detail dev only | jangan produksi |

Yang **tidak boleh** di-log: API key mentah, gateway key, password, cookie, konten chat penuh, PII berlebih.

Struktur log (JSON):

```json
{
  "level": "error",
  "requestId": "req_9f2a",
  "userId": "usr_1",
  "model": "mimo",
  "endpoint": "chat.completions",
  "status": 502,
  "code": "upstream_error",
  "latencyMs": 1204,
  "msg": "upstream request failed"
}
```

Selalu sertakan `requestId` (propagasi sebagai `x-request-id`) untuk tracing (lihat [18](./18-MONITORING.md)).

---

## 9. Alerting thresholds

| Kondisi | Ambang | Channel |
|---|---|---|
| Error rate 5xx | > 2% selama 5 mnt | Slack + Sentry |
| `upstream_unavailable` | > 10 dalam 5 mnt | Slack |
| Settle gagal | > 0 (data uang!) | PagerDuty/Slack keras |
| Queue settle menumpuk | > 100 item | Slack |
| Webhook signature invalid | > 5 dalam 10 mnt | Slack (indikasi serangan) |
| Reconcile saldo mismatch | > 0 | Slack keras |
| p95 latency | > target 2 jam | Slack |
| Redis down | sekaligus | Slack |

---

## 10. Error budget (target keandalan)

- SLO ketersediaan: **99.9%** per bulan (≈ 43 menit downtime).
- Error 5xx ≤ 0.5% dari total request.
- Bila budget habis → fokus stabilitas, tunda fitur.

```
error_budget_bulan = (1 - 0.999) * total_windows
bila error_5xx_rate > 0.5% dalam 24 jam → review & freeze fitur
```

---

## 11. Edge cases

| Kasus | Penanganan |
|---|---|
| Error sebelum body dibaca | balas 400 cepat |
| Error setelah header stream terkirim | kirim chunk error + `[DONE]` (lihat [09 §8](./09-STREAMING.md)) |
| Upstream kirim HTML (bukan JSON) | tangkap parse error → `upstream_error` |
| Upstream lambat tanpa respons | timeout → `upstream_timeout` |
| Error di webhook Midtrans | balas 5xx agar Midtrans retry (kecuali signature invalid → 401 no retry) |
| Siswa salah kirim `internalName` | 404 `model_not_found` (cegah enumerasi) |

---

## 12. Referensi

- Contract & codes → [05-API-CONTRACT.md](./05-API-CONTRACT.md)
- Decision matrix → [03-FLOW-LOGIC.md](./03-FLOW-LOGIC.md)
- Monitoring & alert → [18-MONITORING.md](./18-MONITORING.md)
- Security (redaction) → [13-SECURITY.md](./13-SECURITY.md)