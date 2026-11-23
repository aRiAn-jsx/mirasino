import type { ReactNode } from 'react';
import { CartDock } from '@/components/site/CartDock';
import { SiteHeader } from '@/components/site/SiteHeader';
import styles from '@/components/site/site.module.css';
import { currentUser } from '@/lib/auth';

/** Shared frame of the inner pages (cart, about, contact, account). The hero has its own. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const signedIn = (await currentUser()) !== null;
  return (
    <div className={styles.shell} dir="rtl" lang="fa">
      <SiteHeader signedIn={signedIn} />
      <main className={styles.main}>{children}</main>
      <CartDock />
    </div>
  );
}
