import type { Metadata } from 'next';
import { CartView } from '@/components/site/CartView';
import styles from '@/components/site/site.module.css';

export const metadata: Metadata = { title: 'سبد خرید — نفیس' };

export default function CartPage() {
  return (
    <>
      <p className={styles.eyebrow}>نفیس</p>
      <h1 className={styles.title}>سبد خرید</h1>
      <CartView />
    </>
  );
}
