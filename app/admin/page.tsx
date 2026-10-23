'use client';

import { useEffect, useState } from 'react';
import { Users, UserCheck, Activity, Coins, TrendingUp, AlertTriangle, Wallet } from 'lucide-react';
import { PageHeader, StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIdr, formatNumber } from '@/lib/utils';

type Range = 'all' | '24h' | '7d' | '30d';

const RANGE_TABS: Array<{ value: Range; label: string }> = [
  { value: 'all', label: 'Semua' },
  { value: '24h', label: '24 jam' },
  { value: '7d', label: '7 hari' },
  { value: '30d', label: '30 hari' },
];

const RANGE_SUFFIX: Record<Range, string> = {
  all: 'sepanjang waktu',
  '24h': '24 jam terakhir',
  '7d': '7 hari terakhir',
  '30d': '30 hari terakhir',
};

interface Metrics {
  range: Range;
  users: number;
  activeUsers: number;
  revenueMonthIdr: number;
  requests: number;
  tokens: number;
  cachedTokens: number;
  /** Nilai pemakaian (harga resmi provider). */
  valueIdr: number;
  /** Yang benar-benar ditagih ke saldo user. */
  chargedIdr: number;
  /** Hemat user (retail − charged). */
  savedIdr: number;
  errors: number;
  errorRate: number;
  topModels: Array<{ model: string; requests: number; tokens: number; value: number; charged: number; saved: number }>;
}

function errorAccent(rate: number): 'destructive' | 'warning' | 'success' {
  if (rate > 0.05) return 'destructive';
  if (rate > 0.01) return 'warning';
  return 'success';
}

export default function AdminOverview() {
  const [m, setM] = useState<Metrics | null>(null);
  const [range, setRange] = useState<Range>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/metrics?range=${range}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setM(d);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const suffix = RANGE_SUFFIX[range];

  return (
    <div>
      <PageHeader title="Admin Overview" description="Ringkasan platform Mpruy AI.">
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            {RANGE_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {loading && !m ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : m ? (
          <>
            <StatCard label="Requests" value={formatNumber(m.requests)} icon={Activity} hint={suffix} />
            <StatCard
              label="Tokens"
              value={formatNumber(m.tokens)}
              icon={Coins}
              hint={`${formatNumber(m.cachedTokens)} cached`}
            />
            <StatCard
              label="Error rate"
              value={`${(m.errorRate * 100).toFixed(2)}%`}
              icon={AlertTriangle}
              hint={`${formatNumber(m.errors)} error`}
              accent={errorAccent(m.errorRate)}
            />
            <StatCard
              label="Nilai pemakaian"
              value={formatIdr(m.valueIdr)}
              icon={TrendingUp}
              hint="Harga resmi provider"
            />
            <StatCard
              label="Ditagih"
              value={formatIdr(m.chargedIdr)}
              icon={Wallet}
              accent="success"
              hint={`Hemat user ${formatIdr(m.savedIdr)}`}
            />
          </>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Users" value={formatNumber(m?.users ?? 0)} icon={Users} />
        <StatCard label="Active" value={formatNumber(m?.activeUsers ?? 0)} icon={UserCheck} accent="success" />
        <StatCard
          label="Revenue bulan ini"
          value={formatIdr(m?.revenueMonthIdr ?? 0)}
          icon={TrendingUp}
          accent="success"
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Top model ({suffix})</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Nilai</TableHead>
              <TableHead className="text-right">Ditagih</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !m ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : m?.topModels.length ? (
              m.topModels.map((t) => (
                <TableRow key={t.model}>
                  <TableCell className="font-medium">{t.model}</TableCell>
                  <TableCell className="text-right">{formatNumber(t.requests)}</TableCell>
                  <TableCell className="text-right">{formatNumber(t.tokens)}</TableCell>
                  <TableCell className="text-right">{formatIdr(t.value)}</TableCell>
                  <TableCell className="text-right">{formatIdr(t.charged)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Belum ada data.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
