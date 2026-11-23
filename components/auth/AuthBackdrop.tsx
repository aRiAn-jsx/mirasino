/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from 'react';
import { RUGS } from '@/components/hero/config';
import styles from './auth.module.css';

/**
 * THE VIEWING ROOM behind the door: a stretch of the gallery's wall under one
 * light, with the gallery's pieces taking turns on the rod and their
 * reflections in the polished floor. The membership card is held up in front
 * of it, so its glass is always full of rug.
 *
 * Decorative throughout — it says nothing the form does not — so it is
 * hidden from assistive tech.
 */
export function AuthBackdrop() {
  const stack = () =>
    RUGS.map((rug, i) => (
      <img
        key={rug.id}
        src={rug.poster}
        alt=""
        draggable={false}
        loading={i === 0 ? 'eager' : 'lazy'}
        style={{ '--i': i, filter: rug.fallbackFilter } as CSSProperties}
      />
    ));

  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.beam} />
      <div className={styles.floor} />

      <div className={styles.hang}>
        <span className={styles.rod} />
        <div className={styles.rugs}>{stack()}</div>
      </div>
      <div className={styles.reflection}>
        <div className={styles.rugs}>{stack()}</div>
      </div>

      <ol className={styles.names}>
        {RUGS.map((rug, i) => (
          <li key={rug.id} style={{ '--i': i } as CSSProperties}>
            <span className={styles.nameDot} />
            در حال تماشا
            <b>{rug.fa.title}</b>
            <span lang="en" dir="ltr">
              N° {rug.index}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
