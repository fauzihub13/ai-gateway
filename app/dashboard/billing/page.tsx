'use client';

import { useEffect, useState } from 'react';
import { Wallet, ExternalLink, Loader2 } from 'lucide-react';
import { PageHeader, StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatIdr } from '@/lib/utils';

interface Trx {
  id: string;
  orderId: string;
  amountIdr: number;
  status: string;
  redirectUrl: string | null;
  createdAt: string;
}

const PRESETS = [50000, 100000, 250000, 500000];

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
  const [amount, setAmount] = useState(100000);
  const [txns, setTxns] = useState<Trx[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function load() {
    fetch('/api/billing/usage?days=30')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBalance(d.balance))
      .catch(() => undefined);
    fetch('/api/billing/transactions')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTxns(d.items))
      .catch(() => undefined);
  }

  useEffect(load, []);

  async function topup() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/billing/topup', {
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
      setLoading(false);
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
          <CardDescription>Minimal Rp10.000, kelipatan Rp1.000. Pembayaran via Midtrans.</CardDescription>
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
                step={1000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>
            <Button onClick={topup} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Top-up
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Transaksi</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
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
                <TableCell className="text-right">{formatIdr(t.amountIdr)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[t.status] ?? 'secondary'}>{t.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(t.createdAt).toLocaleString('id-ID')}
                </TableCell>
                <TableCell className="text-right">
                  {t.status === 'PENDING' && t.redirectUrl && (
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
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
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