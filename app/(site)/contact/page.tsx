import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ContactForm } from '@/components/site/ContactForm';
import styles from '@/components/site/site.module.css';

export const metadata: Metadata = { title: 'تماس با ما — نفیس' };

// Placeholder details: none of these are real. Replace before launch.
const DETAILS = [
  { label: 'نشانی', value: 'تهران — نشانی گالری اینجا نوشته می‌شود' },
  { label: 'تلفن', value: '۰۲۱ ۰۰۰۰ ۰۰۰۰' },
  { label: 'ایمیل', value: 'hello@nafis.example', ltr: true },
  { label: 'ساعت بازدید', value: 'شنبه تا پنجشنبه، ۱۰ تا ۱۹' },
];

export default function ContactPage() {
  return (
    <>
      <p className={styles.eyebrow}>نفیس</p>
      <h1 className={styles.title}>تماس با ما</h1>
      <p className={styles.lead}>برای دیدن قالیچه‌ها از نزدیک، استعلام قیمت یا هر پرسش دیگری با ما در تماس باشید.</p>

      <div className={styles.contactGrid}>
        <ul className={styles.details}>
          {DETAILS.map((detail) => (
            <li key={detail.label}>
              <span className={styles.detailLabel}>{detail.label}</span>
              <span className={styles.detailValue} dir={detail.ltr ? 'ltr' : undefined}>
                {detail.value}
              </span>
            </li>
          ))}
        </ul>

        {/* the form reads ?pieces= from the cart */}
        <Suspense fallback={null}>
          <ContactForm />
        </Suspense>
      </div>
    </>
  );
}
