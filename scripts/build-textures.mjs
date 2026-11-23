/**
 * Texture build — run with `npm run textures`.
 *
 * Produces the rug LOD pyramid consumed by components/hero/scene/Rug.tsx:
 *
 *   LOD 0  whole rug      public/textures/rug-01.webp        photo, edge-bled RGB
 *                         public/textures/rug-01-mask.png    silhouette (body + fringe)
 *                         public/textures/rug-01-thumb.webp  320 px, for the collection dial
 *   LOD 1  pattern/weave  public/textures/weave-{a,b}.png    256²  knot-scale relief (8×8 knots)
 *   LOD 2  fibre          public/textures/fiber-a.jpg        2048² normal.xy + height
 *                         public/textures/fiber-b.webp       2048² owner-knot offset + fibre tint
 *
 * LOD 1 is the box-filtered LOD 2, so the shader can cross-fade between them
 * without any change in structure. LOD 2 is only requested when a hover is
 * imminent.
 *
 * The fibre tile is authored procedurally: a cotton foundation (paired warps,
 * wefts crossing over/under) with two cut-pile tufts per knot, each a bundle
 * of individually stamped, crimped wool fibres leaning toward the viewer.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets', 'source');
const OUT = path.join(ROOT, 'public', 'textures');

/* ------------------------------------------------------------------ utils */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------------------------------------- rug photo */

async function buildRug(name) {
  const { data, info } = await sharp(path.join(SRC, `${name}.webp`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const rgb = new Float32Array(W * H * 3);
  const mask = Buffer.alloc(W * H);
  const filled = new Uint8Array(W * H);

  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3];
    mask[i] = a;
    if (a > 200) {
      filled[i] = 1;
      rgb[i * 3] = data[i * 4];
      rgb[i * 3 + 1] = data[i * 4 + 1];
      rgb[i * 3 + 2] = data[i * 4 + 2];
    }
  }

  // Bleed edge colour outward so bilinear / mip filtering never pulls the
  // transparent black of the source into the silhouette.
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (let pass = 0; pass < 40; pass++) {
    const next = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        if (x > 0 && filled[i - 1]) { r += rgb[(i - 1) * 3]; g += rgb[(i - 1) * 3 + 1]; b += rgb[(i - 1) * 3 + 2]; n++; }
        if (x < W - 1 && filled[i + 1]) { r += rgb[(i + 1) * 3]; g += rgb[(i + 1) * 3 + 1]; b += rgb[(i + 1) * 3 + 2]; n++; }
        if (y > 0 && filled[i - W]) { r += rgb[(i - W) * 3]; g += rgb[(i - W) * 3 + 1]; b += rgb[(i - W) * 3 + 2]; n++; }
        if (y < H - 1 && filled[i + W]) { r += rgb[(i + W) * 3]; g += rgb[(i + W) * 3 + 1]; b += rgb[(i + W) * 3 + 2]; n++; }
        if (n) next.push(i, r / n, g / n, b / n);
      }
    }
    for (let k = 0; k < next.length; k += 4) {
      const i = next[k];
      filled[i] = 1;
      rgb[i * 3] = next[k + 1];
      rgb[i * 3 + 1] = next[k + 2];
      rgb[i * 3 + 2] = next[k + 3];
      sr += next[k + 1]; sg += next[k + 2]; sb += next[k + 3]; sn++;
    }
  }
  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    if (filled[i]) {
      out[i * 3] = rgb[i * 3];
      out[i * 3 + 1] = rgb[i * 3 + 1];
      out[i * 3 + 2] = rgb[i * 3 + 2];
    } else {
      out[i * 3] = sr / sn;
      out[i * 3 + 1] = sg / sn;
      out[i * 3 + 2] = sb / sn;
    }
  }

  await sharp(out, { raw: { width: W, height: H, channels: 3 } })
    // The source is slightly soft; a restrained unsharp gives each knot a
    // more decisive dye colour when the shader point-samples it.
    .sharpen({ sigma: 1.1, m1: 0.6, m2: 1.4 })
    .webp({ quality: 93, smartSubsample: true, effort: 6 })
    .toFile(path.join(OUT, `${name}.webp`));

  await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `${name}-mask.png`));

  // Tiny poster for the no-WebGL fallback composition.
  await sharp(path.join(SRC, `${name}.webp`))
    .resize({ width: 1400 })
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(path.join(OUT, `${name}-poster.webp`));

  // Thumbnail for the collection dial.
  await sharp(path.join(SRC, `${name}.webp`))
    .resize({ width: 320 })
    .webp({ quality: 86, alphaQuality: 100 })
    .toFile(path.join(OUT, `${name}-thumb.webp`));

  console.log(`rug   ${name}  ${W}×${H}`);
}

/* --------------------------------------------------------------- fibre tile */

function buildFiberTile() {
  const N = 2048;
  const K = 8; // knots per tile edge
  const S = N / K; // px per knot
  const rnd = mulberry32(90210);
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.866;

  const Hh = new Float32Array(N * N);
  const OX = new Float32Array(N * N); // owner knot centre, px (unwrapped)
  const OY = new Float32Array(N * N);
  const TI = new Float32Array(N * N);

  // cheap value noise for the foundation
  const P = new Float32Array(64 * 64);
  for (let i = 0; i < P.length; i++) P[i] = rnd();
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const g = (a, b) => P[((b & 63) << 6) | (a & 63)];
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };

  /* ---- foundation: undyed cotton warps + wefts, tint < 0.1 flags "cotton" */
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const u = x / S, v = y / S;
      const col = Math.floor(u), row = Math.floor(v);
      const fu = u - col, fv = v - row;
      let h = 0.04 + 0.03 * vn(u * 5, v * 5);

      const dvw = Math.min(fv, 1 - fv);
      const sgn = fv < 0.5 ? fv : fv - 1;
      const wrow = Math.round(v);
      const RW = 0.18;
      if (dvw < RW) {
        const prof = Math.sqrt(1 - (dvw / RW) ** 2);
        const wave = 0.5 + 0.5 * Math.cos(2 * Math.PI * (u + 0.5 * (wrow & 1)));
        const twist = 0.84 + 0.16 * Math.sin(2 * Math.PI * (u * 4 + (sgn / RW) * 0.55));
        h = Math.max(h, (0.17 + 0.11 * wave) * prof * twist + 0.05);
      }
      for (let w = 0; w < 2; w++) {
        const wu = w === 0 ? 0.27 : 0.73;
        const du = Math.abs(fu - wu);
        const RP = 0.115;
        if (du < RP) {
          const prof = Math.sqrt(1 - (du / RP) ** 2);
          const over = (col * 2 + w + wrow) & 1;
          const cross = Math.exp(-((dvw / 0.2) ** 2));
          const twist = 0.84 + 0.16 * Math.sin(2 * Math.PI * (v * 5 + ((fu - wu) / RP) * 0.5));
          h = Math.max(h, (0.15 + (over ? 0.2 : -0.07) * cross) * prof * twist + 0.04);
        }
      }
      Hh[i] = h;
      OX[i] = (col + 0.5) * S;
      OY[i] = (row + 0.5) * S;
      TI[i] = 0.02 + 0.05 * vn(u * 11 + 7, v * 11 + 3);
    }
  }

  const wrap = (a) => ((a % N) + N) % N;

  const stampBlob = (cx, cy, rad, height, ox, oy, tint) => {
    const r = rad * S;
    const x0 = Math.floor(cx * S - r), x1 = Math.ceil(cx * S + r);
    const y0 = Math.floor(cy * S - r), y1 = Math.ceil(cy * S + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx * S) / r, dy = (y - cy * S) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const hh = height * (1 - d2) ** 0.75;
        const i = wrap(y) * N + wrap(x);
        if (hh > Hh[i]) {
          Hh[i] = hh;
          OX[i] = ox * S + (wrap(x) - x);
          OY[i] = oy * S + (wrap(y) - y);
          TI[i] = tint;
        }
      }
    }
  };

  const stampFibre = (f) => {
    const steps = Math.max(8, Math.ceil(f.len * S * 2));
    const cosA = Math.cos(f.ang), sinA = Math.sin(f.ang);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lat = f.amp * Math.sin(2 * Math.PI * (f.freq * t + f.ph)) + f.bend * t * t;
      const cx = (f.x + cosA * f.len * t - sinA * lat) * S;
      const cy = (f.y + sinA * f.len * t + cosA * lat) * S;
      const rp = f.rad * S * (1 - 0.55 * t * t * t);
      const hc = f.h0 + (f.h1 - f.h0) * Math.pow(t, 0.7);
      const x0 = Math.floor(cx - rp), x1 = Math.ceil(cx + rp);
      const y0 = Math.floor(cy - rp), y1 = Math.ceil(cy + rp);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy;
          const d2 = (dx * dx + dy * dy) / (rp * rp);
          if (d2 >= 1) continue;
          const hh = hc + 0.075 * Math.sqrt(1 - d2);
          const i = wrap(y) * N + wrap(x);
          if (hh > Hh[i]) {
            Hh[i] = hh;
            OX[i] = f.ox * S + (wrap(x) - x);
            OY[i] = f.oy * S + (wrap(y) - y);
            TI[i] = f.tint;
          }
        }
      }
    }
  };

  /* ---- pile: asymmetric (Persian) knot → two cut tufts per knot */
  for (let j = 0; j < K; j++) {
    for (let i = 0; i < K; i++) {
      const kx = i + 0.5, ky = j + 0.5;
      const jx = (rnd() - 0.5) * 0.1, jy = (rnd() - 0.5) * 0.1;
      const lean = 0.2 + rnd() * 0.08;
      for (let sub = -1; sub <= 1; sub += 2) {
        const rx = kx + jx + sub * 0.235 + (rnd() - 0.5) * 0.05;
        const ry = ky + jy - 0.27 + (rnd() - 0.5) * 0.05;
        // yarn core: the darker mass the individual fibres sit on
        stampBlob(rx, ry + 0.2, 0.31, 0.5, kx, ky, 0.3);
        stampBlob(rx + sub * 0.03, ry + 0.38 + lean * 0.3, 0.22, 0.46, kx, ky, 0.27);
        const nf = 56 + Math.floor(rnd() * 14);
        for (let f = 0; f < nf; f++) {
          const a = rnd() * Math.PI * 2;
          const rr = Math.sqrt(rnd()) * 0.2;
          const centr = 1 - rr / 0.2;
          stampFibre({
            x: rx + Math.cos(a) * rr,
            y: ry + Math.sin(a) * rr * 0.7,
            ang: Math.PI / 2 + gauss() * 0.5 + sub * 0.1,
            len: 0.34 + rnd() * 0.36,
            h0: 0.5 + rnd() * 0.08,
            h1: 0.68 + 0.22 * centr + rnd() * 0.08,
            rad: 0.0115 + rnd() * 0.008,
            amp: 0.008 + rnd() * 0.02,
            freq: 1 + rnd() * 1.8,
            ph: rnd(),
            bend: (rnd() - 0.5) * 0.16,
            tint: 0.36 + rnd() * 0.64,
            ox: kx,
            oy: ky,
          });
        }
      }
    }
  }

  /* ---- fuzz: a few stray fibres lying across their neighbours */
  for (let s = 0; s < 30; s++) {
    const i = Math.floor(rnd() * K), j = Math.floor(rnd() * K);
    stampFibre({
      x: i + 0.2 + rnd() * 0.6,
      y: j + 0.2 + rnd() * 0.6,
      ang: rnd() * Math.PI * 2,
      len: 0.7 + rnd() * 0.9,
      h0: 0.84 + rnd() * 0.06,
      h1: 0.88 + rnd() * 0.05,
      rad: 0.007 + rnd() * 0.004,
      amp: 0.04 + rnd() * 0.07,
      freq: 0.5 + rnd() * 0.8,
      ph: rnd(),
      bend: (rnd() - 0.5) * 0.5,
      tint: 0.8 + rnd() * 0.2,
      ox: i + 0.5,
      oy: j + 0.5,
    });
  }

  /* ---- height → smoothed height + tangent-space normal */
  const Hs = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const ym = wrap(y - 1) * N, yc = y * N, yp = wrap(y + 1) * N;
    for (let x = 0; x < N; x++) {
      const xm = wrap(x - 1), xp = wrap(x + 1);
      Hs[yc + x] =
        (Hh[yc + x] * 4 +
          (Hh[yc + xm] + Hh[yc + xp] + Hh[ym + x] + Hh[yp + x]) * 2 +
          Hh[ym + xm] + Hh[ym + xp] + Hh[yp + xm] + Hh[yp + xp]) / 16;
    }
  }

  const A = Buffer.alloc(N * N * 3);
  const B = Buffer.alloc(N * N * 3);
  const NS = 0.34 * S; // relief strength
  const q = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const gx = (Hs[y * N + wrap(x + 1)] - Hs[y * N + wrap(x - 1)]) * 0.5 * NS;
      const gy = (Hs[wrap(y + 1) * N + x] - Hs[wrap(y - 1) * N + x]) * 0.5 * NS;
      const il = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      // uv-space tangent frame: +u = image right, +v = image up
      A[i * 3] = q(-gx * il * 0.5 + 0.5);
      A[i * 3 + 1] = q(gy * il * 0.5 + 0.5);
      A[i * 3 + 2] = q(Math.min(1, Hs[i]));
      B[i * 3] = q((OX[i] - x) / S / 3 + 0.5);
      B[i * 3 + 1] = q(-(OY[i] - y) / S / 3 + 0.5);
      B[i * 3 + 2] = q(TI[i]);
    }
  }
  return { N, A, B };
}

/* -------------------------------------------------------------------- main */

await mkdir(OUT, { recursive: true });
await buildRug('rug-01');

const t0 = Date.now();
const { N, A, B } = buildFiberTile();
const raw = { raw: { width: N, height: N, channels: 3 } };
await sharp(A, raw).jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toFile(path.join(OUT, 'fiber-a.jpg'));
await sharp(B, raw).webp({ lossless: true, effort: 5 }).toFile(path.join(OUT, 'fiber-b.webp'));
await sharp(A, raw).resize(256, 256, { kernel: 'cubic' }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'weave-a.png'));
await sharp(B, raw).resize(256, 256, { kernel: 'cubic' }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'weave-b.png'));
// preview for humans (not shipped to the page)
await sharp(A, raw).extract({ left: 0, top: 0, width: 768, height: 768 }).png().toFile(path.join(ROOT, 'assets', 'fiber-preview.png'));
console.log(`fibre ${N}² in ${Date.now() - t0} ms`);
