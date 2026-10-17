'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ResetPasswordClient() {
  const params = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h1 className="text-lg font-semibold">Tautan tidak valid</h1>
        <p className="text-sm text-muted-foreground">
          Tautan reset tidak memuat token. Minta tautan baru dari halaman lupa password.
        </p>
        <Button asChild className="mt-2 w-full">
          <Link href="/forgot-password">Minta tautan reset</Link>
        </Button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Konfirmasi password tidak sama.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? 'Reset password gagal.');
        return;
      }
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <h1 className="text-lg font-semibold">Password berhasil diubah</h1>
        <p className="text-sm text-muted-foreground">
          Semua sesi lama sudah keluar. Masuk kembali dengan password baru Anda.
        </p>
        <Button asChild className="mt-2 w-full">
          <Link href="/login">Masuk ke halaman login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold">Reset password</h1>
        <p className="text-sm text-muted-foreground">Masukkan password baru untuk akun Anda.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password baru</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Ulangi password</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Simpan password baru
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Kembali ke login
        </Link>
      </p>
    </form>
  );
}