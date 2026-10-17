'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type State =
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

export function VerifyEmailClient() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState({
        kind: 'error',
        message: 'Tautan tidak memuat token. Buka tautan persis seperti yang ada di email verifikasi.',
      });
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setState({ kind: 'error', message: data?.error?.message ?? 'Verifikasi gagal.' });
          return;
        }
        setState({ kind: 'ok' });
      } catch {
        setState({ kind: 'error', message: 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.' });
      }
    })();
  }, [token]);

  if (state.kind === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Memverifikasi email Anda…</p>
      </div>
    );
  }

  if (state.kind === 'ok') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <h1 className="text-lg font-semibold">Email berhasil diverifikasi</h1>
        <p className="text-sm text-muted-foreground">
          Akun Anda sudah aktif. Masuk untuk mulai membuat API key dan memakai model.
        </p>
        <Button asChild className="mt-2 w-full">
          <Link href="/login">Masuk ke halaman login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <h1 className="text-lg font-semibold">Verifikasi gagal</h1>
      <p className="text-sm text-muted-foreground">{state.message}</p>
      <p className="text-xs text-muted-foreground">
        Tautan verifikasi berlaku 24 jam dan hanya bisa dipakai sekali.
      </p>
      <ResendForm />
      <Button asChild variant="outline" className="w-full">
        <Link href="/login">Masuk ke halaman login</Link>
      </Button>
    </div>
  );
}

function ResendForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'throttled'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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

  if (status === 'sent' || status === 'throttled') {
    return (
      <p className="text-sm text-foreground">
        {status === 'throttled'
          ? 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.'
          : `Tautan verifikasi baru dikirim ke ${email}.`}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="w-full space-y-2 border-t border-hairline pt-4 text-left">
      <Label htmlFor="resend-email">Kirim ulang tautan verifikasi</Label>
      <Input
        id="resend-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@contoh.com"
        required
      />
      <Button type="submit" className="w-full" disabled={status === 'sending'}>
        {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
        Kirim ulang
      </Button>
    </form>
  );
}