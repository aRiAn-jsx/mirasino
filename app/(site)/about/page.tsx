/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { RUGS } from '@/components/hero/config';
import about from '@/components/site/about.module.css';
import styles from '@/components/site/site.module.css';

export const metadata: Metadata = { title: 'درباره ما — نفیس' };

// PLACEHOLDER COPY: the house's own story, in its own words, goes here before launch.

const PILLARS: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: 'گزینش',
    text: 'هر قطعه را یکی‌یکی می‌بینیم و تنها آنچه را می‌آوریم که خودمان حاضریم سال‌ها با آن زندگی کنیم.',
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="M14.5 14.5 19 19" />
      </>
    ),
  },
  {
    title: 'شناسنامه',
    text: 'برای هر قالیچه اندازه، جنس، رج‌شمار و خاستگاهش نوشته می‌شود تا بدانید چه چیزی به خانه می‌برید.',
    icon: (
      <>
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
      </>
    ),
  },
  {
    title: 'نگهداری',
    text: 'قالیچه‌ها دور از نورِ تند و رطوبت نگه داشته می‌شوند تا همان‌طور که رسیده‌اند به دستِ شما برسند.',
    icon: (
      <>
        <path d="M12 3.5 19 6v5.5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6l7-2.5z" />
        <path d="m9 12 2.2 2.2L15.5 10" />
      </>
    ),
  },
  {
    title: 'تماشا',
    text: 'در گالری می‌توانید به هر قطعه نزدیک شوید؛ آن‌قدر که گره و پرز را ببینید، و پشتِ آن را هم.',
    icon: (
      <>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
];

const STEPS = [
  { title: 'نقشه', text: 'طراح، نقش را خانه به خانه روی کاغذِ شطرنجی می‌کشد؛ هر خانه یک گره.' },
  { title: 'رنگرزی', text: 'پشم و ابریشم در رنگ‌های گیاهی — روناس، نیل، اسپرک — رنگ می‌گیرند.' },
  { title: 'بافت', text: 'بافنده رج به رج گره می‌زند؛ برای یک قالیچه‌ی ریزبافت، ماه‌ها و گاهی سال‌ها.' },
  { title: 'پرداخت', text: 'پرز چیده و شسته می‌شود و در آفتاب می‌ماند تا رنگ‌ها جا بیفتند.' },
];

export default function AboutPage() {
  const rug = RUGS[0];
  return (
    <div className={about.page}>
      {/* ───────────────────────────────────────── the house, in one sentence */}
      <section className={about.intro}>
        <div className={about.introText}>
          <p className={styles.eyebrow}>درباره‌ی نفیس</p>
          <h1 className={about.display}>
            قالیچه، آن‌طور که باید <em>دیده</em> شود.
          </h1>
          <p className={about.lead}>
            نفیس خانه‌ای است برای قالیچه‌های دست‌بافتِ ایرانی؛ جایی که هر قطعه تنها، زیرِ یک چراغ و در سکوت دیده
            می‌شود — همان‌طور که یک تابلو را در گالری تماشا می‌کنیم.
          </p>
          <div className={styles.actions}>
            <Link href="/shop" className={styles.button}>
              فروشگاه
            </Link>
            <Link href="/" className={styles.ghost}>
              دیدنِ گالری
            </Link>
          </div>
        </div>

        <figure className={about.wall}>
          <span className={about.light} aria-hidden="true" />
          <span className={about.rod} aria-hidden="true" />
          <img src={rug.poster} alt={`قالیچه‌ی ${rug.fa.title}`} className={about.rug} />
          <figcaption className={`${styles.glass} ${about.chip}`}>
            <span className={about.chipDot} aria-hidden="true" />
            در گالری
            <b>{rug.fa.title}</b>
            <span lang="en" dir="ltr" className={about.chipNum}>
              N° {rug.index}
            </span>
          </figcaption>
        </figure>
      </section>

      {/* ─────────────────────────────────────────────────────── a statement */}
      <section className={about.statement}>
        <span className={about.quoteMark} aria-hidden="true">
          «
        </span>
        <p>
          ما قالیچه را مثلِ یک تابلو نشان می‌دهیم: تنها، زیرِ یک چراغ، تا <strong>بافت و رنگِ خودش</strong> حرف
          بزند.
        </p>
      </section>

      {/* ────────────────────────────────────────────────────── four pillars */}
      <section className={about.block}>
        <header className={about.blockHead}>
          <p className={styles.eyebrow}>آنچه برایمان مهم است</p>
          <h2 className={about.h2}>چهار چیز، برای هر قطعه</h2>
        </header>
        <ul className={about.pillars}>
          {PILLARS.map((pillar, i) => (
            <li key={pillar.title} className={`${styles.glass} ${about.pillar}`}>
              <span className={about.icon}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {pillar.icon}
                </svg>
              </span>
              <span className={about.pillarNum} lang="en" dir="ltr">
                0{i + 1}
              </span>
              <h3>{pillar.title}</h3>
              <p>{pillar.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ────────────────────────────────────────────── from loom to wall */}
      <section className={`${about.block} ${about.craft}`}>
        <figure className={`${styles.glass} ${about.detail}`}>
          <div className={about.detailFrame}>
            <img src={rug.poster} alt="نمای نزدیکِ گره‌ها و نقش" />
          </div>
          <figcaption>از نزدیک: اسلیمی‌ها و گل‌های شاه‌عباسی، رج به رج</figcaption>
        </figure>
        <div>
          <p className={styles.eyebrow}>ساخت</p>
          <h2 className={about.h2}>از دار تا دیوار</h2>
          <p className={about.body}>
            قالیچه‌ی دست‌بافت را یک نفر نمی‌سازد. از نقشه تا آخرین شست‌وشو، چند دست و چند ماه در آن است؛ چیزی که در
            گالری می‌بینید، پایانِ این راه است.
          </p>
          <ol className={about.steps}>
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className={about.stepNum}>{'۱۲۳۴'[i]}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────── invitation */}
      <section className={`${styles.glass} ${about.cta}`}>
        <div>
          <h2 className={about.h2}>یک قطعه را از نزدیک ببینید</h2>
          <p className={about.body}>برای دیدنِ قالیچه‌ها در گالری، یا پرسیدنِ قیمت، با ما در تماس باشید.</p>
        </div>
        <div className={styles.actions} style={{ marginTop: 0 }}>
          <Link href="/contact" className={styles.button}>
            هماهنگیِ بازدید
          </Link>
          <Link href="/shop" className={styles.ghost}>
            فروشگاه
          </Link>
        </div>
      </section>
    </div>
  );
}
