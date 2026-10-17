# 16 — Admin Panel

Fitur admin, permission model, halaman detail, bulk operations, export, impersonation, audit, emergency actions.

---

## 1. Tujuan

Memberi operator alat lengkap untuk mengelola platform tanpa menyentuh DB langsung: users, models, plans, transaksi, monitoring, audit, dan aksi darurat.

---

## 2. Permission model

| Role | Akses |
|---|---|
| `USER` | dashboard user |
| `ADMIN` | semua `/api/admin/*` |

Fase awal: satu peran admin (tanpa granular). Bila tim besar → tambah `AdminRole` (support, finance, superadmin) di masa depan. Semua aksi admin **wajib** tercatat di `AdminAuditLog`.

```ts
export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== 'ADMIN') throw new ForbiddenError('admin_required');
  return u;
}
```

---

## 3. Halaman admin

### 3.1 Overview `/admin`

```
┌──────────────────────────────────────────────────────────────┐
│  Stats hari ini                                                 │
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐            │
│  │Req    │ │Active │ │Revenue│ │Error% │ │Saldo  │            │
│  │120k   │ │users  │ │Rp8.2jt│ │0.4%   │ │total  │            │
│  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘            │
│  Chart: request & revenue 7 hari                               │
│  Top models · Top users by spend                                │
│  Alert aktif (upstream down, queue numpuk, mismatch)           │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Users `/admin/users`

Filter: status, plan, search email. Kolom: email, plan, status, saldo, req30d, biaya30d, dibuat, aksi.

Aksi per baris: Detail, Suspend/Unsuspend, Verifikasi (untuk `PENDING_EMAIL`), Adjust saldo.

### 3.3 User detail `/admin/users/[id]`

```
┌──────────────────────────────────────────────────────────────┐
│  user@example.com   [ACTIVE]  plan: free         [Suspend]      │
│  Saldo: Rp84.200   [Adjust saldo]   Terdaftar: 2024-06-01      │
├──────────────────────────────────────────────────────────────┤
│  Tabs: [Keys] [Usage] [Transactions] [Ledger] [Audit]          │
│                                                                │
│  Keys: prefix, scope, rpm, lastUsed, [Revoke]                  │
│  Usage: tabel + chart 30d                                       │
│  Transactions: order, nominal, status, [Reconcile]            │
│  Ledger: delta, balanceAfter, reason, waktu                    │
│  Audit: aksi admin terhadap user ini                           │
└──────────────────────────────────────────────────────────────┘
```

### 3.4 Models `/admin/models`

Tabel: publicName, internalName (tampil ke admin), harga in/out, markup plan, aktif, aksi.

Form tambah/edit (lihat [08](./08-MODEL-MAPPING.md)). Aksi: aktif/nonaktif, deprecate, hapus dari plan.

### 3.5 Plans `/admin/plans`

Ubah markup, rpm, monthlyTokenLimit, monthlyPriceIdr, akses model (matrix plan × model).

```
Plan × Model matrix (contoh):
              mimo
free          [x]
```

### 3.6 Transactions `/admin/transactions`

Filter: status, tanggal, user, nominal. Aksi: Reconcile (paksa cek Midtrans), lihat raw payload (redacted).

### 3.7 Monitoring `/admin/monitoring`

Ringkasan metrik hidup (lihat [18](./18-MONITORING.md)): error rate, latency, upstream status, queue settle, redis status.

### 3.8 Settings `/admin/settings`

Kelola `AppSetting`: maintenance mode, pesan maintenance, flag fitur, default markup, provider enabled.

```json
{
  "maintenance": { "enabled": false, "message": "" },
  "features": { "playground": true, "embeddings": true },
  "providers": { "gh": true, "kr": true, "gm": true }
}
```

### 3.9 Audit `/admin/audit`

List `AdminAuditLog` dengan filter admin, aksi, tanggal, target.

---

## 4. Bulk operations

| Aksi | Endpoint | Catatan |
|---|---|---|
| Suspend banyak user | `POST /api/admin/users/bulk` `{ ids, action:"suspend" }` | audit per user |
| Adjust saldo massal | `POST /api/admin/users/bulk` `{ ids, action:"adjust", deltaIdr, reason }` | HATI-HATI, uang |
| Aktif/nonaktif model massal | `POST /api/admin/models/bulk` | |
| Reconcile massal | `POST /api/admin/transactions/bulk-reconcile` | |

Bulk selalu: validasi → jeda/batch (mis. 50 per batch) → audit ringkasan.

---

## 5. Export data

```bash
GET /api/admin/export/usage?from=2024-08-01&to=2024-08-31&format=csv
GET /api/admin/export/transactions?status=PAID&format=csv
```

Stream CSV (jangan muat semua di memori):

```ts
const stream = new ReadableStream({
  async start(controller) {
    controller.enqueue('date,user,model,tokens,cost\n');
    let cursor: string | undefined;
    do {
      const rows = await db.usageLog.findMany({ take: 1000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: 'asc' } });
      for (const r of rows) controller.enqueue(toCsvLine(r));
      cursor = rows.at(-1)?.id;
    } while (cursor);
    controller.close();
  },
});
return new Response(stream, { headers: { 'Content-Type': 'text/csv' } });
```

Format: CSV (default), Excel (via library bila perlu).

---

## 6. Impersonation (opsional)

Admin masuk sebagai user untuk debugging **tanpa** harus tahu password.

- Buat token sesi sementara dengan `actor=adminId`, `impersonating=userId`.
- Banner jelas: "Anda melihat sebagai user@x.com — [Keluar]".
- **Wajib** audit: `admin.impersonate.start` / `.stop`.
- Batasi durasi (mis. 1 jam) dan aksi (read-only kecuali disengaja).
- Disabled by default; aktifkan via setting bila diperlukan.

```ts
async function startImpersonation(adminId: string, userId: string) {
  const sid = `imp_${nanoid()}`;
  await redis.set(`impersonate:${sid}`, { adminId, userId }, { ex: 3600 });
  await db.adminAuditLog.create({ data: { adminId, action: 'admin.impersonate.start', targetType: 'User', targetId: userId } });
  return signSession({ sub: userId, role: 'USER', sid });
}
```

---

## 7. Admin activity log

Semua aksi admin menulis `AdminAuditLog`:

```ts
async function audit(adminId: string, action: string, target?: { type: string; id: string }, metadata?: any, ip?: string) {
  await db.adminAuditLog.create({
    data: { adminId, action, targetType: target?.type, targetId: target?.id, metadata: metadata ?? {}, ip },
  });
}
```

Contoh aksi: `user.suspend`, `user.unsuspend`, `user.verify`, `user.balance.adjust`, `model.create`, `model.update`, `model.deprecate`, `plan.update`, `transaction.reconcile`, `settings.update`, `emergency.maintenance`, `emergency.disable_model`, `admin.impersonate.start/stop`.

---

## 8. Emergency actions

```
┌─ Maintenance mode ──────────────────────────────┐
│ Aktifkan: semua /v1/* balas 503 maintenance     │
│ (dashboard tetap hidup; admin tetap bisa masuk) │
└─────────────────────────────────────────────────┘

┌─ Disable model segera ──────────────────────────┐
│ Set isActive=false → 404 model_not_found        │
│ (dipakai bila provider bermasalah / biaya naik) │
└─────────────────────────────────────────────────┘

┌─ Purge cache ───────────────────────────────────┐
│ redis.del('models:map') dll                     │
└─────────────────────────────────────────────────┘
```

```ts
async function setMaintenance(adminId: string, enabled: boolean, message = '') {
  await db.appSetting.upsert({
    where: { key: 'maintenance' },
    create: { key: 'maintenance', value: { enabled, message } },
    update: { value: { enabled, message } },
  });
  await redis.set('setting:maintenance', { enabled, message });
  await audit(adminId, 'emergency.maintenance', undefined, { enabled, message });
}
```

Proxy `/v1/*` cek flag maintenance lebih dulu → 503 `maintenance_mode`.

---

## 9. Reconcile manual transaksi

```bash
curl -X POST /api/admin/transactions/TRX-ab12/reconcile -b admin_cookies.txt
```

Handler: query `snap.transaction.status(orderId)` → bila status berubah, apply idempotent (logika sama dengan webhook). Audit.

---

## 10. Table + filter pattern

```ts
// contoh endpoint list dengan pagination cursor
export async function GET(req: Request) {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const q = searchParams.get('q');
  const take = Math.min(Number(searchParams.get('limit') ?? 25), 100);
  const cursor = searchParams.get('cursor') ?? undefined;

  const where: any = {};
  if (status) where.status = status;
  if (q) where.email = { contains: q, mode: 'insensitive' };

  const items = await db.user.findMany({
    where, take, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, plan: { select: { name: true } }, status: true, balance: true, createdAt: true },
  });
  return Response.json({ items, nextCursor: items.at(-1)?.id ?? null });
}
```

---

## 11. Edge cases

| Kasus | Penanganan |
|---|---|
| Admin adjust saldo tanpa alasan | validasi wajib `reason` |
| Admin suspend diri sendiri | tolak (cek `targetId !== adminId`) |
| Bulk adjust besar | konfirmasi UI + audit ringkasan |
| Maintenance tapi admin butuh test | allowlist admin tetap bisa `/v1/*` (opsional) |
| Reconcile saat Midtrans down | tangkap error, tampilkan pesan, tidak ubah state |
| Hapus model yang masih dipakai | soft (deprecate), bukan delete |

---

## 12. Referensi

- Contract admin → [05-API-CONTRACT.md](./05-API-CONTRACT.md)
- Model mapping → [08-MODEL-MAPPING.md](./08-MODEL-MAPPING.md)
- Billing & ledger → [10-BILLING-USAGE.md](./10-BILLING-USAGE.md)
- Monitoring → [18-MONITORING.md](./18-MONITORING.md)
- Audit & security → [13-SECURITY.md](./13-SECURITY.md)