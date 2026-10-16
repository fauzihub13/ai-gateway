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
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
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

export type NavIcon =
  | 'dashboard'
  | 'key'
  | 'usage'
  | 'billing'
  | 'sparkles'
  | 'shield'
  | 'users'
  | 'models'
  | 'plans'
  | 'transactions'
  | 'settings'
  | 'audit';

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  key: KeyRound,
  usage: BarChart3,
  billing: Wallet,
  sparkles: Sparkles,
  shield: Shield,
  users: Users,
  models: Boxes,
  plans: CreditCard,
  transactions: Receipt,
  settings: Settings,
  audit: ScrollText,
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

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const initials = user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="flex min-h-screen bg-background">
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-6">
          <Link href={brandHref} className="flex items-center gap-2 font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">
              M
            </span>
            {brand}
          </Link>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== brandHref && pathname.startsWith(item.href));
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
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
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
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