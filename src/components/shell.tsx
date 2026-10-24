'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  Boxes,
  CreditCard,
  LayoutDashboard,
  KeyRound,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Logo } from '@/components/logo';

export type NavIcon =
  | 'dashboard'
  | 'key'
  | 'usage'
  | 'billing'
  | 'sparkles'
  | 'integration'
  | 'shield'
  | 'users'
  | 'models'
  | 'plans'
  | 'transactions'
  | 'settings'
  | 'audit'
  | 'profile';

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  key: KeyRound,
  usage: BarChart3,
  billing: Wallet,
  sparkles: Sparkles,
  integration: Plug,
  shield: Shield,
  users: Users,
  models: Boxes,
  plans: CreditCard,
  transactions: Receipt,
  settings: Settings,
  audit: ScrollText,
  profile: UserRound,
};

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

export interface ShellUser {
  email: string;
  role: string;
}

/** Persisted desktop sidebar collapse state. */
const COLLAPSE_STORAGE_KEY = 'mpruy.sidebar.collapsed';

export function Shell({
  brand,
  brandHref,
  items,
  user,
  children,
}: {
  brand: string;
  brandHref: string;
  items: NavItem[];
  user: ShellUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [prefsLoaded, setPrefsLoaded] = React.useState(false);

  // Restore the collapse preference after hydration so server and client markup
  // match on the first paint (no flash / hydration warning).
  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1');
    } catch {
      /* localStorage unavailable (private mode / blocked storage) — keep expanded */
    }
    setPrefsLoaded(true);
  }, []);

  React.useEffect(() => {
    if (!prefsLoaded) return;
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore write failures */
    }
  }, [collapsed, prefsLoaded]);

  // Mobile drawer: close on Escape, lock body scroll, and drop the drawer when
  // the viewport grows past the md breakpoint.
  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const initials = user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="flex min-h-screen bg-background">
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Navigasi utama"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-hairline bg-card',
          'transition-[width,transform] duration-200 ease-out',
          // Desktop: stay pinned while the page scrolls, and take the full
          // viewport height so the nav list scrolls internally.
          'md:sticky md:top-0 md:z-40 md:h-screen md:translate-x-0 md:self-start',
          collapsed ? 'md:w-[76px]' : 'md:w-64',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-hairline px-5">
          <Link
            href={brandHref}
            className={cn(
              'flex min-w-0 items-center gap-2.5 rounded-sm transition-opacity hover:opacity-80',
              collapsed && 'md:w-full md:justify-center',
            )}
            title={collapsed ? brand : undefined}
          >
            <Logo className="h-5" />
            <span
              className={cn(
                'truncate font-display text-[13px] font-semibold tracking-tight',
                collapsed && 'md:hidden',
              )}
            >
              {brand}
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Tutup menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav
          className={cn(
            'flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-3 scrollbar-thin',
            collapsed && 'md:px-2',
          )}
        >
          {items.map((item) => {
            const active =
              pathname === item.href || (item.href !== brandHref && pathname.startsWith(item.href));
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors',
                  collapsed && 'md:justify-center md:px-0',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 bg-electric"
                    aria-hidden="true"
                  />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn('truncate', collapsed && 'md:sr-only')}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-hairline bg-background/80 px-4 backdrop-blur md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Buka menu"
            aria-expanded={open}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden shrink-0 md:inline-flex"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
            aria-pressed={collapsed}
            title={collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/docs">
              <BookOpen className="h-4 w-4" />
              Docs
            </Link>
          </Button>
          <ThemeToggle />
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <span className="grid h-7 w-7 place-items-center rounded-sm bg-accent text-xs font-semibold text-accent-foreground">
                    {initials}
                  </span>
                  <span className="hidden text-sm sm:inline">{user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm">{user.email}</span>
                    <span className="text-xs font-normal text-muted-foreground">{user.role}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile" className="cursor-pointer">
                    <UserRound className="h-4 w-4" />
                    Profil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="h-4 w-4" />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
