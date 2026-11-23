'use client';

/**
 * HERO — the controller.
 *
 * Owns the interaction state machine (machine.ts), performs its effects
 * (camera dolly, walking the hall, turning a piece over, lamp, sound), runs
 * the intro choreography, and
 * translates the pointer into events. Everything visual it touches goes
 * through `live` (WebGL) or a handful of `data-el` elements (DOM).
 */
import gsap from 'gsap';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HeroAudio } from './audio';
import { DARK_TITLE, PARALLAX, PARALLAX_PX, RUGS, TIERS, WEAK_GPU, ZOOM, type Tier } from './config';
import { EASE, registerEases, smoothstep } from './easing';
import styles from './hero.module.css';
import { createLive, settle } from './live';
import { initialState, label, transition, type Effect, type MachineEvent, type MachineState } from './machine';
import type { WorldApi } from './scene/world';
import { cart, useCart } from '../site/cart';
import { Cursor } from './ui/Cursor';
import { Fallback } from './ui/Fallback';
import { GlassControl } from './ui/GlassControl';
import { Header } from './ui/Header';
import { Menu } from './ui/Menu';
import { DarkTitle, Story } from './ui/Story';

const Scene = dynamic(() => import('./Scene'), { ssr: false });

interface Env {
  webgl: boolean;
  reduced: boolean;
  touch: boolean;
  tier: Tier;
  dpr: number;
}

function detect(): Env {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  let webgl = false;
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    webgl = !!gl;
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && info) gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
  } catch {
    webgl = false;
  }
  // `?still` previews the no-WebGL plate on a machine that does have WebGL
  if (new URLSearchParams(window.location.search).has('still')) webgl = false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  let tier = TIERS.high;
  if (touch || Math.min(w, h) < 640) tier = cores <= 4 || memory <= 3 ? TIERS.low : TIERS.medium;
  // integrated graphics on a desktop: start on the lite tier rather than discover it the slow way
  else if (WEAK_GPU.test(gpu)) tier = TIERS.lite;
  const dpr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, tier.maxDpr, Math.sqrt(tier.maxPixels / (w * h))));
  return { webgl, reduced, touch, tier, dpr: Math.round(dpr * 100) / 100 };
}

const HOVER_INTENT_MS = 140;
const REARM_TRAVEL_PX = 28;

/* ---- the story lines turn over with the rug -------------------------------
   Out: each line folds away on its top edge in the direction the cloth goes.
   In:  the new lines unfold from the other side, out of blur, staggered.     */

const storyLines = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[data-el="piece"] [data-line]'));

function storyOut(root: HTMLElement, dir: number, reduced: boolean) {
  const lines = storyLines(root);
  if (reduced) return gsap.to(lines, { opacity: 0, duration: 0.15, ease: 'none', overwrite: true });
  return gsap.to(lines, {
    opacity: 0,
    y: -14 * dir,
    rotateX: 62 * dir,
    filter: 'blur(7px)',
    transformPerspective: 700,
    duration: 0.42,
    stagger: { each: 0.035, from: dir > 0 ? 'start' : 'end' },
    ease: 'power2.in',
    overwrite: true,
  });
}

function storyIn(root: HTMLElement, dir: number, reduced: boolean, delay = 0) {
  const lines = storyLines(root);
  if (reduced) return gsap.fromTo(lines, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'none', overwrite: true });
  return gsap.fromTo(
    lines,
    { opacity: 0, y: 20 * dir, rotateX: -68 * dir, filter: 'blur(9px)', transformPerspective: 700 },
    {
      opacity: 1,
      y: 0,
      rotateX: 0,
      filter: 'blur(0px)',
      duration: 1.05,
      delay,
      stagger: { each: 0.075, from: dir > 0 ? 'start' : 'end' },
      ease: 'expo.out',
      overwrite: true,
    },
  );
}

export default function Hero({ signedIn = false }: { signedIn?: boolean }) {
  const rootRef = useRef<HTMLElement>(null);
  const live = useMemo(createLive, []);
  const audioRef = useRef<HeroAudio | null>(null);
  const sendRef = useRef<(event: MachineEvent) => void>(() => undefined);
  const indexRef = useRef(0);
  const shownRef = useRef(0);
  const dirRef = useRef(1);

  const [env, setEnv] = useState<Env | null>(null);
  const [api, setApi] = useState<WorldApi | null>(null);
  const [index, setIndex] = useState(0);
  const [audioOn, setAudioOn] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const cartItems = useCart();

  /* ---- arriving from the shop: ?piece=n stands the visitor in front of that piece ---- */
  useLayoutEffect(() => {
    const asked = Number(new URLSearchParams(window.location.search).get('piece'));
    if (!Number.isInteger(asked) || asked <= 0 || asked >= RUGS.length) return;
    indexRef.current = asked;
    shownRef.current = asked;
    setIndex(asked);
  }, []);

  /* ---- environment: capability, motion preference, quality tier ---- */
  useEffect(() => {
    let timer = 0;
    const apply = () =>
      setEnv((prev) => {
        const next = detect();
        if (prev && prev.webgl === next.webgl && prev.reduced === next.reduced && prev.tier === next.tier && prev.dpr === next.dpr)
          return prev;
        return next;
      });
    apply();
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 200);
    };
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', onResize);
    mq.addEventListener('change', apply);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      mq.removeEventListener('change', apply);
    };
  }, []);

  useEffect(() => {
    const audio = new HeroAudio();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  const reduced = env?.reduced ?? false;
  const ready = !!env && (!env.webgl || !!api);

  /* ---- the controller ---- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !ready) return;
    registerEases();

    const audio = audioRef.current;
    Object.assign(live, createLive());
    live.reduced = reduced;

    const $ = (name: string) => root.querySelector<HTMLElement>(`[data-el="${name}"]`) as HTMLElement;
    const $$ = (name: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-el="${name}"]`));
    const el = {
      veil: $('veil'),
      header: $('header'),
      lines: $$('burger-line'),
      brand: $('brand'),
      brandInner: $('brand-inner'),
      sound: $('sound'),
      story: $('story'),
      piece: $('piece'),
      mask: $('title-mask'),
      words: $$('word'),
      glassWrap: $('glass-wrap'),
      glass: $('glass'),
      dark: $('dark'),
      typed: $('typed'),
      hint: $('dark-hint'),
      dot: $('cursor-dot'),
      ring: $('cursor-ring'),
      pulse: $('cursor-pulse'),
    };

    let machine: MachineState = initialState;
    let intro: gsap.core.Timeline | null = null;
    let zoomTween: gsap.core.Animation | null = null;
    let flipTl: gsap.core.Timeline | null = null;
    let lightTl: gsap.core.Timeline | null = null;
    let typeTl: gsap.core.Timeline | null = null;
    let intent = 0;
    let disposed = false;

    const pointer = {
      kind: 'none' as 'rug' | 'lamp' | 'piece' | 'none' | 'ui',
      /** for a neighbouring piece under the pointer: which way it hangs */
      pieceDir: 1 as 1 | -1,
      type: 'mouse',
      cx: -200,
      cy: -200,
      rx: -200,
      ry: -200,
      placed: false,
      pickU: 0,
      pickV: 0,
      rearmX: 0,
      rearmY: 0,
      swallow: false,
      /* where a touch began, for telling a swipe from a tap */
      downX: 0,
      downY: 0,
      downT: 0,
    };

    api?.setActive(indexRef.current);
    live.travel = indexRef.current;

    /* ================= state machine plumbing ================= */

    const sync = () => {
      root.dataset.view = label(machine);
      root.dataset.light = machine.light;
    };

    const send = (event: MachineEvent) => {
      if (disposed) return;
      const next = transition(machine, event);
      machine = next.state;
      sync();
      for (const fx of next.effects) perform(fx);
      if (event.type === 'FLIP_DONE') {
        pointer.rearmX = pointer.cx;
        pointer.rearmY = pointer.cy;
      }
      if (event.type === 'INTRO_DONE' || event.type === 'REARM') hoverIntent();
    };
    sendRef.current = send;

    if (process.env.NODE_ENV !== 'production') {
      // dev handle for poking the piece from the console: __nafis.send({ type: 'LAMP_CLICK' })
      (window as unknown as Record<string, unknown>).__nafis = { gsap, live, send, state: () => machine };
    }

    /* ================= effects ================= */

    /** reduced motion: a short dip through black instead of camera travel */
    const dip = (apply: () => void, done: () => void) =>
      gsap
        .timeline()
        .to(live, { fade: 0, duration: 0.18, ease: 'sine.in' })
        .add(apply)
        .to(live, { fade: 1, duration: 0.24, ease: 'sine.out' })
        .add(done);

    const zoomIn = () => {
      api?.requestFibres();
      live.focusU = pointer.pickU;
      live.focusV = pointer.pickV;
      live.anchorX = live.targetX;
      live.anchorY = live.targetY;
      zoomTween?.kill();
      if (!api) {
        send({ type: 'ZOOM_IN_DONE' });
      } else if (reduced) {
        zoomTween = dip(
          () => (live.zoom = ZOOM.reducedDepth),
          () => send({ type: 'ZOOM_IN_DONE' }),
        );
      } else {
        zoomTween = gsap.to(live, {
          zoom: 1,
          duration: Math.max(0.9, ZOOM.inDuration * (1 - live.zoom)),
          ease: EASE.dolly,
          onComplete: () => send({ type: 'ZOOM_IN_DONE' }),
        });
      }
    };

    const zoomOut = (hurried: boolean) => {
      zoomTween?.kill();
      if (!api || live.zoom < 0.001) {
        live.zoom = 0;
        send({ type: 'ZOOM_OUT_DONE' });
      } else if (reduced) {
        zoomTween = dip(
          () => (live.zoom = 0),
          () => send({ type: 'ZOOM_OUT_DONE' }),
        );
      } else {
        zoomTween = gsap.to(live, {
          zoom: 0,
          duration: hurried ? 0.3 + 0.75 * live.zoom : Math.max(0.6, ZOOM.outDuration * Math.pow(live.zoom, 0.6)),
          ease: EASE.pullBack,
          onComplete: () => send({ type: 'ZOOM_OUT_DONE' }),
        });
      }
    };

    /** prev / next: the visitor walks along the hall to the neighbouring piece */
    const walk = (dir: 1 | -1, target?: number) => {
      const n = RUGS.length;
      const from = indexRef.current;
      const to = target ?? (from + dir + n) % n;
      if (to === from) {
        send({ type: 'FLIP_DONE' });
        return;
      }
      const arrive = () => {
        indexRef.current = to;
        api?.setActive(to);
      };
      flipTl?.kill();
      dirRef.current = dir;

      if (!api || reduced) {
        // reduced motion / no WebGL: a short dip, and the visitor is simply there
        storyOut(root, dir, true);
        flipTl = gsap
          .timeline()
          .to(live, { fade: 0, duration: 0.2, ease: 'sine.in' })
          .add(() => {
            live.travel = to;
            arrive();
            setIndex(to);
          })
          .to(live, { fade: 1, duration: 0.3, ease: 'sine.out' })
          .add(() => send({ type: 'FLIP_DONE' }));
        return;
      }

      // a walk of one piece takes a second and a half; the way back to the start, a little longer
      const duration = 1.5 + 0.55 * (Math.abs(to - from) - 1);
      storyOut(root, dir, false);
      flipTl = gsap
        .timeline()
        .to(live, { travel: to, duration, ease: 'power2.inOut' }, 0)
        // the words change halfway, between the two pieces
        .add(() => setIndex(to), duration * 0.5)
        .add(arrive, duration)
        .add(() => send({ type: 'FLIP_DONE' }), duration);
    };

    /** a click on the piece: it turns over on its rod to show its back — or turns back again */
    const turn = () => {
      flipTl?.kill();
      if (!api) {
        send({ type: 'FLIP_DONE' });
        return;
      }
      const reversed = api.isReversed();
      const land = () => {
        api.setReversed(!reversed);
        live.flip = 0;
      };
      if (reduced) {
        flipTl = dip(land, () => send({ type: 'FLIP_DONE' }));
        return;
      }

      audio?.flip();
      live.flipDir = 1;
      live.flip = 0;
      // 1.4 s: lift → grabbed curl travels the length of the cloth → set down → settle
      flipTl = gsap
        .timeline()
        .to(live, { lift: 0.045, duration: 0.26, ease: 'power2.out' }, 0)
        .to(live, { shape: 0, duration: 0.2, ease: 'power1.out' }, 0)
        .to(live, { flip: 1, duration: 1.0, ease: EASE.fabric }, 0.1)
        .to(live, { blur: 1, duration: 0.42, ease: 'sine.in' }, 0.14)
        .to(live, { blur: 0, duration: 0.42, ease: 'sine.out' }, 0.62)
        .add(land, 1.1)
        .to(live, { lift: 0, duration: 0.3, ease: EASE.land }, 1.1)
        .fromTo(live, { ripple: 1 }, { ripple: 0, duration: 0.6, ease: 'power2.out', immediateRender: false }, 1.1)
        .add(() => send({ type: 'FLIP_DONE' }), 1.4)
        // the corner stands proud again and the fringe settles back as the cloth relaxes
        .to(live, { shape: 1, duration: 1.1, ease: 'sine.inOut' }, 1.2);
    };

    /** lights off: after the room has gone black, type the title into the middle of it */
    const typeTitle = () => {
      typeTl?.kill();
      el.typed.textContent = '';
      gsap.set(el.dark, { opacity: 1 });
      gsap.set(el.hint, { opacity: 0 });
      const chars = Array.from(DARK_TITLE);
      const tl = gsap.timeline({ delay: reduced ? 0.3 : 1.05 });
      if (reduced) {
        tl.add(() => (el.typed.textContent = DARK_TITLE)).fromTo(el.dark, { opacity: 0 }, { opacity: 1, duration: 0.4 });
      } else {
        // connected script re-joins as each letter lands, exactly as it does under a real keyboard
        let t = 0.35;
        chars.forEach((ch, i) => {
          tl.add(() => {
            el.typed.textContent = chars.slice(0, i + 1).join('');
            if (ch !== ' ') audio?.key();
          }, t);
          t += ch === ' ' ? 0.36 : 0.17 + Math.random() * 0.1;
        });
        tl.to(el.hint, { opacity: 0.6, duration: 1.4, ease: 'sine.out' }, t + 1.3);
      }
      typeTl = tl;
    };

    const clearTitle = () => {
      typeTl?.kill();
      typeTl = gsap.timeline().to(el.dark, { opacity: 0, duration: 0.35, ease: 'sine.out' }).add(() => {
        el.typed.textContent = '';
        root.dataset.dark = '0';
        gsap.set(el.dark, { clearProps: 'opacity' });
      });
    };

    const light = (on: boolean) => {
      lightTl?.kill();
      const k = reduced ? 0.25 : 1;
      const tl = gsap.timeline();
      if (on) {
        audio?.lampOn();
        clearTitle();
        // the architecture answers first, then the key ignites
        tl.to(live, { ambience: 1, stageRim: 1, duration: 0.9 * k, ease: EASE.emerge }, 0)
          .to(live, { accent: 1, duration: 1.1 * k, ease: EASE.emerge }, 0.05)
          .to(live, { led: 1, duration: 0.05, ease: 'none' }, 0)
          .to(live, { aperture: 1, duration: 0.5 * k, ease: EASE.lampOn }, 0.1)
          // ignition: a first catch, a 10 ms sag, then the driver ramps
          .to(live, { light: Math.max(live.light, 0.16), duration: 0.05, ease: 'none' }, 0.1)
          .to(live, { light: Math.max(live.light, 0.09), duration: 0.01, ease: 'none' }, 0.15)
          .to(live, { light: 1, duration: 1.2 * k, ease: EASE.lampOn }, 0.16)
          .to(live, { beam: 1, duration: 1.3 * k, ease: EASE.lampOn }, 0.12)
          .to(live, { dust: 1, duration: 1.1 * k, ease: 'sine.out' }, 0.12);
      } else {
        audio?.lampOff();
        root.dataset.dark = '1';
        // everything goes: key, accents, room tone — to black
        tl.to(live, { led: 0, duration: 0.09, ease: 'none' }, 0.03)
          .to(live, { aperture: 0, duration: 0.6 * k, ease: EASE.lampOff }, 0)
          .to(live, { light: 0, duration: 0.9 * k, ease: EASE.lampOff }, 0)
          .to(live, { beam: 0, duration: 0.8 * k, ease: EASE.lampOff }, 0)
          .to(live, { dust: 0, duration: 0.8 * k, ease: 'sine.in' }, 0)
          .to(live, { accent: 0, duration: 1.0 * k, ease: EASE.lampOff }, 0.05)
          .to(live, { ambience: 0, stageRim: 0, duration: 1.0 * k, ease: 'sine.inOut' }, 0.1);
        typeTitle();
      }
      lightTl = tl;
    };

    const perform = (fx: Effect) => {
      switch (fx.type) {
        case 'skipIntro':
          if (intro && intro.progress() < 1) gsap.to(intro, { progress: 1, duration: 0.8, ease: 'power2.out', overwrite: true });
          break;
        case 'zoomIn':
          zoomIn();
          break;
        case 'zoomOut':
          zoomOut(fx.hurried);
          break;
        case 'walk':
          walk(fx.dir, fx.to);
          break;
        case 'turn':
          turn();
          break;
        case 'light':
          light(fx.on);
          break;
      }
    };

    /* ================= intro ================= */

    const introDone = () => {
      gsap.to(live, { adapt: 1, duration: 1.2, ease: 'sine.inOut' });
      send({ type: 'INTRO_DONE' });
    };

    root.dataset.dark = '0';
    if (!api || reduced) {
      // reduced motion (and the static fallback): the settled frame, one 600 ms fade
      settle(live);
      live.adapt = 1;
      root.dataset.phase = 'live';
      gsap.to(el.veil, { opacity: 0, duration: 0.6, ease: 'sine.out', onComplete: introDone });
    } else {
      gsap.to(el.veil, { opacity: 0, duration: 0.4, ease: 'none' });
      const tl = gsap.timeline({ onComplete: introDone });
      // 1–2  black, then the faintest room
      tl.to(live, { ambience: 0.38, duration: 1.3, ease: EASE.emerge }, 0.35)
        // 3  dust gathers where the beam will be
        .to(live, { dust: 1, duration: 1.7, ease: 'sine.inOut' }, 0.9)
        // 4  the architecture finds itself: wall wash and column uplights, stele rim, then body
        .to(live, { accent: 1, duration: 1.9, ease: EASE.emerge }, 1.1)
        .to(live, { stageRim: 1, duration: 1.1, ease: EASE.emerge }, 1.45)
        .to(live, { ambience: 1, duration: 1.2, ease: EASE.emerge }, 1.95)
        // 5  lamp: LED, relay, aperture
        .add(() => audio?.lampOn(), 2.95)
        .to(live, { led: 1, duration: 0.05, ease: 'none' }, 2.95)
        .to(live, { aperture: 1, duration: 0.5, ease: EASE.lampOn }, 3.08)
        // 6  light fills the room, with the ignition sag
        .to(live, { light: 0.16, duration: 0.05, ease: 'none' }, 3.08)
        .to(live, { light: 0.09, duration: 0.01, ease: 'none' }, 3.13)
        .to(live, { light: 1, duration: 1.2, ease: EASE.lampOn }, 3.14)
        .to(live, { beam: 1, duration: 1.4, ease: EASE.lampOn }, 3.1)
        // 7  rug: silhouette, then colour
        .to(live, { rugSat: 1, duration: 1.7, ease: 'sine.inOut' }, 3.45)
        // 8  focus pull — textile detail arrives
        .to(live, { rugDetail: 1, introBlur: 0, duration: 1.7, ease: EASE.emerge }, 3.85)
        // 9  reflection resolves
        .to(live, { reflection: 1, reflSoft: 0, duration: 1.9, ease: EASE.emerge }, 4.1)
        // 10  glass: floats up as its blur comes in
        .fromTo(
          el.glass,
          { opacity: 0, y: 12, '--glass-blur': '0px' },
          { opacity: 1, y: 0, '--glass-blur': '24px', duration: 0.9, ease: EASE.settle },
          5.15,
        )
        // 11  mark: tracking closes from 0.4 em to 0.15 em
        .fromTo(el.brand, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'sine.out' }, 5.55)
        .fromTo(
          el.brandInner,
          { letterSpacing: '0.4em', marginRight: '-0.4em' },
          { letterSpacing: '0.15em', marginRight: '-0.15em', duration: 0.7, ease: EASE.settle },
          5.55,
        )
        // 12  menu mark: each rule drawn from the left
        .fromTo(el.lines, { scaleX: 0 }, { scaleX: 1, duration: 0.55, stagger: 0.08, ease: EASE.settle }, 5.85)
        // 13  headline: mask opens right → left, words rise out of blur
        .fromTo(
          el.mask,
          { clipPath: 'inset(0% 0% 0% 100%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: EASE.settle },
          6.05,
        )
        .fromTo(
          el.words,
          { opacity: 0, y: 10, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, stagger: 0.14, ease: EASE.settle },
          6.05,
        )
        // …then the piece's own lines unfold beneath it
        .fromTo(el.piece, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'sine.out' }, 6.25)
        .add(storyIn(root, 1, false), 6.3)
        .fromTo(el.sound, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'sine.out' }, 6.3);
      // 14  hold a beat on the settled frame
      tl.to({}, { duration: 0.1 }, 7.35);
      intro = tl;
      root.dataset.phase = 'intro';
    }
    sync();

    /* ================= pointer ================= */

    const setKind = (kind: typeof pointer.kind) => {
      if (kind === pointer.kind) return false;
      const was = pointer.kind;
      pointer.kind = kind;
      root.dataset.cursor = kind;
      window.clearTimeout(intent);
      if (was === 'rug') send({ type: 'RUG_LEAVE' });
      return true;
    };

    const hoverIntent = () => {
      window.clearTimeout(intent);
      if (pointer.kind !== 'rug' || pointer.type === 'touch') return;
      intent = window.setTimeout(
        () => {
          if (pointer.kind === 'rug') send({ type: 'RUG_ENTER' });
        },
        reduced ? 420 : HOVER_INTENT_MS,
      );
    };

    const locate = (e: PointerEvent | MouseEvent) => {
      const r = root.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      return { x, y, nx: (x / r.width) * 2 - 1, ny: -((y / r.height) * 2 - 1) };
    };

    const classify = (e: PointerEvent | MouseEvent, nx: number, ny: number): typeof pointer.kind => {
      if ((e.target as Element | null)?.closest?.('[data-ui]')) return 'ui';
      if (!api || machine.view === 'INTRO') return 'none';
      const hit = api.pick(nx, ny);
      if (hit.kind === 'piece') pointer.pieceDir = hit.u > 0 ? 1 : -1;
      if (hit.kind === 'rug') {
        // latch the knot under the pointer only while the camera is still at rest
        if (machine.view === 'IDLE' || machine.view === 'RETURNING') {
          pointer.pickU = hit.u;
          pointer.pickV = hit.v;
        }
      }
      return hit.kind;
    };

    const onMove = (e: PointerEvent) => {
      const p = locate(e);
      pointer.type = e.pointerType || 'mouse';
      pointer.cx = p.x;
      pointer.cy = p.y;
      // the liquid floor follows the pointer itself, finger or mouse
      live.px = p.nx;
      live.py = p.ny;
      live.pOn = !(e.target as Element | null)?.closest?.('[data-ui]');
      if (pointer.type === 'touch') return; // touch has no hover; taps are handled in onClick
      live.targetX = p.nx;
      live.targetY = p.ny;
      if (!pointer.placed) {
        pointer.placed = true;
        pointer.rx = p.x;
        pointer.ry = p.y;
      }
      root.dataset.cursorOn = '1';

      if (!machine.hoverArmed && machine.view === 'IDLE') {
        if (Math.hypot(p.x - pointer.rearmX, p.y - pointer.rearmY) > REARM_TRAVEL_PX) send({ type: 'REARM' });
      }
      if (setKind(classify(e, p.nx, p.ny))) hoverIntent();
    };

    const onLeave = () => {
      if (pointer.type === 'touch') return; // a lifted finger is not a departure
      root.dataset.cursorOn = '0';
      live.pOn = false;
      live.targetX = 0;
      live.targetY = 0;
      setKind('none');
    };

    const onDown = (e: PointerEvent) => {
      pointer.type = e.pointerType || 'mouse';
      const at = locate(e);
      live.px = at.nx;
      live.py = at.ny;
      live.pOn = !(e.target as Element | null)?.closest?.('[data-ui]');
      if (live.pOn) live.taps++;
      audio?.arm();
      pointer.swallow = machine.view === 'INTRO';
      if (pointer.swallow) send({ type: 'SKIP' });
      pointer.downX = at.x;
      pointer.downY = at.y;
      pointer.downT = performance.now();
    };

    /* on a phone, a sideways swipe across the room walks to the next piece (or back) */
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || (e.target as Element | null)?.closest?.('[data-ui]')) return;
      const at = locate(e);
      const dx = at.x - pointer.downX;
      const dy = at.y - pointer.downY;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5 || performance.now() - pointer.downT > 700) return;
      // whatever click follows the swipe is part of it, not a tap
      pointer.swallow = true;
      if (machine.view === 'INTRO') return;
      // the hall runs left to right: drawing the room to the left brings the next piece in
      send({ type: 'NAVIGATE', dir: dx < 0 ? 1 : -1 });
    };

    const pulse = () =>
      gsap.fromTo(
        el.pulse,
        { scale: 0.2, opacity: 0.9 },
        { scale: 1.25, opacity: 0, duration: 0.3, ease: 'power2.out', overwrite: true },
      );

    const onClick = (e: MouseEvent) => {
      if (pointer.swallow) {
        pointer.swallow = false;
        return;
      }
      const p = locate(e);
      const kind = classify(e, p.nx, p.ny);
      if (kind === 'ui') return;
      if (pointer.type !== 'touch') pulse();

      // lights off: the whole room is the switch (rule 5)
      if (machine.light === 'LIGHT_OFF') {
        send({ type: 'ROOM_CLICK' });
        return;
      }

      if (pointer.type === 'touch') {
        // first tap = hover (dive in), second tap = click (turn the rug), tap elsewhere = leave
        if (kind === 'rug') {
          if (machine.view === 'IDLE') {
            pointer.kind = 'rug';
            live.targetX = p.nx;
            live.targetY = p.ny;
            if (!machine.hoverArmed) send({ type: 'REARM' });
            send({ type: 'RUG_ENTER' });
          } else send({ type: 'RUG_CLICK' });
        } else {
          if (pointer.kind === 'rug') {
            pointer.kind = 'none';
            send({ type: 'RUG_LEAVE' });
          }
          if (kind === 'lamp') send({ type: 'LAMP_CLICK' });
          else if (kind === 'piece') send({ type: 'NAVIGATE', dir: pointer.pieceDir });
        }
        return;
      }

      if (kind === 'lamp') send({ type: 'LAMP_CLICK' });
      else if (kind === 'rug') send({ type: 'RUG_CLICK' });
      // a neighbouring piece, at the edge of the frame: walk over to it
      else if (kind === 'piece') send({ type: 'NAVIGATE', dir: pointer.pieceDir });
    };

    const onWheel = () => {
      if (machine.view === 'INTRO') send({ type: 'SKIP' });
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // the menu owns the keyboard while it is open; so does any field or button with focus
      if (root.dataset.menu === '1') return;
      if (machine.view === 'INTRO') {
        if (e.key !== 'Tab' && e.key !== 'Shift') send({ type: 'SKIP' });
        return;
      }
      audio?.arm();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') send({ type: 'NAVIGATE', dir: 1 });
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') send({ type: 'NAVIGATE', dir: -1 });
      else if (e.key === 'l' || e.key === 'L') send({ type: 'LAMP_CLICK' });
      else if (e.key === 'Escape') send({ type: 'RUG_LEAVE' });
      else return;
      e.preventDefault();
    };

    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('click', onClick);
    root.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);

    /* ================= per-frame DOM: cursor, UI parallax layers, glass sheen ================= */

    let storyOpacity = -1;
    let sheenX = -1;
    let sheenY = -1;
    const tick = (_time: number, deltaMs: number) => {
      const k = 1 - Math.exp(-Math.min(deltaMs, 50) / 85);
      pointer.rx += (pointer.cx - pointer.rx) * k;
      pointer.ry += (pointer.cy - pointer.ry) * k;
      el.dot.style.transform = `translate3d(${pointer.cx}px, ${pointer.cy}px, 0)`;
      el.ring.style.transform = `translate3d(${pointer.rx.toFixed(2)}px, ${pointer.ry.toFixed(2)}px, 0)`;

      if (!reduced) {
        // without WebGL nobody smooths the pointer for us
        if (!api) {
          live.x += (live.targetX - live.x) * k * 0.4;
          live.y += (live.targetY - live.y) * k * 0.4;
        }
        const gx = -live.x * PARALLAX_PX * PARALLAX.glass;
        const gy = live.y * PARALLAX_PX * PARALLAX.glass;
        const tx = -live.x * PARALLAX_PX * PARALLAX.text;
        const ty = live.y * PARALLAX_PX * PARALLAX.text;
        el.glassWrap.style.translate = `${gx.toFixed(2)}px ${gy.toFixed(2)}px`;
        el.header.style.translate = `${tx.toFixed(2)}px ${ty.toFixed(2)}px`;
        el.story.style.translate = `${tx.toFixed(2)}px ${ty.toFixed(2)}px`;

        // the capsule's sheen leans toward the pointer, as glass does toward a light
        if (pointer.placed && (Math.abs(pointer.rx - sheenX) > 0.5 || Math.abs(pointer.ry - sheenY) > 0.5)) {
          sheenX = pointer.rx;
          sheenY = pointer.ry;
          const g = el.glass.getBoundingClientRect();
          const r = root.getBoundingClientRect();
          const lx = Math.max(-40, Math.min(g.width + 40, pointer.rx - (g.left - r.left)));
          const ly = Math.max(-40, Math.min(g.height + 40, pointer.ry - (g.top - r.top)));
          el.glass.style.setProperty('--gx', `${lx.toFixed(0)}px`);
          el.glass.style.setProperty('--gy', `${ly.toFixed(0)}px`);
        }
      }

      // words step aside as the lens goes in: the rug outranks them
      const o = 1 - smoothstep(0.02, 0.26, live.zoom);
      if (Math.abs(o - storyOpacity) > 0.004) {
        storyOpacity = o;
        el.story.style.opacity = o.toFixed(3);
        el.story.style.visibility = o < 0.02 ? 'hidden' : 'visible';
      }
    };
    gsap.ticker.add(tick);

    return () => {
      disposed = true;
      window.clearTimeout(intent);
      gsap.ticker.remove(tick);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('click', onClick);
      root.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      intro?.kill();
      zoomTween?.kill();
      flipTl?.kill();
      lightTl?.kill();
      typeTl?.kill();
      gsap.killTweensOf(live);
      const lines = storyLines(root);
      const animated = [el.glass, el.brand, el.brandInner, el.mask, el.sound, el.piece, el.dark, el.hint, ...el.lines, ...el.words, ...lines];
      gsap.killTweensOf([el.veil, el.pulse, ...animated]);
      gsap.set(animated, { clearProps: 'all' });
      gsap.set(el.veil, { opacity: 1 });
      el.typed.textContent = '';
      root.dataset.phase = 'boot';
      root.dataset.dark = '0';
      sendRef.current = () => undefined;
    };
  }, [api, live, ready, reduced]);

  /* ---- the piece changed: its lines unfold, the way the cloth just did ---- */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || index === shownRef.current) return;
    shownRef.current = index;
    storyIn(root, dirRef.current, reduced, 0.05);
  }, [index, reduced]);

  const navigate = useCallback((dir: 1 | -1) => {
    audioRef.current?.arm();
    sendRef.current({ type: 'NAVIGATE', dir });
  }, []);

  const toggleAudio = useCallback(() => {
    setAudioOn((on) => {
      const next = !on;
      audioRef.current?.setEnabled(next);
      if (next) audioRef.current?.arm();
      return next;
    });
  }, []);

  const onReady = useCallback((world: WorldApi) => setApi(world), []);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // buy: first press puts the piece in the cart, a second goes to the cart
  const rug = RUGS[index];
  const inCart = cartItems.includes(rug.id);
  const buy = () => {
    if (inCart) router.push('/cart');
    else cart.add(rug.id);
  };

  return (
    <section
      ref={rootRef}
      className={styles.hero}
      data-phase="boot"
      data-view="INTRO"
      data-light="LIGHT_OFF"
      data-dark="0"
      data-menu={menuOpen ? '1' : '0'}
      data-cursor="none"
      data-cursor-on="0"
      aria-label="Nafis — fine Persian rugs"
    >
      {env &&
        (env.webgl ? (
          <Scene className={styles.scene} live={live} tier={env.tier} dpr={env.dpr} onReady={onReady} />
        ) : (
          <Fallback index={index} />
        ))}

      <div className={styles.veil} data-el="veil" />

      <div className={styles.chrome}>
        <Header
          audioOn={audioOn}
          onToggleAudio={toggleAudio}
          menuOpen={menuOpen}
          onMenu={openMenu}
          cartCount={cartItems.length}
          signedIn={signedIn}
        />
        <Story rug={rug} inCart={inCart} onBuy={buy} />
        <GlassControl index={index} onNavigate={navigate} />
      </div>

      <Menu open={menuOpen} onClose={closeMenu} cartCount={cartItems.length} signedIn={signedIn} />
      <DarkTitle />
      <Cursor />
    </section>
  );
}
