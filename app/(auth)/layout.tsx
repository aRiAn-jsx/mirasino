import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthBackdrop } from '@/components/auth/AuthBackdrop';
import styles from '@/components/auth/auth.module.css';

/**
 * The frame of the two account pages: a viewing room in the gallery, and the
 * membership card held up in front of it. It stays put while the visitor
 * moves between signing in and signing up.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.stage} dir="rtl" lang="fa">
      <AuthBackdrop />
      <header className={styles.top}>
        <Link href="/" className={styles.brand} lang="en" dir="ltr" aria-label="Nafis — خانه">
          Nafis
        </Link>
        <Link href="/" className={styles.back}>
          بازگشت به گالری
          <svg viewBox="0 0 15 15" aria-hidden="true">
            <path d="M12.5 7.5h-10M6 3.5l-4 4 4 4" />
          </svg>
        </Link>
      </header>
      <main className={styles.center}>{children}</main>
    </div>
  );
}
