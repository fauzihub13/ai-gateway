'use client';

import { useEffect, useState } from 'react';
import { Wallet, Activity, Coins, TrendingUp } from 'lucide-react';
import { PageHeader, StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIdr, formatNumber } from '@/lib/utils';

interface Overview {
  balance: number;
  totals: { requests: number; tokens: number; cost: number };
  items: Array<{ key: string; requests: number; tokens: number; cost: number }>;
  user?: { email: string; name: string | null; plan: string };
}

export default function DashboardOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [user, setUser] = useState<{ email: string; name: string | null; plan: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/billing/usage?days=30').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([me, usage]) => {
        if (me) setUser({ email: me.user.email, name: me.user.name, plan: me.plan });
        if (usage) setData(usage);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Overview"
        description={user ? `Selamat datang, ${user.name ?? user.email} · plan ${user.plan}` : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard label="Saldo" value={formatIdr(data?.balance ?? 0)} icon={Wallet} accent="primary" />
            <StatCard label="Request (30d)" value={formatNumber(data?.totals.requests ?? 0)} icon={Activity} />
            <StatCard label="Token (30d)" value={formatNumber(data?.totals.tokens ?? 0)} icon={Coins} />
            <StatCard
              label="Biaya (30d)"
              value={formatIdr(data?.totals.cost ?? 0)}
              icon={TrendingUp}
              accent="success"
            />
          </>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Aktivitas 30 hari</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : data && data.items.length > 0 ? (
            <MiniBar items={data.items} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada aktivitas. Mulai kirim request lewat API key Anda.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniBar({ items }: { items: Array<{ key: string; cost: number }> }) {
  const recent = items.slice(0, 14);
  const max = Math.max(1, ...recent.map((i) => i.cost));
  return (
    <div className="flex h-40 items-end gap-1.5">
      {recent.map((i) => (
        <div key={i.key} className="group relative flex-1" title={`${i.key}: ${formatIdr(i.cost)}`}>
          <div
            className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
            style={{ height: `${Math.max(4, (i.cost / max) * 140)}px` }}
          />
        </div>
      ))}
    </div>
  );
}