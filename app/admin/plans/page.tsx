'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { PageHeader } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

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

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)$`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [saving, setSaving] = useState('');

  function load() {
    fetch('/api/admin/plans')
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

  async function save(plan: Plan) {
    setSaving(plan.name);
    const res = await fetch('/api/admin/plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
      body: JSON.stringify(plan),
    });
    setSaving('');
    if (!res.ok) alert('Gagal menyimpan plan.');
    else load();
  }

  return (
    <div>
      <PageHeader title="Plans" description="Atur markup, limit, harga, dan akses model per plan." />

      <div className="grid gap-6 lg:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.name}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{p.displayName}</CardTitle>
                <CardDescription>Markup ×{p.markup}</CardDescription>
              </div>
              <Badge variant="secondary">{p.name}</Badge>
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

              <Button onClick={() => save(p)} disabled={saving === p.name}>
                {saving === p.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan
              </Button>
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && <p className="text-sm text-muted-foreground">Belum ada plan.</p>}
      </div>
    </div>
  );
}