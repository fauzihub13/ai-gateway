'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatIdr } from '@/lib/utils';

interface Trx {
  id: string;
  orderId: string;
  amountIdr: number;
  status: string;
  method: string | null;
  createdAt: string;
  user: { email: string };
}

const STATUSES = ['ALL', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED'];

const statusVariant: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  PAID: 'success',
  PENDING: 'warning',
  FAILED: 'destructive',
  EXPIRED: 'secondary',
  REFUNDED: 'secondary',
};

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)$`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function AdminTransactionsPage() {
  const [txns, setTxns] = useState<Trx[]>([]);
  const [status, setStatus] = useState('ALL');

  function load() {
    const q = status === 'ALL' ? '' : status;
    fetch(`/api/admin/transactions?status=${q}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setTxns(d.items ?? []))
      .catch(() => undefined);
  }

  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reconcile(id: string) {
    const res = await fetch(`/api/admin/transactions/${id}/reconcile`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': getCookie('csrf_token') },
    });
    const data = await res.json();
    if (!res.ok) alert(data?.error?.message ?? 'Gagal reconcile');
    load();
  }

  return (
    <div>
      <PageHeader title="Transaksi" description="Riwayat pembayaran top-up.">
        <div className="w-44">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === 'ALL' ? 'Semua status' : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>User</TableHead>
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
                <TableCell>{t.user.email}</TableCell>
                <TableCell className="text-right">{formatIdr(t.amountIdr)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[t.status] ?? 'secondary'}>{t.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(t.createdAt).toLocaleString('id-ID')}</TableCell>
                <TableCell className="text-right">
                  {t.status === 'PENDING' && (
                    <Button variant="ghost" size="sm" onClick={() => reconcile(t.id)}>
                      <RefreshCw className="h-4 w-4" />
                      Reconcile
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {txns.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Tidak ada transaksi.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}