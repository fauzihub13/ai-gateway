'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  // Pesan dari server (mis. sesi lama yang cookie-nya sudah dibersihkan).
  // Dibaca di effect agar tidak bentrok dengan prerender.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('error');
    if (reason === 'account_deactivated') {
      setNotice('Akun Anda dinonaktifkan. Hubungi admin bila menurut Anda ini keliru.');
    } else if (reason === 'session_invalid') {
      setNotice('Sesi Anda sudah tidak berlaku. Silakan masuk kembali.');
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.error?.code === 'email_not_verified') {
          setUnverified(true);
          setError('Email Anda belum diverifikasi. Verifikasi dulu sebelum masuk.');
          return;
        }
        setError(data?.error?.message ?? 'Login gagal.');
        return;
      }
      router.push('/dashboard');
      router.refresh();
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
          <CardHeader>
            <Link href="/" className="mb-3 flex items-center gap-2.5">
              <Logo className="h-5" />
              <span className="font-display text-[13px] font-semibold tracking-tight">
                Mpruy<span className="text-electric">AI</span>
              </span>
            </Link>
            <CardTitle>Masuk</CardTitle>
            <CardDescription>Masuk ke akun Anda untuk mengelola API.</CardDescription>
          </CardHeader>
          <CardContent>
            {notice && (
              <p className="mb-4 rounded-sm border border-hairline bg-muted/60 p-3 text-xs text-muted-foreground">
                {notice}
              </p>
            )}
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                    Lupa?
                  </Link>
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {unverified && <ResendVerification email={email} />}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Masuk
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Belum punya akun?{' '}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Daftar
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResendVerification({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'throttled'>('idle');

  async function resend() {
    setStatus('sending');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      setStatus(res.ok && data?.throttled ? 'throttled' : res.ok ? 'sent' : 'idle');
    } catch {
      setStatus('idle');
    }
  }

  return (
    <div className="space-y-2 rounded-sm border border-hairline p-3">
      <p className="text-xs text-muted-foreground">
        {status === 'sent'
          ? `Tautan verifikasi baru dikirim ke ${email}.`
          : status === 'throttled'
            ? 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.'
            : 'Belum menerima email verifikasi? Kirim ulang tautannya.'}
      </p>
      {status !== 'sent' && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={resend} disabled={status === 'sending'}>
          {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
          Kirim ulang tautan verifikasi
        </Button>
      )}
    </div>
  );
}