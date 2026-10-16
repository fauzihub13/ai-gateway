import Link from 'next/link';
import { BookOpen, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

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
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">
              M
            </span>
            Mpruy AI
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Docs
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">
                Dashboard <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

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