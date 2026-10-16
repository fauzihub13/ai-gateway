'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/#models', label: 'Models' },
  { href: '/#features', label: 'Features' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/docs', label: 'Documentation' },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur-md transition-colors',
        scrolled && 'border-hairline',
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Mpruy AI">
          <span className="grid h-7 w-7 place-items-center border border-foreground bg-foreground font-display text-sm font-semibold text-background">
            M
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight">
            Mpruy<span className="text-electric">AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="link-rule text-sm text-muted-foreground hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-electric px-3 text-sm font-medium text-white transition-colors hover:bg-electric/90"
          >
            Get API Key
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-sm border border-hairline md:hidden"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-hairline bg-background md:hidden">
          <nav className="container flex flex-col py-2">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between border-b border-hairline py-3 text-sm text-muted-foreground last:border-b-0"
              >
                {l.label}
                <ArrowRight className="h-3.5 w-3.5 opacity-40" />
              </Link>
            ))}
            <div className="flex items-center justify-between gap-3 py-4">
              <Link href="/login" onClick={() => setOpen(false)} className="text-sm text-muted-foreground">
                Sign in
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-electric px-4 text-sm font-medium text-white"
              >
                Get API Key
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}