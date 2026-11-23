import styles from '../hero.module.css';

/**
 * A 6 px point that the controller moves directly, and a ring that trails it.
 * State (rug / lamp / ui / dark) is a data attribute on the hero root; all of
 * the cursor's behaviour is CSS reacting to that.
 */
export function Cursor() {
  return (
    <>
      <div className={styles.cursorRing} data-el="cursor-ring" aria-hidden="true">
        <span className={styles.ring} />
        <span className={styles.pulse} data-el="cursor-pulse" />
        <span className={styles.cursorLabel} data-for="rug">
          Explore
        </span>
        <span className={styles.cursorLabel} data-for="piece">
          Visit
        </span>
        <span className={styles.cursorLabel} data-for="dark">
          Light
        </span>
      </div>
      <div className={styles.cursorDot} data-el="cursor-dot" aria-hidden="true">
        <span className={styles.dot} />
      </div>
    </>
  );
}
