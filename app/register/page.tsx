'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? 'Registrasi gagal.');
        return;
      }
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-sm">
          {done ? (
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <h2 className="text-lg font-semibold">Cek email Anda</h2>
              <p className="text-sm text-muted-foreground">
                Kami mengirim tautan verifikasi ke <span className="font-medium text-foreground">{email}</span>.
              </p>
              <Button asChild className="mt-2">
                <Link href="/login">Ke halaman login</Link>
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <Link href="/" className="mb-2 flex items-center gap-2 font-bold">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">
                    M
                  </span>
                  Mpruy AI
                </Link>
                <CardTitle>Buat akun</CardTitle>
                <CardDescription>Gratis. Tanpa kartu kredit.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
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
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Daftar
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  Sudah punya akun?{' '}
                  <Link href="/login" className="font-medium text-primary hover:underline">
                    Masuk
                  </Link>
                </p>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}