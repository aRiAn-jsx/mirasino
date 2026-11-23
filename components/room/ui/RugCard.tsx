'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MATERIALS, PRODUCTS, REGIONS } from '@/components/site/catalog';
import { cart, useCart } from '@/components/site/cart';
import { cssPersian, designChecks, rugSize, score } from '../model';
import { store, useRoom } from '../store';
import styles from '../room.module.css';
import { Icon } from './Icon';

export const usePhone = () => {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return phone;
};

/**
 * The piece on the floor: its name and its size first, the way to take it
 * home, then what it is and how it sits in this room.
 *
 * On a desktop, a card at the side of the room. On a phone, one line above
 * the collection — name, size, fit, buy — that opens into a sheet.
 */
export function RugCard() {
  const room = useRoom((s) => s.room);
  const dragging = useRoom((s) => s.ui.dragging);
  const mode = useRoom((s) => s.ui.mode);
  const sheet = useRoom((s) => s.ui.sheet);
  const product = PRODUCTS.find((p) => p.id === room.rug.id) ?? PRODUCTS[0];
  const size = rugSize(product);
  const checks = useMemo(() => designChecks(room), [room]);
  const fit = Math.round(score(checks) * 100);
  const passed = checks.filter((c) => c.verdict === 'good').length;
  const inCart = useCart().includes(product.id);
  const phone = usePhone();

  // desktop: open, except while arranging on a screen without room for both panels
  const [desktopOpen, setDesktopOpen] = useState(true);
  useEffect(() => {
    setDesktopOpen(!(mode === 'arrange' && window.innerWidth < 1400));
  }, [mode]);
  const [guideOpen, setGuideOpen] = useState(false);

  const open = phone ? sheet === 'card' : desktopOpen;
  const toggle = () => (phone ? store.ui({ sheet: open ? null : 'card' }) : setDesktopOpen(!open));
  const tone = fit >= 80 ? 'good' : fit >= 50 ? 'fair' : 'poor';
  const ring = 2 * Math.PI * 17;

  return (
    <aside className={`${styles.glass} ${styles.card}`} data-open={open ? '1' : '0'} data-ui data-inset aria-label="فرشِ روی کف">
      <div className={styles.cardHead}>
        <button type="button" className={styles.cardToggle} onClick={toggle} aria-expanded={open}>
          <span className={styles.cardIndex} lang="en" dir="ltr">
            N° {product.index}
          </span>
          <span className={styles.cardName}>{product.title}</span>
          <span className={styles.cardSize}>
            {cssPersian(Math.round(size.length * 100))} × {cssPersian(Math.round(size.width * 100))}
            <small> سانتی‌متر</small>
          </span>
        </button>
        <span className={styles.score} data-tone={tone} title={`تناسب با این چیدمان: ${cssPersian(fit)}٪`}>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="17" className={styles.scoreTrack} />
            <circle cx="20" cy="20" r="17" className={styles.scoreArc} strokeDasharray={`${(ring * fit) / 100} ${ring}`} />
          </svg>
          <b>{cssPersian(fit)}</b>
        </span>
        {/* on a phone, folded, the one action stays in reach */}
        <span className={styles.peekBuy}>
          {inCart ? (
            <Link href="/cart" className={styles.iconPrimary} data-added="1" aria-label="در سبد خرید؛ دیدن سبد">
              <Icon name="check" size={17} />
            </Link>
          ) : (
            <button type="button" className={styles.iconPrimary} onClick={() => cart.add(product.id)} aria-label="افزودن به سبد">
              <Icon name="cart" size={17} />
            </button>
          )}
        </span>
      </div>

      <div className={styles.cardBody}>
        <p className={styles.cardEyebrow}>
          {REGIONS[product.region]} <i aria-hidden="true" /> {MATERIALS[product.material]} <i aria-hidden="true" /> {product.knot}
        </p>
        <p className={styles.cardBlurb}>{product.blurb}</p>

        <div className={styles.cardActions}>
          {inCart ? (
            <Link href="/cart" className={styles.primary} data-added="1">
              <Icon name="check" size={16} />
              <span>در سبد · دیدن سبد</span>
            </Link>
          ) : (
            <button type="button" className={styles.primary} onClick={() => cart.add(product.id)}>
              <Icon name="cart" size={16} />
              <span>افزودن به سبد</span>
            </button>
          )}
          {product.gallery !== null && (
            <Link href={`/?piece=${product.gallery}`} className={styles.ghost} title="همین قطعه، آویخته در گالری">
              <Icon name="gallery" size={16} />
              <span>در گالری</span>
            </Link>
          )}
        </div>

        <div className={styles.guide} data-live={dragging ? '1' : '0'} data-open={guideOpen ? '1' : '0'}>
          <button type="button" className={styles.guideHead} onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}>
            <span>
              <small>راهنمای چیدمان</small>
              {fit >= 80 ? 'این فرش در این اتاق می‌نشیند' : fit >= 50 ? 'نزدیک است؛ کمی جابه‌جایی' : 'این اندازه به این چیدمان نمی‌خورد'}
            </span>
            <em data-tone={tone}>
              {cssPersian(passed)} از {cssPersian(checks.length)}
            </em>
            <Icon name={guideOpen ? 'chevronUp' : 'chevronDown'} size={16} />
          </button>
          <ul>
            {checks.map((c) => (
              <li key={c.id} data-verdict={c.verdict}>
                <i aria-hidden="true" />
                <div>
                  <b>{c.title}</b>
                  <span>{c.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
