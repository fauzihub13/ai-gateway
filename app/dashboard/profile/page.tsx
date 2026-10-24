'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/client';

interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
}

type Message = { kind: 'ok' | 'error'; text: string } | null;

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<Message>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<Message>(null);

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.user) return;
        const user: Profile = data.user;
        setProfile(user);
        setName(user.name ?? '');
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const initial = (profile?.name ?? profile?.email ?? '?').charAt(0).toUpperCase();
  const nameDirty = profile !== null && name.trim() !== (profile.name ?? '');

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameMessage(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setNameMessage({ kind: 'error', text: 'Nama tidak boleh kosong.' });
      return;
    }

    setSavingName(true);
    try {
      const res = await apiFetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNameMessage({ kind: 'error', text: data?.error?.message ?? 'Gagal menyimpan nama.' });
        return;
      }
      setProfile(data.user);
      setName(data.user.name ?? '');
      setNameMessage({ kind: 'ok', text: 'Nama berhasil diperbarui.' });
    } catch {
      setNameMessage({ kind: 'error', text: 'Gagal menyimpan nama. Coba lagi.' });
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({ kind: 'error', text: 'Password baru minimal 8 karakter.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ kind: 'error', text: 'Konfirmasi password tidak cocok.' });
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordMessage({ kind: 'error', text: 'Password baru harus berbeda dari password saat ini.' });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await apiFetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordMessage({ kind: 'error', text: data?.error?.message ?? 'Gagal mengubah password.' });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage({ kind: 'ok', text: 'Password berhasil diubah.' });
    } catch {
      setPasswordMessage({ kind: 'error', text: 'Gagal mengubah password. Coba lagi.' });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div>
      <PageHeader title="Profile" description="Kelola nama tampilan dan password akun Anda." />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Profil ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4" />
              Informasi akun
            </CardTitle>
            <CardDescription>Email dipakai untuk login dan tidak dapat diubah.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-sm bg-accent font-display text-lg font-semibold text-accent-foreground">
                {initial}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">{profile?.name ?? profile?.email ?? '—'}</p>
                <Badge variant={profile?.role === 'ADMIN' ? 'default' : 'secondary'}>
                  {profile?.role ?? 'USER'}
                </Badge>
              </div>
            </div>

            <form onSubmit={saveName} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-email" className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Email
                </Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={profile?.email ?? ''}
                  readOnly
                  disabled
                  aria-describedby="profile-email-hint"
                />
                <p id="profile-email-hint" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Email tidak dapat diubah. Hubungi admin jika perlu menggantinya.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-name">Nama</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama Anda"
                  maxLength={60}
                  autoComplete="name"
                  disabled={loading || savingName}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={loading || savingName || !nameDirty}>
                  {savingName && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan nama
                </Button>
                {nameDirty && !savingName && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setName(profile?.name ?? '');
                      setNameMessage(null);
                    }}
                  >
                    Batal
                  </Button>
                )}
              </div>

              <Feedback message={nameMessage} />
            </form>
          </CardContent>
        </Card>

        {/* ── Password ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              Ubah password
            </CardTitle>
            <CardDescription>Gunakan minimal 8 karakter. Sesi aktif Anda tetap login.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Password saat ini</Label>
                <Input
                  id="current-password"
                  type={showPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={savingPassword}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">Password baru</Label>
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  disabled={savingPassword}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Konfirmasi password baru</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  disabled={savingPassword}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}>
                  {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan password
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                </Button>
              </div>

              <Feedback message={passwordMessage} />
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        message.kind === 'ok'
          ? 'flex items-center gap-1.5 text-sm text-success'
          : 'flex items-center gap-1.5 text-sm text-destructive'
      }
    >
      {message.kind === 'ok' && <CheckCircle2 className="h-4 w-4" />}
      {message.text}
    </p>
  );
}
