'use client';

/**
 * THE ROOM — try a rug on the floor of a living room, at its true size, and
 * rearrange the room around it until it is your own.
 *
 * This component holds the page together: it reads what the device can do,
 * restores the visitor's last arrangement and their choice of graphics,
 * mounts the WebGL room (client only) and lays the interface over it.
 * Everything the interface changes goes through the store; the engine
 * listens. A change of graphics quality rebuilds the canvas — the room, the
 * view and the rug are all in the store, so the visitor lands where they were.
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Engine } from './engine/engine';
import { store, useRoom } from './store';
import { detectRoomEnv, tierFor, type RoomEnv } from './tiers';
import { ArrangePanel } from './ui/ArrangePanel';
import { Icon } from './ui/Icon';
import { Inspector } from './ui/Inspector';
import { RugCard, usePhone } from './ui/RugCard';
import { RugRail } from './ui/RugRail';
import { Settings } from './ui/Settings';
import { StageBar } from './ui/StageBar';
import { TopBar } from './ui/TopBar';
import styles from './room.module.css';

const RoomCanvas = dynamic(() => import('./RoomCanvas'), { ssr: false });

const HINTS = {
  view: ['بکشید تا دور فرش بچرخید', '← و → فرش‌ها را عوض می‌کنند', '«فقط فرش» اثاثیه را کنار می‌برد', 'ذره‌بین را روشن کنید و روی فرش ببرید'],
  arrange: ['هر چیز را بکشید و جابه‌جا کنید', 'R و E برای چرخش، Delete برای برداشتن', 'Alt را نگه دارید تا آزاد و بی‌شبکه جابه‌جا شود'],
};

export default function RoomExperience({ rug }: { rug: string | null }) {
  const [env, setEnv] = useState<RoomEnv | null>(null);
  const engine = useRef<Engine | null>(null);
  const inspector = useRef<HTMLDivElement>(null);
  const dimLength = useRef<HTMLSpanElement>(null);
  const dimWidth = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hint, setHint] = useState(0);
  const introPlayed = useRef(false);
  const phone = usePhone();

  const phase = useRoom((s) => s.ui.phase);
  const mode = useRoom((s) => s.ui.mode);
  const loupe = useRoom((s) => s.ui.loupe);
  const dragging = useRoom((s) => s.ui.dragging);
  const quality = useRoom((s) => s.ui.quality);
  const sheet = useRoom((s) => s.ui.sheet);
  const focus = useRoom((s) => s.ui.focus);

  useEffect(() => {
    const e = detectRoomEnv();
    store.hydrate(rug, e.suggested);
    setEnv(e);
  }, [rug]);

  const graphics = useMemo(() => (env ? tierFor(quality, env.small) : null), [env, quality]);

  const say = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((t) => (t === text ? null : t)), 2400);
  }, []);

  // a change of quality, once the room is up: say so, as the canvas is rebuilt
  const shownQuality = useRef(quality);
  useEffect(() => {
    if (shownQuality.current === quality) return;
    shownQuality.current = quality;
    if (introPlayed.current) say(quality === 'max' ? 'کیفیت گرافیک: حداکثر' : 'کیفیت گرافیک: معمولی');
  }, [quality, say]);

  // the hints take turns, quietly
  useEffect(() => {
    const id = window.setInterval(() => setHint((h) => h + 1), 5200);
    return () => window.clearInterval(id);
  }, []);

  /*
   * What the interface covers, edge by edge, so the engine can frame the room
   * in the rest. A panel narrower than half the frame covers the side it is
   * on; a wide one covers the top or the bottom.
   */
  useEffect(() => {
    const measure = () => {
      const el = root.current;
      if (!el) return;
      // the stack along the bottom, for what sits on top of it on a phone
      if (bottom.current) el.style.setProperty('--bottom-h', `${bottom.current.offsetHeight}px`);
      const e = engine.current;
      if (!e) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      const out = { left: 0, right: 0, top: 0, bottom: 0 };
      for (const node of el.querySelectorAll<HTMLElement>('[data-inset]')) {
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.top >= H - 2 || r.bottom <= 2) continue;
        if (r.width < W * 0.5 && r.height > H * 0.25) {
          if (r.left + r.width / 2 > W / 2) out.right = Math.max(out.right, W - r.left + 12);
          else out.left = Math.max(out.left, r.right + 12);
        } else if (r.top + r.height / 2 < H / 2) out.top = Math.max(out.top, r.bottom + 8);
        else out.bottom = Math.max(out.bottom, H - r.top + 8);
      }
      e.setInsets(out);
    };
    measure();
    const id = window.setInterval(measure, 300);
    return () => window.clearInterval(id);
  }, [env]);

  const onEngine = useCallback((e: Engine | null) => {
    engine.current = e;
    if (e) introPlayed.current = true;
    e?.bind({ inspector: inspector.current, dimLength: dimLength.current, dimWidth: dimWidth.current });
    if (process.env.NODE_ENV !== 'production') {
      // dev handle, as in the gallery: __room.store.ui({ view: 'plan' })
      (window as unknown as Record<string, unknown>).__room = { engine: e, store };
    }
  }, []);

  const shot = useCallback(async () => {
    const blob = await engine.current?.screenshot();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nafis-room.png';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    say('تصویر اتاق ذخیره شد');
  }, [say]);

  const hints = HINTS[mode];
  const hintText = focus
    ? 'اثاثیه کنار رفته؛ دوباره «فقط فرش» را بزنید تا برگردد'
    : loupe && mode === 'view'
      ? phone
        ? 'انگشت را روی فرش نگه دارید و بکشید'
        : 'چرخ ماوس روی فرش: بزرگ‌نمایی ذره‌بین'
      : hints[hint % hints.length];

  return (
    <div
      ref={root}
      className={styles.room}
      dir="rtl"
      lang="fa"
      data-phase={phase}
      data-mode={mode}
      data-dragging={dragging ? '1' : '0'}
      data-sheet={sheet ?? 'none'}
    >
      {env?.webgl && graphics && (
        <RoomCanvas
          key={quality}
          className={styles.canvas}
          tier={graphics.tier}
          dpr={graphics.dpr}
          reduced={env.reduced}
          intro={!introPlayed.current}
          onEngine={onEngine}
        />
      )}

      {env && !env.webgl && (
        <div className={styles.noGl}>
          <p>این مرورگر WebGL ندارد و اتاقِ سه‌بعدی در آن ساخته نمی‌شود.</p>
          <Link href="/shop" className={styles.primary}>
            دیدن فرش‌ها در فروشگاه
          </Link>
        </div>
      )}

      {/* things the engine pins to the room */}
      <div className={styles.pins} aria-hidden="true">
        <span ref={dimLength} className={styles.dim} />
        <span ref={dimWidth} className={styles.dim} />
      </div>
      <Inspector ref={inspector} pinned={phone} />

      <div className={styles.chrome}>
        <TopBar onShot={shot} />
        <RugCard />
        {mode === 'arrange' && <ArrangePanel />}
        {mode === 'arrange' && (
          <button type="button" className={`${styles.glass} ${styles.drawerButton}`} onClick={() => store.ui({ drawer: true })} data-ui>
            <Icon name="layout" size={16} />
            چیدمان و اتاق
          </button>
        )}
        <div className={styles.bottom} data-inset ref={bottom}>
          <p className={styles.hint} key={hintText} aria-live="polite">
            {hintText}
          </p>
          <StageBar />
          <RugRail />
        </div>
        <button type="button" className={styles.scrim} data-on={sheet ? '1' : '0'} onClick={() => store.ui({ sheet: null })} aria-label="بستن" tabIndex={-1} data-ui />
        <Settings onShot={shot} />
      </div>

      <div className={styles.loader} data-done={phase !== 'loading' ? '1' : '0'} aria-hidden={phase !== 'loading'}>
        <span className={styles.loaderMark} lang="en">
          Nafis
        </span>
        <span className={styles.loaderLine}>اتاق را می‌چینیم…</span>
        <i className={styles.loaderBar} />
      </div>

      {phase === 'intro' && (
        <button type="button" className={styles.skip} onClick={() => engine.current?.skipIntro()}>
          رد شدن
        </button>
      )}

      <p className={styles.toast} data-on={toast ? '1' : '0'} role="status">
        {toast}
      </p>
    </div>
  );
}
