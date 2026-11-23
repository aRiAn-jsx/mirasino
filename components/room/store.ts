'use client';

/**
 * ONE STORE for the room: the arrangement (persisted) and the state of the
 * interface (not). React reads it through `useRoom(selector)`; the engine
 * subscribes and applies whatever changed. Nothing else holds a copy.
 *
 * The arrangement lives in localStorage, so a visitor who has rebuilt their
 * own living room finds it again next time. It is read in `hydrate()`, after
 * the first render, so the server's markup and the client's agree.
 */
import { useSyncExternalStore } from 'react';
import { PRODUCTS } from '@/components/site/catalog';
import {
  ITEMS,
  MOODS,
  ROOM_LIMITS,
  clampToRoom,
  defaultState,
  itemBox,
  presetPoses,
  rugBox,
  type ItemId,
  type PresetId,
  type RoomState,
  type StyleId,
} from './model';

export type Mode = 'view' | 'arrange';
export type ViewId = 'rug' | 'overview' | 'plan' | 'eye' | 'detail';
/** how much the graphics card is asked to do: everything it can, or what any machine can */
export type Quality = 'max' | 'normal';
export type Sheet = 'settings' | 'card' | null;
export type Panel = 'layout' | 'furniture' | 'room';
export type Selection = ItemId | 'rug' | null;

export interface UiState {
  mode: Mode;
  selected: Selection;
  hovered: Selection;
  view: ViewId;
  loupe: boolean;
  panel: Panel;
  phase: 'loading' | 'intro' | 'live';
  progress: number;
  /** a piece is being dragged, and whether where it is now is allowed */
  dragging: boolean;
  blocked: boolean;
  /** the rug is being rolled up / out */
  swapping: boolean;
  /** the arrangement panel, on a phone */
  drawer: boolean;
  /** the furniture stepped out of the way, so the whole rug can be seen */
  focus: boolean;
  quality: Quality;
  /** which sheet is up from the bottom, on a phone */
  sheet: Sheet;
}

export interface Snapshot {
  room: RoomState;
  ui: UiState;
}

const KEY = 'nafis.room.v3';
const QUALITY_KEY = 'nafis.room.quality';

/** a clamped position, without the clamp's own bookkeeping */
const at = ({ x, z }: { x: number; z: number }) => ({ x, z });

const initialUi: UiState = {
  mode: 'view',
  selected: null,
  hovered: null,
  view: 'rug',
  loupe: false,
  panel: 'layout',
  phase: 'loading',
  progress: 0,
  dragging: false,
  blocked: false,
  swapping: false,
  drawer: false,
  focus: false,
  quality: 'normal',
  sheet: null,
};

const serverSnapshot: Snapshot = { room: defaultState(), ui: initialUi };
let snap: Snapshot = serverSnapshot;

type Listener = (next: Snapshot, prev: Snapshot) => void;
const listeners = new Set<Listener>();

function emit(next: Snapshot) {
  const prev = snap;
  snap = next;
  for (const listener of listeners) listener(next, prev);
  if (next.room !== prev.room) persist();
}

let saveTimer = 0;
function persist() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(snap.room));
    } catch {
      /* private mode: the room lasts for this visit */
    }
  }, 350);
}

/** a stored room is accepted only if it still has the shape this version expects */
function valid(value: unknown): value is RoomState {
  if (!value || typeof value !== 'object') return false;
  const room = value as RoomState;
  return (
    room.v === 1 &&
    typeof room.w === 'number' &&
    typeof room.d === 'number' &&
    !!room.rug &&
    PRODUCTS.some((p) => p.id === room.rug.id) &&
    !!room.items &&
    MOODS.some((m) => m.id === room.mood) &&
    ITEMS.every(({ id }) => room.items[id] && typeof room.items[id].x === 'number')
  );
}

export const store = {
  get: () => snap,
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** read the saved room, the saved quality, and the ?rug= the visitor arrived with */
  hydrate(rugFromUrl: string | null | undefined, defaultQuality: Quality) {
    let room = defaultState();
    let quality = defaultQuality;
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (valid(parsed)) room = parsed;
      const q = window.localStorage.getItem(QUALITY_KEY);
      if (q === 'max' || q === 'normal') quality = q;
    } catch {
      /* nothing saved */
    }
    if (rugFromUrl && PRODUCTS.some((p) => p.id === rugFromUrl)) room = { ...room, rug: { ...room.rug, id: rugFromUrl } };
    emit({ room, ui: { ...snap.ui, quality } });
  },

  setQuality(quality: Quality) {
    try {
      window.localStorage.setItem(QUALITY_KEY, quality);
    } catch {
      /* remembered for this visit only */
    }
    store.ui({ quality });
  },

  /** the next or the previous piece in the collection */
  cycleRug(dir: 1 | -1) {
    const i = PRODUCTS.findIndex((p) => p.id === snap.room.rug.id);
    store.chooseRug(PRODUCTS[(i + dir + PRODUCTS.length) % PRODUCTS.length].id);
  },

  room(update: (room: RoomState) => RoomState) {
    const room = update(snap.room);
    if (room !== snap.room) emit({ ...snap, room });
  },

  ui(patch: Partial<UiState>) {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof UiState)[]) {
      if (snap.ui[key] !== patch[key]) changed = true;
    }
    if (changed) emit({ ...snap, ui: { ...snap.ui, ...patch } });
  },

  /* ---- intentions, named the way the interface talks about them ---- */

  chooseRug(id: string) {
    if (id === snap.room.rug.id) return;
    store.room((room) => {
      const next = { ...room.rug, id };
      return { ...room, rug: { ...next, ...at(clampToRoom(rugBox(next), room.w, room.d, false)) } };
    });
  },

  setStyle(style: StyleId) {
    store.room((room) => (room.style === style ? room : { ...room, style }));
  },

  applyPreset(preset: PresetId) {
    // the formal arrangement is the classic salon: it brings its own furniture
    if (preset === 'formal') store.setStyle('classic');
    store.room((room) => {
      const poses = presetPoses(preset, room.w, room.d);
      const items = { ...room.items };
      for (const { id } of ITEMS) {
        const pose = { ...items[id], ...poses.items[id] };
        items[id] = { ...pose, ...at(clampToRoom(itemBox(id, pose), room.w, room.d, false)) };
      }
      const rug = { ...room.rug, ...poses.rug };
      return { ...room, items, rug: { ...rug, ...at(clampToRoom(rugBox(rug), room.w, room.d, false)) } };
    });
  },

  /** resize the room; everything in it is kept inside the new walls */
  resize(w: number, d: number) {
    const W = Math.min(ROOM_LIMITS.w[1], Math.max(ROOM_LIMITS.w[0], w));
    const D = Math.min(ROOM_LIMITS.d[1], Math.max(ROOM_LIMITS.d[0], d));
    store.room((room) => {
      if (room.w === W && room.d === D) return room;
      const items = { ...room.items };
      for (const { id } of ITEMS) {
        const s = items[id];
        // things against a wall stay against it as the wall moves
        const sx = Math.abs(s.x) > room.w / 2 - 0.6 ? Math.sign(s.x) * (W / 2 - (room.w / 2 - Math.abs(s.x))) : s.x;
        const sz = Math.abs(s.z) > room.d / 2 - 0.6 ? Math.sign(s.z) * (D / 2 - (room.d / 2 - Math.abs(s.z))) : s.z;
        items[id] = { ...s, ...at(clampToRoom(itemBox(id, { ...s, x: sx, z: sz }), W, D, false)) };
      }
      return { ...room, w: W, d: D, items, rug: { ...room.rug, ...at(clampToRoom(rugBox(room.rug), W, D, false)) } };
    });
  },

  /** turn a piece (or the rug) about its centre; it is kept inside the walls */
  rotate(sel: Selection, delta: number) {
    if (!sel) return;
    store.room((room) => {
      if (sel === 'rug') {
        const rug = { ...room.rug, rot: room.rug.rot + delta };
        return { ...room, rug: { ...rug, ...at(clampToRoom(rugBox(rug), room.w, room.d, false)) } };
      }
      const s = { ...room.items[sel], rot: room.items[sel].rot + delta };
      return { ...room, items: { ...room.items, [sel]: { ...s, ...at(clampToRoom(itemBox(sel, s), room.w, room.d, false)) } } };
    });
  },

  /** move a piece by a few centimetres */
  nudge(sel: Selection, dx: number, dz: number) {
    if (!sel) return;
    store.room((room) => {
      if (sel === 'rug') {
        const rug = { ...room.rug, x: room.rug.x + dx, z: room.rug.z + dz };
        return { ...room, rug: { ...rug, ...at(clampToRoom(rugBox(rug), room.w, room.d, false)) } };
      }
      const s = { ...room.items[sel], x: room.items[sel].x + dx, z: room.items[sel].z + dz };
      return { ...room, items: { ...room.items, [sel]: { ...s, ...at(clampToRoom(itemBox(sel, s), room.w, room.d, false)) } } };
    });
  },

  setItem(id: ItemId, patch: Partial<RoomState['items'][ItemId]>) {
    store.room((room) => {
      const s = { ...room.items[id], ...patch };
      return { ...room, items: { ...room.items, [id]: { ...s, ...at(clampToRoom(itemBox(id, s), room.w, room.d, false)) } } };
    });
  },

  reset() {
    store.room((room) => defaultState(room.rug.id));
    store.ui({ selected: null });
  },
};

export function useRoom<T>(selector: (s: Snapshot) => T): T {
  return useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => selector(snap),
    () => selector(serverSnapshot),
  );
}
