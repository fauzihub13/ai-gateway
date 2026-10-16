'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch } from '@/lib/client';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  status: string;
  rpmLimit: number | null;
  lastUsedAt: string | null;
  createdAt: string;
}

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)$`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [rawKey, setRawKey] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await apiFetch('/api/keys');
    if (res.ok) setKeys((await res.json()).keys);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    setError('');
    setRawKey('');
    setCreating(true);
    try {
      const res = await apiFetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? 'Gagal membuat key.');
        return;
      }
      setRawKey(data.rawKey);
      setName('');
      load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke key ini? Tindakan tidak bisa dibatalkan.')) return;
    await apiFetch(`/api/keys/${id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': getCookie('csrf_token') } });
    load();
  }

  function copy() {
    navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <PageHeader title="API Keys" description="Kelola kunci akses untuk memanggil API Mpruy AI." />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="keyname">Nama key baru</Label>
            <Input id="keyname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" />
          </div>
          <Button onClick={create} disabled={!name || creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Buat key
          </Button>
        </CardContent>
      </Card>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>RPM</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {k.prefix}…{k.last4}
                  </code>
                </TableCell>
                <TableCell>
                  <Badge variant={k.status === 'ACTIVE' ? 'success' : 'secondary'}>{k.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{k.rpmLimit ?? 'default'}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => revoke(k.id)}>
                    <Trash2 className="h-4 w-4" />
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <KeyRound className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  Belum ada API key.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={Boolean(rawKey)} onOpenChange={(o) => !o && setRawKey('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key dibuat</DialogTitle>
            <DialogDescription>
              Salin sekarang — kunci ini tidak akan ditampilkan lagi.
            </DialogDescription>
          </DialogHeader>
          <code className="block break-all rounded-md border bg-muted p-3 text-xs">{rawKey}</code>
          <DialogFooter>
            <Button onClick={copy} variant={copied ? 'secondary' : 'default'}>
              <Copy className="h-4 w-4" />
              {copied ? 'Tersalin' : 'Copy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}