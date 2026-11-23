/* eslint-disable @next/next/no-img-element */
import { RUGS } from '../config';
import styles from '../hero.module.css';

/**
 * WebGL unavailable: a still, art-directed plate of the same composition —
 * the rug floating over its round stage, a column either side, the lamp above
 * left, one seam for scale. The chrome around it is the live one, prev/next
 * works as a cross-dissolve, and the lamp key still takes the room to black.
 */
export function Fallback({ index }: { index: number }) {
  return (
    <div
      className={styles.fallback}
      role="img"
      aria-label={`${RUGS[index].name}, a Persian rug floating above a round stage between two Persepolis columns, under a single spotlight`}
    >
      <div className={styles.fbSeam} />
      <div className={styles.fbColumn} data-side="l" />
      <div className={styles.fbColumn} data-side="r" />
      <div className={styles.fbStage} />
      <div className={styles.fbRug}>
        {RUGS.map((rug, i) => (
          <img
            key={rug.id}
            src={rug.poster}
            alt=""
            draggable={false}
            style={{ opacity: i === index ? 1 : 0, filter: rug.fallbackFilter }}
          />
        ))}
      </div>
      <div className={styles.fbCone} />
      <div className={styles.fbLamp} aria-hidden="true">
        <svg viewBox="0 0 118 150" preserveAspectRatio="xMidYMax meet">
          <rect x="58" y="-400" width="2" height="500" fill="#2e3238" />
          <rect x="34" y="100" width="50" height="3" fill="#2e3238" />
          <rect x="34" y="100" width="3" height="36" fill="#2e3238" />
          <rect x="81" y="100" width="3" height="36" fill="#2e3238" />
          <g transform="rotate(24 59 128)">
            <rect x="14" y="112" width="92" height="34" rx="2" fill="#22252a" />
            <rect x="14" y="112" width="24" height="34" fill="#1a1c20" />
            <rect x="60" y="112" width="1" height="34" fill="#0b0b0e" />
            <rect x="104" y="115" width="2" height="28" fill="#d5d8dd" />
          </g>
          <circle cx="82.5" cy="108" r="1.3" fill="#f4f6f8" />
        </svg>
      </div>
    </div>
  );
}
