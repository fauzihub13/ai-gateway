import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { Shell, type NavItem } from '@/components/shell';

const items: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: 'dashboard' },
  { href: '/dashboard/keys', label: 'API Keys', icon: 'key' },
  { href: '/dashboard/usage', label: 'Usage', icon: 'usage' },
  { href: '/dashboard/billing', label: 'Billing', icon: 'billing' },
  { href: '/dashboard/playground', label: 'Playground', icon: 'sparkles' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const user = session
    ? await db.user.findUnique({ where: { id: session.sub }, select: { email: true, role: true } })
    : null;

  const nav = [...items];
  if (session?.role === 'ADMIN') {
    nav.push({ href: '/admin', label: 'Admin Panel', icon: 'shield' });
  }

  return (
    <Shell
      brand="Mpruy AI"
      brandHref="/dashboard"
      items={nav}
      user={user ? { email: user.email, role: user.role } : null}
    >
      {children}
    </Shell>
  );
}