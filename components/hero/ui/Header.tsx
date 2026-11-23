import type { CSSProperties } from 'react';
import Link from 'next/link';
import styles from '../hero.module.css';

interface HeaderProps {
  audioOn: boolean;
  onToggleAudio: () => void;
  menuOpen: boolean;
  onMenu: () => void;
  cartCount: number;
  signedIn: boolean;
}

/**
 * The menu mark on the left, the house mark on the right. Beside the mark,
 * small enough to be read as part of it: sound, the cart, and the door —
 * the account if someone is signed in, the way in if not.
 */
export function Header({ audioOn, onToggleAudio, menuOpen, onMenu, cartCount, signedIn }: HeaderProps) {
  return (
    <header className={styles.header} data-el="header">
      <div className={styles.quiet} data-ui>
        <button
          type="button"
          className={styles.burger}
          data-el="burger"
          data-intro
          aria-label="منو"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={onMenu}
        >
          <span className={styles.burgerLines} aria-hidden="true">
            <i data-el="burger-line" />
            <i data-el="burger-line" />
          </span>
        </button>
      </div>

      <div className={styles.headerRight}>
        <div className={styles.headerTools} data-el="sound" data-intro>
        <div className={styles.quiet} data-ui>
          <button
            type="button"
            className={styles.sound}
            aria-pressed={audioOn}
            aria-label={audioOn ? 'Sound on' : 'Sound off'}
            onClick={onToggleAudio}
          >
            <span className={styles.soundBars} aria-hidden="true">
              <i style={{ '--h': '5px', '--d': '0s' } as CSSProperties} />
              <i style={{ '--h': '11px', '--d': '-0.9s' } as CSSProperties} />
              <i style={{ '--h': '7px', '--d': '-1.7s' } as CSSProperties} />
              <i style={{ '--h': '9px', '--d': '-0.4s' } as CSSProperties} />
            </span>
          </button>
        </div>

        <div className={styles.quiet} data-ui>
          <Link href="/cart" className={styles.cart} aria-label={cartCount > 0 ? `سبد خرید، ${cartCount} قطعه` : 'سبد خرید'}>
            <svg viewBox="0 0 22 22" aria-hidden="true">
              <path d="M5.2 7.5h11.6l-.9 10.2a1.4 1.4 0 0 1-1.4 1.3H7.5a1.4 1.4 0 0 1-1.4-1.3L5.2 7.5z" />
              <path d="M8.2 9.6V6.4a2.8 2.8 0 0 1 5.6 0v3.2" />
            </svg>
            {cartCount > 0 && (
              <span className={styles.cartCount} aria-hidden="true">
                {cartCount}
              </span>
            )}
          </Link>
        </div>

        <div className={styles.quiet} data-ui>
          <Link href={signedIn ? '/account' : '/login'} className={styles.cart} aria-label={signedIn ? 'حساب من' : 'ورود و ثبت‌نام'}>
            <svg viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="7.8" r="3.3" />
              <path d="M4.6 18.6c.5-3.3 3.1-5.3 6.4-5.3s5.9 2 6.4 5.3" />
            </svg>
            {signedIn && <span className={styles.signedIn} aria-hidden="true" />}
          </Link>
        </div>
        </div>

        <div className={styles.quiet} data-ui>
          <span className={styles.brand} data-el="brand" data-intro lang="en" aria-label="Nafis">
            <span className={styles.brandInner} data-el="brand-inner">
              Nafis
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
