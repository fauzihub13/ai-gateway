'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
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
import { MAX_ACTIVE_KEYS_PER_USER } from '@/lib/key-policy';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  status: string;
  rpmLimit: number | null;
  lastUsedAt: string | null;
  createdAt: string;
  /** False untuk key lama yang dibuat sebelum ciphertext disimpan. */
  recoverable: boolean;
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback untuk browser/konteks non-secure (mis. akses via IP di jaringan lokal).
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) throw new Error('copy_failed');
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const atKeyLimit = keys.length >= MAX_ACTIVE_KEYS_PER_USER;

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
    void copyRawKey(rawKey);
  }

  async function copyRawKey(value: string) {
    try {
      await writeClipboard(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError('Gagal menyalin API key. Salin manual dari kotak di atas.');
    }
  }

  async function copyExisting(k: ApiKey) {
    setCopyError('');
    if (!k.recoverable) {
      setCopyError('Key ini dibuat sebelum fitur copy ulang aktif. Revoke lalu buat key baru untuk bisa menyalinnya.');
      return;
    }

    setRevealingId(k.id);
    try {
      const res = await apiFetch(`/api/keys/${k.id}/reveal`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.error?.code;
        if (code === 'key_not_recoverable') {
          setCopyError('Key ini tidak bisa dipulihkan. Revoke lalu buat key baru.');
        } else if (code === 'key_not_active') {
          setCopyError('Key ini sudah tidak aktif. Buat key baru untuk mendapatkan key yang bisa dipakai.');
        } else if (code === 'rate_limit_exceeded') {
          setCopyError('Terlalu sering membuka key. Tunggu sebentar lalu coba lagi.');
        } else {
          setCopyError(data?.error?.message ?? 'Gagal mengambil API key.');
        }
        return;
      }

      await writeClipboard(data.rawKey);
      setCopiedId(k.id);
      window.setTimeout(() => setCopiedId((current) => (current === k.id ? null : current)), 1500);
    } catch {
      setCopyError('Gagal menyalin API key. Coba lagi.');
    } finally {
      setRevealingId(null);
    }
  }

  return (
    <div>
      <PageHeader title="API Keys" description="Kelola kunci akses untuk memanggil API Mpruy AI." />

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="space-y-2">
            <Label htmlFor="keyname">Nama key baru</Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex-1 space-y-2">
                <Input id="keyname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" />
                <p className={atKeyLimit ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                  {atKeyLimit
                    ? `Batas ${MAX_ACTIVE_KEYS_PER_USER} key aktif tercapai. Revoke key lama dulu untuk membuat key baru.`
                    : `${keys.length}/${MAX_ACTIVE_KEYS_PER_USER} key aktif. Maksimal ${MAX_ACTIVE_KEYS_PER_USER} key per akun.`}
                </p>
              </div>
              <Button onClick={create} disabled={!name || creating || atKeyLimit} size="sm" className="sm:shrink-0">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Buat key
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {copyError && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {copyError}
        </p>
      )}

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
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyExisting(k)}
                      disabled={revealingId === k.id}
                      title={k.recoverable ? 'Salin API key' : 'Key lama tidak bisa ditampilkan'}
                      aria-label={`Salin API key ${k.name}`}
                    >
                      {revealingId === k.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : copiedId === k.id ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copiedId === k.id ? 'Tersalin' : 'Copy'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => revoke(k.id)}>
                      <Trash2 className="h-4 w-4" />
                      Revoke
                    </Button>
                  </div>
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
              Salin sekarang, atau kembali ke daftar kapan saja untuk copy ulang.
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