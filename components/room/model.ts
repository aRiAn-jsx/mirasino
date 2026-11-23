/**
 * THE ROOM, AS NUMBERS — no three.js in here, so the panels, the store and the
 * engine all read the same truth.
 *
 * World frame: the floor is y = 0, the room is centred on the origin, x runs
 * across its width and z along its depth. The window wall is at z = −d/2; the
 * fluted wall, where the console usually stands, at x = −w/2.
 *
 * Every piece of furniture is authored facing +z (its "front"), standing on
 * its footprint centre. `rot` turns it about y: rot = π/2 faces +x.
 *
 * A rug is laid with its length along its local x.
 */
import { PRODUCTS, type Product } from '@/components/site/catalog';

/* ------------------------------------------------------------- furniture */

export type ItemKind = 'sofa' | 'armchair' | 'coffeeTable' | 'sideTable' | 'console' | 'floorLamp' | 'plant' | 'pouf';
export type ItemId = 'sofa' | 'chairA' | 'chairB' | 'table' | 'side' | 'console' | 'lamp' | 'plant' | 'pouf';

export interface ItemDef {
  kind: ItemKind;
  label: string;
  /** footprint width (local x) and depth (local z), and height, in metres */
  w: number;
  d: number;
  h: number;
  /** upholstered: the fabric can be changed */
  fabric: boolean;
  /** somewhere to sit: its front legs belong on the rug */
  seat: boolean;
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  sofa: { kind: 'sofa', label: 'مبل سه‌نفره', w: 2.4, d: 0.98, h: 0.8, fabric: true, seat: true },
  armchair: { kind: 'armchair', label: 'صندلی راحتی', w: 0.86, d: 0.84, h: 0.72, fabric: true, seat: true },
  coffeeTable: { kind: 'coffeeTable', label: 'میز جلومبلی', w: 1.3, d: 0.72, h: 0.36, fabric: false, seat: false },
  sideTable: { kind: 'sideTable', label: 'میز کنار مبل', w: 0.46, d: 0.46, h: 0.52, fabric: false, seat: false },
  console: { kind: 'console', label: 'کنسول و تلویزیون', w: 2.1, d: 0.46, h: 0.5, fabric: false, seat: false },
  floorLamp: { kind: 'floorLamp', label: 'آباژور قوسی', w: 0.42, d: 0.42, h: 2.05, fabric: false, seat: false },
  plant: { kind: 'plant', label: 'درخت زیتون', w: 0.62, d: 0.62, h: 1.95, fabric: false, seat: false },
  pouf: { kind: 'pouf', label: 'پاف چرمی', w: 0.56, d: 0.56, h: 0.42, fabric: true, seat: false },
};

export const ITEMS: { id: ItemId; kind: ItemKind }[] = [
  { id: 'sofa', kind: 'sofa' },
  { id: 'chairA', kind: 'armchair' },
  { id: 'chairB', kind: 'armchair' },
  { id: 'table', kind: 'coffeeTable' },
  { id: 'side', kind: 'sideTable' },
  { id: 'console', kind: 'console' },
  { id: 'lamp', kind: 'floorLamp' },
  { id: 'plant', kind: 'plant' },
  { id: 'pouf', kind: 'pouf' },
];

export const kindOf = (id: ItemId) => ITEMS.find((item) => item.id === id)!.kind;
export const defOf = (id: ItemId) => ITEM_DEFS[kindOf(id)];

/**
 * The seating's style. Modern: low, deep, plain. Classic: the formal salon —
 * carved gilt frames, cabriole legs, buttoned backs. Each piece keeps its
 * footprint, so an arrangement holds whichever is chosen; only the height
 * (the classic back stands taller) changes.
 */
export const STYLES = [
  { id: 'modern', label: 'مدرن', note: 'کوتاه، عمیق، بی‌پیرایه' },
  { id: 'classic', label: 'کلاسیک', note: 'قاب طلاکوب، پشتی کاپیتونه، پایه‌ی خمیده' },
] as const;
export type StyleId = (typeof STYLES)[number]['id'];

/** the pieces that change with the style */
export const STYLED: ItemKind[] = ['sofa', 'armchair', 'coffeeTable'];
const CLASSIC_HEIGHT: Partial<Record<ItemKind, number>> = { sofa: 1.06, armchair: 1.02, coffeeTable: 0.47 };

export const heightOf = (id: ItemId, style: StyleId) => {
  const kind = kindOf(id);
  return (style === 'classic' && CLASSIC_HEIGHT[kind]) || ITEM_DEFS[kind].h;
};

/* --------------------------------------------------------------- finishes */

export const FABRICS = [
  { id: 'mocha', label: 'قهوه‌ای', color: '#5b4335' },
  { id: 'olive', label: 'زیتونی', color: '#4d5034' },
  { id: 'ivory', label: 'شیری', color: '#cfc4b2' },
  { id: 'navy', label: 'سرمه‌ای', color: '#1e2944' },
  { id: 'rust', label: 'آجری', color: '#7c3a24' },
  { id: 'ink', label: 'ذغالی', color: '#24221f' },
] as const;
export type FabricId = (typeof FABRICS)[number]['id'];

export const FLOORS = [
  { id: 'walnut', label: 'جناغیِ گردو', swatch: '#3b2619' },
  { id: 'oak', label: 'جناغیِ بلوط', swatch: '#8a6a4a' },
  { id: 'travertine', label: 'تراورتن', swatch: '#cbb79c' },
  { id: 'concrete', label: 'میکروسمان', swatch: '#5d5a56' },
] as const;
export type FloorId = (typeof FLOORS)[number]['id'];

export const WALLS = [
  { id: 'sand', label: 'شنی', swatch: '#a89a8a' },
  { id: 'charcoal', label: 'ذغالی', swatch: '#2a2826' },
  { id: 'clay', label: 'گِلی', swatch: '#6e5a4a' },
  { id: 'olive', label: 'زیتونی', swatch: '#44463a' },
  { id: 'ivory', label: 'شیری', swatch: '#d6cec1' },
] as const;
export type WallId = (typeof WALLS)[number]['id'];

/**
 * The light in the room. «Gallery» is the default: the room steps back into
 * shadow and the rug is lit the way a museum lights a piece.
 */
export const MOODS = [
  { id: 'gallery', label: 'گالری', note: 'نور متمرکز روی فرش' },
  { id: 'night', label: 'شب', note: 'نور گرم و آرام' },
  { id: 'day', label: 'روز', note: 'روشن و یکدست' },
] as const;
export type MoodId = (typeof MOODS)[number]['id'];

/* ------------------------------------------------------------------ state */

export interface ItemState {
  x: number;
  z: number;
  rot: number;
  on: boolean;
  fabric: FabricId;
}

export interface RugPlacement {
  id: string;
  x: number;
  z: number;
  rot: number;
}

export interface RoomState {
  v: 1;
  /** room width (x) and depth (z), metres */
  w: number;
  d: number;
  floor: FloorId;
  wall: WallId;
  mood: MoodId;
  /** the seating's style; absent in rooms saved before there was a choice */
  style?: StyleId;
  rug: RugPlacement;
  items: Record<ItemId, ItemState>;
}

export const ROOM_LIMITS = { w: [4, 8] as const, d: [3.6, 7] as const, height: 3.05 };

/* ---------------------------------------------------------------- presets */

export const PRESETS = [
  { id: 'conversation', label: 'گفت‌وگو', note: 'مبل و دو صندلی رو‌به‌روی هم' },
  { id: 'cinema', label: 'سینما', note: 'همه رو به تلویزیون' },
  { id: 'gallery', label: 'نمایش فرش', note: 'وسط اتاق خالی، فرش در قاب' },
  { id: 'minimal', label: 'مینیمال', note: 'فقط آنچه لازم است' },
  { id: 'formal', label: 'رسمی', note: 'مبل کلاسیک زیر تابلو، صندلی‌ها قرینه' },
] as const;
export type PresetId = (typeof PRESETS)[number]['id'];

const HALF_PI = Math.PI / 2;

type Pose = Partial<Pick<ItemState, 'x' | 'z' | 'rot' | 'on'>>;

/**
 * Where everything stands in each arrangement, worked out from the size of the
 * room so a preset still makes sense in a small flat or a large salon.
 */
export function presetPoses(preset: PresetId, w: number, d: number): { items: Record<ItemId, Pose>; rug: Pick<RugPlacement, 'x' | 'z' | 'rot'> } {
  const left = -w / 2;
  const right = w / 2;
  const back = -d / 2;
  const front = d / 2;
  const consoleX = left + ITEM_DEFS.console.d / 2 + 0.02;
  // the sofa faces the console across the room, but never further than a comfortable 4 m from the screen
  const sofaX = Math.min(right - ITEM_DEFS.sofa.d / 2 - 0.35, consoleX + 4.1);
  const tableX = sofaX - ITEM_DEFS.sofa.d / 2 - 0.42 - ITEM_DEFS.coffeeTable.d / 2;
  const spread = Math.min(1.42, d / 2 - 0.62);
  // the arc lamp stands past the end of the sofa, its shade over the chair there — never over the rug
  const lampZ = Math.min(2.0, d / 2 - 0.3);

  const corner = { plant: { x: right - 0.5, z: back + 0.5, rot: 0.6, on: true } };

  switch (preset) {
    case 'cinema':
      return {
        rug: { x: tableX + 0.12, z: 0, rot: HALF_PI },
        items: {
          console: { x: consoleX, z: 0, rot: HALF_PI, on: true },
          sofa: { x: sofaX, z: 0, rot: -HALF_PI, on: true },
          table: { x: tableX, z: 0, rot: HALF_PI, on: true },
          // either side of the sofa, turned in toward the screen
          chairA: { x: sofaX - 0.75, z: -Math.min(1.9, d / 2 - 0.55), rot: -HALF_PI + 0.5, on: true },
          chairB: { x: sofaX - 0.75, z: Math.min(1.9, d / 2 - 0.55), rot: -HALF_PI - 0.5, on: true },
          side: { x: sofaX + 0.05, z: -1.52, rot: 0, on: false },
          lamp: { x: sofaX + 0.32, z: lampZ, rot: -HALF_PI - 0.25, on: true },
          pouf: { x: tableX - 0.95, z: 0.95, rot: 0, on: false },
          ...corner,
        },
      };
    case 'gallery':
      // the room cleared to the walls, so the piece on the floor is the event
      return {
        rug: { x: 0, z: 0.1, rot: 0 },
        items: {
          console: { x: consoleX, z: 0, rot: HALF_PI, on: true },
          sofa: { x: 0, z: back + ITEM_DEFS.sofa.d / 2 + 0.25, rot: 0, on: true },
          table: { x: 0, z: 0, rot: 0, on: false },
          chairA: { x: right - 0.7, z: front - 0.75, rot: -2.4, on: true },
          chairB: { x: right - 0.7, z: -0.4, rot: -HALF_PI - 0.4, on: false },
          side: { x: right - 1.2, z: front - 0.45, rot: 0, on: true },
          lamp: { x: -1.55, z: back + 0.45, rot: 0.2, on: true },
          pouf: { x: 0, z: 0, rot: 0, on: false },
          ...corner,
        },
      };
    case 'formal': {
      // the salon: the sofa beneath the painting on the right wall, the table before it,
      // the two chairs facing each other across the table — everything on one axis
      const axisZ = -0.15;
      const fSofaX = right - ITEM_DEFS.sofa.d / 2 - 0.1;
      const fTableX = fSofaX - ITEM_DEFS.sofa.d / 2 - 0.45 - ITEM_DEFS.coffeeTable.d / 2;
      const fSpread = Math.min(1.3, d / 2 - 0.6);
      return {
        rug: { x: fTableX + 0.15, z: axisZ, rot: HALF_PI },
        items: {
          console: { x: consoleX, z: 0, rot: HALF_PI, on: true },
          sofa: { x: fSofaX, z: axisZ, rot: -HALF_PI, on: true },
          table: { x: fTableX, z: axisZ, rot: HALF_PI, on: true },
          chairA: { x: fTableX + 0.05, z: axisZ - fSpread, rot: 0, on: true },
          chairB: { x: fTableX + 0.05, z: axisZ + fSpread, rot: Math.PI, on: true },
          side: { x: fSofaX + 0.02, z: axisZ - 1.5, rot: 0, on: true },
          lamp: { x: fSofaX + 0.32, z: lampZ, rot: -HALF_PI - 0.25, on: false },
          pouf: { x: fTableX - 1.0, z: axisZ, rot: 0, on: false },
          plant: { x: right - 0.5, z: back + 0.5, rot: 0.6, on: true },
        },
      };
    }
    case 'minimal':
      return {
        rug: { x: tableX + 0.1, z: 0, rot: HALF_PI },
        items: {
          console: { x: consoleX, z: 0, rot: HALF_PI, on: true },
          sofa: { x: sofaX, z: 0, rot: -HALF_PI, on: true },
          table: { x: tableX, z: 0, rot: HALF_PI, on: true },
          chairA: { x: tableX, z: -spread, rot: 0, on: false },
          chairB: { x: tableX, z: spread, rot: Math.PI, on: false },
          side: { x: sofaX, z: -1.52, rot: 0, on: false },
          lamp: { x: sofaX + 0.32, z: lampZ, rot: -HALF_PI - 0.25, on: true },
          pouf: { x: tableX - 0.9, z: 0.9, rot: 0, on: false },
          ...corner,
        },
      };
    case 'conversation':
    default:
      return {
        rug: { x: tableX + 0.18, z: 0, rot: HALF_PI },
        items: {
          console: { x: consoleX, z: 0, rot: HALF_PI, on: true },
          sofa: { x: sofaX, z: 0, rot: -HALF_PI, on: true },
          table: { x: tableX, z: 0, rot: HALF_PI, on: true },
          chairA: { x: tableX - 0.05, z: -spread, rot: 0.12, on: true },
          chairB: { x: tableX - 0.05, z: spread, rot: Math.PI - 0.12, on: true },
          side: { x: sofaX + 0.04, z: -1.5, rot: 0, on: true },
          lamp: { x: sofaX + 0.32, z: lampZ, rot: -HALF_PI - 0.25, on: true },
          pouf: { x: tableX - 1.05, z: 0.55, rot: 0, on: false },
          ...corner,
        },
      };
  }
}

export const DEFAULT_RUG = PRODUCTS[0].id;

export function defaultState(rugId: string = DEFAULT_RUG): RoomState {
  const w = 6.2;
  const d = 5.2;
  const poses = presetPoses('conversation', w, d);
  const items = {} as Record<ItemId, ItemState>;
  for (const { id, kind } of ITEMS) {
    const pose = poses.items[id];
    items[id] = {
      x: pose.x ?? 0,
      z: pose.z ?? 0,
      rot: pose.rot ?? 0,
      on: pose.on ?? true,
      // muted, deep colours by default: the rug is the brightest thing in the room
      fabric: kind === 'pouf' ? 'rust' : kind === 'armchair' ? 'olive' : 'mocha',
    };
  }
  return { v: 1, w, d, floor: 'walnut', wall: 'sand', mood: 'gallery', style: 'modern', rug: { id: rugId, ...poses.rug }, items };
}

/* -------------------------------------------------------------- rug sizes */

const FA = '۰۱۲۳۴۵۶۷۸۹';
const latin = (s: string) => s.replace(/[۰-۹]/g, (c) => String(FA.indexOf(c)));

/** "۳۰۰ × ۱۵۸ سانتی‌متر" → { length: 3.0, width: 1.58 } in metres, length the longer */
export function rugSize(product: Pick<Product, 'size'>): { length: number; width: number } {
  const numbers = latin(product.size).match(/\d+(\.\d+)?/g)?.map(Number) ?? [300, 158];
  const [a, b] = [numbers[0] ?? 300, numbers[1] ?? numbers[0] ?? 158];
  return { length: Math.max(a, b) / 100, width: Math.min(a, b) / 100 };
}

/* -------------------------------------------------------------- footprints */

export interface Box {
  x: number;
  z: number;
  /** half extents along the box's own axes */
  hw: number;
  hd: number;
  rot: number;
}

export const itemBox = (id: ItemId, s: Pick<ItemState, 'x' | 'z' | 'rot'>): Box => {
  const def = defOf(id);
  return { x: s.x, z: s.z, hw: def.w / 2, hd: def.d / 2, rot: s.rot };
};

export const rugBox = (rug: RugPlacement): Box => {
  const product = PRODUCTS.find((p) => p.id === rug.id) ?? PRODUCTS[0];
  const { length, width } = rugSize(product);
  return { x: rug.x, z: rug.z, hw: length / 2, hd: width / 2, rot: rug.rot };
};

/** the box's own axes in world space: local +x and local +z */
function axes(b: Box) {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  // three.js y-rotation: local x → (cos, −sin), local z → (sin, cos) in (x, z)
  return { ax: [c, -s] as const, az: [s, c] as const };
}

/** world-space point at local (lx, lz) of the box */
export function boxPoint(b: Box, lx: number, lz: number): [number, number] {
  const { ax, az } = axes(b);
  return [b.x + ax[0] * lx + az[0] * lz, b.z + ax[1] * lx + az[1] * lz];
}

export const corners = (b: Box) => [
  boxPoint(b, -b.hw, -b.hd),
  boxPoint(b, b.hw, -b.hd),
  boxPoint(b, b.hw, b.hd),
  boxPoint(b, -b.hw, b.hd),
];

/** half extents of the box's axis-aligned bound */
export function aabbHalf(b: Box): [number, number] {
  const c = Math.abs(Math.cos(b.rot));
  const s = Math.abs(Math.sin(b.rot));
  return [c * b.hw + s * b.hd, s * b.hw + c * b.hd];
}

/** separating-axis test for two boxes on the floor; `pad` shrinks both a little so touching is allowed */
export function overlaps(a: Box, b: Box, pad = 0.015): boolean {
  const A = axes(a);
  const B = axes(b);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const axis of [A.ax, A.az, B.ax, B.az]) {
    const project = (box: Box, ax: { ax: readonly [number, number]; az: readonly [number, number] }) =>
      Math.abs(box.hw * (ax.ax[0] * axis[0] + ax.ax[1] * axis[1])) + Math.abs(box.hd * (ax.az[0] * axis[0] + ax.az[1] * axis[1]));
    const distance = Math.abs(dx * axis[0] + dz * axis[1]);
    if (distance >= project(a, A) + project(b, B) - pad * 2) return false;
  }
  return true;
}

export function contains(b: Box, x: number, z: number, inset = 0): boolean {
  const { ax, az } = axes(b);
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = dx * ax[0] + dz * ax[1];
  const lz = dx * az[0] + dz * az[1];
  return Math.abs(lx) <= b.hw - inset && Math.abs(lz) <= b.hd - inset;
}

/** distance from a point to the box (0 inside) */
export function distanceTo(b: Box, x: number, z: number): number {
  const { ax, az } = axes(b);
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = Math.max(Math.abs(dx * ax[0] + dz * ax[1]) - b.hw, 0);
  const lz = Math.max(Math.abs(dx * az[0] + dz * az[1]) - b.hd, 0);
  return Math.hypot(lx, lz);
}

const WALL_SNAP = 0.12;
const GAP = 0.012;

/**
 * Keep a box inside the room. Within a hand's breadth of a wall it is drawn
 * flush against it — furniture wants to stand against walls, and dragging
 * something exactly flush by hand is fiddly.
 */
export function clampToRoom(b: Box, w: number, d: number, snap = true): { x: number; z: number; snapped: boolean } {
  const [ex, ez] = aabbHalf(b);
  const minX = -w / 2 + ex + GAP;
  const maxX = w / 2 - ex - GAP;
  const minZ = -d / 2 + ez + GAP;
  const maxZ = d / 2 - ez - GAP;
  let x = minX > maxX ? 0 : Math.min(maxX, Math.max(minX, b.x));
  let z = minZ > maxZ ? 0 : Math.min(maxZ, Math.max(minZ, b.z));
  let snapped = false;
  if (snap) {
    if (x - minX < WALL_SNAP) (x = minX), (snapped = true);
    else if (maxX - x < WALL_SNAP) (x = maxX), (snapped = true);
    if (z - minZ < WALL_SNAP) (z = minZ), (snapped = true);
    else if (maxZ - z < WALL_SNAP) (z = maxZ), (snapped = true);
  }
  return { x, z, snapped };
}

/** which other pieces this one would stand inside */
export function collisions(state: RoomState, id: ItemId, pose: Pick<ItemState, 'x' | 'z' | 'rot'>): ItemId[] {
  const box = itemBox(id, pose);
  const hits: ItemId[] = [];
  for (const other of ITEMS) {
    if (other.id === id || !state.items[other.id].on) continue;
    if (overlaps(box, itemBox(other.id, state.items[other.id]))) hits.push(other.id);
  }
  return hits;
}

/* ------------------------------------------------------------ design guide */

export type Verdict = 'good' | 'fair' | 'poor';
export interface Check {
  id: string;
  verdict: Verdict;
  title: string;
  detail: string;
}

const cm = (m: number) => `${Math.round(m * 100)}`.replace(/\d/g, (c) => FA[Number(c)]);

/** what an interior designer would say about how this rug sits in this room */
export function designChecks(state: RoomState, rugOverride?: RugPlacement): Check[] {
  const rug = rugBox(rugOverride ?? state.rug);
  const checks: Check[] = [];

  // 1 · breathing room between the rug and the walls
  const wallGap = Math.min(
    ...corners(rug).flatMap(([x, z]) => [x + state.w / 2, state.w / 2 - x, z + state.d / 2, state.d / 2 - z]),
  );
  checks.push({
    id: 'walls',
    verdict: wallGap >= 0.25 ? 'good' : wallGap >= 0.1 ? 'fair' : 'poor',
    title: 'فاصله از دیوار',
    detail:
      wallGap >= 0.25
        ? `${cm(wallGap)} سانتی‌متر کفِ پیدا دورِ فرش؛ قاب کامل است.`
        : 'فرش به دیوار نزدیک است؛ دست‌کم ۲۵ سانتی‌متر کفِ پیدا بگذارید.',
  });

  // 2 · the front legs of every seat on the rug
  const seats = ITEMS.filter(({ id }) => defOf(id).seat && state.items[id].on);
  if (seats.length > 0) {
    const off = seats.filter(({ id }) => {
      const box = itemBox(id, state.items[id]);
      const legs = [boxPoint(box, -box.hw + 0.12, box.hd - 0.1), boxPoint(box, box.hw - 0.12, box.hd - 0.1)];
      return !legs.every(([x, z]) => contains(rug, x, z));
    });
    checks.push({
      id: 'seats',
      verdict: off.length === 0 ? 'good' : off.length < seats.length ? 'fair' : 'poor',
      title: 'پایه‌های جلویی',
      detail:
        off.length === 0
          ? 'پایه‌های جلوییِ همه‌ی نشیمن‌ها روی فرش‌اند؛ گروه یکپارچه دیده می‌شود.'
          : `پایه‌های جلوییِ ${off.map(({ id }) => defOf(id).label).join(' و ')} بیرون از فرش‌اند.`,
    });
  }

  // 3 · the coffee table wholly on the rug
  if (state.items.table.on) {
    const table = itemBox('table', state.items.table);
    const inside = corners(table).every(([x, z]) => contains(rug, x, z));
    checks.push({
      id: 'table',
      verdict: inside ? 'good' : 'poor',
      title: 'میز روی فرش',
      detail: inside ? 'میز جلومبلی کامل روی فرش نشسته است.' : 'میز جلومبلی تا لبه‌ی فرش بیرون زده است.',
    });

    // 4 · the reach from the sofa to the table
    if (state.items.sofa.on) {
      const sofa = itemBox('sofa', state.items.sofa);
      const [fx, fz] = boxPoint(sofa, 0, sofa.hd);
      const reach = distanceTo(table, fx, fz);
      checks.push({
        id: 'reach',
        verdict: reach >= 0.35 && reach <= 0.6 ? 'good' : reach >= 0.25 && reach <= 0.9 ? 'fair' : 'poor',
        title: 'دسترسی به میز',
        detail: `${cm(reach)} سانتی‌متر تا میز؛ ${reach < 0.35 ? 'برای پا کم است' : reach > 0.6 ? 'دست به میز نمی‌رسد' : 'اندازه‌ی ایده‌آل (۳۵ تا ۶۰)'}.`,
      });
    }
  }

  // 5 · the rug wider than the sofa it anchors
  if (state.items.sofa.on) {
    const sofa = state.items.sofa;
    const delta = rug.rot - sofa.rot;
    const span = Math.abs(Math.cos(delta)) * rug.hw * 2 + Math.abs(Math.sin(delta)) * rug.hd * 2;
    const extra = span - ITEM_DEFS.sofa.w;
    checks.push({
      id: 'scale',
      verdict: extra >= 0.2 ? 'good' : extra >= -0.3 ? 'fair' : 'poor',
      title: 'تناسب با مبل',
      detail:
        extra >= 0.2
          ? 'فرش از دو سوی مبل بیرون می‌زند؛ تناسب درست است.'
          : 'فرش از مبل باریک‌تر است؛ اندازه‌ای بزرگ‌تر یا چرخش ۹۰ درجه را امتحان کنید.',
    });
  }

  return checks;
}

export const score = (checks: Check[]) =>
  checks.length === 0 ? 1 : checks.reduce((sum, c) => sum + (c.verdict === 'good' ? 1 : c.verdict === 'fair' ? 0.5 : 0), 0) / checks.length;

/**
 * Would this rug suit the room as it is now? Tried where the current rug lies,
 * both ways round, and accepted if it fits inside the walls and scores well.
 */
export function suits(state: RoomState, product: Product): boolean {
  for (const rot of [state.rug.rot, state.rug.rot + HALF_PI]) {
    const placement = { id: product.id, x: state.rug.x, z: state.rug.z, rot };
    const checks = designChecks(state, placement);
    if (checks.some((c) => c.verdict === 'poor')) continue;
    if (score(checks) >= 0.8) return true;
  }
  return false;
}

export function cssPersian(n: number | string) {
  return String(n).replace(/\d/g, (c) => FA[Number(c)]);
}
