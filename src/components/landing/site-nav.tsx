import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { SiteNavClient } from './site-nav-client';

/**
 * Server wrapper: auth state di-resolve di server supaya CTA nav langsung benar
 * pada paint pertama (tanpa flash "Sign in" lalu berubah jadi "Dashboard").
 */
export async function SiteNav() {
  let signedIn = false;
  try {
    const session = await getSession();
    if (session) {
      const user = await db.user.findUnique({
        where: { id: session.sub },
        select: { status: true },
      });
      signedIn = user?.status === 'ACTIVE';
    }
  } catch {
    // DB tidak bisa diakses / cookie rusak: perlakukan sebagai guest.
    signedIn = false;
  }

  return <SiteNavClient signedIn={signedIn} />;
}
