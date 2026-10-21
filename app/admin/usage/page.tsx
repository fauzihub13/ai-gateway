'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Coins, TrendingUp } from 'lucide-react';
import { PageHeader, StatCard } from '@/components/stat-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIdr, formatNumber } from '@/lib/utils';
import { apiFetch } from '@/lib/client';

interface PerUser {
  userId: string;
  email: string;
  requests: number;
  tokens: number;
  cost: number;
}

interface Bucket {
  key: string;
  requests: number;
  tokens: number;
  cost: number;
}

interface Totals {
  requests: number;
  tokens: number;
  cost: number;
}

type Preset = '24h' | '7d' | '30d' | '90d' | 'custom';

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: '24h', label: '24 jam' },
  { value: '7d', label: '7 hari' },
  { value: '30d', label: '30 hari' },
  { value: '90d', label: '90 hari' },
  { value: 'custom', label: 'Kustom' },
];

const PRESET_DAYS: Record<Exclude<Preset, 'custom'>, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminUsagePage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<{ id: string; email: string } | null>(null);

  const rangeQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (preset === 'custom') {
      if (from) p.set('from', new Date(`${from}T00:00:00`).toISOString());
      if (to) p.set('to', new Date(`${to}T23:59:59.999`).toISOString());
    } else {
      p.set('days', String(PRESET_DAYS[preset]));
    }
    return p;
  }, [preset, from, to]);

  return (
    <div>
      <PageHeader title="Usage per user" description="Pantau pemakaian seluruh pengguna dan drilldown ke satu akun." />

      <Card className="mb-4">
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Rentang waktu</label>
            <Tabs value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <TabsList>
                {PRESETS.map((p) => (
                  <TabsTrigger key={p.value} value={p.value}>
                    {p.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          {preset === 'custom' && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Dari</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full lg:w-44" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Sampai</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full lg:w-44" />
              </div>
            </>
          )}
        </div>
      </Card>

      {selected ? (
        <UserDrilldown
          user={selected}
          rangeQuery={rangeQuery}
          onBack={() => setSelected(null)}
        />
      ) : (
        <PerUserTable rangeQuery={rangeQuery} onSelect={setSelected} />
      )}
    </div>
  );
}

function PerUserTable({
  rangeQuery,
  onSelect,
}: {
  rangeQuery: () => URLSearchParams;
  onSelect: (u: { id: string; email: string }) => void;
}) {
  const [items, setItems] = useState<PerUser[]>([]);
  const [totals, setTotals] = useState<Totals>({ requests: 0, tokens: 0, cost: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/admin/usage?${rangeQuery()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setItems(d.items ?? []);
        setTotals(d.totals ?? { requests: 0, tokens: 0, cost: 0 });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeQuery]);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Requests" value={formatNumber(totals.requests)} icon={Activity} />
        <StatCard label="Tokens" value={formatNumber(totals.tokens)} icon={Coins} />
        <StatCard label="Biaya" value={formatIdr(totals.cost)} icon={TrendingUp} accent="success" />
      </div>

      <Card className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Biaya</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length > 0 ? (
              items.map((u) => (
                <TableRow key={u.userId}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell className="tabular text-right">{formatNumber(u.requests)}</TableCell>
                  <TableCell className="tabular text-right">{formatNumber(u.tokens)}</TableCell>
                  <TableCell className="tabular text-right">{formatIdr(u.cost)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onSelect({ id: u.userId, email: u.email })}>
                        Detail
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/logs?userId=${u.userId}`}>Log</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Belum ada usage pada rentang ini.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function UserDrilldown({
  user,
  rangeQuery,
  onBack,
}: {
  user: { id: string; email: string };
  rangeQuery: () => URLSearchParams;
  onBack: () => void;
}) {
  const [groupBy, setGroupBy] = useState<'day' | 'model' | 'key'>('day');
  const [items, setItems] = useState<Bucket[]>([]);
  const [totals, setTotals] = useState<Totals>({ requests: 0, tokens: 0, cost: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = rangeQuery();
    p.set('userId', user.id);
    p.set('groupBy', groupBy);
    apiFetch(`/api/admin/usage?${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setItems(d.items ?? []);
        setTotals(d.totals ?? { requests: 0, tokens: 0, cost: 0 });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, groupBy, rangeQuery]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Usage user</div>
          <div className="font-medium">{user.email}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/admin/logs?userId=${user.id}`}>Lihat log</Link>
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Kembali
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Requests" value={formatNumber(totals.requests)} icon={Activity} />
        <StatCard label="Tokens" value={formatNumber(totals.tokens)} icon={Coins} />
        <StatCard label="Biaya" value={formatIdr(totals.cost)} icon={TrendingUp} accent="success" />
      </div>

      <div className="mt-6">
        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
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
                  <TableCell className="tabular text-right">{formatNumber(i.requests)}</TableCell>
                  <TableCell className="tabular text-right">{formatNumber(i.tokens)}</TableCell>
                  <TableCell className="tabular text-right">{formatIdr(i.cost)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Tidak ada usage pada rentang ini.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
