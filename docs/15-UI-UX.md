# 15 — UI / UX

Sitemap, wireframe tiap halaman, komponen reusable, design system, responsive, aksesibilitas, state (loading/empty/error), dark mode.

---

## 1. Prinsip UX

1. **Time-to-first-key < 3 menit** — onboarding tanpa friksi.
2. **Transparansi harga** — user lihat **harga resmi provider** (dasar estimasi "nilai pemakaian") dan cara plan menagih (PAYG = resmi × markup; SUBSCRIPTION = tanpa potong saldo, dibatasi kuota) sebelum pakai.
3. **Playground sebelum integrasi** — coba model tanpa tulis kode.
4. **Copy-paste friendly** — snippet siap tempel (curl, JS, Python).
5. **State jelas** — loading/empty/error tidak pernah ambigu.
6. **Aksesibel** — WCAG 2.1 AA.

---

## 2. Sitemap

```
/                                  Landing
/pricing                           Harga & plan
/docs                              Dokumentasi publik
/docs/quickstart
/docs/api-reference
/docs/models
/login                             Login
/register                          Register
/verify                            Verifikasi email (?token=)
/forgot-password
/reset-password                    (?token=)

/dashboard                         Overview
/dashboard/keys                    Kelola API key
/dashboard/keys/new
/dashboard/usage                   Usage & analytics
/dashboard/billing                 Saldo, top-up, transaksi, invoice
/dashboard/playground              Playground chat
/dashboard/settings                Profil, password, sesi
/dashboard/docs                    Docs ringkas (redirect ke /docs)

/admin                             Overview admin
/admin/users
/admin/users/[id]
/admin/models
/admin/models/[id]
/admin/plans
/admin/transactions
/admin/transactions/[id]
/admin/monitoring
/admin/settings
/admin/audit
```

---

## 3. Wireframe halaman kunci

### 3.1 Landing `/`

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo]   Produk  Harga  Docs  Login      [Coba gratis]         │  nav
├──────────────────────────────────────────────────────────────┤
│                                                                │
│   Satu API untuk semua model AI terbaik                        │
│   OpenAI-compatible. Streaming. Harga transparan.              │
│                                                                │
│   [Mulai gratis]  [Lihat harga]                                │
│                                                                │
│   ┌─ code snippet (curl/JS/Python tabs) ────────────────────┐  │
│   │ curl https://api.mpruy.ai/v1/chat/completions \          │  │
│   │   -H "Authorization: Bearer sk-mpruy-..."                 │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│  Logos model: mimo  ...                                          │
├──────────────────────────────────────────────────────────────┤
│  Fitur:  [OpenAI-compatible] [Streaming] [Dashboard] [SSE]    │
├──────────────────────────────────────────────────────────────┤
│  Harga ringkas (kartu plan)                                    │
├──────────────────────────────────────────────────────────────┤
│  FAQ                                                            │
├──────────────────────────────────────────────────────────────┤
│  [CTA] Mulai sekarang           Footer (legal, status, kontak) │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Pricing `/pricing`

```
┌──────────────────────────────────────────────────────────────┐
│  Pilih plan sesuai kebutuhan                                   │
│                                                                │
│  Kartu plan dirender dari tabel Plan (aktif), urut harga.      │
│  Contoh:                                                       │
│  ┌─ Free ─────┐  ┌─ Pro ──────┐                               │
│  │ Gratis     │  │ Rp100.000  │                               │
│  │ 100 req/mnt│  │ 300 req/mnt│                               │
│  │ 20jt tok   │  │ 100jt tok  │                               │
│  │ PAYG       │  │ SUBSCRIPTION                               │
│  │ [Default]  │  │ [Pilih]    │                               │
│  └────────────┘  └────────────┘                               │
│                                                                │
│  Tabel harga per model = HARGA RESMI provider (tanpa markup).  │
│  Dipakai untuk estimasi "nilai pemakaian", bukan tagihan.      │
│  Model | Input/1M | Output/1M | Konteks                       │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Login `/login`

```
        ┌────────────────────────────┐
        │        [Logo]              │
        │  Masuk ke akun Anda        │
        │                            │
        │  Email    [___________]    │
        │  Password [___________]    │
        │                            │
        │  [       Masuk        ]    │
        │                            │
        │  Lupa password?  Daftar    │
        └────────────────────────────┘
```

### 3.4 Register `/register`

```
        ┌────────────────────────────┐
        │  Buat akun                 │
        │  Nama     [___________]    │
        │  Email    [___________]    │
        │  Password [___________]    │
        │  (indikator kekuatan)      │
        │  [      Daftar      ]      │
        │  Sudah punya akun? Masuk   │
        └────────────────────────────┘
```

### 3.5 Dashboard overview `/dashboard`

```
┌────────┬─────────────────────────────────────────────────────┐
│ Sidebar│  Selamat datang, Budi          Saldo: Rp84.200 [Top-up]│
│        ├─────────────────────────────────────────────────────┤
│ Overview│  ┌─Stat─┐ ┌─Stat─┐ ┌─Stat─┐ ┌─Stat─┐               │
│ Keys   │  │Req   │ │Token │ │Biaya │ │Error │               │
│ Usage  │  │1.2k  │ │340k  │ │Rp12k │ │0.3%  │               │
│ Billing│  └──────┘ └──────┘ └──────┘ └──────┘               │
│ Play   │                                                     │
│ Settings│  ┌─ Chart: request 7 hari ──────────────────────┐  │
│        │  │  ▁▂▄▆█▇▆                                      │  │
│        │  └───────────────────────────────────────────────┘  │
│        │  ┌─ Request terbaru ────────────────────────────┐   │
│        │  │ model | token | biaya | status | waktu        │   │
│        │  └───────────────────────────────────────────────┘  │
└────────┴─────────────────────────────────────────────────────┘
```

### 3.6 Keys `/dashboard/keys`

```
┌──────────────────────────────────────────────────────────────┐
│  API Keys                              [+ Buat key baru]       │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Production   sk-mpruy-ab12…cd34   ACTIVE                  │ │
│  │ dipakai 2m lalu · 120 rpm · [Edit] [Revoke]              │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ Dev          sk-mpruy-xy99…pq11   ACTIVE                  │ │
│  │ belum dipakai · default rpm · [Edit] [Revoke]            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  (modal create) → tampilkan rawKey SEKALI + tombol Copy        │
└──────────────────────────────────────────────────────────────┘
```

### 3.7 Usage `/dashboard/usage`

```
┌──────────────────────────────────────────────────────────────┐
│  Usage    [Rentang: 7d | 30d | bulan ini]  [Group: hari|model|key]│
│                                                                │
│  ┌─ total ─────────────┐  ┌─ chart ────────────────────────┐  │
│  │ requests 1.240      │  │  tokens/hari (bar)              │  │
│  │ tokens 340.120      │  │                                │  │
│  │ biaya Rp12.480      │  │                                │  │
│  └─────────────────────┘  └────────────────────────────────┘  │
│                                                                │
│  Tabel: model | requests | tokens | biaya                      │
│  [Export CSV]                                                  │
└──────────────────────────────────────────────────────────────┘
```

### 3.8 Billing `/dashboard/billing`

```
┌──────────────────────────────────────────────────────────────┐
│  Saldo: Rp84.200            [Top-up]                           │
│                                                                │
│  ┌─ Top-up ────────────────────────────────────────────────┐  │
│  │ nominal: [50rb][100rb][250rb][500rb][custom ____]        │  │
│  │ → buat transaksi → redirect Snap                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  Transaksi                                                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ TRX-...  Rp100.000  PAID    2024-08-16  [Invoice]        │ │
│  │ TRX-...  Rp50.000   PENDING 2024-08-16                    │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 3.9 Playground `/dashboard/playground`

```
┌──────────────┬───────────────────────────────────────────────┐
│ Model [▼]    │  Chat                                          │
│ Temp [—o—]   │  ┌────────────────────────────────────────┐  │
│ Max tok [ ]  │  │ user: Halo                              │  │
│ Stream [✓]   │  │ assistant: Halo! Ada yang bisa...      │  │
│ System [ ]   │  │                                   ▍      │  │
│              │  └────────────────────────────────────────┘  │
│              │  [____________________________] [Kirim]       │
│              │  usage: 42 tok · ~Rp2 · 320ms                 │
└──────────────┴───────────────────────────────────────────────┘
```

### 3.10 Admin — users `/admin/users`

```
┌──────────────────────────────────────────────────────────────┐
│ Filter: [status ▼][plan ▼][search ____]      [Export CSV]      │
│                                                                │
│ Tabel: email | plan | status | saldo | req30d | biaya | aksi    │
│  user@x.com | free | ACTIVE | Rp12k | 1.2k | Rp12k | [Detail]   │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Komponen reusable

| Komponen | Properti | Catatan |
|---|---|---|
| `Button` | variant (primary/secondary/ghost/danger), size, loading | disabled saat loading |
| `Card` | title, footer, actions | container dasar |
| `Table` | columns, data, empty, loading, pagination | generik |
| `Modal` | open, onClose, title, footer | fokus trap, ESC |
| `Input` | label, error, hint, type | aksesibel |
| `Select` | options, value | Radix |
| `Badge` | variant (success/warn/danger/neutral) | status |
| `Toast` | type, message | notifikasi |
| `Chart` | type (line/bar), data | Recharts wrapper |
| `CodeBlock` | language, code, copy | snippet |
| `KeyRevealModal` | rawKey | tampil sekali |
| `ConfirmDialog` | title, onConfirm | aksi destruktif |
| `StatCard` | label, value, delta | dashboard |
| `EmptyState` | icon, title, cta | daftar kosong |
| `Skeleton` | shape | loading |

Contoh `Button`:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';

const button = cva('inline-flex items-center justify-center rounded-md text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2', {
  variants: {
    variant: {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
      secondary: 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200',
      ghost: 'hover:bg-neutral-100',
      danger: 'bg-red-600 text-white hover:bg-red-500',
    },
    size: { sm: 'h-8 px-3', md: 'h-9 px-4', lg: 'h-11 px-6' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

export function Button({ className, variant, size, loading, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { loading?: boolean }) {
  return (
    <button className={button({ variant, size, className })} disabled={loading || props.disabled} {...props}>
      {loading ? <Spinner className="mr-2" /> : null}
      {props.children}
    </button>
  );
}
```

---

## 5. Design system

### 5.1 Warna

| Token | Nilai | Pakai |
|---|---|---|
| `--primary` | `#4f46e5` (indigo-600) | aksi utama |
| `--primary-hover` | `#4338ca` | hover |
| `--bg` | `#ffffff` / dark `#0a0a0a` | latar |
| `--surface` | `#f8fafc` / dark `#171717` | kartu |
| `--text` | `#0f172a` / dark `#fafafa` | teks |
| `--muted` | `#64748b` | teks sekunder |
| `--border` | `#e2e8f0` / dark `#262626` | garis |
| `--success` | `#16a34a` | sukses |
| `--warn` | `#d97706` | peringatan |
| `--danger` | `#dc2626` | error |

### 5.2 Tipografi

| Peran | Font | Ukuran |
|---|---|---|
| UI | Inter (variable) | base 14/16 |
| Headings | Inter | h1 30/36, h2 24/32, h3 20/28 |
| Mono | JetBrains Mono | 13/20 (kode) |

### 5.3 Spacing & radius

- Skala 4px: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: `sm 6px`, `md 8px`, `lg 12px`, `full`.
- Shadow: subtle (`0 1px 2px rgba(0,0,0,.05)`).

---

## 6. Responsive

- Breakpoint Tailwind: `sm 640`, `md 768`, `lg 1024`, `xl 1280`.
- Sidebar dashboard → drawer di mobile.
- Tabel → kartu bertumpuk di mobile, atau horizontal scroll.
- Contoh grid stat: `grid grid-cols-2 md:grid-cols-4 gap-4`.

---

## 7. Aksesibilitas (WCAG 2.1 AA)

- Kontras ≥ 4.5:1 (teks normal).
- Semua kontrol dapat diakses keyboard; visible focus ring.
- `aria-label` pada ikon-only button.
- Modal: fokus trap, kembalikan fokus saat tutup, tutup dengan ESC.
- Form: `label` terhubung `htmlFor`, pesan error `aria-describedby` + `role="alert"`.
- Chart: sediakan tabel alternatif / ringkasan teks.
- Tidak mengandalkan warna saja (tambah ikon/teks).

---

## 8. State

### 8.1 Loading

- Skeleton untuk tabel/kartu.
- Button loading (spinner + disabled).
- Streaming: tampilkan token bertambah + kursor.

### 8.2 Empty

```
┌──────────────────────────────┐
│      (ikon kunci)            │
│  Belum ada API key           │
│  Buat key pertamamu          │
│  [Buat key baru]             │
└──────────────────────────────┘
```

### 8.3 Error

```
┌──────────────────────────────┐
│  ⚠ Gagal memuat data          │
│  <pesan singkat dari code>   │
│  [Coba lagi]                 │
└──────────────────────────────┘
```

Map error code → pesan ramah (lihat [14 §7](./14-ERROR-HANDLING.md)).

---

## 9. Dark mode

- Default ikut `prefers-color-scheme`, toggle manual tersimpan.
- Tailwind `darkMode: 'class'`; root `<html class="dark">`.
- Token warna dark disediakan (§5.1).

---

## 10. Microcopy penting

| Konteks | Teks |
|---|---|
| Reveal key | "Salin sekarang — kunci ini tidak akan ditampilkan lagi." |
| Top-up sukses | "Saldo berhasil ditambahkan: Rp100.000." |
| Top-up pending | "Menunggu pembayaran. Saldo masuk otomatis setelah terkonfirmasi." |
| Rate limit | "Terlalu banyak permintaan. Coba lagi dalam {s} detik." |
| Saldo habis | "Saldo tidak cukup. Top-up untuk melanjutkan." |
| Playground biaya | "Percakapan di playground memakai saldo Anda." |

---

## 11. Referensi

- Contract endpoint dashboard → [05-API-CONTRACT.md](./05-API-CONTRACT.md)
- Admin panel → [16-ADMIN-PANEL.md](./16-ADMIN-PANEL.md)
- Error pesan → [14-ERROR-HANDLING.md](./14-ERROR-HANDLING.md)
- Design system di Figma (opsional) — koordinasikan via tool desain.