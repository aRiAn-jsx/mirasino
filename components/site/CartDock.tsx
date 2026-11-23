'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cart, faDigits, useCart } from './cart';
import { MATERIALS, productById } from './catalog';
import dock from './dock.module.css';

/**
 * THE CART DOCK — phones only.
 *
 * On a phone the header stays at the top, out of a thumb's reach. So the
 * moment the cart holds anything, a bead of glass with the cart in it rises
 * into the bottom corner of the screen and stays there; it gives a little
 * jump each time something is added. Tapping it opens the cart
 * as a sheet from the bottom of the screen: the pieces, a way to remove each,
 * and the two ways on — ask to buy them, or open the full cart page.
 */
export function CartDock() {
  const ids = useCart();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const count = useRef(ids.length);
  // the cart is read from storage just after the page arrives; that is not an addition
  const since = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const items = ids.map(productById).filter((p) => p !== undefined);

  useEffect(() => {
    since.current = performance.now();
  }, []);

  // something was added: the bead jumps
  useEffect(() => {
    if (ids.length > count.current && performance.now() - since.current > 400) setBump((n) => n + 1);
    count.current = ids.length;
    if (ids.length === 0) setOpen(false);
  }, [ids.length]);

  // the sheet: Escape closes it, the page behind it holds still, focus goes in and comes back
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    heading.current?.focus();
    const opener = button.current;
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [open]);

  // leaving the page closes it
  useEffect(() => setOpen(false), [pathname]);

  if (pathname === '/cart') return null;

  const subject = items.map((p) => p.title).join('، ');

  return (
    <>
      <button
        ref={button}
        type="button"
        className={dock.bead}
        data-shown={items.length > 0 ? '1' : '0'}
        aria-hidden={items.length === 0}
        tabIndex={items.length > 0 ? 0 : -1}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`سبد خرید، ${faDigits(items.length)} قطعه`}
        onClick={() => setOpen(true)}
      >
        <span key={bump} className={dock.icon} data-bump={bump > 0 ? '1' : '0'}>
          <svg viewBox="0 0 22 22" aria-hidden="true">
            <path d="M5.2 7.5h11.6l-.9 10.2a1.4 1.4 0 0 1-1.4 1.3H7.5a1.4 1.4 0 0 1-1.4-1.3L5.2 7.5z" />
            <path d="M8.2 9.6V6.4a2.8 2.8 0 0 1 5.6 0v3.2" />
          </svg>
        </span>
        <span key={`n${bump}`} className={dock.count}>
          {faDigits(items.length)}
        </span>
      </button>

      <div className={dock.layer} data-open={open ? '1' : '0'} aria-hidden={!open}>
        <button type="button" className={dock.scrim} aria-label="بستن سبد" tabIndex={-1} onClick={() => setOpen(false)} />
        <section className={dock.sheet} role="dialog" aria-modal="true" aria-labelledby="dock-title">
          <span className={dock.grabber} aria-hidden="true" />
          <header className={dock.head}>
            <h2 id="dock-title" ref={heading} tabIndex={-1}>
              سبد خرید <span>{faDigits(items.length)} قطعه</span>
            </h2>
            <button type="button" className={dock.close} aria-label="بستن سبد" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
              <span aria-hidden="true" />
            </button>
          </header>

          <ul className={dock.list}>
            {items.map((p) => (
              <li key={p.id}>
                <span className={dock.thumb}>
                  <img src={p.image} alt="" style={{ filter: p.filter }} />
                </span>
                <span className={dock.text}>
                  <b>{p.title}</b>
                  <span>
                    {p.size} · {MATERIALS[p.material]}
                  </span>
                </span>
                <button type="button" className={dock.remove} tabIndex={open ? 0 : -1} onClick={() => cart.remove(p.id)}>
                  حذف
                </button>
              </li>
            ))}
          </ul>

          <p className={dock.note}>قیمتِ هر قطعه پس از استعلام اعلام می‌شود.</p>
          <div className={dock.actions}>
            <Link
              href={`/contact?pieces=${encodeURIComponent(subject)}`}
              className={dock.primary}
              tabIndex={open ? 0 : -1}
              onClick={() => setOpen(false)}
            >
              ثبت درخواست خرید
            </Link>
            <Link href="/cart" className={dock.secondary} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
              دیدنِ سبد
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
