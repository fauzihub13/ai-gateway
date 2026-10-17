import Link from 'next/link';
import { BookOpen, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';

const nav = [
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'authentication', label: 'Autentikasi' },
  { id: 'chat', label: 'Chat Completions' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'models', label: 'Models' },
  { id: 'embeddings', label: 'Embeddings' },
  { id: 'errors', label: 'Error' },
  { id: 'ratelimits', label: 'Rate Limit' },
  { id: 'sdks', label: 'SDK & Library' },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-hairline bg-background/85 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Logo className="h-5" />
            <span className="font-display text-[13px] font-semibold tracking-tight">
              Mpruy<span className="text-electric">AI</span>
            </span>
            <span className="ml-1 hidden rounded-sm border border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">
              Docs
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">
                <span className="hidden sm:inline">Dashboard</span> <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile section navigation — horizontal scroll, hidden on lg+ where the sidebar shows. */}
      <div className="sticky top-16 z-20 border-b border-hairline bg-background/85 backdrop-blur lg:hidden">
        <nav className="container flex gap-2 overflow-x-auto py-2 scrollbar-thin">
          {nav.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="shrink-0 rounded-sm border border-hairline px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="container flex gap-10 py-10">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              Panduan Integrasi
            </div>
            <nav className="space-y-0.5 border-l">
              {nav.map((n) => (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  className="-ml-px block border-l border-transparent px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {n.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24">{children}</main>
      </div>
    </div>
  );
}