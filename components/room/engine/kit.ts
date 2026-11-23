/**
 * THE WORKSHOP — the shapes and the materials the furniture is made of.
 *
 * Shapes are built from profiles (lathe), outlines (extrude) and rounded
 * boxes, so every edge has a radius: nothing in a good room is a sharp cube.
 * Materials are made once and shared; upholstery is the exception — each
 * upholstered piece owns its own, so it can be re-covered alone.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { marbleSurface, walnutSurface, weaveRelief } from './textures';

/* ----------------------------------------------------------------- shapes */

export const roundedBox = (w: number, h: number, d: number, r: number, segments = 4) =>
  new RoundedBoxGeometry(w, h, d, segments, Math.min(r, w / 2, h / 2, d / 2) * 0.999);

/**
 * A drum with rounded top and bottom edges: lathe of a profile running up
 * the outside. `top` / `bottom` radius of the round-over; `taper` narrows the
 * top by that fraction.
 */
export function drum(radius: number, height: number, round: number, opts: { taper?: number; bottom?: number; segments?: number; bulge?: number } = {}) {
  const taper = opts.taper ?? 0;
  const bottom = opts.bottom ?? round * 0.4;
  const rTop = radius * (1 - taper);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 8) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  };
  arc(radius - bottom, bottom, bottom, -Math.PI / 2, 0, 5);
  const bulge = opts.bulge ?? 0;
  if (bulge) {
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const y = bottom + (height - round - bottom) * t;
      pts.push(new THREE.Vector2(radius + (rTop - radius) * t + Math.sin(t * Math.PI) * bulge, y));
    }
  }
  arc(rTop - round, height - round, round, 0, Math.PI / 2, 8);
  pts.push(new THREE.Vector2(0, height));
  const g = new THREE.LatheGeometry(pts, opts.segments ?? 48);
  return g;
}

/** a column with n flutes cut into it */
export function fluted(radius: number, height: number, flutes: number, depth = 0.06, segments = 128) {
  const g = new THREE.CylinderGeometry(radius, radius, height, segments, 1, false);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const r = Math.hypot(v.x, v.z);
    if (r < radius * 0.5) continue;
    const a = Math.atan2(v.z, v.x);
    const k = 1 - depth * Math.pow(Math.abs(Math.cos((a * flutes) / 2)), 0.6);
    p.setXYZ(i, (v.x / r) * radius * k, v.y, (v.z / r) * radius * k);
  }
  g.computeVertexNormals();
  g.translate(0, height / 2, 0);
  return g;
}

/** a rounded-rectangle outline (a stadium when r = h/2), centred */
export function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** a flat slab with a soft edge, from an outline, lying in the floor plane with its top at y = 0 */
export function slab(shape: THREE.Shape, thickness: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(thickness - bevel * 2, 0.001),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 40,
  });
  // shape in xy, extruded along +z → lay it down: xy → xz, z → y
  g.rotateX(-Math.PI / 2);
  g.translate(0, -thickness + bevel, 0);
  return g;
}

/* --------------------------------------------------------------- upholstery */

/** spread a box's grid so a share (`band`) of its rows falls in the rounded band at each edge */
const spread = (t: number, flat: number, band = 0.5) => {
  const a = Math.abs(t);
  const split = 1 - band;
  const m = a < split ? (a / split) * flat : flat + ((a - split) / band) * (1 - flat);
  return Math.sign(t) * m;
};

export interface CushionOptions {
  puff?: number;
  axis?: 'y' | 'z';
  /** grid density along x, y, z */
  seg?: number;
  segs?: [number, number, number];
  /** share of the grid spent on the rounded edges */
  band?: number;
  /** buttons pulled into the face (the fill axis' + side), in the cushion's own x and the other axis */
  tufts?: [number, number][];
  tuftDepth?: number;
  tuftRadius?: number;
  /** the top edge rises toward the middle by this much (m): a camel back, a crest */
  crest?: number;
}

/**
 * A cushion: a box with its edges rounded to radius r, subdivided so it can
 * be filled out — swollen along one axis the way a stuffed cushion is,
 * fullest in the middle, flat at the seams. `puff` is the swell as a fraction
 * of the cushion's half-thickness along that axis.
 */
export function cushion(w: number, h: number, d: number, r: number, opts: CushionOptions = {}) {
  const puff = opts.puff ?? 0.15;
  const axis = opts.axis ?? 'y';
  const seg = opts.seg ?? 16;
  const band = opts.band ?? 0.5;
  const [sx, sy, sz] = opts.segs ?? [seg, Math.max(4, Math.round(seg * 0.5)), seg];
  const tufts = opts.tufts ?? [];
  const tuftDepth = opts.tuftDepth ?? 0.022;
  const tuftR2 = (opts.tuftRadius ?? 0.04) ** 2;
  const crest = opts.crest ?? 0;
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const R = Math.min(r, hw * 0.98, hh * 0.98, hd * 0.98);
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  const p = g.attributes.position as THREE.BufferAttribute;
  const fx = (hw - R) / hw;
  const fy = (hh - R) / hh;
  const fz = (hd - R) / hd;
  for (let i = 0; i < p.count; i++) {
    let x = spread(p.getX(i) / hw, fx, band) * hw;
    let y = spread(p.getY(i) / hh, fy, band) * hh;
    let z = spread(p.getZ(i) / hd, fz, band) * hd;
    // round: push every point out from the inner box to radius R
    const cx = Math.max(-(hw - R), Math.min(hw - R, x));
    const cy = Math.max(-(hh - R), Math.min(hh - R, y));
    const cz = Math.max(-(hd - R), Math.min(hd - R, z));
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-7) {
      x = cx + (dx / len) * R;
      y = cy + (dy / len) * R;
      z = cz + (dz / len) * R;
    }
    // fill out: a bell over the face, zero at the seams
    if (axis === 'y') {
      const s = Math.max(0, 1 - (x / hw) ** 2) * Math.max(0, 1 - (z / hd) ** 2);
      y += Math.sign(y) * puff * hh * Math.pow(s, 0.7) * Math.min(1, Math.abs(y) / hh);
    } else {
      const s = Math.max(0, 1 - (x / hw) ** 2) * Math.max(0, 1 - (y / hh) ** 2);
      z += Math.sign(z) * puff * hd * Math.pow(s, 0.7) * Math.min(1, Math.abs(z) / hd);
    }
    // buttons: the face is drawn in round each one, and the cloth gathers between
    if (tufts.length > 0) {
      const face = axis === 'y' ? y : z;
      if (face > 0) {
        const v = axis === 'y' ? z : y;
        let pull = 0;
        for (const [tx, tv] of tufts) pull = Math.max(pull, Math.exp(-((x - tx) ** 2 + (v - tv) ** 2) / tuftR2));
        const k = Math.min(1, face / ((axis === 'y' ? hh : hd) * 0.6));
        if (axis === 'y') y -= tuftDepth * pull * k;
        else z -= tuftDepth * pull * k;
      }
    }
    // a crest: the upper half stretched upward, most in the middle
    if (crest > 0 && y > 0) y += crest * (y / hh) * Math.pow(Math.max(0, 1 - (x / hw) ** 2), 1.2);
    p.setXYZ(i, x, y, z);
  }
  return toCreasedNormals(g, Math.PI / 2.1);
}

/**
 * The piping round a cushion's two seams: a thin welt following the rounded
 * outline where the faces meet, perpendicular to the cushion's fill axis.
 */
export function piping(w: number, h: number, d: number, r: number, axis: 'y' | 'z' = 'y', thickness = 0.0055) {
  const k = 1 - Math.SQRT1_2;
  const R = Math.min(r, w / 2, h / 2, d / 2);
  const geos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    // the loop lies in the plane of the two other axes, at the 45° point of the round
    const a = w / 2 - R * k;
    const b = (axis === 'y' ? d : h) / 2 - R * k;
    const at = side * ((axis === 'y' ? h : d) / 2 - R * k);
    const rc = Math.min(R * 0.9, a, b);
    const pts: THREE.Vector3[] = [];
    const corner = (cx: number, cy: number, a0: number) => {
      for (let i = 0; i <= 6; i++) {
        const t = a0 + (i / 6) * (Math.PI / 2);
        const u = cx + Math.cos(t) * rc;
        const v = cy + Math.sin(t) * rc;
        pts.push(axis === 'y' ? new THREE.Vector3(u, at, v) : new THREE.Vector3(u, v, at));
      }
    };
    corner(a - rc, b - rc, 0);
    corner(-a + rc, b - rc, Math.PI / 2);
    corner(-a + rc, -b + rc, Math.PI);
    corner(a - rc, -b + rc, Math.PI * 1.5);
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), 96, thickness, 6, true));
  }
  return geos;
}

/** a cushion with its piping, as one group sharing one material */
export function upholstered(material: THREE.Material, w: number, h: number, d: number, r: number, opts: CushionOptions & { welt?: boolean } = {}) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cushion(w, h, d, r, opts), material));
  if (opts.welt !== false) for (const geo of piping(w, h, d, r, opts.axis ?? 'y')) g.add(new THREE.Mesh(geo, material));
  return g;
}

/* ------------------------------------------------------------- joinery */

/** a tube along a curve whose radius changes along it: `radius(t)`, t from 0 to 1 */
export function taperedTube(curve: THREE.Curve<THREE.Vector3>, segments: number, radial: number, radius: (t: number) => number) {
  const frames = curve.computeFrenetFrames(segments, false);
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = radius(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(p.x + r * (c * N.x + s * B.x), p.y + r * (c * N.y + s * B.y), p.z + r * (c * N.z + s * B.z));
    }
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A cabriole leg: out at the knee, in at the ankle, a scrolled foot — the
 * S-curve of every classical salon chair. Stands on the floor, its knee
 * toward +z; turn it to face the corner it stands at.
 */
export function cabriole(height: number, knee = 0.05, thick = 0.032) {
  const curve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, height, -knee * 0.2),
      new THREE.Vector3(0, height * 0.86, knee * 0.55),
      new THREE.Vector3(0, height * 0.62, knee * 0.35),
      new THREE.Vector3(0, height * 0.3, -knee * 0.15),
      new THREE.Vector3(0, height * 0.1, knee * 0.05),
      new THREE.Vector3(0, 0.012, knee * 0.32),
    ],
    false,
    'centripetal',
  );
  // full at the knee, slim at the ankle, a little fuller again at the foot
  const radius = (t: number) => thick * (1.15 - 0.55 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) + 0.35 * Math.max(0, (t - 0.82) / 0.18) ** 2);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(taperedTube(curve, 40, 12, radius), undefined));
  const foot = new THREE.Mesh(new THREE.SphereGeometry(thick * 0.75, 16, 10));
  foot.scale.set(1, 0.55, 1.3);
  foot.position.set(0, thick * 0.4, knee * 0.36);
  g.add(foot);
  return g;
}

/** a carved scroll — a C of wood, curling in on itself — for crests and arm fronts */
export function scroll(radius: number, thickness: number, turn = Math.PI * 1.45) {
  return new THREE.TorusGeometry(radius, thickness, 8, 28, turn);
}

/** give every mesh in a group one material */
export function clad<T extends THREE.Object3D>(o: T, material: THREE.Material): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = material;
  });
  return o;
}

/* -------------------------------------------------------------- materials */

export interface Kit {
  walnut: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  /** carved wood under gold leaf, worn a little where hands go */
  gilt: THREE.MeshStandardMaterial;
  blackMetal: THREE.MeshStandardMaterial;
  marble: THREE.MeshPhysicalMaterial;
  travertine: THREE.MeshStandardMaterial;
  ceramic: THREE.MeshStandardMaterial;
  terracotta: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  soil: THREE.MeshStandardMaterial;
  linen: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  /** a chunky wool knit, for the throw and the lumbar cushion */
  knit: THREE.MeshPhysicalMaterial;
  books: THREE.MeshStandardMaterial[];
  /** cushions that pick up the rug's colour */
  accent: THREE.MeshPhysicalMaterial;
  velvet(hex: string): THREE.MeshPhysicalMaterial;
  leather(hex: string): THREE.MeshPhysicalMaterial;
  dispose(): void;
}

export function createKit(): Kit {
  const made: THREE.Material[] = [];
  const keep = <M extends THREE.Material>(m: M) => (made.push(m), m);

  const wood = walnutSurface();
  const walnutMap = wood.map.clone();
  walnutMap.repeat.set(1.6, 1.6);
  const walnutData = wood.data.clone();
  walnutData.repeat.set(1.6, 1.6);
  const walnut = keep(
    new THREE.MeshStandardMaterial({ map: walnutMap, roughnessMap: walnutData, bumpMap: walnutData, bumpScale: 0.6, roughness: 1, color: 0xffffff }),
  );

  const stone = marbleSurface();
  const marble = keep(
    new THREE.MeshPhysicalMaterial({ map: stone.map, roughnessMap: stone.data, roughness: 1, clearcoat: 0.7, clearcoatRoughness: 0.08 }),
  );

  const weave = weaveRelief();
  const velvetWeave = weave.clone();
  velvetWeave.repeat.set(22, 22);
  velvetWeave.needsUpdate = true;

  const knitWeave = weave.clone();
  knitWeave.repeat.set(7, 7);
  knitWeave.needsUpdate = true;

  const velvet = (hex: string) =>
    keep(
      new THREE.MeshPhysicalMaterial({
        color: hex,
        roughness: 0.88,
        sheen: 1,
        sheenRoughness: 0.36,
        sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.42),
        bumpMap: velvetWeave,
        bumpScale: 0.12,
        specularIntensity: 0.25,
      }),
    );

  const leather = (hex: string) =>
    keep(
      new THREE.MeshPhysicalMaterial({
        color: hex,
        roughness: 0.48,
        clearcoat: 0.25,
        clearcoatRoughness: 0.4,
        bumpMap: velvetWeave,
        bumpScale: 0.15,
      }),
    );

  const travertine = keep(new THREE.MeshStandardMaterial({ color: '#c7b394', roughness: 0.6 }));
  travertine.onBeforeCompile = (shader) => {
    // bedding lines in object space: it is a solid stone
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float bed = sin(vObj.y * 160.0 + sin(vObj.x * 9.0 + vObj.z * 7.0) * 2.0) * 0.5 + 0.5;
        float pit = step(0.93, fract(sin(dot(floor(vObj * 260.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453));
        diffuseColor.rgb *= 0.9 + bed * 0.12 - pit * 0.25;`,
      );
  };

  const kit: Kit = {
    walnut,
    brass: keep(new THREE.MeshStandardMaterial({ color: '#c09a5b', metalness: 1, roughness: 0.3 })),
    gilt: keep(new THREE.MeshStandardMaterial({ color: '#c6a45e', metalness: 0.82, roughness: 0.36, bumpMap: walnutData, bumpScale: 0.35 })),
    blackMetal: keep(new THREE.MeshStandardMaterial({ color: '#141312', metalness: 0.7, roughness: 0.42 })),
    marble,
    travertine,
    ceramic: keep(new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.7, bumpMap: velvetWeave, bumpScale: 0.08 })),
    terracotta: keep(new THREE.MeshStandardMaterial({ color: '#8c5a40', roughness: 0.85 })),
    bark: keep(new THREE.MeshStandardMaterial({ color: '#4a3d31', roughness: 0.95 })),
    soil: keep(new THREE.MeshStandardMaterial({ color: '#1d1712', roughness: 1 })),
    linen: keep(new THREE.MeshStandardMaterial({ color: '#e8e0d2', roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.82 })),
    paper: keep(new THREE.MeshStandardMaterial({ color: '#efe9de', roughness: 0.85 })),
    knit: keep(
      new THREE.MeshPhysicalMaterial({
        color: '#d9cdb9',
        roughness: 0.96,
        sheen: 0.7,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color('#fff6e8'),
        bumpMap: knitWeave,
        bumpScale: 0.9,
      }),
    ),
    books: ['#2d3a35', '#8e7d63', '#5a1f1c', '#d8cfbf', '#1c2230'].map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }))),
    accent: velvet('#5a1520'),
    velvet,
    leather,
    dispose() {
      for (const m of made) m.dispose();
      walnutMap.dispose();
      walnutData.dispose();
      velvetWeave.dispose();
      knitWeave.dispose();
    },
  };
  return kit;
}

/** every mesh in a group casts and receives */
export function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}
