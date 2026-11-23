/**
 * Ground truth for the composition. Everything is in metres / degrees and is
 * deliberately free of three.js imports so the no-WebGL fallback can share it.
 *
 * World frame: floor is y = 0, +x is screen-right, +z points at the viewer.
 *
 * THE GALLERY. A long white hall. The pieces hang in a row on its back wall,
 * each on a rod, each under its own track light; in front of them runs a
 * shallow black pool — a hoz, as in a Persian courtyard — that holds their
 * reflections and answers the pointer. The visitor stands across the pool
 * from one piece at a time and walks along the hall to the next.
 *
 * (STAGE, COLUMNS and LAMP below belong to the earlier dark room; nothing in
 * the gallery uses them.)
 */

/* ------------------------------------------------------------------ palette */

export const PALETTE = {
  black: ['#080808', '#0B0B0E', '#0E1013'],
  graphite: ['#1A1C20', '#22252A', '#2E3238'],
  silver: ['#6B7079', '#A8ADB5', '#D5D8DD'],
  coolWhite: '#F4F6F8',
} as const;

/* --------------------------------------------------------------------- rug */

/** Source photo, pixels, top-left origin. `body` is the knotted field without fringe. */
export const RUG_IMAGE = {
  w: 2000,
  h: 1117,
  body: { x0: 180, y0: 128, x1: 1820, y1: 992 },
} as const;

/** The brief asks for ≈3.0 × 2.0 m; the supplied piece is 1.9 : 1, so the long side is the anchor. */
const BODY_WIDTH = 3.0;
const MPP = BODY_WIDTH / (RUG_IMAGE.body.x1 - RUG_IMAGE.body.x0);

/**
 * The stage: a round plinth of pale grey stone on the floor, directly beneath
 * the floating rug. Two tiers — a base ring and a narrower upper drum that
 * overhangs a shadow gap, so the top reads as hovering. Nothing stands behind
 * the rug.
 */
export const STAGE = {
  /** base tier radius / height */
  radius: 1.86,
  baseHeight: 0.075,
  /** upper tier radius, and the height of its top above the floor */
  upper: 1.68,
  height: 0.215,
  /** the shadow gap between the tiers */
  gap: 0.036,
} as const;

export const RUG = {
  metresPerKnot: MPP, // one source texel == one knot
  planeW: RUG_IMAGE.w * MPP,
  planeD: RUG_IMAGE.h * MPP,
  bodyHalfX: BODY_WIDTH / 2,
  /** half-height of the hung body (the name is the rug's own "depth" axis) */
  bodyHalfZ: ((RUG_IMAGE.body.y1 - RUG_IMAGE.body.y0) * MPP) / 2,
  /** u0, v0, u1, v1 of the body with v pointing up */
  bodyUv: [
    RUG_IMAGE.body.x0 / RUG_IMAGE.w,
    1 - RUG_IMAGE.body.y1 / RUG_IMAGE.h,
    RUG_IMAGE.body.x1 / RUG_IMAGE.w,
    1 - RUG_IMAGE.body.y0 / RUG_IMAGE.h,
  ] as [number, number, number, number],
  /** the rug floats upright in the plane z = 0; this is the height of its centre */
  z: 0,
  cy: 1.5,
  knotsPerTile: 8,
} as const;

/* ----------------------------------------------------------------- columns */

/**
 * Persepolis columns, complete and in frame: a stepped base, a stout shaft cut
 * with sixteen flutes and tapering a little toward the top, ringed necking, and
 * the double-protome capital — two Homa (griffin) foreparts back to back with
 * the rosette block between them. Every height, and the reach of the capital,
 * is a multiple of `module`; the column stands about 7.4 modules tall. What is
 * measured across it follows `diameter`, the girth of the shaft at its foot.
 */
export const COLUMNS = {
  /** either side of the rug, a metre behind its plane — beside it, never touching */
  x: 2.46,
  z: -1.0,
  module: 0.385,
  diameter: 0.45,
  /** how much of its girth the shaft loses by the top */
  taper: 0.07,
  flutes: 16,
} as const;

export const WALL_Z = -5;

/* ----------------------------------------------------------------- gallery */

export const GALLERY = {
  /** metres between the centres of neighbouring pieces on the wall */
  spacing: 5.6,
  /** the wall the pieces hang on, a hand's breadth behind them */
  wallZ: -0.1,
  /** height of the ceiling; the track runs along it */
  ceiling: 3.42,
  /** the pool: from just in front of the wall toward the visitor, and how far it runs past the end pieces */
  pool: { z0: 0.55, z1: 5.4, overrun: 4.4 },
  /** the track lights: where each head hangs (in front of the wall, below the ceiling) and where it points */
  light: {
    y: 3.02,
    z: 1.55,
    /** aimed a little below the middle of the piece, so the pool of light sits on it, not above it */
    aimY: 1.36,
    angle: 0.75,
    penumbra: 0.5,
    /** candela */
    intensity: 48,
    /** neutral gallery white, the faintest warmth */
    color: [1.0, 0.975, 0.94] as [number, number, number],
    hitRadius: 0.34,
  },
  /** benches in the hall, between the pieces, the visitor's side of the pool */
  bench: { z: 6.3, width: 1.9, depth: 0.5, height: 0.44 },
} as const;

/** where piece i hangs along the wall */
export const pieceX = (i: number) => i * GALLERY.spacing;

/* -------------------------------------------------------------------- lamp */

export const LAMP = {
  /** yoke pivot: above-left and well in front of the rug, so the light rakes across the pile;
   *  placed to hang clear of the left capital, over the rug's upper corner */
  pivot: [-1.02, 2.64, 2.6] as [number, number, number],
  /** where the optical axis lands — right of and below centre, evening out the fall-off */
  aim: [0.35, 1.4, RUG.z] as [number, number, number],
  scale: 1.45,
  /** half-angle (rad) and three.js penumbra fraction */
  angle: 0.85,
  penumbra: 0.9,
  /** candela */
  intensity: 46,
  /** ≈5600 K */
  color: [0.93, 0.962, 1.0] as [number, number, number],
  hitRadius: 0.3,
} as const;

/* ------------------------------------------------------------------ camera */

export interface Layout {
  fovY: number;
  dist: number;
  /** camera above (+) the look-at point, degrees */
  pitch: number;
  yaw: number;
  look: [number, number, number];
}

const DEG = Math.PI / 180;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Frames narrower than 23 : 20 stack the text beneath the piece and lay the
 * dial in the bottom edge. The same query is written out in hero.module.css.
 */
export const STACK_QUERY = '(max-aspect-ratio: 23 / 20)';

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 42 mm on a 36 mm gate → 46.4° horizontal. The camera faces the rug square-on
 * (it is a picture on a wall) from slightly above, so the black liquid of the
 * floor, and what it reflects, hold the bottom of the frame.
 *
 *  · Wide frames: the look-at point is shifted right of the rug, so the piece
 *    sits left of centre and leaves the right of the frame to the text. The
 *    lens is wide enough that both columns stand clear between the dial and
 *    the text even on a small landscape window, and that the floor in front
 *    of the plinth keeps its share of a short, wide one.
 *  · Squarer and portrait frames: the piece is centred and raised into the
 *    upper part of the frame; the floor below it carries the text. The lens
 *    is chosen to keep the columns in frame while there is room for them, and
 *    just the glass plate once there is not (phones).
 */
export function layoutFor(aspect: number): Layout {
  const HFOV = 46.4;
  const fovWide =
    (2 * Math.atan(Math.tan((HFOV / 2) * DEG) / Math.min(Math.max(aspect, 1.15), 16 / 9))) / DEG;
  // wide frames are short ones: the camera looks a little lower there
  const lookY = mix(1.25, 1.15, sstep(1.3, 16 / 9, aspect));
  // the same threshold as STACK_QUERY: the camera and the page change places together
  if (aspect >= 23 / 20) return { fovY: fovWide, dist: 9.47, pitch: 5, yaw: 0, look: [0.36, lookY, 0] };

  // stacked: what half-width must stay in frame at the plane of the rug? Chosen so
  // the scene takes the same share of the frame's height whatever its shape — from
  // about a sixth of the way down to the middle — and the text beneath never
  // lands on the pale plinth. Phones get the rug edge to edge; by the time the
  // frame is square both columns are in.
  const keep = Math.min(4.1, Math.max(2.02, 3.9 * aspect));
  const dist = mix(10.6, 9.8, sstep(0.6, 1.2, aspect));
  const fovY = Math.min(50, (2 * Math.atan(keep / dist / aspect)) / DEG);
  const halfH = dist * Math.tan((fovY / 2) * DEG);
  return {
    fovY,
    dist,
    pitch: mix(9, 6, sstep(0.6, 1.2, aspect)),
    yaw: 0,
    // top of the rug rests about a quarter of the way down the frame: the header and, under it, the
    // lamp above it, the reflection and the sheet below
    look: [0, 2.34 - 0.54 * halfH, 0],
  };
}

export const ZOOM = {
  /** camera-to-pile distance at full depth: frame ≈ 16 mm wide ≈ 9 knots */
  minDist: 0.023,
  /** where the arm ends up relative to the hovered knot: above and to the right, looking back up the light */
  pitch: 20,
  yaw: 16,
  inDuration: 2.5,
  outDuration: 1.8,
  /** static close-up used by the reduced-motion variant (weave level) */
  reducedDepth: 0.66,
} as const;

/* --------------------------------------------------------------- parallax */

/**
 * Section 16 of the brief. Pixels of travel at factor 1.0, and per-layer
 * factors. Horizontal travel slides each layer along the floor; vertical
 * travel is a true camera pedestal (sized so the rug moves by `hero`), because
 * a stele that stands on the floor cannot be slid up and down.
 */
export const PARALLAX_PX = 20;
export const PARALLAX = {
  background: 0.1,
  atmosphere: 0.2,
  light: 0.15,
  architecture: 0.3,
  hero: 0.5,
  reflection: 0.4,
  glass: 0.05,
  text: 0.08,
} as const;

/* -------------------------------------------------------------------- rugs */

export interface RugEntry {
  id: string;
  index: string;
  /** Latin label for assistive text and the fallback */
  name: string;
  /** Persian copy shown beside the piece */
  fa: {
    origin: string;
    title: string;
    lines: [string, string, string];
    specs: [string, string, string];
  };
  texture: string;
  mask: string;
  poster: string;
  /** small image for the collection dial */
  thumb: string;
  /**
   * Dye remap: source colours (burgundy field, gold, blue) → target colours.
   * null leaves the photograph untouched.
   */
  dyes: null | { from: [string, string, string]; to: [string, string, string] };
  /** css filter used only by the no-WebGL fallback */
  fallbackFilter: string;
}

const SOURCE_DYES: [string, string, string] = ['#450b13', '#c79d62', '#40598c'];

/**
 * One photograph was supplied. Pieces 02–05 are the same weave re-dyed in the
 * shader, and all of their copy is placeholder;
 * replace `texture`/`mask`/`fa` with the real pieces and set `dyes: null`.
 */
export const RUGS: RugEntry[] = [
  {
    id: 'kashan-oxblood',
    index: '01',
    name: 'Kashan · Oxblood',
    fa: {
      origin: 'کاشان',
      title: 'کاشانِ لاکی',
      lines: [
        'زمینه‌ی لاکیِ سیر با قاب‌های افشان،',
        'گل‌های شاه‌عباسی و اسلیمی‌های زرین',
        'که رج به رج با دست گره خورده‌اند.',
      ],
      specs: ['کرک و ابریشم', '۳۰۰ × ۱۵۸ سانتی‌متر', 'گره‌ی فارسی، ۵۰ رج'],
    },
    texture: '/textures/rug-01.webp',
    mask: '/textures/rug-01-mask.png',
    poster: '/textures/rug-01-poster.webp',
    thumb: '/textures/rug-01-thumb.webp',
    dyes: null,
    fallbackFilter: 'none',
  },
  {
    id: 'kashan-indigo',
    index: '02',
    name: 'Kashan · Indigo',
    fa: {
      origin: 'کاشان',
      title: 'کاشانِ سرمه‌ای',
      lines: [
        'همان نقشِ قابی، این بار بر زمینه‌ی نیل؛',
        'آبیِ ژرفی که نقش‌های استخوانی',
        'را آرام از دلِ تاریکی بیرون می‌کشد.',
      ],
      specs: ['کرک و ابریشم', '۳۰۰ × ۱۵۸ سانتی‌متر', 'رنگرزیِ گیاهی، نیل'],
    },
    texture: '/textures/rug-01.webp',
    mask: '/textures/rug-01-mask.png',
    poster: '/textures/rug-01-poster.webp',
    thumb: '/textures/rug-01-thumb.webp',
    dyes: { from: SOURCE_DYES, to: ['#161d33', '#d9d2c1', '#6b2028'] },
    fallbackFilter: 'hue-rotate(215deg) saturate(0.7)',
  },
  {
    id: 'tabriz-graphite',
    index: '03',
    name: 'Tabriz · Graphite',
    fa: {
      origin: 'تبریز',
      title: 'تبریزِ دودی',
      lines: [
        'خاکستریِ دودی و استخوانی، بی‌هیاهو؛',
        'قالیچه‌ای برای فضاهای امروزی',
        'که ریشه‌اش هنوز در دارِ تبریز است.',
      ],
      specs: ['کرکِ مرینوس', '۳۰۰ × ۱۵۸ سانتی‌متر', 'گره‌ی ترکی، ۵۰ رج'],
    },
    texture: '/textures/rug-01.webp',
    mask: '/textures/rug-01-mask.png',
    poster: '/textures/rug-01-poster.webp',
    thumb: '/textures/rug-01-thumb.webp',
    dyes: { from: SOURCE_DYES, to: ['#1d1f24', '#e3ddd0', '#2a3352'] },
    fallbackFilter: 'grayscale(0.85) contrast(1.05)',
  },
  {
    id: 'isfahan-saffron',
    index: '04',
    name: 'Isfahan · Saffron',
    fa: {
      origin: 'اصفهان',
      title: 'اصفهانِ زعفرانی',
      lines: [
        'زمینه‌ای به رنگِ زعفران و کهربا،',
        'ترنج‌های استخوانی و حاشیه‌ای سبزآبی',
        'که در نورِ عصر گرم‌تر می‌شود.',
      ],
      specs: ['کرک و ابریشم', '۳۰۰ × ۱۵۸ سانتی‌متر', 'گره‌ی فارسی، ۶۰ رج'],
    },
    texture: '/textures/rug-01.webp',
    mask: '/textures/rug-01-mask.png',
    poster: '/textures/rug-01-poster.webp',
    thumb: '/textures/rug-01-thumb.webp',
    dyes: { from: SOURCE_DYES, to: ['#7a4510', '#efe3c8', '#1e4650'] },
    fallbackFilter: 'sepia(0.55) hue-rotate(-14deg) saturate(1.35) brightness(1.04)',
  },
  {
    id: 'nain-turquoise',
    index: '05',
    name: 'Nain · Turquoise',
    fa: {
      origin: 'نائین',
      title: 'نائینِ فیروزه‌ای',
      lines: [
        'فیروزه‌ای و شیری، با رگه‌هایی از زنگار؛',
        'ریزبافتِ نائین با گره‌هایی چنان ریز',
        'که نقش، چون نقاشی، بی‌پله دیده می‌شود.',
      ],
      specs: ['کرک و ابریشم', '۳۰۰ × ۱۵۸ سانتی‌متر', 'گره‌ی فارسی، ۷۰ رج'],
    },
    texture: '/textures/rug-01.webp',
    mask: '/textures/rug-01-mask.png',
    poster: '/textures/rug-01-poster.webp',
    thumb: '/textures/rug-01-thumb.webp',
    dyes: { from: SOURCE_DYES, to: ['#0f4a53', '#e9e1d2', '#8b2f2a'] },
    fallbackFilter: 'hue-rotate(158deg) saturate(0.85) brightness(1.02)',
  },
];

/** Shown alone, typed out, when the lamp is switched off. */
export const DARK_TITLE = 'فرش نفیس';

/* ----------------------------------------------------------------- quality */

export interface Tier {
  name: 'high' | 'lite' | 'medium' | 'low';
  /** hard cap on rendered megapixels */
  maxPixels: number;
  maxDpr: number;
  msaa: number;
  shadowSize: number;
  mirrorScale: number;
  dofTaps: number;
  beamSteps: number;
  dust: number;
  rugSegments: [number, number];
  bloom: boolean;
  anisotropy: number;
  /** re-render the floor mirror / the shadow map every n-th frame while nothing is moving */
  mirrorEvery: number;
  shadowEvery: number;
}

/** renderer strings (WEBGL_debug_renderer_info) that should start on the lite tier */
export const WEAK_GPU = /Intel\(R\) (HD|UHD) Graphics|Intel.*Iris(?!.*Xe)|Mali|Adreno \(TM\) [3-5]\d\d|PowerVR|SwiftShader|llvmpipe|Basic Render/i;

export const TIERS: Record<Tier['name'], Tier> = {
  high: {
    name: 'high',
    maxPixels: 4.2e6,
    maxDpr: 2,
    msaa: 4,
    shadowSize: 2048,
    mirrorScale: 0.5,
    dofTaps: 22,
    beamSteps: 14,
    dust: 520,
    rugSegments: [220, 124],
    bloom: true,
    anisotropy: 16,
    mirrorEvery: 1,
    shadowEvery: 2,
  },
  // desktop integrated graphics (Intel HD / UHD class): same picture, a third of the work
  lite: {
    name: 'lite',
    maxPixels: 0.8e6,
    maxDpr: 1,
    msaa: 2,
    shadowSize: 1024,
    mirrorScale: 0.42,
    dofTaps: 8,
    beamSteps: 6,
    dust: 240,
    rugSegments: [140, 80],
    bloom: false,
    anisotropy: 8,
    mirrorEvery: 2,
    shadowEvery: 4,
  },
  medium: {
    name: 'medium',
    maxPixels: 1.9e6,
    maxDpr: 1.6,
    msaa: 2,
    shadowSize: 1024,
    mirrorScale: 0.4,
    dofTaps: 10,
    beamSteps: 8,
    dust: 180,
    rugSegments: [120, 68],
    bloom: true,
    anisotropy: 8,
    mirrorEvery: 2,
    shadowEvery: 3,
  },
  // keeps the pool of light; drops the marched beam, depth of field, bloom and accents
  low: {
    name: 'low',
    maxPixels: 1.1e6,
    maxDpr: 1.25,
    msaa: 0,
    shadowSize: 1024,
    mirrorScale: 0.3,
    dofTaps: 0,
    beamSteps: 0,
    dust: 90,
    rugSegments: [80, 46],
    bloom: false,
    anisotropy: 4,
    mirrorEvery: 3,
    shadowEvery: 6,
  },
};
