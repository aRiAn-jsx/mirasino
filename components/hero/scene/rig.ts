/**
 * CAMERA RIG — the visitor's eye.
 *
 * Rest framing comes from config.layoutFor(aspect): a 42 mm lens square-on to
 * the piece in front of the visitor, a little above its look-at point, the
 * piece left of centre so the right of the frame is left to the words.
 *
 * Walking: `live.travel` is where the visitor stands along the hall, in pieces
 * (eased by GSAP). The whole framing slides with it; between two pieces the
 * visitor drifts back half a step, the way one does to take in the room on
 * the way past, and closes in again on arrival.
 *
 * The hover zoom is one parameter, `live.zoom` (0‥1, eased by GSAP):
 *
 *   · distance is interpolated in log space — a constant-speed "powers of ten"
 *     dolly from 9.5 m to 23 mm, so every stage (rug → pattern → weave →
 *     threads → fibres) gets the same share of the move
 *   · the arm swings up and to the right as it closes in, so the lens ends up
 *     looking across the pile toward the light rather than flat onto it
 *   · the look-at point slides from the composition centre to the hovered knot
 *
 * Parallax is the visitor's head moving: the camera itself shifts a little
 * with the pointer, so the bench in front slides across the wall behind it by
 * exactly as much as it would.
 *
 * Hit-testing is done against the *rest* camera on purpose: once the lens is
 * deep in the weave the rug fills the frame, so "mouse leave" has to mean
 * leaving the place where the rug hangs in the composition.
 */
import * as THREE from 'three';
import { GALLERY, PARALLAX, PARALLAX_PX, RUG, RUGS, ZOOM, layoutFor, pieceX, type Layout } from '../config';
import { clamp, damp, mix, smoothstep } from '../easing';
import type { Live } from '../live';

const DEG = Math.PI / 180;

export type PickKind = 'rug' | 'lamp' | 'piece' | 'none';
export interface Pick {
  kind: PickKind;
  /** on the rug: metres right of / above its centre. On another piece: which way it is (±1). */
  u: number;
  v: number;
}

export function createRig(heads: THREE.Vector3[]) {
  let layout: Layout = layoutFor(16 / 9);
  let aspect = 0;
  let active = 0;

  const rest = new THREE.PerspectiveCamera(23, 16 / 9, 0.5, 60);
  const look0 = new THREE.Vector3();
  const target = new THREE.Vector3();
  const focus = new THREE.Vector3(0, RUG.cy, RUG.z);
  const subject = new THREE.Vector3();
  const v = new THREE.Vector3();

  /** values the world needs after update() */
  const out = {
    dist: 9.47,
    focusDist: 9.47,
    /** metres per CSS pixel at the subject */
    worldPerPx: 0.0035,
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    focus,
  };

  function place(camera: THREE.PerspectiveCamera, dist: number, pitch: number, yaw: number, at: THREE.Vector3) {
    const cp = Math.cos(pitch);
    camera.position.set(at.x + dist * Math.sin(yaw) * cp, at.y + dist * Math.sin(pitch), at.z + dist * Math.cos(yaw) * cp);
    camera.lookAt(at);
  }

  function placeRest() {
    rest.fov = layout.fovY;
    rest.aspect = aspect || 16 / 9;
    v.set(layout.look[0] + pieceX(active), layout.look[1], layout.look[2]);
    place(rest, layout.dist, layout.pitch * DEG, layout.yaw * DEG, v);
    rest.updateProjectionMatrix();
    rest.updateMatrixWorld(true);
  }

  function setAspect(a: number) {
    if (Math.abs(a - aspect) < 1e-4) return;
    aspect = a;
    layout = layoutFor(a);
    placeRest();
  }

  /** the piece the visitor stands in front of (hover, picking and turning act on it) */
  function setActive(i: number) {
    if (i === active) return;
    active = i;
    placeRest();
  }

  function update(camera: THREE.PerspectiveCamera, live: Live, dt: number, viewportH: number) {
    const z = live.zoom;
    const ez = z * z * (3 - 2 * z);
    // half a step back while walking between pieces
    const between = Math.abs(live.travel - Math.round(live.travel));
    const stroll = live.reduced ? 0 : Math.sin(Math.PI * between);
    const restDist = layout.dist + 1.1 * stroll;
    const dist = restDist * Math.pow(ZOOM.minDist / restDist, z);
    const pitch = (mix(layout.pitch, ZOOM.pitch, ez) + 1.5 * stroll) * DEG;
    const yaw = mix(layout.yaw, ZOOM.yaw, ez) * DEG;

    look0.set(layout.look[0] + live.travel * GALLERY.spacing, layout.look[1], layout.look[2]);

    // the hovered knot — eased, so re-latching mid-flight never jumps the lens
    const fx = pieceX(active) + live.focusU;
    const fy = RUG.cy + live.focusV;
    if (z < 0.02) focus.set(fx, fy, RUG.z + 0.003);
    else {
      focus.x = damp(focus.x, fx, 0.28, dt);
      focus.y = damp(focus.y, fy, 0.28, dt);
    }

    const follow = smoothstep(0, 0.55, z);
    target.lerpVectors(look0, focus, follow);

    // while diving, the pointer pans the frame by a fraction of itself
    const halfH = dist * Math.tan((layout.fovY / 2) * DEG);
    if (!live.reduced) {
      const pan = follow * 0.42;
      target.x += (live.x - live.anchorX) * halfH * camera.aspect * pan;
      target.y += (live.y - live.anchorY) * halfH * pan;
    }

    camera.fov = layout.fovY;
    camera.near = clamp(dist * 0.25, 0.004, 0.5);
    camera.far = dist > 1.5 ? 60 : 14;
    place(camera, dist, pitch, yaw, target);
    camera.updateMatrixWorld(true);

    out.right.setFromMatrixColumn(camera.matrixWorld, 0);
    out.up.setFromMatrixColumn(camera.matrixWorld, 1);
    subject.set(look0.x, RUG.cy, RUG.z).lerp(target, follow);
    out.focusDist = v.copy(subject).sub(camera.position).length();
    out.dist = dist;
    out.worldPerPx = (2 * out.focusDist * Math.tan((layout.fovY / 2) * DEG)) / Math.max(1, viewportH);

    // the visitor's head: a real shift of the eye, so near things slide across far ones
    if (!live.reduced) {
      const k = out.worldPerPx * (PARALLAX_PX * PARALLAX.hero * 1.6 + 2 * z);
      camera.position.addScaledVector(out.up, live.y * k);
      camera.position.addScaledVector(out.right, -live.x * k * 1.4);
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  const l = new THREE.Vector3();

  /** nx, ny in −1‥1 (y up), against the rest framing */
  function pick(nx: number, ny: number, allowLamp: boolean): Pick {
    o.copy(rest.position);
    d.set(nx, ny, 0.5).unproject(rest).sub(o).normalize();

    if (allowLamp) {
      l.copy(heads[active]).sub(o);
      const tca = l.dot(d);
      const r = GALLERY.light.hitRadius;
      if (tca > 0 && l.lengthSq() - tca * tca < r * r) return { kind: 'lamp', u: 0, v: 0 };
    }
    if (d.z < -1e-4) {
      const t = (RUG.z - o.z) / d.z;
      const y = o.y + d.y * t - RUG.cy;
      for (let i = 0; i < RUGS.length; i++) {
        const x = o.x + d.x * t - pieceX(i);
        if (Math.abs(x) > RUG.planeW / 2 - 0.19 || Math.abs(y) > RUG.bodyHalfZ + 0.03) continue;
        if (i !== active) return { kind: 'piece', u: Math.sign(i - active), v: 0 };
        return {
          kind: 'rug',
          // keep the dive inside the field, clear of border and fringe
          u: clamp(x, -RUG.bodyHalfX + 0.22, RUG.bodyHalfX - 0.22),
          v: clamp(y, -RUG.bodyHalfZ + 0.16, RUG.bodyHalfZ - 0.16),
        };
      }
    }
    return { kind: 'none', u: 0, v: 0 };
  }

  return { setAspect, setActive, update, pick, out };
}
