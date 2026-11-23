'use client';

import Link from 'next/link';
import { store, useRoom } from '../store';
import styles from '../room.module.css';
import { Icon } from './Icon';
import { VIEWS } from './Settings';

/**
 * Across the top: the house mark, the two ways of being in the room
 * (looking, arranging), where the eye stands, and the settings.
 * On a phone the views move into the settings sheet.
 */
export function TopBar({ onShot }: { onShot: () => void }) {
  const mode = useRoom((s) => s.ui.mode);
  const view = useRoom((s) => s.ui.view);
  const sheet = useRoom((s) => s.ui.sheet);

  return (
    <header className={styles.top} data-ui data-inset>
      <div className={styles.brandRow}>
        <Link href="/" className={styles.brand} lang="en" dir="ltr" aria-label="Nafis — بازگشت به گالری">
          Nafis
        </Link>
        <span className={styles.brandSub}>اتاق شما</span>
      </div>

      <div className={styles.centerTools}>
        <div className={`${styles.glass} ${styles.segment}`} role="radiogroup" aria-label="حالت">
          {(['view', 'arrange'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={styles.segmentButton}
              data-on={mode === m ? '1' : '0'}
              onClick={() => store.ui({ mode: m, drawer: m === 'arrange', sheet: null })}
            >
              <Icon name={m === 'view' ? 'view' : 'arrange'} size={16} />
              <span>{m === 'view' ? 'تماشا' : 'چیدمان'}</span>
            </button>
          ))}
          <span className={styles.segmentThumb} data-at={mode} aria-hidden="true" />
        </div>

        <div className={`${styles.glass} ${styles.views}`} role="radiogroup" aria-label="نما">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={view === v.id}
              className={styles.viewButton}
              data-on={view === v.id ? '1' : '0'}
              onClick={() => store.ui({ view: v.id })}
              title={v.hint}
            >
              <Icon name={v.icon} size={16} />
              <span>{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.endTools}>
        <button type="button" className={`${styles.glass} ${styles.roundButton}`} onClick={onShot} title="ذخیره‌ی تصویر اتاق" aria-label="ذخیره‌ی تصویر اتاق">
          <Icon name="camera" />
        </button>
        <button
          type="button"
          className={`${styles.glass} ${styles.roundButton}`}
          data-on={sheet === 'settings' ? '1' : '0'}
          aria-expanded={sheet === 'settings'}
          onClick={() => store.ui({ sheet: sheet === 'settings' ? null : 'settings' })}
          title="نور و کیفیت"
          aria-label="تنظیمات نور، نما و کیفیت"
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}
