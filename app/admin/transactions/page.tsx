'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import { PageHeader } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatIdr } from '@/lib/utils';

interface Trx {
  id: string;
  orderId: string;
  amountIdr: number;
  payAmountIdr: number | null;
  uniqueCode: number;
  provider: 'MIDTRANS' | 'QRIS_MANUAL';
  status: string;
  method: string | null;
  expiresAt: string | null;
  createdAt: string;
  user: { email: string };
}

interface ConfirmTarget {
  id: string;
  orderId: string;
  amountIdr: number;
  payAmountIdr: number | null;
  uniqueCode: number;
  email: string;
  action: 'approve' | 'reject';
}

const STATUSES = ['ALL', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED'];
const PROVIDERS = ['ALL', 'MIDTRANS', 'QRIS_MANUAL'];

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
  const [provider, setProvider] = useState('ALL');
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  function load() {
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (provider !== 'ALL') params.set('provider', provider);
    fetch(`/api/admin/transactions?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setTxns(d.items ?? []))
      .catch(() => undefined);
  }

  useEffect(load, [status, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reconcile(id: string) {
    setActionError('');
    const res = await fetch(`/api/admin/transactions/${id}/reconcile`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': getCookie('csrf_token') },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) setActionError(data?.error?.message ?? 'Gagal reconcile.');
    load();
  }

  async function confirmVerify() {
    if (!confirmTarget) return;
    setSubmitting(true);
    setActionError('');
    try {
      const res = await fetch(`/api/admin/transactions/${confirmTarget.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
        body: JSON.stringify({ action: confirmTarget.action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error?.message ?? 'Gagal memproses transaksi.');
        return;
      }
      setConfirmTarget(null);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Transaksi" description="Riwayat pembayaran top-up.">
        <div className="flex gap-2">
          <div className="w-40">
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p === 'ALL' ? 'Semua metode' : p === 'QRIS_MANUAL' ? 'QRIS manual' : 'Midtrans'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
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
        </div>
      </PageHeader>

      {actionError && !confirmTarget && (
        <div className="mb-4 rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>User</TableHead>
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
                <TableCell>{t.user.email}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t.provider === 'QRIS_MANUAL' ? 'QRIS' : 'Midtrans'}
                </TableCell>
                <TableCell className="text-right">
                  {formatIdr(t.amountIdr)}
                  {t.provider === 'QRIS_MANUAL' && t.payAmountIdr && (
                    <span className="block text-xs text-muted-foreground">
                      bayar {formatIdr(t.payAmountIdr)} (kode {t.uniqueCode})
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[t.status] ?? 'secondary'}>{t.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(t.createdAt).toLocaleString('id-ID')}</TableCell>
                <TableCell className="text-right">
                  {t.status === 'PENDING' && t.provider === 'QRIS_MANUAL' && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setConfirmTarget({
                            id: t.id,
                            orderId: t.orderId,
                            amountIdr: t.amountIdr,
                            payAmountIdr: t.payAmountIdr,
                            uniqueCode: t.uniqueCode,
                            email: t.user.email,
                            action: 'approve',
                          })
                        }
                      >
                        <Check className="h-4 w-4" />
                        Setujui
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setConfirmTarget({
                            id: t.id,
                            orderId: t.orderId,
                            amountIdr: t.amountIdr,
                            payAmountIdr: t.payAmountIdr,
                            uniqueCode: t.uniqueCode,
                            email: t.user.email,
                            action: 'reject',
                          })
                        }
                      >
                        <X className="h-4 w-4" />
                        Tolak
                      </Button>
                    </div>
                  )}
                  {t.status === 'PENDING' && t.provider === 'MIDTRANS' && (
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
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Tidak ada transaksi.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={Boolean(confirmTarget)}
        onOpenChange={(o) => {
          if (!o && !submitting) {
            setConfirmTarget(null);
            setActionError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTarget?.action === 'approve' ? 'Setujui top-up QRIS?' : 'Tolak top-up QRIS?'}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget?.action === 'approve'
                ? 'Pastikan mutasi dengan nominal persis sama sudah masuk. Saldo user langsung bertambah setelah disetujui.'
                : 'Transaksi akan ditandai gagal. Saldo user tidak berubah.'}
            </DialogDescription>
          </DialogHeader>

          {confirmTarget && (
            <dl className="space-y-2 rounded-sm border bg-muted/40 p-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Order</dt>
                <dd className="font-mono text-xs">{confirmTarget.orderId}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">User</dt>
                <dd className="truncate">{confirmTarget.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Nominal saldo</dt>
                <dd>{formatIdr(confirmTarget.amountIdr)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Kode unik</dt>
                <dd className="font-mono">{formatIdr(confirmTarget.uniqueCode)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t pt-2">
                <dt className="font-medium">Total harus dibayar</dt>
                <dd className="font-mono font-semibold">
                  {confirmTarget.payAmountIdr ? formatIdr(confirmTarget.payAmountIdr) : '-'}
                </dd>
              </div>
            </dl>
          )}

          {actionError && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionError}
            </div>
          )}

          {actionError && confirmTarget && (
            <p className="text-sm text-destructive">{actionError}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)} disabled={submitting}>
              Batal
            </Button>
            <Button
              variant={confirmTarget?.action === 'approve' ? 'default' : 'destructive'}
              onClick={confirmVerify}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : confirmTarget?.action === 'approve' ? (
                <Check className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
              {confirmTarget?.action === 'approve' ? 'Setujui' : 'Tolak'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
