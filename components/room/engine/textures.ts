/**
 * PROCEDURAL SURFACES — every finish in the room is painted here, at load, on
 * a canvas. Nothing is downloaded, every surface tiles without a seam (the
 * noise is periodic on the tile), and each comes as two textures:
 *
 *   map    the colour, sRGB
 *   data   R = relief (for bumpMap), G = roughness (for roughnessMap)
 *
 * The floors are the most expensive (a million pixels each), so only the one
 * on show is ever painted; the rest wait until they are chosen.
 */
import * as THREE from 'three';
import type { FloorId } from '../model';

/* ------------------------------------------------------------------ noise */

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** value noise, periodic with period (px, py) lattice cells */
function vnoise(x: number, y: number, px: number, py: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px;
  const y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** fractal noise on a unit tile: (u, v) in 0‥1, base frequency f lattice cells per tile */
function fbm(u: number, v: number, f: number, octaves: number, seed: number) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = f;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(u * freq, v * freq, freq, freq, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** anisotropic periodic noise: different lattice counts along u and v */
function fbm2(u: number, v: number, fu: number, fv: number, octaves: number, seed: number) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0, k = 1; i < octaves; i++, k *= 2) {
    sum += amp * vnoise(u * fu * k, v * fv * k, fu * k, fv * k, seed + i * 17);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/* ---------------------------------------------------------------- canvases */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c: HTMLCanvasElement, srgb: boolean, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

export interface Surface {
  map: THREE.Texture;
  data: THREE.Texture;
  /** metres of floor / wall one tile covers */
  tile: number;
}

/** paint a pair of textures pixel by pixel; `fn` writes colour (0‥255) and relief/roughness (0‥1) */
function paint(
  size: number,
  tile: number,
  fn: (u: number, v: number, out: { r: number; g: number; b: number; h: number; rough: number }) => void,
): Surface {
  const cm = canvas(size, size);
  const cd = canvas(size, size);
  const im = cm.getContext('2d')!.createImageData(size, size);
  const id = cd.getContext('2d')!.createImageData(size, size);
  const out = { r: 0, g: 0, b: 0, h: 0, rough: 0 };
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      fn((x + 0.5) / size, v, out);
      const i = (y * size + x) * 4;
      im.data[i] = out.r;
      im.data[i + 1] = out.g;
      im.data[i + 2] = out.b;
      im.data[i + 3] = 255;
      id.data[i] = clamp01(out.h) * 255;
      id.data[i + 1] = clamp01(out.rough) * 255;
      id.data[i + 2] = 0;
      id.data[i + 3] = 255;
    }
  }
  cm.getContext('2d')!.putImageData(im, 0, 0);
  cd.getContext('2d')!.putImageData(id, 0, 0);
  return { map: toTexture(cm, true), data: toTexture(cd, false), tile };
}

/* ------------------------------------------------------------------ floors */

/**
 * Chevron parquet: planks n times as long as they are wide, laid at 45° in
 * columns that meet in a mitred point (Hungarian point). Four columns and two
 * runs of planks make one square tile, so it repeats without a seam.
 */
function chevron(size: number, palette: { base: string; light: string; dark: string; lacquer: number }) {
  const W = 0.09; // plank width, m
  const n = 7; // length / width
  const c = (n * W) / Math.SQRT2; // column width
  const p = W * Math.SQRT2; // plank pitch along a column
  const tile = 4 * c; // = 2 n p
  const rows = 2 * n;
  const base = rgb(palette.base);
  const light = rgb(palette.light);
  const dark = rgb(palette.dark);
  const phase = c % p;
  return paint(size, tile, (u, v, out) => {
    const X = u * tile;
    const Y = v * tile;
    const k = Math.floor(X / c);
    const xc = X - k * c;
    const odd = k & 1;
    const sgn = odd ? -1 : 1;
    const ph = odd ? phase : 0;
    const s = Y - sgn * xc + ph;
    const jRaw = Math.floor(s / p);
    const j = ((jRaw % rows) + rows) % rows;
    const across = (s - jRaw * p) / p; // 0‥1 across the plank
    const along = ((Y + sgn * xc) / Math.SQRT2 + (j * 0.37 + k * 0.61)) / (n * W); // plank lengths

    const r1 = hash(k, j, 11);
    const r2 = hash(k, j, 23);
    // grain: fine lines across the width, drifting slowly along the plank
    // `along` shifts by exactly 2 across the tile's edge, so every term below is periodic in 2
    const au = across + 0.06 * Math.sin(along * Math.PI * 2 + r1 * 9);
    const fine = vnoise(au * 34 + r2 * 50, along * 3, 1e9, 6, 3);
    const figure = vnoise(au * 7 + r1 * 20, along * 1.5, 1e9, 3, 5);
    const g = 0.55 * fine + 0.45 * figure;
    const tone = 0.78 + 0.44 * r1;
    const lineDark = smooth(0.62, 0.92, fine) * 0.35;

    // seams: plank edges and the mitre at the column boundary
    const edge = Math.min(across, 1 - across) * p;
    const mitre = Math.min(xc, c - xc) * Math.SQRT2;
    const seam = 1 - smooth(0.0004, 0.0016, Math.min(edge, mitre));

    let r = lerp(base[0], light[0], g * 0.6) * tone;
    let gg = lerp(base[1], light[1], g * 0.6) * tone;
    let b = lerp(base[2], light[2], g * 0.6) * tone;
    r = lerp(r, dark[0], lineDark + seam * 0.85);
    gg = lerp(gg, dark[1], lineDark + seam * 0.85);
    b = lerp(b, dark[2], lineDark + seam * 0.85);
    out.r = r;
    out.g = gg;
    out.b = b;
    out.h = 0.75 - seam * 0.75 - fine * 0.12;
    out.rough = palette.lacquer + 0.18 * fine + seam * 0.5 + (r2 - 0.5) * 0.08;
  });
}

function travertine(size: number) {
  // 60 × 120 cm tiles, two by one per tile of texture
  const tile = 1.2;
  const a = rgb('#cdb99d');
  const b = rgb('#a8916f');
  const pale = rgb('#e2d5c1');
  return paint(size, tile, (u, v, out) => {
    const X = u * 2;
    const Y = v * 1 + (Math.floor(X) % 2) * 0.5;
    const tx = X - Math.floor(X);
    const ty = Y - Math.floor(Y);
    const id = Math.floor(X) * 7 + Math.floor(Y);
    // layered bedding, stretched along the stone
    const band = fbm2(u + hash(id, 0, 3) * 0.3, v, 2, 18, 4, 7 + id);
    const cloud = fbm(u, v, 6, 4, 41);
    const pits = smooth(0.78, 0.9, vnoise(u * 160, v * 90, 160, 90, 9)) * smooth(0.45, 0.6, band);
    const grout = 1 - smooth(0.002, 0.006, Math.min(tx, 1 - tx, ty, 1 - ty) * 0.6);
    const t = smooth(0.25, 0.8, band);
    let r = lerp(a[0], b[0], t * 0.7);
    let g = lerp(a[1], b[1], t * 0.7);
    let bb = lerp(a[2], b[2], t * 0.7);
    r = lerp(r, pale[0], cloud * 0.35);
    g = lerp(g, pale[1], cloud * 0.35);
    bb = lerp(bb, pale[2], cloud * 0.35);
    const shade = 1 - pits * 0.45 - grout * 0.35;
    out.r = r * shade;
    out.g = g * shade;
    out.b = bb * shade;
    out.h = 0.8 - pits * 0.6 - grout * 0.8;
    out.rough = 0.42 + pits * 0.4 + grout * 0.3 + band * 0.08;
  });
}

function microcement(size: number) {
  const tile = 2.4;
  const a = rgb('#5f5b56');
  const b = rgb('#77726b');
  return paint(size, tile, (u, v, out) => {
    const cloud = fbm(u, v, 5, 5, 61);
    // trowel arcs: sweeping, overlapping
    const sweep = fbm2(u + cloud * 0.08, v, 3, 9, 3, 77);
    const fleck = vnoise(u * 400, v * 400, 400, 400, 5);
    const t = smooth(0.3, 0.75, cloud) * 0.7 + sweep * 0.3;
    out.r = lerp(a[0], b[0], t) * (0.96 + fleck * 0.06);
    out.g = lerp(a[1], b[1], t) * (0.96 + fleck * 0.06);
    out.b = lerp(a[2], b[2], t) * (0.96 + fleck * 0.06);
    out.h = 0.5 + sweep * 0.25;
    out.rough = 0.48 + sweep * 0.22 - cloud * 0.1;
  });
}

const floorCache = new Map<FloorId, Surface>();

export function floorSurface(id: FloorId, size: number): Surface {
  const hit = floorCache.get(id);
  if (hit) return hit;
  let s: Surface;
  switch (id) {
    case 'oak':
      s = chevron(size, { base: '#6e5236', light: '#a07c56', dark: '#2a1c11', lacquer: 0.48 });
      break;
    case 'travertine':
      s = travertine(size);
      break;
    case 'concrete':
      s = microcement(size);
      break;
    case 'walnut':
    default:
      s = chevron(size, { base: '#2c1b11', light: '#5a3b26', dark: '#120a06', lacquer: 0.36 });
  }
  floorCache.set(id, s);
  return s;
}

/* -------------------------------------------------------------------- walls */

let plaster: Surface | null = null;
/** limewash: a soft, cloudy, hand-trowelled tone, in grey — the wall's colour multiplies it */
export function plasterSurface(): Surface {
  if (plaster) return plaster;
  plaster = paint(512, 2.2, (u, v, out) => {
    const cloud = fbm(u, v, 4, 5, 13);
    const brush = fbm2(u + cloud * 0.12, v, 6, 3, 3, 29);
    const t = 0.84 + cloud * 0.16 + (brush - 0.5) * 0.08;
    out.r = out.g = out.b = t * 255;
    out.h = 0.5 + (brush - 0.5) * 0.6;
    out.rough = 0.9 + (cloud - 0.5) * 0.1;
  });
  return plaster;
}

/* ---------------------------------------------------------------- materials */

let marble: Surface | null = null;
/** Nero Marquina: black ground, white veins that fork and wander */
export function marbleSurface(): Surface {
  if (marble) return marble;
  marble = paint(1024, 1.4, (u, v, out) => {
    const w1 = fbm(u, v, 3, 5, 3);
    const w2 = fbm(u + 0.31, v + 0.17, 3, 5, 9);
    const f = fbm(u + w1 * 0.55, v + w2 * 0.55, 2, 6, 21);
    const vein = Math.abs(f - 0.5);
    const main = Math.exp(-vein * 180);
    const fine = Math.exp(-Math.abs(fbm(u + w2 * 0.4, v + w1 * 0.4, 5, 5, 33) - 0.5) * 260) * 0.45;
    const cloud = fbm(u, v, 8, 3, 55) * 0.06;
    const white = clamp01(main * 0.85 + fine);
    const base = 0.035 + cloud;
    out.r = (base + white * 0.78) * 255;
    out.g = (base + white * 0.77) * 255;
    out.b = (base * 1.05 + white * 0.74) * 255;
    out.h = 0.5;
    out.rough = 0.12 + white * 0.08;
  });
  return marble;
}

let walnut: Surface | null = null;
/** straight-grained walnut, the grain along u */
export function walnutSurface(): Surface {
  if (walnut) return walnut;
  const a = rgb('#3a2416');
  const b = rgb('#6b4429');
  walnut = paint(512, 1.0, (u, v, out) => {
    const warp = fbm2(u, v, 2, 4, 3, 5) * 0.08;
    const fine = vnoise(u * 3, (v + warp) * 140, 3, 140, 7);
    const figure = fbm2(u, v + warp, 3, 18, 3, 11);
    const t = fine * 0.5 + figure * 0.5;
    out.r = lerp(a[0], b[0], t);
    out.g = lerp(a[1], b[1], t);
    out.b = lerp(a[2], b[2], t);
    out.h = 0.5 + (fine - 0.5) * 0.4;
    out.rough = 0.42 + fine * 0.18;
  });
  return walnut;
}

let fabric: THREE.Texture | null = null;
/** a tight plain weave, as relief only: velvet and bouclé take their colour from the material */
export function weaveRelief(): THREE.Texture {
  if (fabric) return fabric;
  const size = 128;
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 16 * Math.PI * 2;
      const v = (y / size) * 16 * Math.PI * 2;
      const over = Math.sin(u) * Math.sin(v * 0.5) > 0 ? 1 : 0;
      const h = 0.5 + 0.25 * (over ? Math.cos(v) : Math.cos(u)) + (hash(x, y, 3) - 0.5) * 0.2;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp01(h) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  fabric = toTexture(c, false);
  return fabric;
}

let leaf: THREE.Texture | null = null;
/** one olive leaf: long, narrow, pointed, a pale midrib */
export function leafTexture(): THREE.Texture {
  if (leaf) return leaf;
  const c = canvas(64, 256);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 64, 256);
  const grad = ctx.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, '#9a9a9a');
  grad.addColorStop(0.5, '#ffffff');
  grad.addColorStop(1, '#a8a8a8');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.bezierCurveTo(60, 70, 58, 190, 32, 254);
  ctx.bezierCurveTo(6, 190, 4, 70, 32, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 10);
  ctx.lineTo(32, 248);
  ctx.stroke();
  leaf = toTexture(c, false, false);
  return leaf;
}

/* --------------------------------------------------------------- pictures */

/**
 * The painting on the wall: a mihrab arch in earth and gold on raw linen —
 * modern, but out of the same house as the rugs.
 */
export function artworkTexture(): THREE.Texture {
  const W = 512;
  const H = 680;
  const c = canvas(W, H);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d9cdb8';
  ctx.fillRect(0, 0, W, H);
  // linen
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${hash(i, 1, 1) > 0.5 ? '255,250,240' : '120,100,80'},${0.04 + hash(i, 2, 2) * 0.05})`;
    ctx.fillRect(hash(i, 3, 3) * W, hash(i, 4, 4) * H, 1 + hash(i, 5, 5) * 30, 1);
  }
  const arch = (x: number, y: number, w: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + w * 0.5);
    ctx.quadraticCurveTo(x, y, x + w / 2, y - w * 0.18);
    ctx.quadraticCurveTo(x + w, y, x + w, y + w * 0.5);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  };
  ctx.fillStyle = '#8a3b23';
  arch(110, 170, 292, 420);
  ctx.fill();
  ctx.fillStyle = '#5c2416';
  arch(150, 250, 212, 340);
  ctx.fill();
  // gold leaf sun, a little off its axis
  const g = ctx.createRadialGradient(300, 300, 4, 300, 300, 70);
  g.addColorStop(0, '#f0d58e');
  g.addColorStop(0.7, '#c8a050');
  g.addColorStop(1, 'rgba(200,160,80,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(300, 300, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,10,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(60, 610);
  ctx.lineTo(452, 610);
  ctx.stroke();
  const t = toTexture(c, true, false);
  return t;
}

/** the screen in art mode: a soft field of colour, slowly glowing */
export function screenTexture(): THREE.Texture {
  const c = canvas(512, 288);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 288);
  g.addColorStop(0, '#2a1410');
  g.addColorStop(0.55, '#7a2f1c');
  g.addColorStop(1, '#c47a3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 288);
  ctx.fillStyle = 'rgba(15,8,6,0.85)';
  ctx.fillRect(40, 150, 432, 2);
  const s = ctx.createRadialGradient(256, 170, 4, 256, 170, 60);
  s.addColorStop(0, 'rgba(255,220,160,1)');
  s.addColorStop(1, 'rgba(255,180,100,0)');
  ctx.fillStyle = s;
  ctx.beginPath();
  ctx.arc(256, 170, 60, Math.PI, 0);
  ctx.fill();
  return toTexture(c, true, false);
}

/** a soft rounded-rectangle blot, for the contact shadow under each piece */
let blot: THREE.Texture | null = null;
export function blotTexture(): THREE.Texture {
  if (blot) return blot;
  const size = 128;
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.abs((x + 0.5) / size - 0.5) * 2;
      const v = Math.abs((y + 0.5) / size - 0.5) * 2;
      // superellipse distance: square-ish in the middle, soft to the edge
      const d = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25);
      const a = 1 - smooth(0.55, 1.0, d);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  blot = toTexture(c, false, false);
  return blot;
}
