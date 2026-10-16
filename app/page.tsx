import Link from 'next/link';
import { ArrowRight, Zap, Code2, LineChart, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';

const features = [
  { icon: Code2, title: 'OpenAI-compatible', desc: 'Pakai SDK OpenAI/LangChain tanpa ubah kode selain baseURL.' },
  { icon: Zap, title: 'Streaming SSE', desc: 'First token cepat, format sesuai spec OpenAI.' },
  { icon: LineChart, title: 'Dashboard lengkap', desc: 'Usage, saldo, dan biaya transparan per request.' },
  { icon: ShieldCheck, title: 'Aman', desc: 'Setiap API key punya scope, rate limit, dan batas belanja sendiri.' },
];

const models = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4.5', 'gemini-1.5-pro'];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">
              M
            </span>
            Mpruy AI
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link href="/#fitur" className="hover:text-foreground">Fitur</Link>
            <Link href="/#model" className="hover:text-foreground">Model</Link>
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <Link href="/login" className="hover:text-foreground">Login</Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild size="sm">
              <Link href="/register">Coba gratis</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="container py-20 text-center">
        <Badge className="mb-4">OpenAI-compatible API</Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Satu API untuk semua model AI terbaik
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          OpenAI-compatible. Streaming. Harga transparan per token.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/register">
              Mulai gratis <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/login">Masuk</Link>
          </Button>
        </div>

        <div className="mx-auto mt-12 max-w-2xl text-left">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-1.5 border-b px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-destructive/70" />
              <span className="h-3 w-3 rounded-full bg-warning/70" />
              <span className="h-3 w-3 rounded-full bg-success/70" />
              <span className="ml-2 text-xs text-muted-foreground">curl</span>
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-muted-foreground scrollbar-thin">
{`curl https://api.mpruy.ai/v1/chat/completions \\
  -H "Authorization: Bearer sk-mpruy-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Halo"}],
    "stream": true
  }'`}
            </pre>
          </div>
        </div>
      </section>

      <section id="model" className="container pb-16">
        <p className="text-center text-sm text-muted-foreground">Model tersedia</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {models.map((m) => (
            <Badge key={m} variant="secondary" className="text-sm">
              {m}
            </Badge>
          ))}
        </div>
      </section>

      <section id="fitur" className="container py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <div className="mb-2 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">{f.title}</CardTitle>
                <CardDescription>{f.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="container pb-24">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <h2 className="text-2xl font-bold">Siap mulai?</h2>
            <p className="max-w-md text-primary-foreground/80">
              Buat akun gratis, generate API key, dan kirim request pertama dalam hitungan menit.
            </p>
            <Button asChild variant="secondary" size="lg">
              <Link href="/register">Buat akun</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t">
        <div className="container flex flex-col items-center justify-between gap-2 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Mpruy AI</span>
          <span>api.mpruy.ai</span>
        </div>
      </footer>
    </div>
  );
}