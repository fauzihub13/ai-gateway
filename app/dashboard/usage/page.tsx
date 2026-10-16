'use client';

import { useEffect, useState } from 'react';
import { Activity, Coins, TrendingUp } from 'lucide-react';
import { PageHeader, StatCard } from '@/components/stat-card';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIdr, formatNumber } from '@/lib/utils';

interface UsageItem {
  key: string;
  requests: number;
  tokens: number;
  cost: number;
}

export default function UsagePage() {
  const [items, setItems] = useState<UsageItem[]>([]);
  const [totals, setTotals] = useState({ requests: 0, tokens: 0, cost: 0 });
  const [groupBy, setGroupBy] = useState('day');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/billing/usage?days=30&groupBy=${groupBy}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setItems(d.items ?? []);
          setTotals(d.totals ?? { requests: 0, tokens: 0, cost: 0 });
        }
      })
      .finally(() => setLoading(false));
  }, [groupBy]);

  return (
    <div>
      <PageHeader title="Usage" description="Pemakaian 30 hari terakhir." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Requests" value={formatNumber(totals.requests)} icon={Activity} />
        <StatCard label="Tokens" value={formatNumber(totals.tokens)} icon={Coins} />
        <StatCard label="Biaya" value={formatIdr(totals.cost)} icon={TrendingUp} accent="success" />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Tabs value={groupBy} onValueChange={setGroupBy}>
          <TabsList>
            <TabsTrigger value="day">Hari</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
            <TabsTrigger value="key">API Key</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="capitalize">{groupBy}</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Biaya</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length > 0 ? (
              items.map((i) => (
                <TableRow key={i.key}>
                  <TableCell className="font-medium">{i.key}</TableCell>
                  <TableCell className="text-right">{formatNumber(i.requests)}</TableCell>
                  <TableCell className="text-right">{formatNumber(i.tokens)}</TableCell>
                  <TableCell className="text-right">{formatIdr(i.cost)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Belum ada usage.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}