import type { Metadata } from 'next';
import { ShopView } from '@/components/site/ShopView';
import styles from '@/components/site/site.module.css';

export const metadata: Metadata = { title: 'فروشگاه — نفیس' };

export default function ShopPage() {
  return (
    <>
      <p className={styles.eyebrow}>فروشگاه</p>
      <h1 className={styles.title}>مجموعه‌ی نفیس</h1>
      <p className={styles.lead}>بیست قالیچه‌ی دست‌بافت؛ پنج تای آن‌ها در گالری آویخته‌اند و می‌توانید از نزدیک ببینیدشان.</p>
      <ShopView />
    </>
  );
}
