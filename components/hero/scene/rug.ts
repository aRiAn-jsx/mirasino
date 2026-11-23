/**
 * THE RUGS
 *
 * One per piece in the gallery, each hung on the wall under its own track
 * light. They share their textures and geometry; each has its own material
 * values, so the one in front of the visitor can be turned over while the
 * others hang still. Each is a subdivided plane, MeshPhysicalMaterial lit by
 * the scene's lights, with three things injected:
 *
 *  1. Vertex: resting shape (2–3 mm breathing, one corner curling toward the
 *     viewer, hand-woven edge wobble) and the
 *     authored page-flip — an isometric "tread" curl, so the cloth never
 *     stretches (see rugDeform). The mesh is authored lying down and hung by
 *     the scene, so "up" in this shader is "toward the viewer".
 *
 *     Turning a piece over shows its reverse — the knots' side: the same
 *     design, mirrored, flat, the grid of knots plain to see.
 *
 *  2. Fragment: the LOD pyramid.
 *        L0  photograph, trilinear/anisotropic               (whole rug)
 *        L1  one dye colour per knot + 256² relief tile      (pattern → weave)
 *        L2  2048² fibre tile, parallax-occlusion mapped,    (threads → fibres)
 *            self-shadowed toward the lamp
 *     Weights come from the projected size of a knot in pixels — i.e. camera
 *     distance and angle — so the cross-fades are continuous at any resolution.
 *
 *  3. Material response: the pile is matte (roughness 1, almost no dielectric
 *     specular). What highlight it has is a broad, cool-grey sheen lobe, so
 *     burgundy under white light desaturates instead of going pink. Tighter
 *     response is reserved for the fringe and for fibre crests at L2.
 */
import * as THREE from 'three';
import { RUG, RUG_IMAGE, RUGS, type RugEntry, type Tier } from '../config';
import type { Live } from '../live';
import { NOISE } from './glsl';
import type { Shared } from './shared';

/* ------------------------------------------------------------------ vertex */

const VERT_COMMON = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uFlip;
uniform float uFlipDir;
uniform float uLift;
uniform float uShape;
uniform float uRipple;
uniform float uCurlR;
uniform vec2 uHalf;
uniform vec2 uBodyHalf;

varying vec2 vRugUv;
varying float vCurl;

vec3 rugPos;
vec3 rugNrm;

// height of the relaxed rug above its plane, metres
float rugRest(vec2 p) {
  float t = uTime * uMotion;
  float breath = sin(p.x * 1.7 + t * 0.31) * sin(p.y * 2.3 - t * 0.23)
               + 0.5 * sin(p.x * 3.1 - p.y * 1.3 + t * 0.17);
  float y = breath * 0.0012;

  // lower-right corner curls a little toward the viewer
  vec2 c = (p - uBodyHalf) / vec2(0.8, 0.6);
  float corner = 1.0 - smoothstep(0.0, 1.0, length(c));
  y += 0.017 * corner * corner;


  y *= uShape;
  // cloth settling after it lands
  y += uRipple * 0.005 * sin(p.y * 8.0 + uTime * 13.0) * (0.6 + 0.4 * sin(p.x * 2.3 + 1.0));
  return y;
}

void rugDeform(vec3 pos) {
  // hand-woven edges are never ruled lines
  vec2 p = pos.xz + vec2(
    0.0045 * sin(pos.z * 4.1 + 1.3) + 0.0025 * sin(pos.z * 9.7 + 0.4),
    0.0040 * sin(pos.x * 2.9 + 0.7) + 0.0028 * sin(pos.x * 6.3 + 2.1)
  );

  float y = rugRest(p);
  const float e = 0.03;
  vec3 n = normalize(vec3(
    -(rugRest(p + vec2(e, 0.0)) - y) / e,
    1.0,
    -(rugRest(p + vec2(0.0, e)) - y) / e
  ));

  vCurl = 0.0;
  rugPos = vec3(p.x, y + uLift, p.y);
  rugNrm = n;

  if (uFlip > 0.0) {
    // TREAD FLIP. The cloth is a belt of length L running round a bend fixed at
    // the leading edge: flat on the stage → half-turn of radius r → flat again,
    // upside down, travelling back toward the viewer. Arc length is preserved
    // exactly, and when the belt has fully run through, the rug lies in its
    // original footprint, reversed. The far side of the cloth carries the next
    // rug (see fragment shader), so landing *is* the transition.
    float hb = uBodyHalf.y + 0.045;
    float L = 2.0 * hb;
    float zz = clamp(p.y, -hb, hb) * uFlipDir;
    float s = zz + hb;

    // grabbed a little right of centre: that column leads, the ends trail
    float g = smoothstep(0.0, 1.0, abs(p.x - 0.35) / (uHalf.x + 0.35));
    float pr = clamp(uFlip * 1.24 - 0.24 * g, 0.0, 1.0);

    float r = max(1e-4, uCurlR * pow(sin(3.14159265 * pr), 0.6));
    float q = pr * (L + 3.14159265 * r) - s;

    float zl; float yl; vec3 nl;
    if (q <= 0.0) {
      zl = -hb - q; yl = 0.0; nl = vec3(0.0, 1.0, 0.0);
    } else if (q < 3.14159265 * r) {
      float phi = q / r;
      zl = -hb - r * sin(phi);
      yl = r * (1.0 - cos(phi));
      nl = vec3(0.0, cos(phi), sin(phi));
      vCurl = sin(phi);
    } else {
      zl = -hb + (q - 3.14159265 * r);
      yl = 2.0 * r;
      nl = vec3(0.0, -1.0, 0.0);
      vCurl = 0.35;
    }
    nl.z *= uFlipDir;
    rugPos = vec3(p.x, yl + uLift, zl * uFlipDir) + nl * y;
    rugNrm = nl;
  }
}
`;

/* ---------------------------------------------------------------- fragment */

const FRAG_PARS = /* glsl */ `
uniform sampler2D tRug;
uniform sampler2D tRugNext;
uniform sampler2D tMask;
uniform sampler2D tMaskNext;
uniform sampler2D tWeaveA;
uniform sampler2D tWeaveB;
uniform sampler2D tFiberA;
uniform sampler2D tFiberB;
uniform mat3 uGrade;
uniform mat3 uGradeNext;
uniform vec2 uTexSize;
uniform vec4 uBodyUv;
uniform vec4 uRepair;
uniform float uFiberReady;
uniform float uDetail;
uniform float uSat;
uniform float uCross;
uniform float uBlur;
uniform float uPomDepth;
uniform float uKnotGain;
uniform float uTile;
uniform float uPomQuality;
uniform float uReversed;
uniform vec3 uKeyView;

varying vec2 vRugUv;
varying float vCurl;

${NOISE}

// re-dye a colour of the photograph — but leave what is nearly white alone: the cotton
// fringe and the ivory ground were never in the dye bath
vec3 rugDye(mat3 grade, vec3 c) {
  float undyed = smoothstep(0.42, 0.72, min(c.r, min(c.g, c.b)));
  return max(mix(grade * c, c, undyed), vec3(0.0));
}

vec3 rugPhoto(sampler2D tex, mat3 grade, vec2 uv, float bias) {
  vec3 c = texture2D(tex, uv, bias).rgb;
  if (uBlur > 0.001) {
    // motion blur along the direction the cloth is travelling
    float o = uBlur * 0.011 * (0.3 + vCurl);
    c = (c * 2.0
      + texture2D(tex, uv + vec2(0.0, o), bias + 1.0).rgb
      + texture2D(tex, uv - vec2(0.0, o), bias + 1.0).rgb
      + texture2D(tex, uv + vec2(0.0, 2.2 * o), bias + 1.6).rgb
      + texture2D(tex, uv - vec2(0.0, 2.2 * o), bias + 1.6).rgb) / 6.0;
  }
  return rugDye(grade, c);
}
`;

/**
 * replaces <map_fragment>: which side this is, and the silhouette.
 *
 * The cloth turns over about its top edge, so the face that comes round is
 * seen upside down; it is read mirrored so the reverse is presented upright,
 * as a gallerist would show it. `uReversed` says the reverse is the side
 * that currently faces the room.
 */
const FRAG_ALPHA = /* glsl */ `
bool rugFront = gl_FrontFacing;
bool rugPile = rugFront != (uReversed > 0.5);
vec2 rugUv = vec2(rugFront == (uReversed > 0.5) ? 1.0 - vRugUv.x : vRugUv.x, rugFront ? vRugUv.y : 1.0 - vRugUv.y);
{
  diffuseColor.a *= texture2D(tMask, rugUv).r;
}
`;

/** replaces <normal_fragment_maps>: the LOD pyramid */
const FRAG_BODY = /* glsl */ `
float rugBody = 1.0;
float rugCrest = 0.0;
{
  // tangent frame from screen-space derivatives (+T = +u, +B = +v)
  vec3 pdx = dFdx(-vViewPosition);
  vec3 pdy = dFdy(-vViewPosition);
  vec2 tdx = dFdx(rugUv);
  vec2 tdy = dFdy(rugUv);
  vec3 Ng = normal;
  vec3 q1p = cross(pdy, Ng);
  vec3 q0p = cross(Ng, pdx);
  vec3 Tg = q1p * tdx.x + q0p * tdy.x;
  vec3 Bg = q1p * tdx.y + q0p * tdy.y;
  float tDet = max(dot(Tg, Tg), dot(Bg, Bg));
  float tScale = tDet == 0.0 ? 0.0 : inversesqrt(tDet);
  mat3 tbn = mat3(Tg * tScale, Bg * tScale, Ng);

  vec2 inLo = smoothstep(uBodyUv.xy - 0.001, uBodyUv.xy + 0.001, rugUv);
  vec2 inHi = 1.0 - smoothstep(uBodyUv.zw - 0.001, uBodyUv.zw + 0.001, rugUv);
  rugBody = inLo.x * inLo.y * inHi.x * inHi.y;

  // ---- L0: the photograph ------------------------------------------------
  float bias = (1.0 - uDetail) * 3.2;
  vec3 albedo = rugPhoto(tRug, uGrade, rugUv, bias);

  // ---- LOD weights: how many pixels does one knot cover? -------------------
  vec2 kc = rugUv * uTexSize;
  vec2 kdx = tdx * uTexSize;
  vec2 kdy = tdy * uTexSize;
  float pxk = 1.0 / max(max(length(kdx), length(kdy)), 1e-5);
  float wKnot = smoothstep(2.2, 6.5, pxk) * rugBody * uDetail * (rugPile ? 1.0 : 0.0);
  float wFiber = smoothstep(34.0, 105.0, pxk) * uFiberReady;
  float wOwner = smoothstep(10.0, 26.0, pxk);

  float microShadow = 1.0;

  if (wKnot > 0.003) {
    vec2 gdx = kdx / uTile;
    vec2 gdy = kdy / uTile;
    #define RUG_A(cc) mix(textureGrad(tWeaveA, (cc) / uTile, gdx, gdy), textureGrad(tFiberA, (cc) / uTile, gdx, gdy), wFiber)
    #define RUG_B(cc) mix(textureGrad(tWeaveB, (cc) / uTile, gdx, gdy), textureGrad(tFiberB, (cc) / uTile, gdx, gdy), wFiber)

    vec2 c = kc;
    float depth = uPomDepth * smoothstep(5.0, 30.0, pxk);

    if (depth > 0.002) {
      // ---- parallax occlusion: march the view ray down through the pile ----
      vec3 Vt = normalize(vViewPosition) * tbn;
      vec2 shift = -Vt.xy / max(Vt.z, 0.3) * depth;
      float layers = mix(20.0, 9.0, clamp(Vt.z, 0.0, 1.0)) * uPomQuality;
      float dl = 1.0 / layers;
      vec2 dc = shift * dl;
      float rayD = 0.0;
      float surfD = 1.0 - RUG_A(c).b;
      float prevD = surfD;
      for (int i = 0; i < 20; i++) {
        if (rayD >= surfD) break;
        c += dc;
        rayD += dl;
        prevD = surfD;
        surfD = 1.0 - RUG_A(c).b;
      }
      float after = surfD - rayD;
      float before = prevD - rayD + dl;
      c -= dc * clamp(after / min(after - before, -1e-5), 0.0, 1.0);

      // ---- tiny inter-thread shadows: march from the hit toward the lamp ----
      {
      vec3 Lt = normalize(uKeyView + vViewPosition) * tbn;
      if (Lt.z > 0.02) {
        float h0 = RUG_A(c).b;
        vec2 ls = Lt.xy / max(Lt.z, 0.14) * depth;
        float occ = 0.0;
        for (int i = 1; i <= 7; i++) {
          float t = float(i) / 7.0;
          float rayH = h0 + t * (1.0 - h0);
          float hs = RUG_A(c + ls * (rayH - h0)).b;
          occ = max(occ, (hs - rayH) * (1.0 - t * 0.6) * 7.0);
        }
        microShadow = 1.0 - clamp(occ, 0.0, 1.0);
      }
      }
    }

    vec4 ta = RUG_A(c);
    vec4 tb = RUG_B(c);

    // ---- L1: every knot is exactly one dye colour ---------------------------
    // The tile stores, per texel, the offset to the knot that owns the fibre
    // under it, so a fibre lying across its neighbour keeps its own colour.
    vec2 cell = floor(c + (tb.rg - 0.5) * 3.0 * wOwner);
    vec3 knot = rugDye(uGrade, textureLod(tRug, (cell + 0.5) / uTexSize, 0.0).rgb);

    float kr = hash12(cell);
    float cotton = (1.0 - smoothstep(0.08, 0.2, tb.b)) * wOwner;
    float fibre = smoothstep(0.2, 1.0, tb.b);
    knot *= 0.88 + 0.24 * kr;                                  // dye-lot jitter knot to knot
    knot *= mix(1.0, mix(0.6, 1.25, fibre), wOwner);           // fibre to fibre
    // one knot in ~90 was tied slightly wrong
    float odd = step(0.989, hash12(cell + 17.3));
    knot *= 1.0 + odd * (hash12(cell + 3.1) - 0.6) * 0.5;
    // undyed cotton foundation glimpsed between rows
    knot = mix(knot, vec3(0.30, 0.285, 0.255), cotton);
    // occlusion deep between tufts
    float relief = smoothstep(5.0, 22.0, pxk);
    knot *= mix(1.0, mix(0.22, 1.0, smoothstep(0.06, 0.72, ta.b)), relief) * mix(1.0, uKnotGain, relief);

    albedo = mix(albedo, knot, wKnot);

    vec3 nt = vec3((ta.rg - 0.5) * 2.0, 0.0);
    nt.xy *= wKnot;
    nt.z = sqrt(max(1.0 - dot(nt.xy, nt.xy), 0.05));
    normal = normalize(tbn * nt);

    rugCrest = smoothstep(0.62, 0.96, ta.b) * wFiber;
    microShadow = mix(1.0, microShadow, wKnot);
  }

  // ---- the reverse: no pile, so the design is crisper and a little darker, and
  //      the knots stand in a plain grid wherever they are big enough to see
  if (!rugPile) {
    vec2 g = abs(fract(rugUv * uTexSize) - 0.5);
    float seam = smoothstep(0.32, 0.5, max(g.x, g.y)) * smoothstep(3.0, 7.0, pxk) * rugBody;
    albedo *= 0.86 * (1.0 - 0.38 * seam);
  }

  // ---- abrash: dye lots change along the length of the loom -----------------
  float ab = (vnoise(vec2(rugUv.x * 11.0, 0.5)) - 0.5) + 0.5 * (vnoise(vec2(rugUv.x * 37.0, 3.5 + rugUv.y * 0.6)) - 0.5);
  albedo *= 1.0 + 0.085 * ab * rugBody;
  albedo.r *= 1.0 + 0.03 * ab * rugBody;
  // nap: pile brushed in slightly different directions
  albedo *= 0.955 + 0.09 * vnoise(rugUv * vec2(7.0, 4.0) + 9.0);
  // one small restoration — a later hand, a slightly different dye bath
  vec2 rp = (rugUv - uRepair.xy) / uRepair.zw;
  rp += (vnoise(rugUv * 240.0) - 0.5) * 0.35;
  float repair = (1.0 - smoothstep(0.75, 1.0, max(abs(rp.x), abs(rp.y)))) * rugBody;
  float rl = dot(albedo, vec3(0.3, 0.55, 0.15));
  albedo = mix(albedo, mix(vec3(rl), albedo, 0.72) * vec3(0.9, 0.93, 0.98), repair * 0.8);

  float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  albedo = max(mix(vec3(lum), albedo, uSat * 1.1), vec3(0.0));

  diffuseColor.rgb = albedo * microShadow;
  // pile: fully rough. fringe (cotton/silk ends) and fibre crests: a little tighter.
  roughnessFactor = mix(0.6, 1.0, rugBody);
  roughnessFactor = mix(roughnessFactor, 0.55, rugCrest * 0.7);
}
`;

/** appended to <lights_physical_fragment>: where the sheen is allowed to live */
const FRAG_SHEEN = /* glsl */ `
#ifdef USE_SHEEN
  material.sheenColor = mix(vec3(0.2, 0.21, 0.225), vec3(0.016, 0.017, 0.019), rugBody) * (1.0 + rugCrest * 3.0);
  material.sheenRoughness = mix(0.42, 0.82, rugBody);
#endif
material.specularColor *= mix(0.8, 0.12, rugBody) + rugCrest * 0.6;
`;

/* -------------------------------------------------------------- dye grades */

/**
 * 3×3 matrix (linear RGB) that carries three reference dyes onto three target
 * dyes. Everything in between follows smoothly; black stays black.
 */
function gradeMatrix(entry: RugEntry): THREE.Matrix3 {
  const m = new THREE.Matrix3();
  if (!entry.dyes) return m;
  const lin = (hex: string) => new THREE.Color(hex); // Color() converts sRGB hex → linear working space
  const cols = (set: [string, string, string]) => {
    const [a, b, c] = set.map(lin);
    // columns are the colours
    return new THREE.Matrix3().set(a.r, b.r, c.r, a.g, b.g, c.g, a.b, b.b, c.b);
  };
  const from = cols(entry.dyes.from).invert();
  return m.multiplyMatrices(cols(entry.dyes.to), from);
}

/* ------------------------------------------------------------------- build */

export interface RugsHandle {
  /** one per catalogue entry, hung at the given x */
  meshes: THREE.Mesh[];
  ready: Promise<void>;
  /** stream in LOD 2 — called when a hover is imminent */
  loadFibres(): void;
  /** which side of piece i faces the room */
  setReversed(i: number, reversed: boolean): void;
  isReversed(i: number): boolean;
  /** `keyView`: each piece's track light, in view space, for the pile's micro-shadows */
  update(live: Live, dt: number, active: number, keyView: THREE.Vector3[]): void;
  dispose(): void;
}

export function createRugs(shared: Shared, tier: Tier, maxAnisotropy: number, xs: number[]): RugsHandle {
  const loader = new THREE.TextureLoader();
  const pending: Promise<unknown>[] = [];
  const cache = new Map<string, THREE.Texture>();

  const load = (url: string, srgb: boolean, repeat: boolean) => {
    const hit = cache.get(url);
    if (hit) return hit;
    let resolve!: () => void;
    pending.push(new Promise<void>((r) => (resolve = r)));
    const tex = loader.load(url, () => resolve(), undefined, () => resolve());
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(tier.anisotropy, maxAnisotropy);
    cache.set(url, tex);
    return tex;
  };

  const photos = RUGS.map((r) => load(r.texture, true, false));
  const masks = RUGS.map((r) => load(r.mask, false, false));
  const grades = RUGS.map(gradeMatrix);
  const weaveA = load('/textures/weave-a.png', false, true);
  const weaveB = load('/textures/weave-b.png', false, true);
  // owner offsets must not be smeared across fibres when minified
  weaveB.minFilter = THREE.LinearMipmapNearestFilter;

  /* geometry: the full photograph, fringe and transparent margin included */
  const [sx, sz] = tier.rugSegments;
  const W = RUG.planeW;
  const D = RUG.planeD;
  const pos = new Float32Array((sx + 1) * (sz + 1) * 3);
  const nrm = new Float32Array((sx + 1) * (sz + 1) * 3);
  const uv = new Float32Array((sx + 1) * (sz + 1) * 2);
  const idx: number[] = [];
  for (let j = 0; j <= sz; j++) {
    for (let i = 0; i <= sx; i++) {
      const k = j * (sx + 1) + i;
      pos[k * 3] = (i / sx - 0.5) * W;
      pos[k * 3 + 1] = 0;
      pos[k * 3 + 2] = (j / sz - 0.5) * D;
      nrm[k * 3 + 1] = 1;
      uv[k * 2] = i / sx;
      uv[k * 2 + 1] = 1 - j / sz; // far edge = top of the photograph
    }
  }
  for (let j = 0; j < sz; j++) {
    for (let i = 0; i < sx; i++) {
      const a = j * (sx + 1) + i;
      const b = a + 1;
      const c = a + sx + 1;
      const d = c + 1;
      idx.push(a, c, d, a, d, b); // +y is the front face
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(idx);

  const build = (piece: number) => {
    const uniforms = {
      uTime: shared.uTime,
      uMotion: { value: 1 },
      uFlip: { value: 0 },
      uFlipDir: { value: 1 },
      uLift: { value: 0 },
      uShape: { value: 1 },
      uRipple: { value: 0 },
      uCurlR: { value: 0.23 },
      uHalf: { value: new THREE.Vector2(W / 2, D / 2) },
      uBodyHalf: { value: new THREE.Vector2(RUG.bodyHalfX, RUG.bodyHalfZ) },
      tRug: { value: photos[piece] },
      tRugNext: { value: photos[piece] },
      tMask: { value: masks[piece] },
      tMaskNext: { value: masks[piece] },
      tWeaveA: { value: weaveA },
      tWeaveB: { value: weaveB },
      tFiberA: { value: weaveA as THREE.Texture },
      tFiberB: { value: weaveB as THREE.Texture },
      uGrade: { value: grades[piece] },
      uGradeNext: { value: grades[piece] },
      uTexSize: { value: new THREE.Vector2(RUG_IMAGE.w, RUG_IMAGE.h) },
      uBodyUv: { value: new THREE.Vector4(...RUG.bodyUv) },
      // centre (uv) and half-size (uv) of the restoration patch: ≈ 5 × 3.5 cm
      uRepair: { value: new THREE.Vector4(0.672, 0.365, 0.0075, 0.0095) },
      uFiberReady: { value: 0 },
      uDetail: { value: 0 },
      uSat: { value: 0 },
      uCross: { value: 0 },
      uBlur: { value: 0 },
      uPomDepth: { value: 0.5 },
      uKnotGain: { value: 1.3 },
      uTile: { value: RUG.knotsPerTile },
      uPomQuality: { value: tier.name === 'high' ? 1 : 0.6 },
      uReversed: { value: 0 },
      uKeyView: { value: new THREE.Vector3(0, 3, 2) },
    };

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      sheen: 1,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(0.016, 0.017, 0.019),
      side: THREE.DoubleSide,
      alphaTest: 0.5,
      alphaToCoverage: tier.msaa > 0,
      envMapIntensity: 0,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_COMMON}`)
        .replace(
          '#include <beginnormal_vertex>',
          `rugDeform(position);
           vRugUv = uv;
           vec3 objectNormal = rugNrm;
           #ifdef USE_TANGENT
             vec3 objectTangent = vec3(1.0, 0.0, 0.0);
           #endif`,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = rugPos;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <map_fragment>', FRAG_ALPHA)
        .replace('#include <normal_fragment_maps>', FRAG_BODY)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${FRAG_SHEEN}`);
    };
    material.customProgramCacheKey = () => 'nafis-rug';

    const mesh = new THREE.Mesh(geometry, material);
    // built lying down (pile = +y, top of the photograph = −z); stood up so the pile faces the room
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(xs[piece], RUG.cy, RUG.z);
    mesh.frustumCulled = false;
    mesh.name = `rug-${piece}`;
    return { mesh, material, uniforms };
  };

  const pieces = RUGS.map((_, i) => build(i));
  const ready = Promise.all(pending).then(() => undefined);

  let fibreRequested = false;
  let fibreLoaded = false;

  return {
    meshes: pieces.map((p) => p.mesh),
    ready,
    loadFibres() {
      if (fibreRequested) return;
      fibreRequested = true;
      let left = 2;
      const done = () => {
        if (--left === 0) fibreLoaded = true;
      };
      const mk = (url: string) => {
        const t = loader.load(url, done, undefined, done);
        t.colorSpace = THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.anisotropy = Math.min(tier.anisotropy, maxAnisotropy);
        cache.set(url, t);
        return t;
      };
      const fa = mk('/textures/fiber-a.jpg');
      const fb = mk('/textures/fiber-b.webp');
      for (const p of pieces) {
        p.uniforms.tFiberA.value = fa;
        p.uniforms.tFiberB.value = fb;
      }
    },
    setReversed(i, reversed) {
      pieces[i].uniforms.uReversed.value = reversed ? 1 : 0;
    },
    isReversed(i) {
      return pieces[i].uniforms.uReversed.value > 0.5;
    },
    update(live, dt, active, keyView) {
      // L2 arrives eased, never popped, even if the download lands mid-dolly
      const ready = fibreLoaded ? 1 : 0;
      pieces.forEach((p, i) => {
        const u = p.uniforms;
        const mine = i === active;
        u.uMotion.value = live.reduced ? 0 : 1;
        // only the piece in front of the visitor is ever handled
        u.uFlip.value = mine ? live.flip : 0;
        u.uFlipDir.value = live.flipDir;
        u.uLift.value = mine ? live.lift : 0;
        u.uShape.value = mine ? live.shape : 1;
        u.uRipple.value = mine ? live.ripple : 0;
        u.uBlur.value = mine ? live.blur : 0;
        u.uDetail.value = live.rugDetail;
        u.uSat.value = live.rugSat;
        u.uKeyView.value.copy(keyView[i]);
        u.uFiberReady.value += (ready - u.uFiberReady.value) * Math.min(1, dt * 3.5);
      });
    },
    dispose() {
      geometry.dispose();
      pieces.forEach((p) => p.material.dispose());
      cache.forEach((t) => t.dispose());
    },
  };
}
