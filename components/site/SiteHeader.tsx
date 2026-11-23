'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { faDigits, useCart } from './cart';
import styles from './site.module.css';

const LINKS = [
  { href: '/', label: 'خانه' },
  { href: '/shop', label: 'فروشگاه' },
  { href: '/room', label: 'اتاق شما' },
  { href: '/about', label: 'درباره ما' },
  { href: '/contact', label: 'تماس با ما' },
] as const;

/**
 * Header of the inner pages: one panel of the site's glass floating at the top
 * of the page, in one row — the house mark, the places one can go, and the
 * things to do: the cart, a piece tried in one's own room, the door. On a
 * phone the places drop to a second row of their own.
 */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const items = useCart();
  const door = signedIn ? { href: '/account', label: 'حساب من' } : { href: '/login', label: 'ورود' };

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <Link href="/" className={styles.brandBlock} aria-label="Nafis — خانه">
          <span className={styles.brand} lang="en" dir="ltr">
            Nafis
          </span>
          <span className={styles.brandSub}>قالیچه نفیس</span>
        </Link>

        <nav aria-label="صفحه‌ها" className={styles.headerNav}>
          <ul className={styles.nav}>
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.headerActions}>
          <Link
            href="/cart"
            className={styles.pill}
            aria-current={pathname === '/cart' ? 'page' : undefined}
            aria-label={items.length > 0 ? `سبد خرید، ${faDigits(items.length)} قطعه` : 'سبد خرید'}
          >
            <svg viewBox="0 0 22 22" aria-hidden="true">
              <path d="M5.2 7.5h11.6l-.9 10.2a1.4 1.4 0 0 1-1.4 1.3H7.5a1.4 1.4 0 0 1-1.4-1.3L5.2 7.5z" />
              <path d="M8.2 9.6V6.4a2.8 2.8 0 0 1 5.6 0v3.2" />
            </svg>
            <span className={styles.pillLabel}>سبد خرید</span>
            {items.length > 0 && (
              <span className={styles.count} aria-hidden="true">
                {faDigits(items.length)}
              </span>
            )}
          </Link>
          <Link href="/room" className={`${styles.pill} ${styles.pillPrimary}`}>
            <svg viewBox="0 0 22 22" aria-hidden="true">
              <path d="M3.5 8h15v7h-15zM2 9.5v4M20 9.5v4M6.5 10.2h9v2.6h-9z" />
            </svg>
            <span className={styles.pillLabel}>امتحان در اتاق</span>
          </Link>
          <span className={styles.headerDivider} aria-hidden="true" />
          <Link href={door.href} className={styles.door} aria-current={pathname === door.href ? 'page' : undefined}>
            <svg viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="7.8" r="3.3" />
              <path d="M4.6 18.6c.5-3.3 3.1-5.3 6.4-5.3s5.9 2 6.4 5.3" />
            </svg>
            <span className={styles.pillLabel}>{door.label}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
