import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { Shell, type NavItem } from '@/components/shell';

const items: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: 'dashboard' },
  { href: '/admin/users', label: 'Users', icon: 'users' },
  { href: '/admin/models', label: 'Models', icon: 'models' },
  { href: '/admin/plans', label: 'Plans', icon: 'plans' },
  { href: '/admin/transactions', label: 'Transaksi', icon: 'transactions' },
  { href: '/admin/settings', label: 'Settings', icon: 'settings' },
  { href: '/admin/audit', label: 'Audit Log', icon: 'audit' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin');
  if (session.role !== 'ADMIN') redirect('/dashboard');

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { email: true, role: true, status: true },
  });

  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE') redirect('/dashboard');

  return (
    <Shell
      brand="Mpruy AI · Admin"
      brandHref="/admin"
      items={items}
      user={{ email: user.email, role: user.role }}
    >
      {children}
    </Shell>
  );
}