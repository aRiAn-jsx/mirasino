import Link from 'next/link';
import { useEffect, useRef } from 'react';
import styles from '../hero.module.css';

const LINKS = [
  { href: '/', label: 'خانه' },
  { href: '/shop', label: 'فروشگاه' },
  { href: '/room', label: 'اتاق شما' },
  { href: '/about', label: 'درباره ما' },
  { href: '/contact', label: 'تماس با ما' },
  { href: '/cart', label: 'سبد خرید' },
] as const;

/**
 * The menu behind the two-line mark: a leaf of glass that slides in from the
 * left over the room. Escape, the scrim, or the close mark puts it away.
 */
export function Menu({
  open,
  onClose,
  cartCount,
  signedIn,
}: {
  open: boolean;
  onClose: () => void;
  cartCount: number;
  signedIn: boolean;
}) {
  const first = useRef<HTMLAnchorElement>(null);
  const links = [...LINKS, signedIn ? { href: '/account', label: 'حساب من' } : { href: '/login', label: 'ورود و ثبت‌نام' }];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const id = window.setTimeout(() => first.current?.focus(), 350);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(id);
    };
  }, [open, onClose]);

  return (
    <div className={styles.menu} data-open={open ? '1' : '0'} data-ui aria-hidden={!open}>
      <button type="button" className={styles.menuScrim} aria-label="بستن منو" tabIndex={-1} onClick={onClose} />
      <nav className={styles.menuPanel} role="dialog" aria-modal="true" aria-label="منو" dir="rtl" lang="fa">
        <button type="button" className={styles.menuClose} aria-label="بستن منو" tabIndex={open ? 0 : -1} onClick={onClose}>
          <span aria-hidden="true" />
        </button>
        <ul className={styles.menuList}>
          {links.map((link, i) => (
            <li key={link.href} style={{ transitionDelay: open ? `${120 + i * 70}ms` : '0ms' }}>
              <Link href={link.href} ref={i === 0 ? first : undefined} tabIndex={open ? 0 : -1} onClick={onClose}>
                <span className={styles.menuIndex} lang="en" dir="ltr">
                  0{i + 1}
                </span>
                <span>{link.label}</span>
                {link.href === '/cart' && cartCount > 0 && <span className={styles.menuCount}>{cartCount}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.menuFoot}>قالیچه نفیس</p>
      </nav>
    </div>
  );
}
