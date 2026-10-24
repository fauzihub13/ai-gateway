import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { Shell, type NavItem } from '@/components/shell';

const items: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: 'dashboard' },
  { href: '/dashboard/keys', label: 'API Keys', icon: 'key' },
  { href: '/dashboard/usage', label: 'Usage', icon: 'usage' },
  { href: '/dashboard/billing', label: 'Billing', icon: 'billing' },
  { href: '/dashboard/playground', label: 'Playground', icon: 'sparkles' },
  { href: '/dashboard/integration', label: 'Integration', icon: 'integration' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login?next=/dashboard');

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { email: true, role: true, status: true },
  });

  // Token masih valid tapi user tidak ada / dinonaktifkan: bersihkan cookie
  // lewat route logout supaya middleware tidak memantulkan kembali ke dashboard.
  if (!user) redirect('/api/auth/logout?reason=session_invalid');
  if (user.status === 'DEACTIVATED') redirect('/api/auth/logout?reason=account_deactivated');

  const nav = [...items];
  if (session.role === 'ADMIN') {
    nav.push({ href: '/admin', label: 'Admin Panel', icon: 'shield' });
  }

  return (
    <Shell
      brand="Mpruy AI"
      brandHref="/dashboard"
      items={nav}
      user={{ email: user.email, role: user.role }}
    >
      {children}
    </Shell>
  );
}