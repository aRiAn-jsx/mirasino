'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { MATERIALS, productById } from './catalog';
import { cart, faDigits, useCart } from './cart';
import styles from './site.module.css';

/**
 * The cart is a shortlist, not a checkout: pieces are priced on request, so
 * its one action hands the list to the contact page.
 */
export function CartView() {
  const ids = useCart();
  const items = ids.map(productById).filter((p) => p !== undefined);

  if (items.length === 0) {
    return (
      <div className={`${styles.glass} ${styles.empty}`}>
        <p>هنوز قالیچه‌ای انتخاب نکرده‌اید.</p>
        <Link href="/shop" className={styles.button}>
          رفتن به فروشگاه
        </Link>
      </div>
    );
  }

  const subject = items.map((p) => p.title).join('، ');

  return (
    <>
      <ul className={styles.cartList}>
        {items.map((rug) => (
          <li key={rug.id} className={`${styles.glass} ${styles.cartItem}`}>
            <img className={styles.cartThumb} src={rug.image} alt="" style={{ filter: rug.filter }} />
            <div>
              <h2 className={styles.cartName}>{rug.title}</h2>
              <ul className={styles.cartMeta}>
                {[MATERIALS[rug.material], rug.size, rug.knot].map((spec) => (
                  <li key={spec}>{spec}</li>
                ))}
              </ul>
            </div>
            <button type="button" className={styles.remove} onClick={() => cart.remove(rug.id)}>
              حذف
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.summary}>
        <p>
          {faDigits(items.length)} قطعه در سبد شماست. قیمت هر قطعه پس از استعلام اعلام می‌شود.
        </p>
        <div className={styles.actions} style={{ marginTop: 0 }}>
          <button type="button" className={styles.ghost} onClick={() => cart.clear()}>
            خالی کردن سبد
          </button>
          <Link href={`/contact?pieces=${encodeURIComponent(subject)}`} className={styles.button}>
            ثبت درخواست خرید
          </Link>
        </div>
      </div>
    </>
  );
}
