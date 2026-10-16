'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Save, X } from 'lucide-react';
import { PageHeader } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatIdr } from '@/lib/utils';

interface ModelRow {
  id: string;
  publicName: string;
  internalName: string;
  displayName: string;
  contextWindow: number;
  priceInPer1kIdr: number;
  priceOutPer1kIdr: number;
  capabilities: Record<string, boolean>;
  isActive: boolean;
  plans: Array<{ plan: { name: string } }>;
}

const EMPTY = {
  publicName: '',
  internalName: '',
  displayName: '',
  contextWindow: 128000,
  priceInPer1kIdr: 4,
  priceOutPer1kIdr: 12,
  capabilities: { stream: true, vision: false, tools: true, jsonMode: true } as Record<string, boolean>,
};

const CAPS = ['stream', 'vision', 'tools', 'jsonMode'] as const;

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)$`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function AdminModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    fetch('/api/admin/models')
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((d) => setModels(d.models ?? []))
      .catch(() => undefined);
  }

  useEffect(load, []);

  async function save() {
    setError('');
    setSaving(true);
    const isEdit = Boolean(editing);
    try {
      const res = await fetch('/api/admin/models', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
        body: JSON.stringify({ ...form, plans: isEdit ? undefined : ['basic', 'pro', 'enterprise'] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? 'Gagal menyimpan.');
        return;
      }
      setForm({ ...EMPTY });
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  function edit(m: ModelRow) {
    setEditing(m.publicName);
    setForm({
      publicName: m.publicName,
      internalName: m.internalName,
      displayName: m.displayName,
      contextWindow: m.contextWindow,
      priceInPer1kIdr: m.priceInPer1kIdr,
      priceOutPer1kIdr: m.priceOutPer1kIdr,
      capabilities: m.capabilities,
    });
  }

  async function toggleActive(m: ModelRow) {
    await fetch('/api/admin/models', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
      body: JSON.stringify({ publicName: m.publicName, isActive: !m.isActive }),
    });
    load();
  }

  return (
    <div>
      <PageHeader title="Models" description="Kelola model publik, mapping internal, dan harga." />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{editing ? `Edit ${editing}` : 'Tambah model'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Public name</Label>
              <Input
                value={form.publicName}
                disabled={Boolean(editing)}
                onChange={(e) => setForm({ ...form, publicName: e.target.value })}
                placeholder="gpt-4o"
              />
            </div>
            <div className="space-y-2">
              <Label>Internal name (rahasia)</Label>
              <Input
                value={form.internalName}
                onChange={(e) => setForm({ ...form, internalName: e.target.value })}
                placeholder="gh/gpt-4o"
              />
            </div>
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Context window</Label>
              <Input
                type="number"
                value={form.contextWindow}
                onChange={(e) => setForm({ ...form, contextWindow: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Harga in / 1k (IDR)</Label>
              <Input
                type="number"
                value={form.priceInPer1kIdr}
                onChange={(e) => setForm({ ...form, priceInPer1kIdr: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Harga out / 1k (IDR)</Label>
              <Input
                type="number"
                value={form.priceOutPer1kIdr}
                onChange={(e) => setForm({ ...form, priceOutPer1kIdr: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            {CAPS.map((cap) => (
              <label key={cap} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={Boolean(form.capabilities[cap])}
                  onCheckedChange={(v) => setForm({ ...form, capabilities: { ...form.capabilities, [cap]: v } })}
                />
                {cap}
              </label>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editing ? 'Simpan perubahan' : 'Tambah'}
            </Button>
            {editing && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setForm({ ...EMPTY });
                }}
              >
                <X className="h-4 w-4" />
                Batal
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Public</TableHead>
              <TableHead>Internal</TableHead>
              <TableHead className="text-right">In / Out</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.publicName}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{m.internalName}</code>
                </TableCell>
                <TableCell className="text-right">
                  {formatIdr(m.priceInPer1kIdr)} / {formatIdr(m.priceOutPer1kIdr)}
                </TableCell>
                <TableCell>
                  <Badge variant={m.isActive ? 'success' : 'secondary'}>{m.isActive ? 'ACTIVE' : 'OFF'}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => edit(m)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(m)}>
                      {m.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {models.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Belum ada model.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}