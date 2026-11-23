'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import styles from './site.module.css';

/**
 * The contact form. There is no backend behind it yet: submitting shows the
 * confirmation and nothing is sent anywhere. Wire `onSubmit` to a route
 * handler or a form service before this goes live.
 */
export function ContactForm() {
  const pieces = useSearchParams().get('pieces');
  const [sent, setSent] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSent(true);
  };

  if (sent) {
    return (
      <div className={`${styles.glass} ${styles.sent}`} role="status">
        <h2>پیام شما دریافت شد.</h2>
        <p>به‌زودی با شما تماس می‌گیریم.</p>
      </div>
    );
  }

  return (
    <form className={`${styles.glass} ${styles.form}`} onSubmit={onSubmit}>
      <div className={styles.field}>
        <label htmlFor="contact-name">نام</label>
        <input id="contact-name" name="name" type="text" autoComplete="name" required />
      </div>
      <div className={styles.field}>
        <label htmlFor="contact-reach">شماره‌ی تماس یا ایمیل</label>
        <input id="contact-reach" name="reach" type="text" inputMode="email" autoComplete="email" required dir="auto" />
      </div>
      <div className={styles.field}>
        <label htmlFor="contact-message">پیام</label>
        <textarea
          id="contact-message"
          name="message"
          required
          defaultValue={pieces ? `درخواست خرید: ${pieces}\n` : ''}
        />
      </div>
      <button type="submit" className={styles.button} style={{ justifySelf: 'start' }}>
        فرستادن پیام
      </button>
    </form>
  );
}
