'use client';

import { store, useRoom } from '../store';
import styles from '../room.module.css';
import { Icon } from './Icon';

/**
 * Just above the collection, the controls that are about the rug itself:
 * step through the collection, the loupe, and «the rug alone» — the furniture
 * lifts away so the whole piece can be seen on the floor.
 */
export function StageBar() {
  const loupe = useRoom((s) => s.ui.loupe);
  const focus = useRoom((s) => s.ui.focus);
  const swapping = useRoom((s) => s.ui.swapping);

  return (
    <div className={`${styles.glass} ${styles.stage}`} data-ui role="toolbar" aria-label="فرش">
      <button type="button" className={styles.stageArrow} onClick={() => store.cycleRug(-1)} disabled={swapping} aria-label="فرش قبلی" title="فرش قبلی (→)">
        <Icon name="forward" />
      </button>
      <button
        type="button"
        className={styles.stageButton}
        data-on={loupe ? '1' : '0'}
        aria-pressed={loupe}
        onClick={() => store.ui({ loupe: !loupe })}
        title="ذره‌بین (L)"
      >
        <Icon name="loupe" size={17} />
        <span>ذره‌بین</span>
      </button>
      <button
        type="button"
        className={styles.stageButton}
        data-on={focus ? '1' : '0'}
        aria-pressed={focus}
        onClick={() => store.ui({ focus: !focus })}
        title="اثاثیه کنار برود (F)"
      >
        <Icon name="focus" size={17} />
        <span>فقط فرش</span>
      </button>
      <button type="button" className={styles.stageArrow} onClick={() => store.cycleRug(1)} disabled={swapping} aria-label="فرش بعدی" title="فرش بعدی (←)">
        <Icon name="back" />
      </button>
    </div>
  );
}
