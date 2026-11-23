/**
 * LIGHT — three moods, each a full rig the room eases into. The rug is the
 * subject in every one of them.
 *
 *   gallery  the room steps back into shadow; a framing projector straight
 *            above the rug lights exactly its rectangle, edges softened — the
 *            way a museum lights a carpet. The niche glows faintly behind.
 *   night    warm 2700 K: the rug's pool of light opens out, the fluted wall
 *            is washed from above, the cove glows, the arc lamp is on
 *   day      a high soft skylight and a bright room; the lamps off
 *
 * The framing projector is a SpotLight with a light cookie: a soft rounded
 * rectangle drawn to the rug's proportions, turned with the rug (the spot's
 * camera takes the rug's long axis as its "up"). Two lights cast shadows: the
 * skylight and that projector — the one that sets the furniture on the rug.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import type { MoodId } from '../model';
import type { Architecture } from './architecture';
import { ROOM_H } from './architecture';

interface Rig {
  hemi: [number, string, string];
  env: number;
  sky: { intensity: number; color: string; elevation: number; azimuth: number };
  key: { intensity: number; color: string };
  /** 0: the projector frames the rug alone · 1: an open pool of light around it */
  open: number;
  niche: number;
  wash: number;
  art: number;
  lamp: number;
  cove: number;
  screen: number;
  exposure: number;
}

const RIGS: Record<MoodId, Rig> = {
  // the room is lit, soft and warm, so it breathes — and the rug, under its own light, still leads
  gallery: {
    hemi: [0.3, '#e6dccd', '#3a2c20'],
    env: 0.26,
    sky: { intensity: 0.55, color: '#fff1df', elevation: 1.2, azimuth: -0.5 },
    key: { intensity: 72, color: '#fff0de' },
    open: 0,
    niche: 12,
    wash: 22,
    art: 14,
    lamp: 0,
    cove: 0.55,
    screen: 0.04,
    exposure: 1.06,
  },
  night: {
    hemi: [0.38, '#7a6f6a', '#2a1c12'],
    env: 0.34,
    sky: { intensity: 0.55, color: '#c9b8a6', elevation: 1.1, azimuth: -0.5 },
    key: { intensity: 44, color: '#ffd4a4' },
    open: 1,
    niche: 14,
    wash: 44,
    art: 20,
    lamp: 13,
    cove: 1,
    screen: 0.35,
    exposure: 1.15,
  },
  day: {
    hemi: [0.95, '#f2f0ea', '#6a5844'],
    env: 0.65,
    sky: { intensity: 4.2, color: '#fff4e6', elevation: 1.12, azimuth: -0.55 },
    key: { intensity: 22, color: '#fff1e0' },
    open: 1,
    niche: 6,
    wash: 8,
    art: 6,
    lamp: 0,
    cove: 0.2,
    screen: 0.08,
    exposure: 1.0,
  },
};

export interface Lighting {
  group: THREE.Group;
  /** a floor lamp's light, kept at the lamp's bulb by the engine */
  lamp: THREE.PointLight;
  setMood(mood: MoodId, seconds: number, onUpdate: () => void): void;
  /** the room was rebuilt: re-aim at the new walls */
  fit(arch: Architecture, w: number, d: number): void;
  /** the rug moved, turned or changed size: the projector follows */
  follow(rug: { x: number; z: number; rot: number; length: number; width: number }): void;
  /** the levels the rest of the scene reads */
  levels: { exposure: number; cove: number; screen: number; env: number; lamp: number; mood: MoodId };
  dispose(): void;
}

/* -------------------------------------------------------------- the cookie */

const COOKIE = 256;
/** a soft rounded rectangle, the rug's shape, filling the given fraction of the frame */
function paintCookie(ctx: CanvasRenderingContext2D, hx: number, hy: number, soft: number) {
  const img = ctx.createImageData(COOKIE, COOKIE);
  for (let y = 0; y < COOKIE; y++) {
    for (let x = 0; x < COOKIE; x++) {
      const u = Math.abs((x + 0.5) / COOKIE - 0.5) * 2;
      const v = Math.abs((y + 0.5) / COOKIE - 0.5) * 2;
      // distance outside the rectangle, in frame units, with rounded corners
      const dx = Math.max(u - hx, 0);
      const dy = Math.max(v - hy, 0);
      const out = Math.hypot(dx, dy);
      let a = 1 - Math.min(1, Math.max(0, out / soft));
      a = a * a * (3 - 2 * a);
      // the round edge of the lens itself
      const r = Math.hypot(u, v);
      a *= 1 - Math.min(1, Math.max(0, (r - 0.94) / 0.06));
      const i = (y * COOKIE + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function createLighting(scene: THREE.Scene, quality: { shadow: number; keyShadow: number; shadowRadius: number; extraLights: boolean }): Lighting {
  const group = new THREE.Group();
  group.name = 'lighting';
  scene.add(group);

  const hemi = new THREE.HemisphereLight('#4a5068', '#160f0b', 0.07);
  group.add(hemi);

  // a skylight: soft, high, from the room's open side
  const sky = new THREE.DirectionalLight('#ffffff', 0);
  sky.castShadow = true;
  sky.shadow.mapSize.set(quality.shadow, quality.shadow);
  sky.shadow.bias = -0.0004;
  sky.shadow.normalBias = 0.025;
  sky.shadow.radius = quality.shadowRadius + 2;
  group.add(sky, sky.target);

  // the framing projector over the rug
  const key = new THREE.SpotLight('#ffe9d2', 0, 10, 0.6, 0.25, 1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.keyShadow, quality.keyShadow);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = quality.shadowRadius;
  key.shadow.camera.near = 0.4;
  const cookieCanvas = document.createElement('canvas');
  cookieCanvas.width = cookieCanvas.height = COOKIE;
  const cookieCtx = cookieCanvas.getContext('2d')!;
  const cookie = new THREE.CanvasTexture(cookieCanvas);
  cookie.colorSpace = THREE.SRGBColorSpace;
  key.map = cookie;
  group.add(key, key.target);

  // the niche, washed from just in front of it
  const niche = new THREE.SpotLight('#ffd2a0', 0, 5, 0.5, 0.9, 1.5);
  group.add(niche, niche.target);

  // the fluted wall, grazed from the ceiling
  const wash = new THREE.SpotLight('#ffc48a', 0, 6, 0.9, 1, 1.4);
  group.add(wash, wash.target);

  const art = new THREE.SpotLight('#ffe2b8', 0, 3, 0.5, 0.8, 1.5);
  group.add(art, art.target);

  const lamp = new THREE.PointLight('#ffc98c', 0, 5.5, 1.6);

  // the fittings, let into the dropped ceiling; the projector's moves with the rug
  const discs: THREE.Mesh[] = [];
  const discMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffe2c2', emissiveIntensity: 0 });
  const discGeo = new THREE.CircleGeometry(0.05, 24).rotateX(Math.PI / 2);
  const keyDisc = new THREE.Mesh(discGeo, discMat);

  const levels = { exposure: 1, cove: 0, screen: 0, env: 0.1, lamp: 0, mood: 'gallery' as MoodId };
  const state = { hemi: 0.07, sky: 0, key: 0, open: 0, niche: 0, wash: 0, art: 0, lamp: 0, el: 1.2, az: -0.5 };
  const keyColor = new THREE.Color('#ffe9d2');
  let room = { w: 6, d: 5 };
  let rug = { x: 0, z: 0, rot: 0, length: 3, width: 1.6 };
  let cookieOpen = -1;

  const placeSky = () => {
    const dist = 14;
    const dir = new THREE.Vector3(Math.sin(state.az) * Math.cos(state.el), Math.sin(state.el), Math.cos(state.az) * Math.cos(state.el));
    sky.target.position.set(0, 0, 0);
    sky.position.copy(dir.multiplyScalar(dist));
    const s = Math.max(room.w, room.d) * 0.78;
    const cam = sky.shadow.camera;
    cam.left = -s;
    cam.right = s;
    cam.top = s;
    cam.bottom = -s;
    cam.near = 2;
    cam.far = dist + Math.max(room.w, room.d) * 1.5;
    cam.updateProjectionMatrix();
  };

  /** aim the projector, size its cone, and redraw its cookie for the rug and how open the light is */
  const placeKey = () => {
    const h = ROOM_H - 0.13;
    key.position.set(rug.x, h, rug.z);
    key.target.position.set(rug.x, 0, rug.z);
    keyDisc.position.set(rug.x, ROOM_H - 0.121, rug.z);
    // the cookie's "up" is the rug's length
    key.shadow.camera.up.set(Math.cos(rug.rot), 0, -Math.sin(rug.rot));
    const open = state.open;
    const reach = Math.hypot(rug.length, rug.width) / 2 + 0.25 + open * 1.4;
    key.angle = Math.min(1.25, Math.atan(reach / h));
    key.penumbra = 0.15 + open * 0.8;
    // cookie: the rug plus a hand's breadth, as a fraction of the frame at the floor
    const frame = h * Math.tan(key.angle);
    const q = Math.round(open * 20) / 20;
    const key2 = q + rug.length * 1000 + rug.width;
    if (key2 !== cookieOpen) {
      cookieOpen = key2;
      const margin = 0.07 + q * 1.6;
      paintCookie(cookieCtx, Math.min(0.97, (rug.width / 2 + margin) / frame), Math.min(0.97, (rug.length / 2 + margin) / frame), 0.05 + q * 0.5);
      cookie.needsUpdate = true;
    }
  };

  const apply = () => {
    hemi.intensity = state.hemi;
    // lights are never hidden, only dimmed: a change in the number of lights recompiles every material
    sky.intensity = state.sky;
    key.intensity = state.key;
    key.color.copy(keyColor);
    niche.intensity = quality.extraLights ? state.niche : 0;
    wash.intensity = state.wash;
    art.intensity = quality.extraLights ? state.art : 0;
    // the engine lights the lamp only while the lamp is in the room
    levels.lamp = state.lamp;
    discMat.emissiveIntensity = Math.min(1, state.key / 30) * 6;
    placeSky();
    placeKey();
  };

  let tween: gsap.core.Tween | null = null;

  const api: Lighting = {
    group,
    lamp,
    levels,
    setMood(mood, seconds, onUpdate) {
      const r = RIGS[mood];
      levels.mood = mood;
      hemi.color.set(r.hemi[1]);
      hemi.groundColor.set(r.hemi[2]);
      sky.color.set(r.sky.color);
      tween?.kill();
      const target = {
        hemi: r.hemi[0],
        sky: r.sky.intensity,
        key: r.key.intensity,
        open: r.open,
        niche: r.niche,
        wash: r.wash,
        art: r.art,
        lamp: r.lamp,
        el: r.sky.elevation,
        az: r.sky.azimuth,
      };
      const lv = { exposure: r.exposure, cove: r.cove, screen: r.screen, env: r.env };
      const toColor = new THREE.Color(r.key.color);
      if (seconds <= 0) {
        Object.assign(state, target);
        Object.assign(levels, lv);
        keyColor.copy(toColor);
        apply();
        onUpdate();
        return;
      }
      // one tween drives everything, so its last frame is always the one applied
      const from = { ...state };
      const fromLv = { exposure: levels.exposure, cove: levels.cove, screen: levels.screen, env: levels.env };
      const fromColor = keyColor.clone();
      const mix = { t: 0 };
      const lerp = (a: number, b: number) => a + (b - a) * mix.t;
      const step = () => {
        for (const k of Object.keys(target) as (keyof typeof target)[]) state[k] = lerp(from[k], target[k]);
        for (const k of Object.keys(lv) as (keyof typeof lv)[]) levels[k] = lerp(fromLv[k], lv[k]);
        keyColor.copy(fromColor).lerp(toColor, mix.t);
        apply();
        onUpdate();
      };
      tween = gsap.to(mix, { t: 1, duration: seconds, ease: 'sine.inOut', onUpdate: step, onComplete: step });
    },
    fit(arch, w, d) {
      room = { w, d };
      for (const disc of discs) disc.removeFromParent();
      discs.length = 0;
      arch.ceiling.add(keyDisc);
      const addDisc = (x: number, z: number) => {
        const m = new THREE.Mesh(discGeo, discMat);
        m.position.set(x, ROOM_H - 0.121, z);
        arch.ceiling.add(m);
        discs.push(m);
      };
      const c = arch.niche.centre;
      niche.position.set(c.x, ROOM_H - 0.13, c.z + 0.75);
      niche.target.position.set(c.x, c.y * 0.8, c.z);
      addDisc(niche.position.x, niche.position.z);
      wash.position.set(arch.fluted.x + 0.35, ROOM_H - 0.13, 0);
      wash.target.position.set(arch.fluted.x, 0.4, 0);
      addDisc(wash.position.x, -0.9);
      addDisc(wash.position.x, 0.9);
      art.position.set(arch.art.x - 0.9, arch.art.y + 1.1, arch.art.z);
      art.target.position.copy(arch.art);
      apply();
    },
    follow(next) {
      rug = { ...next };
      placeKey();
    },
    dispose() {
      tween?.kill();
      for (const disc of [...discs, keyDisc]) disc.removeFromParent();
      discMat.dispose();
      discGeo.dispose();
      cookie.dispose();
      lamp.removeFromParent();
      lamp.dispose();
      group.removeFromParent();
      for (const l of [hemi, sky, key, niche, wash, art]) l.dispose();
    },
  };
  apply();
  return api;
}
