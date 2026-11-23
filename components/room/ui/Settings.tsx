'use client';

import { MOODS, type MoodId } from '../model';
import { store, useRoom, type Quality, type ViewId } from '../store';
import styles from '../room.module.css';
import { Icon, type IconName } from './Icon';

export const VIEWS: { id: ViewId; label: string; hint: string; icon: IconName }[] = [
  { id: 'rug', label: 'فرش', hint: 'بهترین زاویه برای دیدن فرش', icon: 'rug' },
  { id: 'overview', label: 'اتاق', hint: 'همه‌ی اتاق، از بیرون', icon: 'overview' },
  { id: 'plan', label: 'از بالا', hint: 'نقشه، با اندازه‌ها', icon: 'plan' },
  { id: 'eye', label: 'هم‌قد', hint: 'ایستاده در اتاق', icon: 'eye' },
  { id: 'detail', label: 'نزدیک', hint: 'لبه‌ی فرش از نزدیک', icon: 'detail' },
];

const MOOD_ICONS: Record<MoodId, IconName> = { gallery: 'spot', night: 'night', day: 'day' };

const QUALITIES: { id: Quality; label: string; note: string }[] = [
  { id: 'normal', label: 'معمولی', note: 'روان روی هر دستگاهی' },
  { id: 'max', label: 'حداکثر', note: 'سایه‌ی نرم، سایه‌روشن محیطی، وضوح کامل' },
];

/**
 * The room's settings: the light, the quality of the graphics, and — on a
 * phone, where the top bar has no room for them — the views. A popover under
 * its button on a desktop; a sheet from the bottom on a phone.
 */
export function Settings({ onShot }: { onShot: () => void }) {
  const open = useRoom((s) => s.ui.sheet === 'settings');
  const mood = useRoom((s) => s.room.mood);
  const quality = useRoom((s) => s.ui.quality);
  const view = useRoom((s) => s.ui.view);
  const close = () => store.ui({ sheet: null });

  return (
    <>
      <section className={`${styles.glass} ${styles.settings}`} data-open={open ? '1' : '0'} data-ui aria-label="تنظیمات" aria-hidden={!open}>
        <span className={styles.grabber} aria-hidden="true" />

        <div className={styles.settingsGroup} data-phone>
          <p className={styles.groupLabel}>نما</p>
          <div className={styles.tiles}>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={styles.tile}
                data-on={view === v.id ? '1' : '0'}
                tabIndex={open ? 0 : -1}
                onClick={() => {
                  store.ui({ view: v.id, sheet: null });
                }}
              >
                <Icon name={v.icon} />
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <p className={styles.groupLabel}>نور</p>
          <div className={styles.tiles}>
            {MOODS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={styles.tile}
                data-on={mood === m.id ? '1' : '0'}
                tabIndex={open ? 0 : -1}
                onClick={() => store.room((r) => ({ ...r, mood: m.id }))}
                title={m.note}
              >
                <Icon name={MOOD_ICONS[m.id]} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <p className={styles.groupLabel}>کیفیت گرافیک</p>
          <div className={styles.qualities} role="radiogroup" aria-label="کیفیت گرافیک">
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                type="button"
                role="radio"
                aria-checked={quality === q.id}
                className={styles.quality}
                data-on={quality === q.id ? '1' : '0'}
                tabIndex={open ? 0 : -1}
                onClick={() => store.setQuality(q.id)}
              >
                <b>{q.label}</b>
                <span>{q.note}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="button" className={`${styles.ghost} ${styles.phoneOnly}`} tabIndex={open ? 0 : -1} onClick={() => (close(), onShot())}>
          <Icon name="camera" size={16} />
          ذخیره‌ی تصویر اتاق
        </button>
      </section>
    </>
  );
}
