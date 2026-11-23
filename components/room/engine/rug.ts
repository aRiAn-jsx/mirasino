/**
 * THE RUG ON THE FLOOR
 *
 * True size. A rug in the catalogue is 90 × 60 or 400 × 300 — there is one
 * photograph, of a 300 × 158 piece. It is laid at the photograph's own knot
 * density (so a knot is always a knot), and stretched to a new size the way a
 * weaver would: the borders stay whole and keep their width; the field in the
 * middle is cropped if the rug is smaller, or continued in mirror if it is
 * larger (a nine-slice, with a mirrored centre). Then re-dyed: the gallery's
 * own dye remap, or the shop's CSS filter as an exact colour transform.
 *
 * Up close it is knots, not pixels: inside a knot one dye colour, a woven
 * relief tile, and — when the lens is very near — the fibre tile, all shared
 * with the gallery (scripts/build-textures.mjs).
 *
 * It arrives rolled, and leaves the same way: the vertex shader wraps the
 * cloth beyond the roll's front onto an Archimedean spiral (arc-length exact),
 * pile inward, the way rugs are rolled for carrying — so a rolled rug shows its
 * back, the knots' side.
 */
import * as THREE from 'three';
import { RUG_IMAGE, RUGS } from '@/components/hero/config';
import type { Product } from '@/components/site/catalog';
import { rugSize } from '../model';
import { cssFilterToAffine, dyeMatrix, hasDyes } from './filters';
import { blotTexture } from './textures';

/** the photograph's body, in metres, at its own knot density */
const MPP = 3.0 / (RUG_IMAGE.body.x1 - RUG_IMAGE.body.x0);
const SRC = new THREE.Vector2((RUG_IMAGE.body.x1 - RUG_IMAGE.body.x0) * MPP, (RUG_IMAGE.body.y1 - RUG_IMAGE.body.y0) * MPP);
/** fringe beyond the body at each end, as far as the photograph runs */
const FRINGE = RUG_IMAGE.body.x0 * MPP;
/** the border band, measured off the photograph */
const BORDER = new THREE.Vector2(0.27, 0.27);
const BODY_UV = new THREE.Vector4(
  RUG_IMAGE.body.x0 / RUG_IMAGE.w,
  1 - RUG_IMAGE.body.y1 / RUG_IMAGE.h,
  RUG_IMAGE.body.x1 / RUG_IMAGE.w,
  1 - RUG_IMAGE.body.y0 / RUG_IMAGE.h,
);
const THICK = 0.011;

const ROLL_GLSL = /* glsl */ `
uniform float uFront;
uniform float uEnd;
uniform float uCore;
uniform float uK;
uniform vec2 uSize;
varying vec2 vLocal;

// flat cloth (x along the rug, y = height above the floor, z across) → laid or rolled
vec3 rugRoll(vec3 p, out vec3 up) {
  up = vec3(0.0, 1.0, 0.0);
  float s = p.x - uFront;
  if (s <= 0.0) return p;
  float S = max(uEnd - uFront, 0.0);
  float R = sqrt(uCore * uCore + 2.0 * uK * S);
  // arc length along r = R − kθ  →  θ
  float th = (R - sqrt(max(R * R - 2.0 * uK * s, uCore * uCore * 0.2))) / uK;
  float r = R - uK * th;
  vec2 radial = vec2(sin(th), -cos(th));
  vec2 q = vec2(uFront, R) + radial * r - radial * p.y;
  up = vec3(-radial, 0.0);
  return vec3(q.x, q.y, p.z);
}
`;

const FRAG_HEAD = /* glsl */ `
uniform sampler2D tPhoto;
uniform sampler2D tMask;
uniform sampler2D tWeave;
uniform sampler2D tOwner;
uniform sampler2D tFiber;
uniform mat3 uFilterM;
uniform vec3 uFilterO;
uniform mat3 uDye;
uniform vec2 uSize;
uniform vec2 uSrc;
uniform vec2 uBorder;
uniform vec4 uBodyUv;
uniform vec2 uTexSize;
uniform float uMpp;
uniform float uFiberReady;
uniform float uDetail;
varying vec2 vLocal;

float rugHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float rugNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rugHash(i), rugHash(i + vec2(1, 0)), f.x), mix(rugHash(i + vec2(0, 1)), rugHash(i + vec2(1, 1)), f.x), f.y);
}

// one axis of the nine-slice: x from the body's low edge, R the rug's extent, T the photograph's, B the border
float rugSlice(float x, float R, float T, float B) {
  if (x < B) return x;
  if (x > R - B) return T - (R - x);
  float F = T * 0.5 - B;
  float f = x - R * 0.5;
  float m = mod(f + F, 4.0 * F);
  return T * 0.5 + (m < 2.0 * F ? m - F : 3.0 * F - m);
}
vec2 rugUvAt(vec2 local) {
  vec2 b = local + uSize * 0.5;
  vec2 s = vec2(rugSlice(b.x, uSize.x, uSrc.x, uBorder.x), rugSlice(b.y, uSize.y, uSrc.y, uBorder.y));
  return uBodyUv.xy + s / uSrc * (uBodyUv.zw - uBodyUv.xy);
}
vec3 rugToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 rugDye(vec3 srgb) {
  return max(uDye * rugToLinear(clamp(uFilterM * srgb + uFilterO, 0.0, 1.0)), vec3(0.0));
}
`;

/** replaces <map_fragment> */
const FRAG_ALBEDO = /* glsl */ `
vec2 rugUv = rugUvAt(vLocal);
vec2 rugScale = (uBodyUv.zw - uBodyUv.xy) / uSrc;
vec2 rugDx = dFdx(vLocal) * rugScale;
vec2 rugDy = dFdy(vLocal) * rugScale;
float rugBody = step(abs(vLocal.x), uSize.x * 0.5) * step(abs(vLocal.y), uSize.y * 0.5);
bool rugPile = gl_FrontFacing;
vec3 rugAlbedo = rugDye(textureGrad(tPhoto, rugUv, rugDx, rugDy).rgb);
float rugPxk = 1.0 / max(max(length(rugDx * uTexSize), length(rugDy * uTexSize)), 1e-5);
float rugKnotW = smoothstep(2.2, 6.5, rugPxk) * rugBody * uDetail * (rugPile ? 1.0 : 0.0);
float rugFibreW = smoothstep(30.0, 90.0, rugPxk) * uFiberReady;
vec2 rugNt = vec2(0.0);
float rugCrest = 0.0;
// derivatives before the branch: inside non-uniform control flow they are undefined
vec2 kp = vLocal / uMpp;
vec2 tc = kp / 8.0;
vec2 tdx = dFdx(tc);
vec2 tdy = dFdy(tc);
if (rugKnotW > 0.003) {
  vec4 ta = mix(textureGrad(tWeave, tc, tdx, tdy), textureGrad(tFiber, tc, tdx, tdy), rugFibreW);
  // the tile also knows, for every fibre, which knot it grows from: a tuft that leans over its
  // neighbour keeps its own colour, so the knots read as pile, not as a grid of squares
  vec4 tb = textureGrad(tOwner, tc, tdx, tdy);
  float wOwner = smoothstep(10.0, 26.0, rugPxk);
  vec2 cell = floor(kp + (tb.rg - 0.5) * 3.0 * wOwner);
  // one knot, one dye: the colour at the knot's own centre, wherever the nine-slice put it
  vec3 knot = rugDye(textureLod(tPhoto, rugUvAt((cell + 0.5) * uMpp), 0.0).rgb);
  knot *= 0.88 + 0.24 * rugHash(cell);
  float cotton = (1.0 - smoothstep(0.08, 0.2, tb.b)) * wOwner;
  knot *= mix(1.0, mix(0.6, 1.25, smoothstep(0.2, 1.0, tb.b)), wOwner);
  knot = mix(knot, vec3(0.30, 0.285, 0.255), cotton);
  float relief = smoothstep(5.0, 22.0, rugPxk);
  knot *= mix(1.0, mix(0.16, 1.04, smoothstep(0.08, 0.8, ta.b)), relief);
  rugAlbedo = mix(rugAlbedo, knot, rugKnotW);
  rugNt = (ta.rg - 0.5) * 2.0 * rugKnotW;
  rugCrest = smoothstep(0.62, 0.96, ta.b) * rugFibreW;
}
// abrash, and the nap brushed this way and that
float rugAb = rugNoise(vec2(vLocal.x * 3.6, 0.5)) - 0.5 + 0.5 * (rugNoise(vec2(vLocal.x * 12.0, vLocal.y * 0.4 + 3.5)) - 0.5);
rugAlbedo *= 1.0 + 0.08 * rugAb * rugBody;
rugAlbedo *= 0.955 + 0.09 * rugNoise(vLocal * vec2(2.3, 2.6) + 9.0);
if (!rugPile) {
  // the back: the same design, flatter and darker, the knots in a plain grid
  vec2 g = abs(fract(vLocal / uMpp) - 0.5);
  float seam = smoothstep(0.32, 0.5, max(g.x, g.y)) * smoothstep(3.0, 7.0, rugPxk) * rugBody;
  rugAlbedo *= 0.78 * (1.0 - 0.35 * seam);
}
diffuseColor.rgb = rugAlbedo;
`;

const FRAG_ALPHA = /* glsl */ `
diffuseColor.a *= textureGrad(tMask, rugUv, rugDx, rugDy).r;
`;

const FRAG_NORMAL = /* glsl */ `
{
  vec3 pdx = dFdx(-vViewPosition);
  vec3 pdy = dFdy(-vViewPosition);
  vec2 ldx = dFdx(vLocal);
  vec2 ldy = dFdy(vLocal);
  vec3 q1p = cross(pdy, normal);
  vec3 q0p = cross(normal, pdx);
  vec3 Tg = q1p * ldx.x + q0p * ldy.x;
  vec3 Bg = q1p * ldx.y + q0p * ldy.y;
  float det = max(dot(Tg, Tg), dot(Bg, Bg));
  float sc = det == 0.0 ? 0.0 : inversesqrt(det);
  vec3 nt = vec3(rugNt, sqrt(max(1.0 - dot(rugNt, rugNt), 0.05)));
  normal = normalize(mat3(Tg * sc, Bg * sc, normal) * nt);
}
`;

const FRAG_ROUGH = /* glsl */ `
roughnessFactor = mix(0.7, 1.0, rugBody);
roughnessFactor = mix(roughnessFactor, 0.55, rugCrest * 0.7);
`;

const FRAG_SHEEN = /* glsl */ `
#ifdef USE_SHEEN
  material.sheenColor = mix(vec3(0.16, 0.16, 0.17), vec3(0.03, 0.03, 0.032), rugBody) * (1.0 + rugCrest * 3.0);
  material.sheenRoughness = mix(0.45, 0.8, rugBody);
#endif
`;

/* ----------------------------------------------------------------- geometry */

/** a long strip of cloth: top, and the two long sides; positions are the flat cloth (x, height, z) */
function clothGeometry(length: number, width: number) {
  const end = length / 2 + FRINGE;
  const n = Math.min(520, Math.max(90, Math.ceil((end * 2) / 0.011)));
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const top = (x: number) => (Math.abs(x) <= length / 2 ? THICK : 0.002);
  // top: two rows
  for (let i = 0; i <= n; i++) {
    const x = -end + (2 * end * i) / n;
    pos.push(x, top(x), -width / 2, x, top(x), width / 2);
    nor.push(0, 1, 0, 0, 1, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  // the sides: top edge and floor, facing out
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const x = -end + (2 * end * i) / n;
      pos.push(x, top(x), (side * width) / 2, x, 0, (side * width) / 2);
      nor.push(0, 0, side, 0, 0, side);
    }
    for (let i = 0; i < n; i++) {
      const t0 = base + i * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      if (side > 0) idx.push(b0, b1, t0, t0, b1, t1);
      else idx.push(b0, t0, b1, t0, t1, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  // the cloth can roll up into a log anywhere along its length
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(end, width / 2) + 0.4);
  return { geometry: g, end };
}

/* ---------------------------------------------------------------- handle */

export interface RugHandle {
  group: THREE.Group;
  /** invisible plane matching the rug, for picking */
  proxy: THREE.Mesh;
  ready: Promise<void>;
  /** 0 rolled up at its near end … 1 laid flat */
  roll: { value: number };
  size: { length: number; width: number };
  setProduct(product: Product): void;
  applyRoll(): void;
  requestFibres(): void;
  dispose(): void;
}

export function createRug(maxAnisotropy: number): RugHandle {
  const loader = new THREE.TextureLoader();
  const pending: Promise<void>[] = [];
  // every texture here is data to the shader: even the photograph is sampled as its stored sRGB
  // values, because the dye transform is defined on those (the shader linearises afterwards)
  const load = (url: string, repeat: boolean) => {
    let done!: () => void;
    pending.push(new Promise<void>((r) => (done = r)));
    const t = loader.load(url, () => done(), undefined, () => done());
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = maxAnisotropy;
    return t;
  };
  const photo = load(RUGS[0].texture, false);
  const mask = load(RUGS[0].mask, false);
  const weave = load('/textures/weave-a.png', true);
  const owner = load('/textures/weave-b.png', true);
  // owner offsets must never be averaged across fibres
  owner.minFilter = THREE.LinearMipmapNearestFilter;
  // a 1×1 stand-in until the fibre tile is asked for
  const blank = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  blank.needsUpdate = true;

  const uniforms = {
    tPhoto: { value: photo as THREE.Texture },
    tMask: { value: mask as THREE.Texture },
    tWeave: { value: weave as THREE.Texture },
    tOwner: { value: owner as THREE.Texture },
    tFiber: { value: blank as THREE.Texture },
    uFilterM: { value: new THREE.Matrix3() },
    uFilterO: { value: new THREE.Vector3() },
    uDye: { value: new THREE.Matrix3() },
    uSize: { value: new THREE.Vector2(3, 1.58) },
    uSrc: { value: SRC.clone() },
    uBorder: { value: BORDER.clone() },
    uBodyUv: { value: BODY_UV.clone() },
    uTexSize: { value: new THREE.Vector2(RUG_IMAGE.w, RUG_IMAGE.h) },
    uMpp: { value: MPP },
    uFiberReady: { value: 0 },
    uDetail: { value: 1 },
    uFront: { value: 0 },
    uEnd: { value: 2 },
    uCore: { value: 0.035 },
    uK: { value: (THICK * 1.15) / (Math.PI * 2) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0.04, 0.04, 0.042),
    specularIntensity: 0.18,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
    alphaTest: 0.5,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ROLL_GLSL}`)
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 rugUp;
        vec3 rugP = rugRoll(position, rugUp);
        vec3 objectNormal = abs(normal.z) > 0.5 ? normal : rugUp;
        vLocal = vec2(position.x, clamp(position.z, -uSize.y * 0.5 + 0.003, uSize.y * 0.5 - 0.003));`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = rugP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <map_fragment>', FRAG_ALBEDO)
      .replace('#include <alphamap_fragment>', FRAG_ALPHA)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${FRAG_SHEEN}`);
  };
  material.customProgramCacheKey = () => 'nafis-floor-rug';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ROLL_GLSL}`)
      .replace('#include <begin_vertex>', 'vec3 rugUp;\nvec3 transformed = rugRoll(position, rugUp);\nvLocal = position.xz;');
  };
  depth.customProgramCacheKey = () => 'nafis-floor-rug-depth';

  const group = new THREE.Group();
  group.name = 'rug';
  let built = clothGeometry(3, 1.58);
  const mesh = new THREE.Mesh(built.geometry, material);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  group.add(mesh);

  // the floor darkens a little right round the rug's edge, where the pile meets it: it lies on the floor, not over it
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blotTexture(), transparent: true, opacity: 0.5, depthWrite: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), groundMat);
  ground.position.y = 0.0015;
  ground.renderOrder = 1;
  group.add(ground);

  const proxy = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.y = THICK;
  proxy.name = 'rug-proxy';
  group.add(proxy);

  const roll = { value: 1 };
  const size = { length: 3, width: 1.58 };

  const handle: RugHandle = {
    group,
    proxy,
    ready: Promise.all(pending).then(() => undefined),
    roll,
    size,
    setProduct(product) {
      const { length, width } = rugSize(product);
      size.length = length;
      size.width = width;
      built.geometry.dispose();
      built = clothGeometry(length, width);
      mesh.geometry = built.geometry;
      uniforms.uSize.value.set(length, width);
      uniforms.uEnd.value = built.end;
      proxy.scale.set(length, 1, width);
      ground.scale.set(length + 0.16, 1, width + 0.16);

      const gallery = hasDyes(product.id);
      const affine = gallery ? { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], o: [0, 0, 0] } : cssFilterToAffine(product.filter);
      const m = affine.m;
      uniforms.uFilterM.value.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
      uniforms.uFilterO.value.set(affine.o[0], affine.o[1], affine.o[2]);
      const d = dyeMatrix(product.id);
      uniforms.uDye.value.set(d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8]);
      handle.applyRoll();
    },
    applyRoll() {
      // 0: the front stands at the near end with everything wound behind it; 1: past the far end
      const end = built.end;
      uniforms.uFront.value = -end + roll.value * (end * 2 + 0.02);
      // a rolled rug is a log on the floor, not a pickable plane, and it shades no rectangle
      proxy.visible = roll.value > 0.98;
      groundMat.opacity = 0.5 * Math.pow(roll.value, 4);
    },
    requestFibres() {
      if (uniforms.uFiberReady.value > 0 || uniforms.tFiber.value !== blank) return;
      const t = loader.load('/textures/fiber-a.jpg', () => {
        uniforms.tFiber.value = t;
        uniforms.uFiberReady.value = 1;
      });
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAnisotropy;
      uniforms.tFiber.value = t;
    },
    dispose() {
      built.geometry.dispose();
      material.dispose();
      depth.dispose();
      for (const t of [photo, mask, weave, owner, blank, uniforms.tFiber.value]) t.dispose();
      proxy.geometry.dispose();
      ground.geometry.dispose();
      groundMat.dispose();
    },
  };
  handle.applyRoll();
  return handle;
}
