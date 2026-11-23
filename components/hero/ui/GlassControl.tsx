/* eslint-disable @next/next/no-img-element */
import gsap from 'gsap';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RUGS, STACK_QUERY } from '../config';
import styles from '../hero.module.css';

interface GlassControlProps {
  index: number;
  onNavigate: (dir: 1 | -1) => void;
}

/** degrees between neighbouring pieces on the dial */
const STEP = 37;

/** signed distance of piece `i` from the one on show: …, −1, 0, +1, … */
function slot(i: number, index: number, n: number) {
  let d = (((i - index) % n) + n) % n;
  if (d > n / 2) d -= n;
  return d;
}

/**
 * THE COLLECTION DIAL
 *
 * previous / current / next, as a wheel of smoked glass half-sunk into the
 * edge of the frame. The collection rides its rim as small pictures of the
 * rugs themselves: the piece on show sits at the crown of the arc, full size;
 * its neighbours wait a notch above and below, smaller and dimmer.
 *
 * Turning the rug turns the wheel. Every piece keeps its own running angle, so
 * the one that drops off one end of the visible arc travels round the hidden
 * half and comes up at the other — it is a wheel, not a list that wraps.
 *
 * On wide frames the wheel sits in the left edge; where the text stacks under
 * the piece it lies in the bottom edge instead, turned a quarter.
 */
export function GlassControl({ index, onNavigate }: GlassControlProps) {
  const n = RUGS.length;
  const dial = useRef<HTMLElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const angles = useRef<{ a: number }[]>(RUGS.map((_, i) => ({ a: slot(i, 0, n) * STEP })));
  const shown = useRef(index);
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(STACK_QUERY);
    const apply = () => setStacked(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useLayoutEffect(() => {
    const el = dial.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const base = stacked ? -90 : 0; // where the crown of the arc points
    const orbit = parseFloat(getComputedStyle(el).getPropertyValue('--orbit')) || 120;

    const place = (i: number) => {
      const node = items.current[i];
      if (!node) return;
      const a = angles.current[i].a;
      const off = Math.abs(a) / STEP; // 0 on show · 1 neighbour · beyond: out of sight
      const near = Math.min(1, off);
      const gone = Math.min(1, Math.max(0, off - 1));
      node.style.transform = `rotate(${base + a}deg) translateX(${orbit}px) rotate(${-(base + a)}deg) scale(${(1 - 0.36 * near - 0.2 * gone).toFixed(3)})`;
      node.style.opacity = ((1 - 0.42 * near) * (1 - gone)).toFixed(3);
      node.style.zIndex = off < 0.5 ? '2' : '1';
      node.style.pointerEvents = gone > 0.5 ? 'none' : 'auto';
    };

    // which way did the wheel turn? +1: onward (angles run down), −1: back
    const dir = slot(index, shown.current, n);
    shown.current = index;

    angles.current.forEach((state, i) => {
      const target = slot(i, index, n) * STEP;
      gsap.killTweensOf(state);
      if (dir === 0 || reduced) {
        state.a = target;
        place(i);
        return;
      }
      // go the way the wheel turns, however far round that is
      const travel = dir > 0 ? -((((state.a - target) % 360) + 360) % 360) : (((target - state.a) % 360) + 360) % 360;
      gsap.to(state, {
        a: state.a + travel,
        duration: 1.25,
        ease: 'expo.out',
        onUpdate: () => place(i),
        onComplete: () => {
          state.a = target;
          place(i);
        },
      });
    });
  }, [index, stacked, n]);

  useEffect(() => {
    const states = angles.current;
    return () => states.forEach((state) => gsap.killTweensOf(state));
  }, []);

  // any other picture is a turn away: onward if it follows the one on show, back otherwise
  const jump = (to: number) => {
    const d = slot(to, index, n);
    if (d !== 0) onNavigate(d > 0 ? 1 : -1);
  };
  const prev = RUGS[(index - 1 + n) % n];
  const next = RUGS[(index + 1) % n];

  return (
    <div className={styles.glassWrap} data-el="glass-wrap">
      <nav ref={dial} className={styles.dial} data-el="glass" data-intro data-ui aria-label="مجموعه">
        <span className={styles.dialDisc} aria-hidden="true">
          <span className={styles.glassSheen} />
        </span>
        <span className={styles.dialTrack} aria-hidden="true" />
        <span className={styles.dialNotch} aria-hidden="true" />

        <div className={styles.dialOrbit}>
          {RUGS.map((rug, i) => (
            <button
              key={rug.id}
              ref={(node) => {
                items.current[i] = node;
              }}
              type="button"
              className={styles.dialItem}
              aria-current={i === index ? 'true' : undefined}
              aria-label={`${rug.fa.title}، قطعه‌ی ${rug.index}`}
              onClick={() => jump(i)}
            >
              <span className={styles.dialThumb}>
                <img src={rug.thumb} alt="" draggable={false} style={{ filter: rug.fallbackFilter }} />
              </span>
              <span className={styles.dialNum} lang="en" dir="ltr">
                {rug.index}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className={styles.dialArrow}
          data-dir="-1"
          aria-label={`قطعه‌ی قبلی: ${prev.fa.title}`}
          onClick={() => onNavigate(-1)}
        >
          <svg viewBox="0 0 13 13" aria-hidden="true">
            <path d="M2.5 8l4-4 4 4" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.dialArrow}
          data-dir="1"
          aria-label={`قطعه‌ی بعدی: ${next.fa.title}`}
          onClick={() => onNavigate(1)}
        >
          <svg viewBox="0 0 13 13" aria-hidden="true">
            <path d="M2.5 5l4 4 4-4" />
          </svg>
        </button>
      </nav>
    </div>
  );
}
