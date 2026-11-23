/**
 * The hero's motion vocabulary. Every tween in the piece uses one of these
 * names — nothing reaches for a stock ease ad hoc.
 */
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

let registered = false;

export const EASE = {
  /** sharp arrival that keeps decelerating — type, glass, logo */
  settle: 'expo.out',
  /** camera dolly in: reluctant start, very long tail */
  dolly: 'hero.dolly',
  /** camera pull back: leaves promptly, lands softly */
  pullBack: 'hero.pullBack',
  /** fabric being turned over by hand */
  fabric: 'hero.fabric',
  /** filament / driver warm-up */
  lampOn: 'hero.lampOn',
  /** driver capacitors draining: quick drop, long tail */
  lampOff: 'hero.lampOff',
  /** eyes adjusting to a dark room */
  emerge: 'hero.emerge',
  /** weight coming to rest */
  land: 'hero.land',
} as const;

export function registerEases() {
  if (registered) return;
  registered = true;
  gsap.registerPlugin(CustomEase);
  CustomEase.create(EASE.dolly, '0.62,0,0.12,1');
  CustomEase.create(EASE.pullBack, '0.3,0,0.08,1');
  CustomEase.create(EASE.fabric, '0.5,0,0.18,1');
  CustomEase.create(EASE.lampOn, '0.25,0.1,0.1,1');
  CustomEase.create(EASE.lampOff, '0.2,0.7,0.3,1');
  CustomEase.create(EASE.emerge, '0.45,0,0.25,1');
  CustomEase.create(EASE.land, '0.2,0.9,0.25,1');
}

/* per-frame helpers (used inside the render loop, no allocation) */

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const saturate = (v: number) => clamp(v, 0, 1);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = saturate((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** frame-rate independent exponential approach; `tau` is the time constant in seconds */
export const damp = (current: number, target: number, tau: number, dt: number) =>
  target + (current - target) * Math.exp(-dt / tau);
