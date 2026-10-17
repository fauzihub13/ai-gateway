'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSent(true);
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
          {sent ? (
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <MailCheck className="h-10 w-10 text-success" />
              <h2 className="text-lg font-semibold">Cek email Anda</h2>
              <p className="text-sm text-muted-foreground">
                Jika <span className="font-medium text-foreground">{email}</span> terdaftar, kami mengirim tautan
                reset password. Tautan berlaku 1 jam.
              </p>
              <Button asChild className="mt-2">
                <Link href="/login">Kembali ke login</Link>
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <Link href="/" className="mb-3 flex items-center gap-2.5">
                  <span className="grid h-6 w-6 place-items-center border border-foreground bg-foreground font-display text-xs font-semibold text-background">
                    M
                  </span>
                  <span className="font-display text-[13px] font-semibold tracking-tight">
                    Mpruy<span className="text-electric">AI</span>
                  </span>
                </Link>
                <CardTitle>Lupa password</CardTitle>
                <CardDescription>Masukkan email akun Anda untuk menerima tautan reset.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Kirim tautan reset
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  Ingat password?{' '}
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