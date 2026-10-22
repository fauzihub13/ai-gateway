'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wallet, Activity, Coins, TrendingUp, RefreshCw } from 'lucide-react';
import { PageHeader, StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatIdr, formatNumber } from '@/lib/utils';
import { apiFetch } from '@/lib/client';

interface Overview {
  balance: number;
  totals: { requests: number; tokens: number; cost: number };
  items: Array<{ key: string; requests: number; tokens: number; cost: number }>;
  user?: { email: string; name: string | null; plan: string };
}

interface LogItem {
  id: string;
  createdAt: string;
  model: string;
  status: 'COMPLETED' | 'PARTIAL' | 'ERROR' | 'REJECTED';
  streamed: boolean;
  totalTokens: number;
  costIdr: number;
  latencyMs: number | null;
  errorCode: string | null;
}

const STATUS_VARIANT: Record<LogItem['status'], 'success' | 'warning' | 'destructive' | 'secondary'> = {
  COMPLETED: 'success',
  PARTIAL: 'warning',
  ERROR: 'destructive',
  REJECTED: 'secondary',
};

const REFRESH_MS = 15_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function DashboardOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [logs, setLogs] = useState<LogItem[] | null>(null);
  const [user, setUser] = useState<{ email: string; name: string | null; plan: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)),
      apiFetch('/api/billing/usage?days=30').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([me, usage]) => {
        if (me) setUser({ email: me.user.email, name: me.user.name, plan: me.plan });
        if (usage) setData(usage);
      })
      .finally(() => setLoading(false));
  }, []);

  const loadLogs = useCallback((initial = false) => {
    if (initial) setRefreshing(true);
    apiFetch('/api/billing/logs?limit=8')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setLogs(d.items ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (initial) setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    loadLogs(true);
    const t = setInterval(() => loadLogs(false), REFRESH_MS);
    return () => clearInterval(t);
  }, [loadLogs]);

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

      {/* Observability: request terakhir, real dari DB via /api/billing/logs */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Observability — request terakhir
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Diperbarui otomatis tiap 15 detik.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => loadLogs(true)} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/dashboard/usage">Lihat semua</a>
            </Button>
            </div>
        </CardHeader>
        <CardContent>
          {logs === null ? (
            <Skeleton className="h-40 w-full" />
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada request. Buat API key di{' '}
              <a href="/dashboard/keys" className="text-primary underline">Keys</a> lalu kirim request pertama Anda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Token</TableHead>
                  <TableHead className="text-right">Biaya</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatTime(l.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {l.model}
                      {l.streamed && <span className="ml-1 text-[10px] text-muted-foreground">(stream)</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[l.status]} title={l.errorCode ?? undefined}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular text-right">{formatNumber(l.totalTokens)}</TableCell>
                    <TableCell className="tabular text-right">{formatIdr(l.costIdr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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