/**
 * COLOUR — every rug in the shop is one photograph re-dyed by a CSS filter
 * (catalog.ts). To lay the same rug on the floor in WebGL, the filter chain is
 * turned into the affine colour transform the Filter Effects spec defines for
 * each function, composed in order:  rgb' = M · rgb + o,  in sRGB, 0‥1.
 *
 * The gallery's five carry a proper dye remap as well (hero config `dyes`):
 * a 3×3 matrix in linear light that carries the photograph's three dyes onto
 * three new ones. That is what the gallery itself shows, so it wins over the
 * filter for those five.
 */
import { RUGS } from '@/components/hero/config';

/** row-major 3×3 and an offset */
export interface Affine {
  m: number[];
  o: [number, number, number];
}

const identity = (): Affine => ({ m: [1, 0, 0, 0, 1, 0, 0, 0, 1], o: [0, 0, 0] });

function mul(a: number[], b: number[]): number[] {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

const apply3 = (m: number[], v: readonly number[]): [number, number, number] => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

function step(fn: string, raw: string): Affine {
  const a = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
  const k = 1 - a;
  switch (fn) {
    case 'grayscale':
      return {
        m: [
          0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k,
          0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k,
          0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k,
        ],
        o: [0, 0, 0],
      };
    case 'sepia':
      return {
        m: [
          0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
          0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
          0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
        ],
        o: [0, 0, 0],
      };
    case 'saturate':
      return {
        m: [
          0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a,
          0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a,
          0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a,
        ],
        o: [0, 0, 0],
      };
    case 'hue-rotate': {
      const t = (parseFloat(raw) * Math.PI) / 180;
      const c = Math.cos(t);
      const s = Math.sin(t);
      return {
        m: [
          0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
          0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
          0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
        ],
        o: [0, 0, 0],
      };
    }
    case 'brightness':
      return { m: [a, 0, 0, 0, a, 0, 0, 0, a], o: [0, 0, 0] };
    case 'contrast': {
      const b = 0.5 - 0.5 * a;
      return { m: [a, 0, 0, 0, a, 0, 0, 0, a], o: [b, b, b] };
    }
    default:
      return identity();
  }
}

/** "hue-rotate(215deg) saturate(0.7)" → one affine transform */
export function cssFilterToAffine(filter: string): Affine {
  let out = identity();
  for (const [, fn, arg] of filter.matchAll(/([a-z-]+)\(([^)]*)\)/g)) {
    const s = step(fn, arg.trim());
    // s ∘ out: m = s.m · out.m, o = s.m · out.o + s.o
    const o = apply3(s.m, out.o);
    out = { m: mul(s.m, out.m), o: [o[0] + s.o[0], o[1] + s.o[1], o[2] + s.o[2]] };
  }
  return out;
}

export const applyAffine = (t: Affine, rgb: readonly number[]) => {
  const v = apply3(t.m, rgb);
  return [v[0] + t.o[0], v[1] + t.o[1], v[2] + t.o[2]].map((x) => Math.min(1, Math.max(0, x))) as [number, number, number];
};

/* ---------------------------------------------------------------- dyes */

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexLinear = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
};

function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}

/** the gallery's dye remap for a product id, as a row-major 3×3 in linear light; identity if it has none */
export function dyeMatrix(id: string): number[] {
  const entry = RUGS.find((r) => r.id === id);
  if (!entry?.dyes) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const cols = (set: [string, string, string]) => {
    const [a, b, c] = set.map(hexLinear);
    return [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
  };
  return mul(cols(entry.dyes.to), invert3(cols(entry.dyes.from)));
}

export const hasDyes = (id: string) => !!RUGS.find((r) => r.id === id)?.dyes;
export const isGalleryPiece = (id: string) => RUGS.some((r) => r.id === id);

/**
 * The colour of a rug's field, for the cushions that echo it: the photograph's
 * oxblood ground carried through whatever re-dyes this piece.
 */
export function fieldColour(id: string, filter: string): [number, number, number] {
  const ground = [0x45 / 255, 0x0b / 255, 0x13 / 255];
  if (hasDyes(id)) {
    const lin = apply3(dyeMatrix(id), ground.map(toLinear));
    return lin.map((x) => Math.min(1, Math.max(0, x))) as [number, number, number];
  }
  return applyAffine(cssFilterToAffine(filter), ground).map(toLinear) as [number, number, number];
}
