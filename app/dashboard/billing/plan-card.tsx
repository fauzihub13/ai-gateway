'use client';

import { useEffect, useState } from 'react';
import { Check, Crown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatIdr } from '@/lib/utils';
import { apiFetch } from '@/lib/client';

type BillingMode = 'PAYG' | 'SUBSCRIPTION';

interface PlanOption {
  name: string;
  displayName: string;
  markup: number;
  rpmLimit: number;
  monthlyTokenLimit: number | null;
  monthlyPriceIdr: number;
  /** Panjang satu periode plan (hari), diatur admin per plan. */
  periodDays: number;
  billingMode: BillingMode;
  isActive: boolean;
  models: string[];
}

interface CurrentPlan {
  planId: string;
  planName: string;
  billingMode: BillingMode;
  startedAt: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  expired: boolean;
  tokenQuota: number | null;
  tokensUsed: number;
  tokensRemaining: number | null;
  quotaExhausted: boolean;
}

interface PlansResponse {
  balance: number;
  current: CurrentPlan;
  plans: PlanOption[];
}

/**
 * Beli/upgrade plan memakai saldo. Plan gratis tidak bisa dibeli (tombol mati).
 * Saldo dipotong penuh saat konfirmasi — tidak ada recurring/tagihan otomatis.
 */
export function PlanCard({ onPurchased }: { onPurchased?: (balance: number) => void }) {
  const [data, setData] = useState<PlansResponse | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<PlanOption | null>(null);
  const [buying, setBuying] = useState(false);

  function load() {
    apiFetch('/api/billing/plans')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => undefined);
  }

  useEffect(load, []);

  async function purchase() {
    if (!confirm) return;
    setError('');
    setBuying(true);
    try {
      const res = await apiFetch('/api/billing/plans/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: confirm.name }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? 'Gagal membeli plan.');
        return;
      }
      setConfirm(null);
      setData((prev) => (prev ? { ...prev, balance: body.balance } : prev));
      onPurchased?.(body.balance);
      load();
    } finally {
      setBuying(false);
    }
  }

  if (!data) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse rounded-sm bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const { current, plans, balance } = data;

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4" />
            Plan
          </CardTitle>
          <CardDescription>
            Plan aktif: <span className="font-medium text-foreground">{current.planName}</span>
            {current.billingMode === 'SUBSCRIPTION' ? ' · langganan (kuota token)' : ' · pay-as-you-go (potong saldo)'}
            {current.expiresAt ? ` · berlaku sampai ${new Date(current.expiresAt).toLocaleDateString('id-ID')}` : ' · tanpa masa aktif'}
            {current.tokenQuota != null &&
              ` · sisa kuota ${Math.max(current.tokensRemaining ?? 0, 0).toLocaleString('id-ID')} / ${current.tokenQuota.toLocaleString('id-ID')} token`}
            {' · '}dibayar dari saldo, bukan tagihan berulang.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => {
              const isCurrent = p.name === current.planName;
              const isFree = p.monthlyPriceIdr <= 0;
              const affordable = balance >= p.monthlyPriceIdr;
              return (
                <div
                  key={p.name}
                  className={`flex flex-col justify-between rounded-sm border p-4 ${
                    isCurrent ? 'border-electric/60 bg-accent/40' : 'border-hairline'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.displayName}</span>
                      {isCurrent && <Badge variant="success">Aktif</Badge>}
                    </div>
                    <p className="mt-1 text-lg font-semibold">
                      {isFree ? 'Gratis' : formatIdr(p.monthlyPriceIdr)}
                      {!isFree && (
                        <span className="text-xs font-normal text-muted-foreground"> / {p.periodDays} hari</span>
                      )}
                    </p>
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3 w-3" />
                        {p.rpmLimit} request/menit
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3 w-3" />
                        {p.monthlyTokenLimit == null
                          ? 'Tanpa kuota token'
                          : `${p.monthlyTokenLimit.toLocaleString('id-ID')} token / ${p.periodDays} hari`}
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3 w-3" />
                        {p.billingMode === 'SUBSCRIPTION' ? 'Tanpa potong saldo (kuota token)' : 'Bayar per token dari saldo'}
                      </li>
                      {p.billingMode === 'SUBSCRIPTION' && (
                        <li className="flex items-center gap-1.5">
                          <Check className="h-3 w-3" />
                          Hemat hingga markup {p.markup}× dari harga resmi
                        </li>
                      )}
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3 w-3" />
                        {p.models.length} model tersedia
                      </li>
                    </ul>
                  </div>
                  <Button
                    className="mt-4"
                    size="sm"
                    variant={isCurrent ? 'outline' : 'default'}
                    disabled={isFree || !affordable}
                    onClick={() => {
                      setError('');
                      setConfirm(p);
                    }}
                  >
                    {isFree
                      ? 'Plan default'
                      : isCurrent
                        ? 'Perpanjang'
                        : affordable
                          ? 'Beli dengan saldo'
                          : 'Saldo kurang'}
                  </Button>
                </div>
              );
            })}
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && !buying && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.name === current.planName
                ? `Perpanjang plan ${confirm?.displayName}?`
                : `Beli plan ${confirm?.displayName}?`}
            </DialogTitle>
            <DialogDescription>
              {confirm?.name === current.planName
                ? `Masa aktif ditambah ${confirm?.periodDays ?? 0} hari dan kuota token periode ini ditambah — tanpa reset.`
                : `Saldo terpotong ${formatIdr(confirm?.monthlyPriceIdr ?? 0)} dan plan aktif ${confirm?.periodDays ?? 0} hari sejak sekarang.`}
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 rounded-sm border bg-muted/40 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Saldo saat ini</dt>
              <dd>{formatIdr(balance)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Harga plan</dt>
              <dd>{formatIdr(confirm?.monthlyPriceIdr ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-2">
              <dt className="font-medium">Saldo setelah bayar</dt>
              <dd className="font-semibold">{formatIdr(balance - (confirm?.monthlyPriceIdr ?? 0))}</dd>
            </div>
          </dl>
          {error && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={buying}>
              Batal
            </Button>
            <Button onClick={purchase} disabled={buying}>
              {buying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
              Bayar dari saldo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
