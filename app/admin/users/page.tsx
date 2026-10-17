'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Search, Wallet } from 'lucide-react';
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
import { formatIdr } from '@/lib/utils';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  balance: number;
  plan: { name: string };
}

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)$`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState('');
  const [adjustId, setAdjustId] = useState('');
  const [delta, setDelta] = useState(10000);
  const [reason, setReason] = useState('Manual adjustment');
  const [rawKey, setRawKey] = useState('');

  function load() {
    fetch(`/api/admin/users?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setUsers(d.items ?? []))
      .catch(() => undefined);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  async function adjust() {
    const res = await fetch(`/api/admin/users/${adjustId}/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
      body: JSON.stringify({ deltaIdr: delta, reason }),
    });
    if (res.ok) {
      setAdjustId('');
      load();
    } else {
      alert('Gagal adjust saldo');
    }
  }

  async function setStatus(id: string, action: 'suspend' | 'unsuspend' | 'verify') {
    await fetch(`/api/admin/users/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
      body: JSON.stringify({ action }),
    });
    load();
  }

  async function generateKey(userId: string) {
    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
      body: JSON.stringify({ userId, name: 'admin-generated' }),
    });
    const data = await res.json();
    if (res.ok) setRawKey(data.rawKey);
    else alert(data?.error?.message ?? 'Gagal');
  }

  return (
    <div>
      <PageHeader title="Users" description="Kelola akun, saldo, dan akses pengguna." />

      <Card className="mb-6">
        <CardContent className="flex gap-3 p-6">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Cari email..."
          />
          <Button onClick={load}>
            <Search className="h-4 w-4" />
            Cari
          </Button>
        </CardContent>
      </Card>

      <Dialog open={Boolean(adjustId)} onOpenChange={(o) => !o && setAdjustId('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust saldo</DialogTitle>
            <DialogDescription>Positif untuk menambah, negatif untuk mengurangi.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Delta (IDR)</Label>
              <Input type="number" step={1000} value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Alasan</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustId('')}>
              Batal
            </Button>
            <Button onClick={adjust}>
              <Wallet className="h-4 w-4" />
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rawKey)} onOpenChange={(o) => !o && setRawKey('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key baru</DialogTitle>
            <DialogDescription>Salin sekarang — tidak ditampilkan lagi.</DialogDescription>
          </DialogHeader>
          <code className="block break-all rounded-md border bg-muted p-3 text-xs">{rawKey}</code>
          <DialogFooter>
            <Button onClick={() => navigator.clipboard.writeText(rawKey)}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.email}</div>
                  <div className="text-xs text-muted-foreground">{u.role}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{u.plan.name}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === 'ACTIVE' ? 'success' : u.status === 'SUSPENDED' ? 'destructive' : 'secondary'}>
                    {u.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatIdr(u.balance)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setAdjustId(u.id)}>
                      Adjust
                    </Button>
                    {u.role !== 'ADMIN' && u.status === 'PENDING_EMAIL' && (
                      <Button variant="ghost" size="sm" onClick={() => setStatus(u.id, 'verify')}>
                        Verifikasi
                      </Button>
                    )}
                    {u.role !== 'ADMIN' && u.status !== 'PENDING_EMAIL' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStatus(u.id, u.status === 'SUSPENDED' ? 'unsuspend' : 'suspend')}
                      >
                        {u.status === 'SUSPENDED' ? 'Unsuspend' : 'Suspend'}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => generateKey(u.id)}>
                      <KeyRound className="h-4 w-4" />
                      Key
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Tidak ada user.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}