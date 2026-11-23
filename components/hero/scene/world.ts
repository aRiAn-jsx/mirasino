/**
 * WORLD — assembles the gallery and owns the one frame function.
 *
 * The hall (gallery.ts): a white wall with the pieces hung along it, each under
 * its own track light; a black pool in front of them (liquid.ts simulates its
 * surface); pale concrete; benches in crimson velvet. The rugs themselves are
 * rug.ts.
 *
 * Light: three track spots, a soft fill from the room (hemisphere) and the
 * room itself for anything glossy (scene.environment). Nothing casts a shadow
 * map — each rug is a rectangle parallel to the wall, so the wall draws its
 * shadow exactly — which leaves the frame budget to the pile and the water.
 * All of it is on the lamp key: switched off, the hall is black.
 *
 * `stir` finds where the pointer's ray meets the water; that is where the
 * surface is pressed, and the waves follow from there.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GALLERY, RUG, RUGS, pieceX, type Tier } from '../config';
import { damp, mix, smoothstep } from '../easing';
import type { Live } from '../live';
import { createGallery } from './gallery';
import { createLiquid } from './liquid';
import { createPipeline } from './post';
import { createRig, type Pick } from './rig';
import { createRugs } from './rug';
import { createShared } from './shared';

export interface WorldApi {
  pick(nx: number, ny: number): Pick;
  /** the piece the visitor now stands in front of */
  setActive(i: number): void;
  /** which side of the piece in front of the visitor faces the room */
  isReversed(): boolean;
  setReversed(reversed: boolean): void;
  requestFibres(): void;
}

/** scene-linear multiplier applied before the tone curve */
const EXPOSURE = 1.1;

export function createWorld(renderer: THREE.WebGLRenderer, scene: THREE.Scene, live: Live, tier: Tier) {
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 1);

  const shared = createShared();
  const pipeline = createPipeline(renderer, shared, tier);

  // the room's own light, for whatever is glossy or matte enough to show it
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environment;

  const root = new THREE.Group();
  root.name = 'nafis-gallery';

  const gallery = createGallery();
  root.add(gallery.group);
  gallery.floorUniforms.tRefl.value = pipeline.mirror.target.texture;
  gallery.floorUniforms.tReflShort.value = pipeline.mirror.short.texture;
  gallery.floorUniforms.tReflLong.value = pipeline.mirror.long.texture;
  gallery.floorUniforms.uReflMatrix.value = pipeline.mirror.matrix;

  const liquid = createLiquid(renderer, gallery.pool);

  const xs = RUGS.map((_, i) => pieceX(i));
  const rugs = createRugs(shared, tier, renderer.capabilities.getMaxAnisotropy(), xs);
  rugs.meshes.forEach((m) => root.add(m));

  // the hall gives back what the lights put into it: bright from above, warmer off the floor
  const hemi = new THREE.HemisphereLight(new THREE.Color(1, 1, 1), new THREE.Color(0.8, 0.77, 0.73), 0);
  root.add(hemi);

  scene.add(root);

  const rig = createRig(gallery.heads);
  let active = 0;

  /* the key on each piece, for exposure while the lens dives, and for the pile's micro-shadows */
  const L = GALLERY.light;
  const lp = new THREE.Vector3();
  const lightAt = (head: THREE.Vector3, x: number, y: number) => {
    lp.set(x, y, RUG.z).sub(head);
    const d = lp.length();
    return Math.max(0, -lp.z / d) / (d * d);
  };
  const E_REF = lightAt(new THREE.Vector3(0, L.y, L.z), 0, RUG.cy);
  const keyView = xs.map(() => new THREE.Vector3());

  let time = 0;
  let frame = 0;
  let exposure = EXPOSURE;
  let slowWindow = 0;
  let slowFrames = 0;
  let slowStrikes = 0;
  const hidden = [gallery.floor];

  /* ---- the water answers the pointer ---- */
  const eye = new THREE.Vector3();
  const aim = new THREE.Vector3();
  let taps = live.taps;
  function stir(camera: THREE.PerspectiveCamera) {
    const pressed = live.taps !== taps;
    taps = live.taps;
    // only a lit, settled hall, seen from where the visitor stands
    if (!live.pOn || live.reduced || live.zoom > 0.04 || live.light < 0.6 || live.reflection < 0.9) return liquid.release();
    eye.setFromMatrixPosition(camera.matrixWorld);
    aim.set(live.px, live.py, 0.5).unproject(camera).sub(eye).normalize();
    if (aim.y > -1e-3) return liquid.release();
    const reach = -eye.y / aim.y;
    const x = eye.x + aim.x * reach;
    const z = eye.z + aim.z * reach;
    if (!liquid.contains(x, z)) return liquid.release();
    liquid.touch(x, z, pressed);
  }

  const api: WorldApi = {
    pick: (nx, ny) => rig.pick(nx, ny, live.zoom < 0.04),
    setActive(i) {
      active = i;
      rig.setActive(i);
    },
    isReversed: () => rugs.isReversed(active),
    setReversed: (reversed) => rugs.setReversed(active, reversed),
    requestFibres: rugs.loadFibres,
  };

  function frameFn(
    camera: THREE.PerspectiveCamera,
    dt: number,
    cssW: number,
    cssH: number,
    dpr: number,
    /** unclamped frame time, for the watchdog */
    rawDt: number,
    onSlow?: () => void,
  ) {
    // a minimised or zero-sized window: nothing to draw, and nothing to divide by
    if (cssW < 2 || cssH < 2) return;
    time += dt;
    frame++;
    shared.uTime.value = time;

    const bw = Math.max(2, Math.round(cssW * dpr));
    const bh = Math.max(2, Math.round(cssH * dpr));
    pipeline.setSize(bw, bh);
    camera.aspect = cssW / cssH;
    rig.setAspect(camera.aspect);

    // pointer, smoothed once here for everything that reads it
    live.x = damp(live.x, live.reduced ? 0 : live.targetX, 0.22, dt);
    live.y = damp(live.y, live.reduced ? 0 : live.targetY, 0.22, dt);

    rig.update(camera, live, dt, cssH);
    const r = rig.out;

    /* ---- light ---- */
    gallery.update(live);
    hemi.intensity = 0.42 * live.ambience;
    scene.environmentIntensity = 0.36 * live.ambience;

    gallery.heads.forEach((h, i) => keyView[i].copy(h).applyMatrix4(camera.matrixWorldInverse));
    rugs.update(live, dt, active, keyView);

    /* ---- the pool ---- */
    stir(camera);
    if (!live.reduced) liquid.step(dt);
    const f = gallery.floorUniforms;
    f.tWave.value = liquid.texture;
    f.uWaveGain.value = live.reduced ? 0 : 1;
    f.uReflTime.value = live.reduced ? 0 : time;
    f.uReflStrength.value = live.reflection;
    f.uReflSoft.value = live.reflSoft;
    f.uReflTexel.value.set(1 / pipeline.mirror.target.width, 1 / pipeline.mirror.target.height);
    f.uNearFar.value.set(camera.near, camera.far);

    /* ---- exposure: a camera operator riding the iris as the lens dives ---- */
    const dive = smoothstep(0.15, 0.8, live.zoom);
    const here = lightAt(gallery.heads[active], r.focus.x, r.focus.y);
    const comp = Math.pow(Math.min(3.4, Math.max(0.7, E_REF / Math.max(here, 1e-4))), 0.8);
    exposure = damp(exposure, EXPOSURE * mix(1, comp, dive), 0.5, dt);

    // cloth in the air, the visitor walking, or the room still coming up: redraw everything
    const walking = Math.abs(live.travel - Math.round(live.travel)) > 1e-4;
    const moving = walking || live.flip > 0 || live.lift > 0.0005 || live.ripple > 0.001 || live.adapt < 1 || frame < 4;

    /* ---- lens ---- */
    const aperture =
      0.12 + live.introBlur * 2.4 + live.blur * 1.1 + smoothstep(0.45, 1, live.zoom) * (live.reduced ? 1.0 : 2.1);

    pipeline.render(
      scene,
      camera,
      hidden,
      {
        dt,
        time,
        frame,
        focus: r.focusDist,
        aperture,
        exposure,
        beam: 0,
        fade: live.fade,
        grain: live.reduced ? 0.008 : 0.014,
        clipY: -1,
        shadows: false,
        // a still room does not need its mirror redrawn every frame
        mirror: moving || frame % tier.mirrorEvery === 0,
      },
      Math.max(1, dpr * 0.9),
    );

    /* ---- watchdog: two consecutive slow windows ask the host to step down ---- */
    if (!onSlow) {
      // the host says this frame is not representative (tab was hidden, timers throttled)
      slowWindow = 0;
      slowFrames = 0;
      slowStrikes = 0;
    } else if (live.adapt > 0) {
      slowWindow += rawDt;
      slowFrames++;
      // judged over ~1.2 s of real time, not a frame count: a slow machine must not
      // have to sit through a slow minute before it is helped
      if (slowWindow >= 1.2 && slowFrames >= 8) {
        const avg = slowWindow / slowFrames;
        slowStrikes = avg > 1 / 26 ? slowStrikes + 1 : 0;
        slowWindow = 0;
        slowFrames = 0;
        if (slowStrikes >= 2) {
          slowStrikes = 0;
          onSlow();
        }
      }
    }
  }

  return {
    api,
    ready: rugs.ready,
    frame: frameFn,
    setQuality: pipeline.setQuality,
    dispose() {
      scene.remove(root);
      scene.environment = null;
      environment.dispose();
      gallery.dispose();
      liquid.dispose();
      rugs.dispose();
      pipeline.dispose();
      renderer.setRenderTarget(null);
    },
  };
}

export type World = ReturnType<typeof createWorld>;
