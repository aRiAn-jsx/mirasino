/**
 * COLUMNS — Persepolis, complete and in frame, in a sandy limestone.
 *
 * Bottom to top, after the reference drawing:
 *
 *   square plinth → low drum → the bell, Persepolis' own base: a ring of
 *     drooping leaves that swells out and tucks in under a torus → fillet
 *   → a stout shaft, tapering a little toward the top, cut with sixteen
 *     flutes, each stopped short of the ends and separated by flat fillets
 *   → ringed necking → the corolla, a cup of eight palm leaves opening
 *     under a round abacus → bearing plate
 *   → the double-protome capital: two Homa — Persepolis' griffin, an eagle's
 *     head on a lion's forequarters — back to back: hooked beaks out, tall
 *     ears up, a crest of carved curls down each nape and chest, a collar,
 *     forelegs stretched onto the plate; and between their shoulders the
 *     square block with its framed twelve-petalled rosette.
 *
 * Turned parts are generated as patches whose normals are taken inside the
 * patch, which keeps every arris crisp. The animals are authored in profile
 * (the capitals are read in profile, as the originals are), one outline per
 * piece of stone — body, mandibles, ears, collar, forelegs — each cut to its
 * own depth and rounded over, so the head is broader than the beak and the
 * legs stand proud of the chest. Curls, eyes and toes are added in the round.
 *
 * The stone is limestone the colour of dry earth. Its tool marks and pitting
 * are too fine to model, so they are a relief known only by its slope (a bump);
 * the arrises and the high points of the carving are worn a little smooth; and
 * the foot of each column, which stands in the liquid, has drawn it up and
 * gone dark.
 *
 * Each column has two small lights of its own, evaluated in its shader — an
 * in-ground footlight that models the base and grazes the flutes, and a high
 * accent on the capital — and a thin cool edge from the wash on the wall
 * behind, which is what lifts it off the dark.
 */
import * as THREE from 'three';
import { COLUMNS } from '../config';
import type { Live } from '../live';
import { NOISE } from './glsl';

type P2 = [number, number];
type P3 = [number, number, number];

interface Builder {
  pos: number[];
  nor: number[];
  ao: number[];
  idx: number[];
}

const A = new THREE.Vector3();
const B = new THREE.Vector3();
const C = new THREE.Vector3();
const N = new THREE.Vector3();

/** u runs round the column (increasing angle), v runs up it */
function patch(b: Builder, nu: number, nv: number, P: (u: number, v: number) => P3, ao: (u: number, v: number) => number) {
  const base = b.pos.length / 3;
  const e = 2e-3;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const v = j / nv;
      const p = P(u, v);
      A.set(...P(Math.min(1, u + e), v)).sub(B.set(...P(Math.max(0, u - e), v)));
      C.set(...P(u, Math.min(1, v + e))).sub(B.set(...P(u, Math.max(0, v - e))));
      N.crossVectors(C, A).normalize();
      b.pos.push(p[0], p[1], p[2]);
      b.nor.push(N.x, N.y, N.z);
      b.ao.push(ao(u, v));
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i;
      const c = a + nu + 1;
      b.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
}

/** fold a ready-made geometry (box, extrusion…) into the column */
function append(b: Builder, geometry: THREE.BufferGeometry, x: number, y: number, z: number, ao = 1) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.translate(x, y, z);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const base = b.pos.length / 3;
  for (let i = 0; i < p.count; i++) {
    b.pos.push(p.getX(i), p.getY(i), p.getZ(i));
    b.nor.push(n.getX(i), n.getY(i), n.getZ(i));
    b.ao.push(ao);
    b.idx.push(base + i);
  }
  g.dispose();
  if (g !== geometry) geometry.dispose();
}

const TAU = Math.PI * 2;
const ring = (r: number, y: number, theta: number): P3 => [r * Math.cos(theta), y, r * Math.sin(theta)];
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------- the animals */

interface Run {
  smooth: boolean;
  pts: P2[];
}

/**
 * One protome in profile, facing +x — the Homa. Design units: 1 = the reach of
 * the animal from the column's axis; y = 0 is the bearing plate. Each constant
 * is one piece of stone.
 */
const BODY: Run[] = [
  // back, nape, skull, brow
  { smooth: true, pts: [[0, 0.62], [0.16, 0.62], [0.27, 0.655], [0.335, 0.74], [0.385, 0.86], [0.45, 0.96], [0.55, 1.015], [0.65, 1.015], [0.735, 0.975], [0.79, 0.9]] },
  // face, throat, the swell of the chest
  { smooth: true, pts: [[0.79, 0.9], [0.8, 0.82], [0.77, 0.735], [0.715, 0.67], [0.68, 0.585], [0.685, 0.48], [0.715, 0.385], [0.725, 0.29], [0.7, 0.19], [0.64, 0.1], [0.56, 0.03]] },
  { smooth: false, pts: [[0.54, 0], [0, 0]] },
];
/** upper mandible, hooked over… */
const BEAK_UPPER: Run[] = [
  { smooth: true, pts: [[0.745, 0.955], [0.84, 0.945], [0.925, 0.9], [0.985, 0.825], [1, 0.745], [0.985, 0.675]] },
  { smooth: true, pts: [[0.985, 0.675], [0.955, 0.725], [0.925, 0.775], [0.86, 0.805], [0.765, 0.815]] },
];
/** …the lower: the beak stands a little open */
const BEAK_LOWER: Run[] = [
  { smooth: true, pts: [[0.74, 0.79], [0.85, 0.775], [0.925, 0.745], [0.945, 0.715]] },
  { smooth: true, pts: [[0.945, 0.715], [0.89, 0.695], [0.8, 0.69], [0.725, 0.71]] },
];
const EAR: Run[] = [
  { smooth: true, pts: [[0.455, 0.94], [0.405, 1.07], [0.42, 1.23]] },
  { smooth: true, pts: [[0.42, 1.23], [0.5, 1.13], [0.575, 1]] },
];
const COLLAR: Run[] = [
  { smooth: true, pts: [[0.305, 0.715], [0.34, 0.77], [0.48, 0.69], [0.6, 0.61], [0.7, 0.55]] },
  { smooth: true, pts: [[0.675, 0.5], [0.58, 0.55], [0.46, 0.63], [0.33, 0.7], [0.305, 0.715]] },
];
/** a lion's foreleg, stretched forward, paw flat on the plate */
const FORELEG: Run[] = [
  { smooth: true, pts: [[0.5, 0.43], [0.62, 0.41], [0.78, 0.31], [0.9, 0.205], [0.97, 0.13], [1, 0.06]] },
  { smooth: false, pts: [[1, 0], [0.8, 0]] },
  { smooth: true, pts: [[0.8, 0], [0.8, 0.07], [0.72, 0.16], [0.58, 0.225], [0.48, 0.31], [0.5, 0.43]] },
];
/** rows of carved curls: down the nape, and down the front of the chest */
const NAPE_CURLS: P2[] = [[0.312, 0.7], [0.345, 0.765], [0.372, 0.832], [0.402, 0.895], [0.448, 0.95]];
const CHEST_CURLS: P2[] = [[0.69, 0.62], [0.685, 0.555], [0.69, 0.49], [0.705, 0.425]];
const CREST: P2 = [0.6, 1.035];
const EYE: P2 = [0.685, 0.905];
const BLOCK = { halfW: 0.27, y0: 0.52, y1: 1.02 };
const ROSETTE = { y: 0.78, r: 0.14 };

/** Catmull-Rom through a run of points */
function spline(pts: P2[], per = 6): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function outline(runs: Run[]): P2[] {
  const raw = runs.flatMap((r) => (r.smooth ? spline(r.pts) : r.pts));
  // runs share their end points; drop the repeats
  return raw.filter((p, i) => i === 0 || Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]) > 1e-5);
}

/**
 * A profile cut from a slab of the given depth and rounded over, centred on
 * z = 0. `inset` is how far the rounding eats into the outline, `round` how
 * deep it runs into the slab.
 */
function carve(points: P2[], unit: number, mirror: boolean, depth: number, inset: number, round: number, segments: number) {
  const pts = points.map(([x, y]) => new THREE.Vector2((mirror ? -x : x) * unit, y * unit));
  if (mirror) pts.reverse();
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: depth - 2 * round,
    bevelEnabled: true,
    bevelThickness: round,
    bevelSize: inset,
    bevelOffset: -inset,
    bevelSegments: segments,
    steps: 1,
    curveSegments: 1,
  });
  g.translate(0, 0, -(depth - 2 * round) / 2);
  return g;
}

/* ------------------------------------------------------------- the column */

function buildColumn() {
  const b: Builder = { pos: [], nor: [], ao: [], idx: [] };
  // D is the module: every height, and the reach of the capital. W is the girth of
  // the shaft at its foot — stouter than the module — and T what the taper leaves of
  // it at the top, which the necking and the depth of the capital follow.
  const D = COLUMNS.module;
  const W = COLUMNS.diameter;
  const T = W * (1 - COLUMNS.taper);
  const R = W / 2;

  /** hard-edged turned profile: each segment is its own band */
  const turned = (profile: P2[], shade: number) => {
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, y0] = profile[k];
      const [r1, y1] = profile[k + 1];
      patch(b, 64, 1, (u, v) => ring(r0 + (r1 - r0) * v, y0 + (y1 - y0) * v, u * TAU), () => shade);
    }
  };

  /* ---- base ---- */
  let y = 0;
  append(b, new THREE.BoxGeometry(1.78 * W, 0.16 * D, 1.78 * W), 0, 0.08 * D, 0, 0.95);
  y = 0.16 * D;
  turned(
    [
      [0.8 * W, y],
      [0.8 * W, y + 0.07 * D],
      [0.745 * W, y + 0.07 * D],
    ],
    0.9,
  );
  y += 0.07 * D;
  {
    // the bell: twelve drooping leaves, each parted from the next by a groove that
    // dies away where the leaves meet the torus
    const y0 = y;
    const HB = 0.26 * D;
    const spine = (u: number) => Math.pow(Math.abs(Math.cos(12 * Math.PI * u)), 0.55); // 0 in a groove, 1 along a leaf
    patch(
      b,
      144,
      10,
      (u, v) => {
        const body = 0.585 + 0.2 * Math.pow(1 - v, 0.55);
        const groove = 0.03 * (1 - spine(u)) * Math.sin(Math.PI * Math.min(1, v * 1.12 + 0.06));
        return ring(W * (body - groove), y0 + HB * v, u * TAU);
      },
      (u, v) => (0.5 + 0.5 * spine(u)) * (0.7 + 0.3 * v),
    );
    y += HB;
  }
  {
    const rc = 0.585 * W;
    const rt = 0.085 * D;
    const yc = y + rt;
    patch(
      b,
      64,
      12,
      (u, v) => {
        const phi = -Math.PI / 2 + v * Math.PI;
        return ring(rc + rt * Math.cos(phi), yc + rt * Math.sin(phi), u * TAU);
      },
      (_u, v) => 0.75 + 0.25 * Math.sin(v * Math.PI),
    );
    y += 2 * rt;
    turned(
      [
        [rc, y],
        [0.535 * W, y],
        [0.535 * W, y + 0.05 * D],
        [R, y + 0.05 * D],
      ],
      0.85,
    );
    y += 0.05 * D;
  }

  /* ---- shaft: broad stopped flutes between flat fillets ---- */
  const ys = y;
  const HS = 4.44 * D;
  const FL = COLUMNS.flutes;
  const dense = (v: number) => 0.5 - 0.5 * Math.cos(Math.PI * v); // rows gather where the flutes end
  // a straight taper: the shaft is slimmer at the necking than at the base
  const girth = (h: number) => R * (1 - COLUMNS.taper * (h / HS));
  const stopped = (h: number) => sstep(0.1 * D, 0.32 * D, h) * (1 - sstep(HS - 0.32 * D, HS - 0.1 * D, h));
  for (let k = 0; k < FL; k++) {
    patch(
      b,
      8,
      26,
      (u, v) => {
        const h = HS * dense(v);
        const r = girth(h) - 0.066 * W * Math.pow(Math.sin(Math.PI * u), 0.75) * stopped(h);
        return ring(r, ys + h, ((k + 0.1 + 0.8 * u) / FL) * TAU);
      },
      (u, v) => 1 - 0.5 * Math.sin(Math.PI * u) * stopped(HS * dense(v)),
    );
    patch(b, 2, 1, (u, v) => ring(girth(HS * v), ys + HS * v, ((k + 0.9 + 0.2 * u) / FL) * TAU), () => 1);
  }
  y = ys + HS;

  /* ---- necking, echinus, abacus ---- */
  turned(
    [
      [T / 2, y],
      [0.56 * T, y],
      [0.56 * T, y + 0.06 * D],
      [0.525 * T, y + 0.06 * D],
      [0.525 * T, y + 0.16 * D],
      [0.57 * T, y + 0.16 * D],
      [0.57 * T, y + 0.2 * D],
      [0.54 * T, y + 0.2 * D],
    ],
    0.88,
  );
  y += 0.2 * D;
  {
    // the corolla: eight palm leaves rising almost straight from the necking, then
    // opening under the abacus; the grooves between them deepen toward the rim
    const y0 = y;
    const HC = 0.41 * D;
    const spine = (u: number) => Math.pow(Math.abs(Math.cos(8 * Math.PI * u)), 0.5);
    patch(
      b,
      128,
      12,
      (u, v) => {
        const open = Math.pow(v * v * (3 - 2 * v), 1.4);
        const groove = 0.034 * (1 - spine(u)) * sstep(0.08, 0.75, v);
        return ring(T * (0.53 + 0.13 * open - groove), y0 + HC * v, u * TAU);
      },
      (u, v) => (0.52 + 0.48 * spine(u)) * (0.72 + 0.28 * v),
    );
    y += HC;
  }
  turned(
    [
      [0.6 * T, y],
      [0.68 * T, y],
      [0.68 * T, y + 0.1 * D],
      [0.3 * T, y + 0.1 * D],
    ],
    0.95,
  );
  y += 0.1 * D;
  /* ---- capital: two Homa protomes, back to back ---- */
  const U = 1.33 * D; // the reach of one animal
  const bodyDepth = 0.8 * T;
  const half = bodyDepth / 2;

  // bearing plate: long enough for the forepaws to rest on
  append(b, new THREE.BoxGeometry(2.1 * U, 0.07 * D, 1.2 * T), 0, y + 0.035 * D, 0, 0.9);
  y += 0.07 * D;

  const ball = (r: number, x: number, yy: number, z: number, ao: number, seg = 8) =>
    append(b, new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), x, yy, z, ao);
  const body = outline(BODY);

  for (const mirror of [false, true]) {
    const side = mirror ? -1 : 1;
    // the mass — torso, neck and skull — rounded right over
    append(b, carve(body, U, mirror, bodyDepth, 0.04, 0.075, 4), 0, y, 0, 0.82);
    // the beak is narrower than the skull
    append(b, carve(outline(BEAK_UPPER), U, mirror, 0.4 * T, 0.014, 0.03, 3), 0, y, 0, 0.96);
    append(b, carve(outline(BEAK_LOWER), U, mirror, 0.3 * T, 0.01, 0.022, 2), 0, y, 0, 0.86);
    // an ear each side of the skull
    for (const face of [-1, 1]) append(b, carve(outline(EAR), U, mirror, 0.085 * D, 0.007, 0.012, 2), 0, y, face * 0.25 * T, 0.92);
    // collar and forelegs stand proud of the body
    append(b, carve(outline(COLLAR), U, mirror, bodyDepth + 0.07 * D, 0.011, 0.014, 2), 0, y, 0, 1);
    append(b, carve(outline(FORELEG), U, mirror, bodyDepth + 0.22 * D, 0.03, 0.05, 3), 0, y, 0, 1);
    // curls, three abreast, down the nape and the chest; the crest knob
    for (const across of [-0.14, 0, 0.14]) {
      for (const [cx, cy] of NAPE_CURLS) ball(0.035 * U, side * cx * U, y + cy * U, across * T, 0.98);
      for (const [cx, cy] of CHEST_CURLS) ball(0.031 * U, side * cx * U, y + cy * U, across * T, 0.98);
    }
    ball(0.046 * U, side * CREST[0] * U, y + CREST[1] * U, 0, 0.98, 12);
    // eyes: a lidded socket and the ball in it, on each flank of the head
    for (const face of [-1, 1]) {
      append(b, new THREE.TorusGeometry(0.04 * U, 0.012 * U, 6, 16), side * EYE[0] * U, y + EYE[1] * U, face * (half - 0.002), 0.95);
      ball(0.026 * U, side * EYE[0] * U, y + EYE[1] * U, face * (half - 0.007), 0.1, 10);
    }
    // toes
    for (const across of [-0.38, -0.127, 0.127, 0.38]) ball(0.033 * U, side * 0.972 * U, y + 0.036 * U, across * T, 1);
  }

  // the block between the shoulders, and its framed rosette on both faces
  const blockDepth = 0.7 * T;
  append(
    b,
    new THREE.BoxGeometry(2 * BLOCK.halfW * U, (BLOCK.y1 - BLOCK.y0) * U, blockDepth),
    0,
    y + ((BLOCK.y0 + BLOCK.y1) / 2) * U,
    0,
    0.8,
  );
  append(b, new THREE.BoxGeometry(0.46 * U, 0.07 * U, blockDepth + 0.05 * D), 0, y + (BLOCK.y1 + 0.035) * U, 0, 0.95);
  for (const face of [-1, 1]) {
    const turn = (g: THREE.BufferGeometry) => {
      if (face < 0) g.rotateY(Math.PI);
      return g;
    };
    const flat = { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelOffset: -0.006, bevelSegments: 1, curveSegments: 1 };

    const fw = 0.215 * U;
    const fh = 0.205 * U;
    const frame = new THREE.Shape([new THREE.Vector2(-fw, -fh), new THREE.Vector2(fw, -fh), new THREE.Vector2(fw, fh), new THREE.Vector2(-fw, fh)]);
    const t = 0.03 * U;
    frame.holes.push(
      new THREE.Path([new THREE.Vector2(-fw + t, -fh + t), new THREE.Vector2(-fw + t, fh - t), new THREE.Vector2(fw - t, fh - t), new THREE.Vector2(fw - t, -fh + t)]),
    );
    append(b, turn(new THREE.ExtrudeGeometry(frame, flat)), 0, y + ROSETTE.y * U, face * (blockDepth / 2 + 0.003), 1);

    const petals: THREE.Vector2[] = [];
    for (let i = 0; i < 96; i++) {
      const th = (i / 96) * TAU;
      const r = ROSETTE.r * U * (0.7 + 0.3 * Math.pow(Math.abs(Math.cos(6 * th)), 0.6));
      petals.push(new THREE.Vector2(r * Math.cos(th), r * Math.sin(th)));
    }
    append(b, turn(new THREE.ExtrudeGeometry(new THREE.Shape(petals), flat)), 0, y + ROSETTE.y * U, face * (blockDepth / 2 + 0.004), 1);
    const boss = new THREE.CylinderGeometry(ROSETTE.r * U * 0.26, ROSETTE.r * U * 0.26, 0.014, 18);
    boss.rotateX(Math.PI / 2);
    append(b, boss, 0, y + ROSETTE.y * U, face * (blockDepth / 2 + 0.024), 1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('aAo', new THREE.Float32BufferAttribute(b.ao, 1));
  g.setIndex(b.idx);
  return { geometry: g, capitalY: y + 0.6 * U, capitalBase: y, unit: U };
}

export function createColumns() {
  const group = new THREE.Group();
  group.name = 'columns';

  const { geometry, capitalY, capitalBase, unit } = buildColumn();

  /* The columns' own lights, evaluated here (inverse-square Lambert with a soft
     cone) rather than as scene lights that every other material would pay for:
       foot — in the floor, two paces in front and a little outboard: models
              the base from below, grazes the flutes, dies away up the shaft
       kiss — high above and a step in front, so it rakes down the carving:
              top edges catch it, the relief below them falls into shade       */
  const light = (pos: THREE.Vector3, aim: THREE.Vector3, halfAngle: number) => ({
    pos,
    axis: aim.clone().sub(pos).normalize(),
    cone: new THREE.Vector2(Math.cos(halfAngle), 1),
  });
  const foot = light(
    new THREE.Vector3(COLUMNS.x + 0.2, 0.05, COLUMNS.z + 1.9),
    new THREE.Vector3(COLUMNS.x, 1.25, COLUMNS.z),
    0.8,
  );
  const kiss = light(
    new THREE.Vector3(COLUMNS.x - 0.75, capitalY + 1.5, COLUMNS.z + 1.35),
    new THREE.Vector3(COLUMNS.x, capitalY, COLUMNS.z),
    0.5,
  );
  const uniforms = {
    uFootPos: { value: foot.pos },
    uFootAxis: { value: foot.axis },
    uFootCone: { value: foot.cone },
    uFootPower: { value: 0 },
    uKissPos: { value: kiss.pos },
    uKissAxis: { value: kiss.axis },
    uKissCone: { value: kiss.cone },
    uKissPower: { value: 0 },
    uAccentColor: { value: new THREE.Color(0.9, 0.93, 1.0) },
    uRim: { value: 0 },
    uShift: { value: 0 },
    // where the capital starts, and its design unit, for the carved feathering
    uCapital: { value: new THREE.Vector2(capitalBase, unit) },
  };

  // limestone the colour of dry earth: the earth is in the stone, not in the light
  const material = new THREE.MeshStandardMaterial({ color: 0x987c55, roughness: 0.88, metalness: 0, envMapIntensity: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aAo;
         varying float vAo;
         varying vec3 vColLocal;
         varying vec3 vColWorld;
         varying vec3 vColNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vAo = aAo;
         vColLocal = position;
         vColWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
         vColNormal = mat3(modelMatrix) * normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uFootPos;
         uniform vec3 uFootAxis;
         uniform vec2 uFootCone;
         uniform float uFootPower;
         uniform vec3 uKissPos;
         uniform vec3 uKissAxis;
         uniform vec2 uKissCone;
         uniform float uKissPower;
         uniform vec3 uAccentColor;
         uniform float uRim;
         uniform float uShift;
         uniform vec2 uCapital;
         varying float vAo;
         varying vec3 vColLocal;
         varying vec3 vColWorld;
         varying vec3 vColNormal;
         ${NOISE}
         // how far the foot of the column has drawn the liquid up into the stone
         float colDamp = 0.0;
         // inverse-square Lambert from a small cone light; mirrored for the left-hand column
         float accent(vec3 pos, vec3 axis, vec2 cone, float side, vec3 n) {
           vec3 toL = vec3(side * pos.x + uShift, pos.yz) - vColWorld;
           float d2 = dot(toL, toL);
           vec3 L = toL * inversesqrt(d2);
           float c = smoothstep(cone.x, cone.y, dot(-L, vec3(side * axis.x, axis.yz)));
           return c * max(dot(n, L), 0.0) / d2;
         }`,
      )
      .replace(
        '#include <map_fragment>',
        // weathered limestone: soft blotches, bedding that runs with the stone, dirt held in the creases
        `{
           float blotch = vnoise3(vColLocal * vec3(4.0, 1.6, 4.0));
           float bed = vnoise(vec2(vColLocal.y * 5.0, atan(vColLocal.z, vColLocal.x) * 1.5));
           float grit = vnoise3(vColLocal * 38.0);
           vec3 stone = diffuseColor.rgb * (0.78 + 0.27 * blotch) * (0.92 + 0.12 * bed) * (0.95 + 0.08 * grit);
           // ochre where iron has come through the stone, greyer along its beds
           float iron = smoothstep(0.42, 0.8, vnoise3(vColLocal * vec3(2.3, 0.9, 2.3) + 7.0));
           stone *= mix(vec3(1.0), vec3(1.08, 0.96, 0.8), iron);
           stone = mix(stone, vec3(dot(stone, vec3(0.3, 0.55, 0.15))) * vec3(0.98, 1.0, 1.04), 0.2 * smoothstep(0.5, 0.9, bed));
           // the creases keep more of the earth…
           stone *= mix(vec3(0.5, 0.45, 0.37), vec3(1.0), vAo);
           // …and the foot stands in the liquid, and has drawn it up: darker, with a ragged edge
           colDamp = 1.0 - smoothstep(0.03, 0.4, vColWorld.y + 0.16 * (blotch - 0.5));
           stone *= 1.0 - 0.45 * colDamp;
           diffuseColor.rgb = stone;
           // feathering incised on the neck and chest: offset rows of scallops, faded
           // out wherever a scallop would be smaller than a few pixels
           vec2 q = vec2(abs(vColLocal.x), vColLocal.y - uCapital.x) / uCapital.y;
           float zone = smoothstep(0.28, 0.33, q.x) * (1.0 - smoothstep(0.7, 0.76, q.x))
                      * smoothstep(0.24, 0.3, q.y) * (1.0 - smoothstep(0.93, 1.0, q.y))
                      * smoothstep(0.55, 0.85, abs(normalize(vColNormal).z));
           if (zone > 0.001) {
             vec2 g = q / 0.085;
             g.x += 0.5 * mod(floor(g.y), 2.0);
             float fine = 1.0 - smoothstep(0.2, 0.5, max(fwidth(g.x), fwidth(g.y)));
             float d = length(fract(g) - vec2(0.5, 1.0));
             float cut = smoothstep(0.4, 0.48, d) * (1.0 - smoothstep(0.5, 0.58, d));
             diffuseColor.rgb *= 1.0 - 0.3 * cut * zone * fine;
           }
         }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        // worn a little smooth where hands and weather reach — the arrises between the
        // flutes, the high points of the carving — and polished where the stone is wet
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(roughnessFactor, 0.52, 0.6 * smoothstep(0.9, 1.0, vAo));
         roughnessFactor = mix(roughnessFactor, 0.32, 0.8 * colDamp);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        // tool marks and pitting: a relief too fine to model, so only its slope is used.
        // Each grain is dropped before it would fall under a few pixels.
        `#include <normal_fragment_maps>
         {
           float grain = length(fwidth(vColLocal));
           float relief = vnoise3(vColLocal * 24.0) * 0.0042 * (1.0 - smoothstep(0.012, 0.03, grain))
                        + vnoise3(vColLocal * 57.0) * 0.0016 * (1.0 - smoothstep(0.005, 0.012, grain));
           vec3 sx = dFdx(-vViewPosition);
           vec3 sy = dFdy(-vViewPosition);
           vec3 r1 = cross(sy, normal);
           vec3 r2 = cross(normal, sx);
           float det = dot(sx, r1);
           normal = normalize(abs(det) * normal - sign(det) * (dFdx(relief) * r1 + dFdy(relief) * r2));
         }`,
      )
      .replace(
        '#include <aomap_fragment>',
        `{
           reflectedLight.indirectDiffuse *= vAo * vAo;
           float side = sign(vColWorld.x - uShift);
           // the relief answers the column's own lights too
           vec3 n = inverseTransformDirection(normal, viewMatrix);
           float lit = uFootPower * accent(uFootPos, uFootAxis, uFootCone, side, n)
                     + uKissPower * accent(uKissPos, uKissAxis, uKissCone, side, n);
           reflectedLight.directDiffuse += uAccentColor * lit * diffuseColor.rgb * RECIPROCAL_PI;
           // the wash on the wall behind comes round the stone as a thin cool edge
           float edge = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
           reflectedLight.directDiffuse += uAccentColor * (uRim * edge * (0.35 + 0.65 * vAo)) * diffuseColor.rgb;
         }`,
      );
  };
  material.customProgramCacheKey = () => 'nafis-column';

  for (const side of [-1, 1]) {
    const column = new THREE.Mesh(geometry, material);
    // square-on: the capitals are read in profile, heads toward and away from the rug
    column.position.set(side * COLUMNS.x, 0, COLUMNS.z);
    column.castShadow = true;
    column.receiveShadow = true;
    column.frustumCulled = false;
    group.add(column);
  }

  return {
    group,
    update(live: Live, shiftX: number) {
      uniforms.uFootPower.value = 6 * live.accent;
      uniforms.uKissPower.value = 13 * live.accent;
      uniforms.uRim.value = 0.3 * live.accent;
      uniforms.uShift.value = shiftX;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
