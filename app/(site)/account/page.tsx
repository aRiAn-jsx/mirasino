import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from '@/components/auth/actions';
import auth from '@/components/auth/auth.module.css';
import styles from '@/components/site/site.module.css';
import { currentUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'حساب من — نفیس' };

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/account');

  const since = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long' }).format(new Date(user.createdAt * 1000));

  return (
    <>
      <p className={styles.eyebrow}>حساب من</p>
      <h1 className={styles.title}>سلام، {user.name}</h1>
      <p className={styles.lead}>به نفیس خوش آمدید.</p>

      <section className={`${styles.glass} ${auth.account}`} aria-label="مشخصات حساب">
        <div className={auth.who}>
          <span className={auth.initial} aria-hidden="true">
            {Array.from(user.name)[0]}
          </span>
          <div>
            <p className={auth.whoName}>{user.name}</p>
            <p className={auth.whoMeta}>
              <span dir="ltr">{user.email}</span>
            </p>
            <p className={auth.whoMeta}>عضو از {since}</p>
          </div>
        </div>
        <form action={logout}>
          <button type="submit" className={styles.ghost}>
            خروج از حساب
          </button>
        </form>
      </section>

      <div className={styles.actions}>
        <Link href="/" className={styles.button}>
          دیدن مجموعه
        </Link>
        <Link href="/cart" className={styles.ghost}>
          سبد خرید
        </Link>
      </div>
    </>
  );
}
