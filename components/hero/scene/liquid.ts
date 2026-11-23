/**
 * THE POOL — the hoz in front of the pieces, as water that actually moves.
 *
 * A height field the shape of the pool, stepped as a wave equation: every
 * cell is pulled toward the mean of its four neighbours, and what it gains in
 * speed it keeps, less a little friction. Nothing is drawn by hand. The
 * pointer only works the surface up and down along the path it travels, the
 * way a hand trailed through water does; the waves are what the surface does
 * about it — a train of crests rolling out from the path, harder the faster
 * the pointer goes, and a ring of them from a press — and they run on, meet
 * each other, and come back off the pool's stone edges.
 *
 * The floor's shader reads one texel of it per pixel (gallery.ts): the slope
 * of the surface, which is all a reflection ever sees of a wave.
 *
 * Stepped at a fixed rate, so a wave crosses the pool in the same time at any
 * frame rate. The cells are square, about 4 cm a side.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FULLSCREEN_VERT } from './glsl';

/** the pool: its near-left corner (x, z) and its size along x and z, in metres */
export interface PoolBox {
  x: number;
  z: number;
  w: number;
  h: number;
}

const CELL = 0.042;
/** steps per second */
const RATE = 60;
/** pull toward the neighbours per step; a wave travels √STIFF / 2 cells a step (≈ 1.3 m/s) */
const STIFF = 1.08;
/** what a wave keeps of its speed each step: it has all but died away after five seconds */
const DAMP = 0.9915;
/** how fast the pointer works the surface, in beats a second: with the wave speed, crests half a metre apart */
const BEAT = 2.6;
/** the dent the pointer makes: its radius in metres, and its depth per metre travelled */
const PRESS_RADIUS = 0.3;
const DRAG = 1.3;
const DRAG_MAX = 0.15;
/** a press on the water rings for a moment; arriving on it is the same thing, fainter */
const DROP = 0.075;
const DROP_LIFE = 0.9;
const ARRIVE = 0.3;

const STEP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tPrev;
uniform vec2 uTexel;
uniform vec2 uSize;
uniform vec4 uStroke;
uniform vec2 uPress;
uniform vec3 uDrop;
uniform float uStiff;
uniform float uDamp;
varying vec2 vUv;

void main() {
  // the edge cells read themselves for the neighbour beyond: the stone turns the wave back
  vec4 here = texture2D(tPrev, vUv);
  float l = texture2D(tPrev, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(tPrev, vUv + vec2(uTexel.x, 0.0)).r;
  float d = texture2D(tPrev, vUv - vec2(0.0, uTexel.y)).r;
  float u = texture2D(tPrev, vUv + vec2(0.0, uTexel.y)).r;

  float speed = (here.g + ((l + r + d + u) * 0.25 - here.r) * uStiff) * uDamp;
  float height = here.r + speed;

  // the pointer works the surface along the path it travelled this step (down, or back up)
  vec2 at = vUv * uSize;
  if (uPress.y != 0.0) {
    vec2 a = uStroke.xy * uSize;
    vec2 ba = uStroke.zw * uSize - a;
    vec2 pa = at - a;
    float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
    float k = max(0.0, 1.0 - length(pa - ba * t) / uPress.x);
    height -= k * k * (3.0 - 2.0 * k) * uPress.y;
  }
  // a press, still ringing
  if (uDrop.z != 0.0) {
    float k = max(0.0, 1.0 - length(at - uDrop.xy * uSize) / (uPress.x * 1.4));
    height -= k * k * (3.0 - 2.0 * k) * uDrop.z;
  }

  // r: height · g: speed · b, a: slope along x and z (over two cells)
  gl_FragColor = vec4(height, speed, r - l, u - d);
}
`;

export function createLiquid(renderer: THREE.WebGLRenderer, box: PoolBox) {
  const gx = Math.max(8, Math.round(box.w / CELL));
  const gz = Math.max(8, Math.round(box.h / CELL));

  const field = () => {
    const rt = new THREE.WebGLRenderTarget(gx, gz, { type: THREE.HalfFloatType, depthBuffer: false });
    renderer.setRenderTarget(rt);
    renderer.clear();
    return rt;
  };
  let now = field();
  let next = field();
  renderer.setRenderTarget(null);

  const uniforms = {
    tPrev: { value: now.texture as THREE.Texture },
    uTexel: { value: new THREE.Vector2(1 / gx, 1 / gz) },
    uSize: { value: new THREE.Vector2(box.w, box.h) },
    uStroke: { value: new THREE.Vector4() },
    uPress: { value: new THREE.Vector2(PRESS_RADIUS, 0) },
    uDrop: { value: new THREE.Vector3() },
    uStiff: { value: STIFF },
    uDamp: { value: DAMP },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: STEP_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new FullScreenQuad(material);

  /* where the pointer's path has got to and where it is heading; the beat it works the
     surface at; and the last press, while it still rings */
  const at = { on: false, x: 0, z: 0 };
  const goal = { on: false, x: 0, z: 0 };
  const drop = { age: DROP_LIFE, x: 0, z: 0, gain: 0 };
  let beat = 0;
  let owed = 0;
  const TAU = Math.PI * 2;
  const ring = (x: number, z: number, gain: number) => {
    drop.age = 0;
    drop.x = x;
    drop.z = z;
    drop.gain = gain;
  };
  const u = (x: number) => (x - box.x) / box.w;
  const v = (z: number) => (z - box.z) / box.h;

  return {
    box,
    get texture() {
      return now.texture;
    },
    /** is (x, z) on the water? */
    contains(x: number, z: number) {
      return x > box.x && x < box.x + box.w && z > box.z && z < box.z + box.h;
    },
    /** the pointer is over the water at (x, z); `pressed` on the frame it clicks or taps */
    touch(x: number, z: number, pressed: boolean) {
      goal.on = true;
      goal.x = x;
      goal.z = z;
      if (pressed) ring(x, z, 1);
    },
    /** the pointer has left the water */
    release() {
      goal.on = false;
      at.on = false;
    },
    step(dt: number) {
      owed = Math.min(owed + dt, 3 / RATE);
      const steps = Math.floor(owed * RATE + 1e-4);
      if (steps === 0) return;
      owed -= steps / RATE;

      for (let i = 0; i < steps; i++) {
        let depth = 0;
        let fromX = 0;
        let fromZ = 0;
        let toX = 0;
        let toZ = 0;
        beat += (TAU * BEAT) / RATE;
        if (goal.on) {
          if (!at.on) {
            // arriving: a first faint ring, wherever the pointer came down
            at.on = true;
            at.x = goal.x;
            at.z = goal.z;
            if (drop.age >= DROP_LIFE) ring(at.x, at.z, ARRIVE);
          } else {
            // spread this frame's travel evenly over its steps; work the surface up and
            // down as it goes, a little more down than up, so a wake is left as well
            const f = 1 / (steps - i);
            fromX = at.x;
            fromZ = at.z;
            toX = at.x + (goal.x - at.x) * f;
            toZ = at.z + (goal.z - at.z) * f;
            depth = Math.min(Math.hypot(toX - fromX, toZ - fromZ) * DRAG, DRAG_MAX) * (0.3 + 0.9 * Math.sin(beat));
            at.x = toX;
            at.z = toZ;
          }
        }
        uniforms.uStroke.value.set(u(fromX), v(fromZ), u(toX), v(toZ));
        uniforms.uPress.value.y = depth;
        if (drop.age < DROP_LIFE) {
          uniforms.uDrop.value.set(u(drop.x), v(drop.z), DROP * drop.gain * Math.cos(TAU * BEAT * drop.age) * Math.exp(-drop.age * 4.5));
          drop.age += 1 / RATE;
        } else uniforms.uDrop.value.z = 0;
        uniforms.tPrev.value = now.texture;
        renderer.setRenderTarget(next);
        quad.render(renderer);
        const swap = now;
        now = next;
        next = swap;
      }
    },
    dispose() {
      now.dispose();
      next.dispose();
      material.dispose();
      quad.dispose();
    },
  };
}
