'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Save } from 'lucide-react';
import { PageHeader } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)$`));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function AdminSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.maintenance) {
          setEnabled(d.maintenance.enabled);
          setMessage(d.maintenance.message ?? '');
        }
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('csrf_token') },
        body: JSON.stringify({ maintenance: { enabled, message } }),
      });
      setSaved(res.ok);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Konfigurasi platform." />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Maintenance mode</CardTitle>
          <CardDescription>Saat aktif, semua request ke /v1/* ditolak dengan 503.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between rounded-lg border p-4">
            <span className="text-sm font-medium">Aktifkan maintenance mode</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>
          <div className="space-y-2">
            <Label>Pesan maintenance</Label>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Kami sedang melakukan pemeliharaan..."
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" />
                Tersimpan
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}