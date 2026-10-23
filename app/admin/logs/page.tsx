'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/stat-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIdr, formatNumber } from '@/lib/utils';
import { apiFetch } from '@/lib/client';

interface LogItem {
  id: string;
  requestId: string;
  createdAt: string;
  model: string;
  modelDisplayName: string;
  apiKey: { name: string; masked: string } | null;
  endpoint: string;
  status: 'COMPLETED' | 'PARTIAL' | 'ERROR' | 'REJECTED';
  streamed: boolean;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  totalTokens: number;
  /** Nilai pemakaian: harga resmi provider × token (tanpa markup). */
  costIdr: number;
  /** Yang benar-benar ditagih ke saldo (0 untuk SUBSCRIPTION). */
  chargedIdr: number;
  /** Hemat = (harga resmi × markup) − charged. 0 untuk PAYG. */
  savedIdr: number;
  latencyMs: number | null;
  errorCode: string | null;
}

interface Facets {
  models: Array<{ id: string; publicName: string; displayName: string }>;
  keys: Array<{ id: string; name: string; masked: string }>;
}

interface UserOption {
  id: string;
  email: string;
}

type Preset = '24h' | '7d' | '30d' | '90d' | 'custom';

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: '24h', label: '24 jam' },
  { value: '7d', label: '7 hari' },
  { value: '30d', label: '30 hari' },
  { value: '90d', label: '90 hari' },
  { value: 'custom', label: 'Kustom' },
];

const PRESET_HOURS: Record<Exclude<Preset, 'custom'>, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
};

const STATUS_VARIANT: Record<LogItem['status'], 'success' | 'warning' | 'destructive' | 'secondary'> = {
  COMPLETED: 'success',
  PARTIAL: 'warning',
  ERROR: 'destructive',
  REJECTED: 'secondary',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [facets, setFacets] = useState<Facets>({ models: [], keys: [] });
  const [users, setUsers] = useState<UserOption[]>([]);
  const facetsLoaded = useRef(false);

  const [userId, setUserId] = useState('all');
  const [apiKeyId, setApiKeyId] = useState('all');
  const [modelId, setModelId] = useState('all');
  const [preset, setPreset] = useState<Preset>('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Deep link dari halaman usage (`?userId=...`). Dibaca di effect supaya
  // tidak perlu Suspense boundary untuk useSearchParams.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('userId');
    if (id) setUserId(id);
  }, []);

  const buildQuery = useCallback(
    (cursor?: string) => {
      const p = new URLSearchParams();
      p.set('limit', '25');
      if (userId !== 'all') p.set('userId', userId);
      if (apiKeyId !== 'all') p.set('apiKeyId', apiKeyId);
      if (modelId !== 'all') p.set('modelId', modelId);
      if (preset === 'custom') {
        if (from) p.set('from', new Date(`${from}T00:00:00`).toISOString());
        if (to) p.set('to', new Date(`${to}T23:59:59.999`).toISOString());
      } else {
        const hours = PRESET_HOURS[preset];
        p.set('from', new Date(Date.now() - hours * 3_600_000).toISOString());
      }
      if (cursor) p.set('cursor', cursor);
      return p.toString();
    },
    [userId, apiKeyId, modelId, preset, from, to],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/admin/logs?${buildQuery()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setLogs(d.items ?? []);
        setNextCursor(d.nextCursor ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buildQuery]);

  useEffect(() => {
    if (facetsLoaded.current) return;
    facetsLoaded.current = true;
    apiFetch('/api/admin/logs?limit=1&facets=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.facets) setFacets(d.facets);
      })
      .catch(() => undefined);
    apiFetch('/api/admin/users?limit=100')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.items) setUsers(d.items);
      })
      .catch(() => undefined);
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    setLoadingMore(true);
    apiFetch(`/api/admin/logs?${buildQuery(nextCursor)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setLogs((prev) => [...prev, ...(d.items ?? [])]);
        setNextCursor(d.nextCursor ?? null);
      })
      .finally(() => setLoadingMore(false));
  }, [buildQuery, nextCursor]);

  const hasFilter =
    userId !== 'all' || apiKeyId !== 'all' || modelId !== 'all' || preset !== '7d' || Boolean(from) || Boolean(to);

  return (
    <div>
      <PageHeader title="Log request" description="Semua request dari seluruh user." />

      <Card className="mb-4">
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">User</label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full lg:w-64">
                <SelectValue placeholder="Semua user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua user</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">API Key</label>
            <Select value={apiKeyId} onValueChange={setApiKeyId}>
              <SelectTrigger className="w-full lg:w-56">
                <SelectValue placeholder="Semua key" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua key</SelectItem>
                {facets.keys.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.name} ({k.masked})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Model</label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger className="w-full lg:w-56">
                <SelectValue placeholder="Semua model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua model</SelectItem>
                {facets.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.publicName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Rentang waktu</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {hasFilter && (
            <Button
              variant="outline"
              onClick={() => {
                setUserId('all');
                setApiKeyId('all');
                setModelId('all');
                setPreset('7d');
                setFrom('');
                setTo('');
              }}
            >
              Reset filter
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>API Key</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead className="text-right">Cached</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Nilai</TableHead>
              <TableHead className="text-right">Ditagih</TableHead>
              <TableHead className="text-right">Hemat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={11}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : logs.length > 0 ? (
              logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(l.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span title={l.modelDisplayName}>{l.model}</span>
                    {l.streamed && <span className="ml-1 text-[10px] text-muted-foreground">(stream)</span>}
                  </TableCell>
                  <TableCell className="text-xs">{l.apiKey ? l.apiKey.name : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[l.status]} title={l.errorCode ?? undefined}>
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular text-right">{formatNumber(l.promptTokens)}</TableCell>
                  <TableCell className="tabular text-right">{formatNumber(l.completionTokens)}</TableCell>
                  <TableCell className="tabular text-right">
                    {l.cachedPromptTokens > 0 ? formatNumber(l.cachedPromptTokens) : '—'}
                  </TableCell>
                  <TableCell className="tabular text-right">{formatNumber(l.totalTokens)}</TableCell>
                  <TableCell className="tabular text-right">{formatIdr(l.costIdr)}</TableCell>
                  <TableCell className="tabular text-right">{formatIdr(l.chargedIdr)}</TableCell>
                  <TableCell className="tabular text-right text-success">{formatIdr(l.savedIdr)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                  Tidak ada log pada rentang ini.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {nextCursor && (
          <div className="flex justify-center border-t p-4">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
