'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch } from '@/lib/client';

interface Plan {
  id: string;
  name: string;
  displayName: string;
  markup: number;
  rpmLimit: number;
  monthlyTokenLimit: number | null;
  monthlyPriceIdr: number;
  isActive: boolean;
  models: string[];
}

interface ModelOption {
  publicName: string;
  displayName: string;
}

const EMPTY = {
  name: '',
  displayName: '',
  markup: 1.5,
  rpmLimit: 60,
  monthlyTokenLimit: '' as number | '',
  monthlyPriceIdr: 0,
  models: [] as string[],
};

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)$`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [saving, setSaving] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  function load() {
    apiFetch('/api/admin/plans')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setPlans(d.plans ?? []);
          setAllModels(d.allModels ?? []);
        }
      })
      .catch(() => undefined);
  }

  useEffect(load, []);

  function update(name: string, patch: Partial<Plan>) {
    setPlans((prev) => prev.map((p) => (p.name === name ? { ...p, ...patch } : p)));
  }

  function toggleModel(plan: Plan, model: string) {
    const models = plan.models.includes(model) ? plan.models.filter((m) => m !== model) : [...plan.models, model];
    update(plan.name, { models });
  }

  function toggleFormModel(model: string) {
    setForm((f) => ({
      ...f,
      models: f.models.includes(model) ? f.models.filter((m) => m !== model) : [...f.models, model],
    }));
  }

  async function save(plan: Plan) {
    setSaving(plan.name);
    const res = await apiFetch('/api/admin/plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
      body: JSON.stringify(plan),
    });
    setSaving('');
    if (!res.ok) alert('Gagal menyimpan plan.');
    else load();
  }

  async function create() {
    setCreateError('');
    setCreating(true);
    try {
      const res = await apiFetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
        body: JSON.stringify({
          ...form,
          monthlyTokenLimit: form.monthlyTokenLimit === '' ? null : Number(form.monthlyTokenLimit),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data?.error?.message ?? 'Gagal membuat plan.');
        return;
      }
      setForm({ ...EMPTY });
      setShowCreate(false);
      load();
    } finally {
      setCreating(false);
    }
  }

  function requestDelete(plan: Plan) {
    setDeleteError('');
    setDeleteTarget(plan);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await apiFetch(`/api/admin/plans?name=${encodeURIComponent(deleteTarget.name)}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': getCookie('csrf_token') },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data?.error?.message ?? 'Gagal menghapus plan.');
        return;
      }
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Plans" description="Buat, atur, dan hapus plan: markup, limit, harga, dan akses model." />

      {!showCreate ? (
        <Button className="mb-6" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Tambah plan
        </Button>
      ) : (
        <Card className="mb-6">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Plan baru</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowCreate(false);
                setForm({ ...EMPTY });
                setCreateError('');
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Name (slug, rahasia)</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="starter"
                />
              </div>
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="Starter"
                />
              </div>
              <div className="space-y-2">
                <Label>Markup</Label>
                <Input
                  type="number"
                  step={0.05}
                  value={form.markup}
                  onChange={(e) => setForm({ ...form, markup: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>RPM limit</Label>
                <Input
                  type="number"
                  value={form.rpmLimit}
                  onChange={(e) => setForm({ ...form, rpmLimit: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Token / bulan</Label>
                <Input
                  type="number"
                  value={form.monthlyTokenLimit}
                  placeholder="unlimited"
                  onChange={(e) =>
                    setForm({ ...form, monthlyTokenLimit: e.target.value === '' ? '' : Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Harga / bulan (IDR)</Label>
                <Input
                  type="number"
                  value={form.monthlyPriceIdr}
                  onChange={(e) => setForm({ ...form, monthlyPriceIdr: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Model yang boleh diakses</Label>
              <div className="flex flex-wrap gap-2">
                {allModels.map((m) => {
                  const on = form.models.includes(m.publicName);
                  return (
                    <button
                      key={m.publicName}
                      type="button"
                      onClick={() => toggleFormModel(m.publicName)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {m.publicName}
                    </button>
                  );
                })}
                {allModels.length === 0 && <p className="text-xs text-muted-foreground">Belum ada model.</p>}
              </div>
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}

            <Button onClick={create} disabled={!form.name || !form.displayName || creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Buat plan
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.name}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{p.displayName}</CardTitle>
                <CardDescription>Markup ×{p.markup}</CardDescription>
              </div>
              <Badge variant={p.isActive ? 'secondary' : 'destructive'}>{p.name}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Markup</Label>
                  <Input
                    type="number"
                    step={0.05}
                    value={p.markup}
                    onChange={(e) => update(p.name, { markup: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>RPM limit</Label>
                  <Input
                    type="number"
                    value={p.rpmLimit}
                    onChange={(e) => update(p.name, { rpmLimit: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Token / bulan</Label>
                  <Input
                    type="number"
                    value={p.monthlyTokenLimit ?? ''}
                    placeholder="unlimited"
                    onChange={(e) =>
                      update(p.name, { monthlyTokenLimit: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Harga / bulan (IDR)</Label>
                  <Input
                    type="number"
                    value={p.monthlyPriceIdr}
                    onChange={(e) => update(p.name, { monthlyPriceIdr: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Model yang boleh diakses</Label>
                <div className="flex flex-wrap gap-2">
                  {allModels.map((m) => {
                    const on = p.models.includes(m.publicName);
                    return (
                      <button
                        key={m.publicName}
                        type="button"
                        onClick={() => toggleModel(p, m.publicName)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {m.publicName}
                      </button>
                    );
                  })}
                  {allModels.length === 0 && <p className="text-xs text-muted-foreground">Belum ada model.</p>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={() => save(p)} disabled={saving === p.name}>
                  {saving === p.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Simpan
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => requestDelete(p)}
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && <p className="text-sm text-muted-foreground">Belum ada plan.</p>}
      </div>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus plan?</DialogTitle>
            <DialogDescription>
              Plan <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{deleteTarget?.name}</code> akan dihapus
              permanen dan dilepas dari semua model. Plan yang masih dipakai user tidak bisa dihapus.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}