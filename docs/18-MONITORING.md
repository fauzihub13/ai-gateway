# 18 — Monitoring

Metrics, tools, dashboard, alerting rules, log retention, tracing, health checks, status page.

---

## 1. Prinsip observability

1. **Tiga pilar:** metrics, logs, traces — dipropagasi oleh `requestId`.
2. **Metrik yang penting bisnis** (revenue, biaya upstream, saldo) sama pentingnya dengan teknis.
3. **Alert actionable** — setiap alert punya tindakan jelas; hindari alert fatigue.
4. **Data uang di-monitor keras** (settle gagal, mismatch ledger).

---

## 2. Metrics yang di-track

| Kategori | Metrik | Sumber |
|---|---|---|
| Traffic | request rate (rps), per endpoint, per model | proxy |
| Latency | p50/p95/p99 per tahap (auth, upstream TTFB, total) | proxy |
| Errors | 4xx, 5xx, error rate %, per code | proxy + Sentry |
| Upstream | 9Router error rate, timeout, TTFB | client 9Router |
| Billing | cost/request, revenue, top-up rate, settle failures | billing |
| Tokens | prompt/completion/total per hari, per model | UsageLog |
| Users | register, active, key dibuat, churn | DB |
| Infra | DB conn pool, redis latency, queue depth | infra |
| Abuse | 401 rate, rate-limit hits, key lintas IP | rate limit |

---

## 3. Tools

| Kebutuhan | Tool | Catatan |
|---|---|---|
| Error + tracing | Sentry | `@sentry/nextjs`, propagasi requestId |
| Log terstruktur | Vercel logs + Axiom | query JSON log |
| Uptime | Better Stack / UptimeRobot | ping health endpoints |
| Metrics kustom | Axiom/Logflare atau Vercel Analytics | agregasi dari log |
| Alerting | Slack + PagerDuty (opsional) | webhook |

Fase awal: Sentry (error) + Vercel logs + uptime monitor sudah cukup. Tambah Axiom saat volume log besar.

```ts
// sentry.client.config.ts / server
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% tracing
  beforeSend(event) {
    if (event.request?.headers) delete event.request.headers['authorization'];
    if (event.request?.headers) delete event.request.headers['cookie'];
    return event;
  },
});
```

---

## 4. Request ID propagation

Setiap request membuat `requestId` di awal, diteruskan ke log, response header, Sentry, dan settle. Memungkinkan korelasi end-to-end.

```ts
const requestId = req.headers.get('x-request-id') ?? `req_${nanoid(12)}`;
// set ke Sentry scope
Sentry.setTag('requestId', requestId);
// sertakan di response header
headers['x-request-id'] = requestId;
// sertakan di UsageLog.errorCode context & log
```

---

## 5. Logging terstruktur

Semua log JSON (lihat [14 §8](./14-ERROR-HANDLING.md)). Query contoh (Axiom/Logflare):

```
level:"error" AND requestId:"req_9f2a"
code:"upstream_error" | stats count() by model
detect stream duration p95
```

Retensi: 30 hari hot, arsip 90 hari (sesuai kebutuhan). Log uang/audit disimpan lebih lama di DB.

---

## 6. Health check endpoints

```
GET /api/health          → 200 { status: "ok", time }
GET /api/health/db       → cek koneksi DB (SELECT 1)
GET /api/health/redis    → cek Redis PING
GET /api/health/upstream → cek 9Router /v1/models (timeout 2s, cache 30s)
GET /api/health/ready    → siap melayani (DB + Redis OK)
```

```ts
export async function GET() {
  const checks: Record<string, boolean> = {};
  try { await db.$queryRaw`SELECT 1`; checks.db = true; } catch { checks.db = false; }
  try { await redis.ping(); checks.redis = true; } catch { checks.redis = false; }
  try {
    const r = await fetch(`${process.env.NINE_ROUTER_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${process.env.NINE_ROUTER_API_KEY}` },
      signal: AbortSignal.timeout(2000),
    });
    checks.upstream = r.ok;
  } catch { checks.upstream = false; }

  const ok = checks.db && checks.redis;
  return Response.json({ status: ok ? 'ok' : 'degraded', checks }, { status: ok ? 200 : 503 });
}
```

Uptime monitor ping `/api/health` tiap 1 menit.

---

## 7. Alerting rules

| Alert | Kondisi | Severity | Channel |
|---|---|---|---|
| Error 5xx tinggi | rate > 2% 5 mnt | high | Slack + PagerDuty |
| Upstream down | `upstream_unavailable` > 10 / 5 mnt | high | Slack + PagerDuty |
| Settle gagal | > 0 | kritikal | PagerDuty |
| Queue settle | depth > 100 | high | Slack |
| Balance mismatch | > 0 | kritikal | PagerDuty |
| Webhook signature invalid | > 5 / 10 mnt | medium | Slack |
| Latency degrade | p95 > 2× target 30 mnt | medium | Slack |
| Redis error | > 10 / 5 mnt | high | Slack |
| DB conn pool | > 90% | high | Slack |
| Zero request | 0 selama 5 mnt (jam sibuk) | high | PagerDuty |
| Uptime fail | health gagal 2× | high | PagerDuty |

Contoh definisi alert (pseudo):

```ts
if (errorRate5m > 0.02) alert('high_error_rate', { errorRate5m });
if (settleFailures1m > 0) alert('settle_failure', { count: settleFailures1m });
if (queueDepth > 100) alert('settle_queue_backlog', { queueDepth });
```

---

## 8. Dashboard

### 8.1 Operasional (admin)

```
┌─ Request/min ──────┐ ┌─ Error % ──────────┐ ┌─ p95 latency ──────┐
│  ▁▂▄▆█▇              │ │  0.3%              │ │  820ms             │
└────────────────────┘ └────────────────────┘ └────────────────────┘
┌─ Upstream 9Router %─┐ ┌─ Settle queue ────┐ ┌─ Revenue (hari) ──┐
│  99.7% ok           │ │  depth: 0          │ │  Rp8.2jt           │
└────────────────────┘ └────────────────────┘ └────────────────────┘
```

### 8.2 Bisnis (admin)

- Revenue harian/bulanan, top-up rate, ARPU.
- Token usage per model, biaya upstream vs pendapatan (margin).
- User aktif, register/retensi.

---

## 9. Cost monitoring

Pantau biaya upstream (dari 9Router/metric) vs pendapatan:

```
margin = revenue - (cost_upstream)
bila margin negatif pada model tertentu → alert (mis. markup salah / harga dasar naik)
```

Job harian: hitung cost dasar (dari `priceIn/OutPer1MIdr` dibagi markup) × token → bandingkan dengan pendapatan tercatat.

---

## 10. Status page (opsional)

- Halaman publik `/status` (Better Stack / instatus / kustom).
- Komponen: API, Dashboard, Payment, Docs.
- Update insiden manual + otomatis dari uptime.

---

## 11. Log retention policy

| Jenis | Hot | Arsip |
|---|---|---|
| Application logs | 30 hari | 90 hari |
| Access logs (edge) | 30 hari | — |
| Audit (DB) | 24 bulan | permanen (keuangan) |
| UsageLog | 24 bulan | arsip |
| Sentry events | 30–90 hari (sesuai plan) | — |

---

## 12. Referensi

- Error & alert → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)
- Deployment & health → [17-DEPLOYMENT.md](./17-DEPLOYMENT.md)
- Troubleshooting → [21-TROUBLESHOOTING.md](./21-TROUBLESHOOTING.md)
- Billing reconcile → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md)