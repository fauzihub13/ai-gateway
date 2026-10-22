'use client';

import { useEffect, useState } from 'react';
import { Copy, Crown, KeyRound, Loader2, Search, Wallet } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatIdr } from '@/lib/utils';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  balance: number;
  planExpiresAt: string | null;
  plan: { name: string };
}

interface PlanOption {
  name: string;
  displayName: string;
  monthlyPriceIdr: number;
  isActive: boolean;
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
  // Ganti plan manual: tanpa potong saldo (kompensasi/hadiah/migrasi).
  const [planTarget, setPlanTarget] = useState<UserRow | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planName, setPlanName] = useState('');
  const [planDays, setPlanDays] = useState(30);
  const [planNote, setPlanNote] = useState('');
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState('');

  function load() {
    fetch(`/api/admin/users?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setUsers(d.items ?? []))
      .catch(() => undefined);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  // Daftar plan hanya perlu sekali; dipakai untuk dropdown ganti plan.
  useEffect(() => {
    fetch('/api/admin/plans')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPlans(d.plans ?? []))
      .catch(() => undefined);
  }, []);

  function openPlanDialog(u: UserRow) {
    setPlanTarget(u);
    setPlanName(u.plan.name);
    setPlanDays(30);
    setPlanNote('');
    setPlanError('');
  }

  async function savePlan() {
    if (!planTarget) return;
    setPlanSaving(true);
    setPlanError('');
    try {
      const res = await fetch(`/api/admin/users/${planTarget.id}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
        body: JSON.stringify({ plan: planName, days: planDays, note: planNote || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPlanError(data?.error?.message ?? 'Gagal mengganti plan.');
        return;
      }
      setPlanTarget(null);
      load();
    } finally {
      setPlanSaving(false);
    }
  }

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

      <Dialog
        open={Boolean(planTarget)}
        onOpenChange={(o) => {
          if (!o && !planSaving) {
            setPlanTarget(null);
            setPlanError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ganti plan</DialogTitle>
            <DialogDescription>
              Plan diganti <span className="font-medium">tanpa memotong saldo</span>. Dipakai untuk
              kompensasi, hadiah, atau migrasi manual. Pembelian normal oleh user tetap memotong saldo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>User</Label>
              <p className="text-sm text-muted-foreground">{planTarget?.email}</p>
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={planName} onValueChange={setPlanName}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.displayName}
                      {p.monthlyPriceIdr > 0 ? ` · ${formatIdr(p.monthlyPriceIdr)}` : ' · gratis'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Masa aktif (hari)</Label>
              <Input
                type="number"
                min={0}
                max={3650}
                value={planDays}
                onChange={(e) => setPlanDays(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                0 = tanpa masa aktif (hanya untuk plan gratis). Plan berbayar otomatis diturunkan saat lewat.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Catatan (opsional)</Label>
              <Input value={planNote} onChange={(e) => setPlanNote(e.target.value)} placeholder="Alasan pemberian plan" />
            </div>
          </div>
          {planError && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {planError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanTarget(null)} disabled={planSaving}>
              Batal
            </Button>
            <Button onClick={savePlan} disabled={planSaving || !planName}>
              {planSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
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
                  {u.planExpiresAt && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      s.d. {new Date(u.planExpiresAt).toLocaleDateString('id-ID')}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === 'ACTIVE' ? 'success' : u.status === 'SUSPENDED' ? 'destructive' : 'secondary'}>
                    {u.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatIdr(u.balance)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openPlanDialog(u)}>
                      <Crown className="h-4 w-4" />
                      Plan
                    </Button>
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