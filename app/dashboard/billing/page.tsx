'use client';

import { useEffect, useState } from 'react';
import { Wallet, ExternalLink, Loader2, QrCode, X } from 'lucide-react';
import { PageHeader, StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatIdr } from '@/lib/utils';
import { apiFetch } from '@/lib/client';
import { MIDTRANS_ENABLED, TOPUP_MAX_IDR, TOPUP_MIN_IDR, TOPUP_STEP_IDR } from '@/lib/topup';

interface Trx {
  id: string;
  orderId: string;
  amountIdr: number;
  payAmountIdr: number | null;
  uniqueCode: number;
  provider: 'MIDTRANS' | 'QRIS_MANUAL';
  status: string;
  redirectUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface QrisTopup {
  orderId: string;
  amountIdr: number;
  uniqueCode: number;
  payAmountIdr: number;
  qrDataUrl: string;
  expiresAt: string | null;
}

const PRESETS = [TOPUP_MIN_IDR, 50_000, 100_000, 250_000, 500_000].filter(
  (v, i, arr) => v >= TOPUP_MIN_IDR && v <= TOPUP_MAX_IDR && arr.indexOf(v) === i,
);

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)$`));
  return m ? decodeURIComponent(m[1]) : '';
}

const statusVariant: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  PAID: 'success',
  PENDING: 'warning',
  FAILED: 'destructive',
  EXPIRED: 'secondary',
  REFUNDED: 'secondary',
};

export default function BillingPage() {
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState(TOPUP_MIN_IDR);
  const [txns, setTxns] = useState<Trx[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'midtrans' | 'qris' | null>(null);
  const [qris, setQris] = useState<QrisTopup | null>(null);

  function load() {
    apiFetch('/api/billing/usage?days=30')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBalance(d.balance))
      .catch(() => undefined);
    apiFetch('/api/billing/transactions')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTxns(d.items))
      .catch(() => undefined);
  }

  useEffect(load, []);

  async function topupMidtrans() {
    setError('');
    setLoading('midtrans');
    try {
      const res = await apiFetch('/api/billing/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
        body: JSON.stringify({ amountIdr: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? 'Gagal membuat transaksi.');
        return;
      }
      window.location.href = data.redirectUrl;
    } finally {
      setLoading(null);
    }
  }

  async function topupQris() {
    setError('');
    setLoading('qris');
    try {
      const res = await apiFetch('/api/billing/topup/qris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
        body: JSON.stringify({ amountIdr: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? 'Gagal membuat QRIS.');
        return;
      }
      setQris(data);
      load();
    } finally {
      setLoading(null);
    }
  }

  async function showQris(orderId: string) {
    setError('');
    setLoading('qris');
    try {
      const res = await apiFetch(`/api/billing/topup/qris/${orderId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? 'Gagal memuat QRIS.');
        setQris(null);
        load();
        return;
      }
      setQris(data);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <PageHeader title="Billing" description="Top-up saldo dan riwayat transaksi." />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Saldo saat ini" value={formatIdr(balance)} icon={Wallet} accent="primary" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Top-up saldo</CardTitle>
          <CardDescription>
            Minimal {formatIdr(TOPUP_MIN_IDR)}, kelipatan {formatIdr(TOPUP_STEP_IDR)}.{' '}
            {MIDTRANS_ENABLED
              ? 'Bayar otomatis via Midtrans, atau scan QRIS dan tunggu verifikasi admin.'
              : 'Scan QRIS, lalu saldo masuk setelah admin memverifikasi.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p}
                variant={amount === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAmount(p)}
              >
                {formatIdr(p)}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="amount">Nominal (IDR)</Label>
              <Input
                id="amount"
                type="number"
                min={TOPUP_MIN_IDR}
                max={TOPUP_MAX_IDR}
                step={TOPUP_STEP_IDR}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>
            <div className="flex gap-2">
              {MIDTRANS_ENABLED && (
                <Button onClick={topupMidtrans} disabled={loading !== null}>
                  {loading === 'midtrans' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Midtrans
                </Button>
              )}
              <Button variant={MIDTRANS_ENABLED ? 'outline' : 'default'} onClick={topupQris} disabled={loading !== null}>
                {loading === 'qris' ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                QRIS
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {qris && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Bayar via QRIS</CardTitle>
            <CardDescription>
              Scan QR di aplikasi bank/e-wallet. Nominal sudah termasuk kode unik — transfer dengan angka yang persis sama.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-start gap-6 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qris.qrDataUrl}
                alt="QRIS pembayaran"
                className="h-64 w-64 rounded-lg border bg-white p-2"
              />
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Nominal saldo</span>
                  <p className="text-lg font-semibold">{formatIdr(qris.amountIdr)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Kode unik</span>
                  <p className="font-mono">{formatIdr(qris.uniqueCode)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total bayar</span>
                  <p className="text-xl font-bold text-primary">{formatIdr(qris.payAmountIdr)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Order</span>
                  <p className="font-mono text-xs">{qris.orderId}</p>
                </div>
                {qris.expiresAt && (
                  <div>
                    <span className="text-muted-foreground">Berlaku sampai</span>
                    <p>{new Date(qris.expiresAt).toLocaleString('id-ID')}</p>
                  </div>
                )}
                <p className="max-w-xs text-xs text-muted-foreground">
                  Saldo masuk setelah admin memverifikasi mutasi (biasanya &lt; 15 menit di jam kerja). Bayar
                  dengan nominal berbeda akan gagal diverifikasi.
                </p>
                <Button variant="ghost" size="sm" onClick={() => setQris(null)}>
                  <X className="h-4 w-4" />
                  Tutup
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Transaksi</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead className="text-right">Nominal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Waktu</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txns.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <code className="text-xs">{t.orderId}</code>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.provider === 'QRIS_MANUAL' ? 'QRIS' : 'Midtrans'}
                </TableCell>
                <TableCell className="text-right">
                  {formatIdr(t.amountIdr)}
                  {t.provider === 'QRIS_MANUAL' && t.payAmountIdr && (
                    <span className="block text-xs text-muted-foreground">
                      bayar {formatIdr(t.payAmountIdr)}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[t.status] ?? 'secondary'}>{t.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(t.createdAt).toLocaleString('id-ID')}
                </TableCell>
                <TableCell className="text-right">
                  {t.status === 'PENDING' && t.provider === 'QRIS_MANUAL' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={loading !== null}
                      onClick={() => showQris(t.orderId)}
                    >
                      <QrCode className="h-4 w-4" />
                      Lihat QRIS
                    </Button>
                  )}
                  {MIDTRANS_ENABLED && t.status === 'PENDING' && t.provider === 'MIDTRANS' && t.redirectUrl && (
                    <Button asChild variant="ghost" size="sm">
                      <a href={t.redirectUrl}>
                        Bayar <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {txns.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Belum ada transaksi.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
