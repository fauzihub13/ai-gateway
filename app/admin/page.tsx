'use client';

import { useEffect, useState } from 'react';
import { Users, UserCheck, Activity, Coins, TrendingUp, AlertTriangle } from 'lucide-react';
import { PageHeader, StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIdr, formatNumber } from '@/lib/utils';

interface Metrics {
  users: number;
  activeUsers: number;
  reqToday: number;
  revenueMonthIdr: number;
  errorRate: number;
  tokensToday: number;
  topModels: Array<{ model: string; requests: number; tokens: number; cost: number }>;
}

export default function AdminOverview() {
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    fetch('/api/admin/metrics')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setM(d))
      .catch(() => undefined);
  }, []);

  return (
    <div>
      <PageHeader title="Admin Overview" description="Ringkasan platform Mpruy AI." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!m ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard label="Users" value={formatNumber(m.users)} icon={Users} />
            <StatCard label="Active" value={formatNumber(m.activeUsers)} icon={UserCheck} accent="success" />
            <StatCard label="Request 24j" value={formatNumber(m.reqToday)} icon={Activity} />
            <StatCard label="Revenue bulan ini" value={formatIdr(m.revenueMonthIdr)} icon={TrendingUp} accent="success" />
            <StatCard label="Tokens 24j" value={formatNumber(m.tokensToday)} icon={Coins} />
            <StatCard
              label="Error rate 24j"
              value={`${(m.errorRate * 100).toFixed(2)}%`}
              icon={AlertTriangle}
              accent={m.errorRate > 0.05 ? 'destructive' : 'warning'}
            />
          </>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Top model (7 hari)</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Biaya</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {m?.topModels.length ? (
              m.topModels.map((t) => (
                <TableRow key={t.model}>
                  <TableCell className="font-medium">{t.model}</TableCell>
                  <TableCell className="text-right">{formatNumber(t.requests)}</TableCell>
                  <TableCell className="text-right">{formatNumber(t.tokens)}</TableCell>
                  <TableCell className="text-right">{formatIdr(t.cost)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
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