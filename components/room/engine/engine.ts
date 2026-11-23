/**
 * THE ENGINE — one object that owns the room's three.js world and answers to
 * the store.
 *
 *   store → engine   every change to the arrangement or the interface is
 *                    diffed and animated here: pieces glide to a preset, the
 *                    rug rolls up and a new one rolls out, the hour changes.
 *   engine → store   only what the hand does: a piece dragged and set down,
 *                    a selection, what is under the pointer.
 *
 * Frames are drawn on demand. While nothing moves — no tween, no drag, the
 * camera at rest — the last frame stays on the screen and the GPU rests.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PRODUCTS } from '@/components/site/catalog';
import {
  FABRICS,
  ITEMS,
  ITEM_DEFS,
  STYLED,
  clampToRoom,
  collisions,
  boxPoint,
  corners,
  distanceTo,
  defOf,
  heightOf,
  kindOf,
  itemBox,
  rugBox,
  type ItemId,
  type ItemState,
  type RoomState,
  type RugPlacement,
  type StyleId,
} from '../model';
import { store, type Selection, type UiState, type ViewId } from '../store';
import type { RoomTier } from '../tiers';
import { ROOM_H, createArchitecture, type Architecture } from './architecture';
import { fieldColour } from './filters';
import { buildItem, type Built } from './furniture';
import { createKit } from './kit';
import { createLighting } from './lights';
import { createMarker } from './markers';
import { createPost } from './post';
import { createRug } from './rug';

export interface Overlay {
  inspector?: HTMLElement | null;
  dimLength?: HTMLElement | null;
  dimWidth?: HTMLElement | null;
}

/** how much of each edge of the frame the interface covers, px */
export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Engine {
  ready: Promise<void>;
  /** the room is framed in what the panels leave free */
  setInsets(insets: Insets): void;
  frame(dt: number, width: number, height: number, dpr: number): void;
  bind(overlay: Overlay): void;
  screenshot(): Promise<Blob | null>;
  skipIntro(): void;
  dispose(): void;
}

interface EngineOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tier: RoomTier;
  reduced: boolean;
  /** play the opening flight (only the first time; a quality change rebuilds the engine without it) */
  intro: boolean;
  setDpr(dpr: number): void;
}

const fabricHex = (id: string) => FABRICS.find((f) => f.id === id)?.color ?? FABRICS[0].color;
const productOf = (id: string) => PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0];
const SNAP = 0.05;
const snap = (v: number, on: boolean) => (on ? Math.round(v / SNAP) * SNAP : v);
/** the shortest way round to `to` from `from` */
const turnTo = (from: number, to: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
const itemDistance = (b: Parameters<typeof distanceTo>[0], p: THREE.Vector3) => distanceTo(b, p.x, p.z);

export function createEngine({ renderer, scene, camera, tier, reduced, intro: withIntro, setDpr }: EngineOptions): Engine {
  const canvas = renderer.domElement;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NeutralToneMapping;
  scene.background = new THREE.Color('#100e0c');

  // reflections: an evenly lit studio room, turned right down — the lamps do the lighting
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envMap = pmrem.fromScene(roomEnv, 0.04).texture;
  roomEnv.dispose();
  pmrem.dispose();
  scene.environment = envMap;

  camera.near = 0.03;
  camera.far = 90;
  camera.fov = 34;
  camera.updateProjectionMatrix();

  let room: RoomState = store.get().room;
  const maxAniso = Math.min(tier.anisotropy, renderer.capabilities.getMaxAnisotropy());

  /* ------------------------------------------------------------- the world */

  const kit = createKit();
  let arch: Architecture = createArchitecture(room.w, room.d, { floor: room.floor, wall: room.wall, floorRes: tier.floorRes, anisotropy: maxAniso });
  scene.add(arch.group);

  const lights = createLighting(scene, { shadow: tier.shadow, keyShadow: tier.keyShadow, shadowRadius: tier.shadowRadius, extraLights: tier.extraLights });
  scene.add(lights.lamp);

  const rug = createRug(maxAniso);
  scene.add(rug.group);
  let rugApplied: RugPlacement = { ...room.rug };
  const placeRug = (r: Pick<RugPlacement, 'x' | 'z' | 'rot'>) => {
    rug.group.position.set(r.x, 0, r.z);
    rug.group.rotation.y = r.rot;
  };
  /** the projector over the rug follows it: where it lies, which way it runs, how big it is */
  const followRug = () =>
    lights.follow({ x: rug.group.position.x, z: rug.group.position.z, rot: rug.group.rotation.y, length: rug.size.length, width: rug.size.width });
  const tintCushions = (id: string) => {
    const product = productOf(id);
    const [r, g, b] = fieldColour(product.id, product.filter);
    kit.accent.color.setRGB(r * 1.7, g * 1.7, b * 1.7);
    kit.accent.sheenColor.setRGB(Math.min(1, r * 3 + 0.08), Math.min(1, g * 3 + 0.08), Math.min(1, b * 3 + 0.08));
  };
  rug.setProduct(productOf(room.rug.id));
  placeRug(room.rug);
  tintCushions(room.rug.id);

  const invisible = new THREE.MeshBasicMaterial({ visible: false });
  const items = new Map<ItemId, { built: Built; proxies: THREE.Mesh[]; applied: ItemState }>();
  let style: StyleId = room.style ?? 'modern';

  /** build one piece in the current style, with what the pointer can take hold of */
  const makeItem = (id: ItemId, st: ItemState) => {
    const kind = kindOf(id);
    const built = buildItem(kind, kit, fabricHex(st.fabric), { leaves: tier.leaves }, style);
    const def = ITEM_DEFS[kind];
    const h = heightOf(id, style);
    // the piece's own volume — for the arc lamp, its foot and its shade, not a two-metre
    // column of air that would stand between the eye and the rug
    const boxes: [number, number, number, number, number, number][] =
      kind === 'floorLamp'
        ? [
            [def.w, 0.3, def.d, 0, 0.15, 0],
            [0.5, 0.36, 0.5, 0, 1.72, 1.32],
          ]
        : [[def.w, h, def.d, 0, h / 2, 0]];
    const proxies = boxes.map(([bw, bh, bd, x, y, z]) => {
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd).translate(x, y, z), invisible);
      proxy.userData.id = id;
      built.group.add(proxy);
      return proxy;
    });
    built.group.position.set(st.x, 0, st.z);
    built.group.rotation.y = st.rot;
    built.group.name = id;
    return { built, proxies };
  };

  for (const { id } of ITEMS) {
    const st = room.items[id];
    const { built, proxies } = makeItem(id, st);
    built.group.visible = st.on;
    scene.add(built.group);
    items.set(id, { built, proxies, applied: { ...st } });
  }

  const select = createMarker();
  const hover = createMarker();
  hover.setTone('hover');
  scene.add(select.mesh, hover.mesh);

  lights.fit(arch, room.w, room.d);
  followRug();
  lights.setMood(room.mood, 0, () => undefined);

  const post = createPost(renderer, scene, camera, tier);

  /* ------------------------------------------------------------ controls */

  // our pointer handlers go on first, so a press on a piece can keep the orbit from starting
  const pointer = { x: -1, y: -1, inside: false, alt: false };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const tmp = new THREE.Vector3();

  const setRay = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  };

  const pick = (clientX: number, clientY: number): { id: Exclude<Selection, null>; point: THREE.Vector3 } | null => {
    setRay(clientX, clientY);
    const targets: THREE.Object3D[] = [];
    if (!focused) for (const [id, it] of items) if (room.items[id].on) targets.push(...it.proxies);
    if (rug.roll.value > 0.98) targets.push(rug.proxy);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    return { id: hit.object === rug.proxy ? 'rug' : (hit.object.userData.id as ItemId), point: hit.point };
  };

  const onFloor = (clientX: number, clientY: number) => {
    setRay(clientX, clientY);
    return raycaster.ray.intersectPlane(floorPlane, tmp) ? tmp.clone() : null;
  };

  /** the rug's top under the pointer, if the pointer is over it */
  const onRug = (clientX: number, clientY: number) => {
    if (rug.roll.value < 0.98) return null;
    setRay(clientX, clientY);
    // the nearest thing hit must be the rug itself, not a table standing on it
    const targets: THREE.Object3D[] = [rug.proxy];
    if (!focused) for (const [id, it] of items) if (room.items[id].on) targets.push(...it.proxies);
    const hit = raycaster.intersectObjects(targets, false)[0];
    return hit && hit.object === rug.proxy ? hit.point.clone() : null;
  };

  type Drag = {
    id: Exclude<Selection, null>;
    start: { x: number; z: number; rot: number };
    offset: THREE.Vector2;
    downX: number;
    downY: number;
    moved: boolean;
    blocked: boolean;
    pointerId: number;
  };
  let drag: Drag | null = null;
  let introTl: gsap.core.Timeline | null = null;
  /** the pointer holding the loupe on a touch screen, or −1 */
  let loupeTouch = -1;
  /** the furniture has stepped aside so the whole rug can be seen */
  let focused = store.get().ui.focus;

  const objectOf = (id: Exclude<Selection, null>) => (id === 'rug' ? rug.group : items.get(id)!.built.group);

  const onPointerDown = (e: PointerEvent) => {
    if (introTl && introTl.progress() < 1) {
      api.skipIntro();
      e.stopImmediatePropagation();
      return;
    }
    if (e.button !== 0) return;
    const ui = store.get().ui;
    // a finger on the rug, with the loupe out, holds the lens there instead of turning the room
    if (ui.loupe && e.pointerType !== 'mouse' && ui.phase === 'live' && onRug(e.clientX, e.clientY)) {
      e.stopImmediatePropagation();
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.inside = true;
      loupeTouch = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      wake(0.3);
      return;
    }
    if (ui.mode !== 'arrange') return;
    const hit = pick(e.clientX, e.clientY);
    if (!hit) {
      if (ui.selected) store.ui({ selected: null });
      return;
    }
    e.stopImmediatePropagation();
    controls.enabled = false;
    const obj = objectOf(hit.id);
    const at = onFloor(e.clientX, e.clientY) ?? hit.point;
    gsap.killTweensOf(obj.position);
    gsap.killTweensOf(obj.rotation);
    drag = {
      id: hit.id,
      start: { x: obj.position.x, z: obj.position.z, rot: obj.rotation.y },
      offset: new THREE.Vector2(obj.position.x - at.x, obj.position.z - at.z),
      downX: e.clientX,
      downY: e.clientY,
      moved: false,
      blocked: false,
      pointerId: e.pointerId,
    };
    canvas.setPointerCapture(e.pointerId);
    store.ui({ selected: hit.id, hovered: null });
  };

  const onPointerMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.inside = true;
    pointer.alt = e.altKey;
    wake(0.25);
    const ui = store.get().ui;

    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.downX, e.clientY - drag.downY) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        store.ui({ dragging: true });
      }
      const at = onFloor(e.clientX, e.clientY);
      if (!at) return;
      const obj = objectOf(drag.id);
      const pose = { x: snap(at.x + drag.offset.x, !e.altKey), z: snap(at.z + drag.offset.y, !e.altKey), rot: obj.rotation.y };
      if (drag.id === 'rug') {
        const c = clampToRoom(rugBox({ ...room.rug, ...pose }), room.w, room.d, false);
        obj.position.set(c.x, 0, c.z);
        followRug();
      } else {
        const c = clampToRoom(itemBox(drag.id, pose), room.w, room.d);
        obj.position.set(c.x, 0, c.z);
        const blocked = collisions(room, drag.id, { x: c.x, z: c.z, rot: pose.rot }).length > 0;
        if (blocked !== drag.blocked) {
          drag.blocked = blocked;
          store.ui({ blocked });
        }
      }
      shadowDirty = true;
      return;
    }

    if (ui.mode === 'arrange' && ui.phase === 'live') {
      const hit = pick(e.clientX, e.clientY);
      const id = hit?.id ?? null;
      if (id !== ui.hovered) store.ui({ hovered: id });
      canvas.style.cursor = id ? 'grab' : '';
    } else if (ui.hovered) store.ui({ hovered: null });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (loupeTouch === e.pointerId) {
      loupeTouch = -1;
      pointer.inside = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      wake(0.2);
      return;
    }
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    controls.enabled = true;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (!d.moved) return;
    const obj = objectOf(d.id);
    if (d.blocked) {
      // it cannot stand there: back to where it came from
      gsap.to(obj.position, { x: d.start.x, z: d.start.z, duration: 0.55, ease: 'back.out(1.4)', onUpdate: () => void (shadowDirty = true) });
    } else if (d.id === 'rug') {
      rugApplied = { ...rugApplied, x: obj.position.x, z: obj.position.z };
      store.room((s) => ({ ...s, rug: { ...s.rug, x: obj.position.x, z: obj.position.z } }));
    } else {
      const id = d.id;
      const it = items.get(id)!;
      it.applied = { ...it.applied, x: obj.position.x, z: obj.position.z };
      store.room((s) => ({ ...s, items: { ...s.items, [id]: { ...s.items[id], x: obj.position.x, z: obj.position.z } } }));
    }
    store.ui({ dragging: false, blocked: false });
  };

  const onLeave = () => {
    if (loupeTouch >= 0) return;
    pointer.inside = false;
    if (store.get().ui.hovered) store.ui({ hovered: null });
    wake(0.2);
  };

  /** in view mode, a double click walks the eye over to what was clicked */
  const onDouble = (e: MouseEvent) => {
    if (store.get().ui.mode !== 'view') return;
    const at = onFloor(e.clientX, e.clientY);
    if (!at) return;
    at.x = THREE.MathUtils.clamp(at.x, -room.w / 2, room.w / 2);
    at.z = THREE.MathUtils.clamp(at.z, -room.d / 2, room.d / 2);
    const shift = at.clone().sub(controls.target).setY(0);
    gsap.to(controls.target, { x: at.x, y: 0.2, z: at.z, duration: 1.1, ease: 'power3.inOut' });
    gsap.to(camera.position, { x: camera.position.x + shift.x * 0.6, z: camera.position.z + shift.z * 0.6, duration: 1.1, ease: 'power3.inOut' });
  };

  /** the wheel over the rug, with the loupe out, changes its power instead of the camera's distance */
  const loupe = { on: false, at: new THREE.Vector3(), distance: 0.04, k: 0 };
  const onWheel = (e: WheelEvent) => {
    if (!loupe.on) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    loupe.distance = THREE.MathUtils.clamp(loupe.distance * Math.exp(e.deltaY * 0.0015), 0.022, 0.3);
    wake(0.3);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('dblclick', onDouble);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.7;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.3;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.addEventListener('change', () => wake(0.15));
  // once the visitor has moved the eye by hand, the frame is theirs: the views stop re-fitting themselves
  let handHeld = false;
  controls.addEventListener('start', () => (handHeld = true));

  /* ---------------------------------------------------------------- keys */

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey) return;
    if (introTl && introTl.progress() < 1) {
      api.skipIntro();
      return;
    }
    const ui = store.get().ui;
    // anywhere: the collection, the loupe, the rug alone. The strip runs right to left, so ← is onward
    if (!(ui.mode === 'arrange' && ui.selected)) {
      if (e.key === 'ArrowLeft') store.cycleRug(1);
      else if (e.key === 'ArrowRight') store.cycleRug(-1);
      else if (e.key === 'l' || e.key === 'L') store.ui({ loupe: !ui.loupe });
      else if (e.key === 'f' || e.key === 'F') store.ui({ focus: !ui.focus });
      else return;
      e.preventDefault();
      return;
    }
    const sel = ui.selected;
    const step = e.shiftKey ? Math.PI / 4 : Math.PI / 12;
    const nudge = e.shiftKey ? 0.2 : SNAP;
    switch (e.key) {
      case 'r':
      case 'R':
        store.rotate(sel, step);
        break;
      case 'e':
      case 'E':
        store.rotate(sel, -step);
        break;
      case 'Delete':
      case 'Backspace':
        if (sel !== 'rug') store.setItem(sel, { on: false });
        store.ui({ selected: null });
        break;
      case 'Escape':
        store.ui({ selected: null });
        break;
      case 'ArrowLeft':
        store.nudge(sel, -nudge, 0);
        break;
      case 'ArrowRight':
        store.nudge(sel, nudge, 0);
        break;
      case 'ArrowUp':
        store.nudge(sel, 0, -nudge);
        break;
      case 'ArrowDown':
        store.nudge(sel, 0, nudge);
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);

  /* --------------------------------------------------------------- views */

  function viewPose(view: ViewId) {
    const { w, d } = room;
    const aspect = camera.aspect || 1.6;
    // the part of the frame the panels leave free, as fractions of its width and height
    const fw = size.w > 0 ? Math.max(0.3, (size.w - insets.target.left - insets.target.right) / size.w) : 1;
    const fh = size.h > 0 ? Math.max(0.3, (size.h - insets.target.top - insets.target.bottom) / size.h) : 1;
    /** half-extents of the free view, as tangents, at a given vertical fov */
    const reach = (fov: number) => {
      const t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      return { v: t * fh, h: t * aspect * fw };
    };
    switch (view) {
      case 'rug': {
        // all round the rug, the angle from which the least of it is hidden by furniture — on a wide
        // frame preferring to look across its length, on a tall one along it, and from the room's open side
        const box = rugBox(room.rug);
        const centre = new THREE.Vector3(box.x, 0.05, box.z);
        const fov = 32;
        const r = reach(fov);
        const wide = aspect * fw >= fh;
        const elevation = THREE.MathUtils.degToRad(wide ? 58 : 70);
        const along = new THREE.Vector3(Math.cos(box.rot), 0, -Math.sin(box.rot));
        const acrossAxis = new THREE.Vector3(Math.sin(box.rot), 0, Math.cos(box.rot));
        /** how far back to stand, looking along `flat`, for the rug (and a hand's breadth of floor) to fill the free frame */
        const fitDistance = (flat: THREE.Vector3) => {
          const right = new THREE.Vector3(flat.z, 0, -flat.x);
          const halfW = Math.abs(along.dot(right)) * box.hw + Math.abs(acrossAxis.dot(right)) * box.hd + 0.18;
          const halfD = Math.abs(along.dot(flat)) * box.hw + Math.abs(acrossAxis.dot(flat)) * box.hd + 0.18;
          // seen from above at this elevation, depth on the floor shortens to its sine on the screen
          const halfV = halfD * Math.sin(elevation) + 0.12;
          return Math.max(halfW / r.h, halfV / r.v) + halfD * Math.cos(elevation) * 0.5;
        };
        const samples: THREE.Vector3[] = [];
        for (let i = 0; i < 6; i++)
          for (let j = 0; j < 4; j++) {
            const [sx, sz] = boxPoint(box, (i / 5 - 0.5) * box.hw * 1.8, (j / 3 - 0.5) * box.hd * 1.7);
            samples.push(new THREE.Vector3(sx, 0.02, sz));
          }
        const blockers = focused ? [] : [...items].filter(([id]) => room.items[id].on).flatMap(([, it]) => it.proxies);
        const probe = new THREE.Raycaster();
        let best = { score: Infinity, pos: new THREE.Vector3() };
        // square to the rug, or on its diagonals: a rug is a rectangle, and reads best seen square
        for (let k = 0; k < 8; k++) {
          const a = box.rot + (k / 8) * Math.PI * 2;
          const flat = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
          const diagonal = k % 2 === 1 ? 0.35 : 0;
          const dist = fitDistance(flat);
          const eye = centre.clone().addScaledVector(flat, Math.cos(elevation) * dist).setY(centre.y + Math.sin(elevation) * dist);
          let hidden = 0;
          for (const s of samples) {
            const to = s.clone().sub(eye);
            const len = to.length();
            probe.set(eye, to.divideScalar(len));
            probe.far = len - 0.05;
            if (probe.intersectObjects(blockers, false).length > 0) hidden++;
          }
          const across = Math.abs(flat.dot(along));
          const shape = wide ? across : 1 - across;
          const open = 1 - Math.max(0, flat.z * 0.8 + flat.x * 0.4);
          const score = (hidden / samples.length) * 5 + shape * 0.8 + open * 0.5 + diagonal;
          if (score < best.score) best = { score, pos: eye };
        }
        return { pos: best.pos, target: centre, fov };
      }
      case 'plan': {
        const fov = 38;
        const r = reach(fov);
        const dist = Math.max(d / 2 / r.v, w / 2 / r.h) * 1.1 + 0.6;
        return { pos: new THREE.Vector3(0, dist, 0.01), target: new THREE.Vector3(0, 0, 0), fov };
      }
      case 'eye':
        return {
          pos: new THREE.Vector3(-w / 2 + 0.85, 1.52, d / 2 - 0.7),
          target: new THREE.Vector3(w * 0.12, 0.72, -d * 0.12),
          fov: aspect * fw < 1 ? 66 : 54,
        };
      case 'detail': {
        const box = rugBox(room.rug);
        const centre = new THREE.Vector3(box.x, 0, box.z);
        // of the rug's four corners, the one with the most room around it — nothing standing
        // between the lens and the pile — and, between equals, the one nearest the eye
        const furniture = ITEMS.filter(({ id }) => room.items[id].on).map(({ id }) => itemBox(id, room.items[id]));
        let best: { target: THREE.Vector3; out: THREE.Vector3; score: number } | null = null;
        for (const [cx, cz] of corners(box)) {
          const corner = new THREE.Vector3(cx, 0.02, cz);
          const target = corner.clone().lerp(centre, 0.14);
          const out = corner.clone().sub(centre).setY(0).normalize();
          const eye = target.clone().addScaledVector(out, 0.8);
          const clear = Math.min(2, ...furniture.map((b) => Math.min(itemDistance(b, target), itemDistance(b, eye) + 0.1)));
          const inside = Math.abs(eye.x) < w / 2 - 0.1 && Math.abs(eye.z) < d / 2 - 0.1 ? 0.25 : 0;
          const score = clear + inside + eye.distanceTo(camera.position) * -0.01;
          if (!best || score > best.score) best = { target, out, score };
        }
        const { target, out } = best!;
        return { pos: target.clone().addScaledVector(out, 0.78).setY(0.48), target, fov: 40 };
      }
      case 'overview':
      default: {
        const fov = 34;
        const r = reach(fov);
        // the room's bounding sphere, fitted to the free view; a diagonal look needs a little less than all of it
        const radius = Math.hypot(w, d, ROOM_H) / 2;
        const dist = (radius * 0.86) / Math.min(r.v, r.h);
        const dir = new THREE.Vector3(0.62, 0.62, 0.86).normalize();
        const target = new THREE.Vector3(-0.1, 0.45, -0.2);
        return { pos: target.clone().addScaledVector(dir, dist), target, fov };
      }
    }
  }

  const goTo = (view: ViewId, seconds = 1.7) => {
    handHeld = false;
    const pose = viewPose(view);
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);
    if (reduced || seconds === 0) {
      camera.position.copy(pose.pos);
      controls.target.copy(pose.target);
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      wake(0.3);
      return;
    }
    const ease = 'power3.inOut';
    gsap.to(camera.position, { x: pose.pos.x, y: pose.pos.y, z: pose.pos.z, duration: seconds, ease });
    gsap.to(controls.target, { x: pose.target.x, y: pose.target.y, z: pose.target.z, duration: seconds, ease });
    gsap.to(camera, { fov: pose.fov, duration: seconds, ease, onUpdate: () => camera.updateProjectionMatrix() });
  };

  /* ------------------------------------------------------- store → world */

  let swapTl: gsap.core.Timeline | null = null;

  const swapRug = (next: RugPlacement) => {
    swapTl?.kill();
    store.ui({ swapping: true });
    const product = productOf(next.id);
    const tl = gsap.timeline({
      onComplete: () => {
        store.ui({ swapping: false });
        // a different size: the rug's own view re-frames it
        const ui = store.get().ui;
        if (ui.view === 'rug' && !handHeld) goTo('rug', 1.1);
      },
    });
    if (rug.roll.value > 0.02 && !reduced) {
      tl.to(rug.roll, { value: 0, duration: 0.9, ease: 'power2.in', onUpdate: () => rug.applyRoll() });
    }
    tl.add(() => {
      rug.roll.value = 0;
      rug.setProduct(product);
      placeRug(next);
      followRug();
      tintCushions(next.id);
    });
    tl.to(rug.roll, { value: 1, duration: reduced ? 0.01 : 1.7, ease: 'power3.out', onUpdate: () => rug.applyRoll() }, '+=0.12');
    swapTl = tl;
  };

  const applyItem = (id: ItemId, next: ItemState, stagger: number) => {
    const it = items.get(id)!;
    const prev = it.applied;
    if (prev.x === next.x && prev.z === next.z && prev.rot === next.rot && prev.on === next.on && prev.fabric === next.fabric) return;
    it.applied = { ...next };
    const g = it.built.group;
    if (prev.fabric !== next.fabric) {
      const hex = fabricHex(next.fabric);
      for (const m of it.built.fabrics) {
        gsap.to(m.color, { ...colorTarget(hex), duration: 0.6, ease: 'sine.inOut' });
        m.sheenColor.set(hex).lerp(new THREE.Color('#ffffff'), 0.35);
      }
    }
    const moved = prev.x !== next.x || prev.z !== next.z || prev.rot !== next.rot;
    if (prev.on !== next.on) {
      gsap.killTweensOf(g.position);
      gsap.killTweensOf(g.scale);
      if (next.on && focused) {
        // it is back in the room, but the room is standing aside for the rug
        g.position.set(next.x, 0, next.z);
        g.rotation.y = next.rot;
        return;
      }
      if (next.on) {
        g.position.set(next.x, 0.6, next.z);
        g.rotation.y = next.rot;
        g.scale.setScalar(0.94);
        g.visible = true;
        gsap.to(g.position, { y: 0, duration: reduced ? 0.01 : 0.75, ease: 'bounce.out', delay: stagger });
        gsap.to(g.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'power2.out', delay: stagger });
      } else {
        gsap.to(g.position, { y: 0.35, duration: reduced ? 0.01 : 0.32, ease: 'power2.in', delay: stagger * 0.5 });
        gsap.to(g.scale, {
          x: 0.9,
          y: 0.9,
          z: 0.9,
          duration: reduced ? 0.01 : 0.32,
          ease: 'power2.in',
          delay: stagger * 0.5,
          onComplete: () => {
            g.visible = false;
            g.position.y = 0;
            g.scale.setScalar(1);
            shadowDirty = true;
          },
        });
      }
      if (!next.on) return;
    }
    if (moved && prev.on === next.on) {
      gsap.to(g.position, { x: next.x, z: next.z, duration: reduced ? 0.01 : 1.1, ease: 'power3.inOut', delay: stagger });
      gsap.to(g.rotation, { y: turnTo(g.rotation.y, next.rot), duration: reduced ? 0.01 : 1.1, ease: 'power3.inOut', delay: stagger });
    }
  };

  const colorTarget = (hex: string) => {
    const c = new THREE.Color(hex);
    return { r: c.r, g: c.g, b: c.b };
  };

  const rebuildRoom = (next: RoomState) => {
    arch.dispose();
    arch = createArchitecture(next.w, next.d, { floor: next.floor, wall: next.wall, floorRes: tier.floorRes, anisotropy: maxAniso });
    scene.add(arch.group);
    lights.fit(arch, next.w, next.d);
    followRug();
    lights.setMood(next.mood, 0, () => undefined);
    shadowDirty = true;
  };

  /** the seating changes style: each styled piece lifts away as its twin settles in its place */
  const restyle = (next: StyleId) => {
    style = next;
    let i = 0;
    for (const { id, kind } of ITEMS) {
      if (!STYLED.includes(kind)) continue;
      const it = items.get(id)!;
      const old = it.built.group;
      const st = room.items[id];
      const made = makeItem(id, st);
      const g = made.built.group;
      const delay = i++ * 0.08;
      items.set(id, { built: made.built, proxies: made.proxies, applied: it.applied });
      scene.add(g);
      gsap.killTweensOf([old.position, old.scale]);
      const gone = () => {
        old.removeFromParent();
        old.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.geometry.dispose();
        });
        for (const f of it.built.fabrics) f.dispose();
        shadowDirty = true;
      };
      if (!old.visible || reduced) gone();
      else {
        gsap.to(old.position, { y: 0.45, duration: 0.4, ease: 'power2.in', delay });
        gsap.to(old.scale, { x: 0.9, y: 0.9, z: 0.9, duration: 0.4, ease: 'power2.in', delay, onComplete: gone });
      }
      const show = st.on && !focused;
      g.visible = show;
      if (show && !reduced) {
        g.position.y = 0.55;
        g.scale.setScalar(0.92);
        gsap.to(g.position, { y: 0, duration: 0.8, ease: 'power3.out', delay: delay + 0.35 });
        gsap.to(g.scale, { x: 1, y: 1, z: 1, duration: 0.7, ease: 'power2.out', delay: delay + 0.35 });
      }
    }
    shadowDirty = true;
    wake(0.4);
  };

  const applyRoom = (next: RoomState, prev: RoomState) => {
    room = next;
    if (next.w !== prev.w || next.d !== prev.d) rebuildRoom(next);
    else {
      if (next.floor !== prev.floor) arch.setFloor(next.floor);
      if (next.wall !== prev.wall) arch.setWall(next.wall);
    }
    if ((next.style ?? 'modern') !== style) {
      room = next;
      restyle(next.style ?? 'modern');
    }
    if (next.mood !== prev.mood) {
      lights.setMood(next.mood, reduced ? 0.01 : 2.2, () => {
        shadowDirty = true;
        wake(0.1);
      });
    }

    if (next.rug.id !== rugApplied.id) swapRug(next.rug);
    else if (next.rug.x !== rugApplied.x || next.rug.z !== rugApplied.z || next.rug.rot !== rugApplied.rot) {
      const d = reduced ? 0.01 : 1.0;
      gsap.to(rug.group.position, { x: next.rug.x, z: next.rug.z, duration: d, ease: 'power3.inOut', onUpdate: followRug });
      gsap.to(rug.group.rotation, { y: turnTo(rug.group.rotation.y, next.rug.rot), duration: d, ease: 'power3.inOut', onUpdate: followRug });
    }
    rugApplied = { ...next.rug };

    let i = 0;
    for (const { id } of ITEMS) {
      const before = items.get(id)!.applied;
      applyItem(id, next.items[id], i * 0.045);
      if (before !== items.get(id)!.applied) i++;
    }
    shadowDirty = true;
    wake(0.3);
  };

  /** every piece in the room lifts away (or settles back), leaving the rug alone on the floor */
  const setFocus = (on: boolean) => {
    focused = on;
    let i = 0;
    for (const [id, it] of items) {
      if (!room.items[id].on) continue;
      const g = it.built.group;
      gsap.killTweensOf(g.position);
      gsap.killTweensOf(g.scale);
      const delay = (i++ % 9) * 0.04;
      if (on) {
        gsap.to(g.position, { y: 0.5, duration: reduced ? 0.01 : 0.45, ease: 'power2.in', delay });
        gsap.to(g.scale, {
          x: 0.92,
          y: 0.92,
          z: 0.92,
          duration: reduced ? 0.01 : 0.45,
          ease: 'power2.in',
          delay,
          onComplete: () => {
            g.visible = false;
            shadowDirty = true;
          },
        });
      } else {
        g.visible = true;
        g.position.y = 0.5;
        g.scale.setScalar(0.92);
        gsap.to(g.position, { y: 0, duration: reduced ? 0.01 : 0.7, ease: 'power3.out', delay });
        gsap.to(g.scale, { x: 1, y: 1, z: 1, duration: reduced ? 0.01 : 0.6, ease: 'power2.out', delay });
      }
    }
    if (on) store.ui({ selected: null, hovered: null });
  };

  const applyUi = (next: UiState, prev: UiState) => {
    if (next.view !== prev.view) goTo(next.view);
    if (next.focus !== prev.focus) {
      setFocus(next.focus);
      if (next.view === 'rug' && !handHeld) goTo('rug', 1.2);
    }
    if (next.mode !== prev.mode) {
      if (next.mode === 'view') store.ui({ selected: null, hovered: null });
      canvas.style.cursor = '';
    }
    if (next.loupe && !prev.loupe) rug.requestFibres();
    if (next.blocked !== prev.blocked) select.setTone(next.blocked ? 'blocked' : 'select');
    wake(0.3);
  };

  const unsubscribe = store.subscribe((next, prev) => {
    if (next.room !== prev.room) applyRoom(next.room, prev.room);
    if (next.ui !== prev.ui) applyUi(next.ui, prev.ui);
  });

  /* --------------------------------------------------------------- intro */

  const intro = { exposure: withIntro ? 0 : 1 };
  const playIntro = () => {
    const pose = viewPose(store.get().ui.view);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    if (!withIntro) {
      // rebuilt (a change of quality): straight back to where the visitor was
      camera.position.copy(pose.pos);
      controls.target.copy(pose.target);
      rug.roll.value = 1;
      rug.applyRoll();
      store.ui({ phase: 'live' });
      wake(0.5);
      return;
    }
    store.ui({ phase: 'intro' });
    if (reduced) {
      camera.position.copy(pose.pos);
      controls.target.copy(pose.target);
      rug.roll.value = 1;
      rug.applyRoll();
      introTl = gsap.timeline({ onComplete: () => store.ui({ phase: 'live' }) }).to(intro, { exposure: 1, duration: 0.6 });
      return;
    }
    // from high above and far out, down into the room as its lights come up; then the rug rolls out
    camera.position.copy(pose.target).add(new THREE.Vector3(-2.5, 17, 11));
    controls.target.copy(pose.target).add(new THREE.Vector3(0, -0.4, 0));
    rug.roll.value = 0;
    rug.applyRoll();
    const ease = 'power3.inOut';
    introTl = gsap
      .timeline({ onComplete: () => store.ui({ phase: 'live' }) })
      .to(intro, { exposure: 1, duration: 2.6, ease: 'power2.inOut' }, 0.15)
      .to(camera.position, { x: pose.pos.x, y: pose.pos.y, z: pose.pos.z, duration: 3.6, ease, onUpdate: () => void (handHeld = false) }, 0)
      .to(controls.target, { x: pose.target.x, y: pose.target.y, z: pose.target.z, duration: 3.6, ease }, 0)
      .to(rug.roll, { value: 1, duration: 2.1, ease: 'power3.out', onUpdate: () => rug.applyRoll() }, 2.5);
  };

  /* --------------------------------------------------------------- frame */

  let shadowDirty = true;
  let awake = 0;
  const wake = (seconds: number) => {
    awake = Math.max(awake, seconds);
  };
  let overlay: Overlay = {};
  const insets = { target: { left: 0, right: 0, top: 0, bottom: 0 }, now: { left: 0, right: 0, top: 0, bottom: 0 } };
  let time = 0;
  const size = { w: 0, h: 0, dpr: 0 };
  const perf = { frames: 0, slow: 0, step: 0, dpr: 0, lastRendered: false };
  const loupeCam = new THREE.PerspectiveCamera(30, 1, 0.004, 4);
  const touchOnly = window.matchMedia('(hover: none)').matches;
  const project = new THREE.Vector3();

  const anyTween = () => gsap.globalTimeline.getChildren(true, true, false).some((t) => t.isActive());

  const placeLabel = (el: HTMLElement | null | undefined, world: THREE.Vector3 | null, text?: string) => {
    if (!el) return;
    if (!world) {
      el.style.opacity = '0';
      return;
    }
    project.copy(world).project(camera);
    const visible = project.z < 1 && Math.abs(project.x) < 1.1 && Math.abs(project.y) < 1.1;
    el.style.opacity = visible ? '1' : '0';
    el.style.transform = `translate3d(${((project.x + 1) / 2) * size.w}px, ${((1 - project.y) / 2) * size.h}px, 0) translate(-50%, -50%)`;
    if (text !== undefined && el.dataset.text !== text) {
      el.dataset.text = text;
      el.textContent = text;
    }
  };

  const toFa = (n: number) => String(Math.round(n)).replace(/\d/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[Number(c)]);

  const updateMarkers = () => {
    const ui = store.get().ui;
    const show = (marker: typeof select, id: Selection) => {
      if (!id) return marker.hide();
      if (id === 'rug') {
        marker.show(rug.group.position.x, rug.group.position.z, rug.group.rotation.y, rug.size.length, rug.size.width, 0.024);
      } else {
        const g = items.get(id)!.built.group;
        if (!g.visible) return marker.hide();
        const def = defOf(id);
        marker.show(g.position.x, g.position.z, g.rotation.y, def.w, def.d);
      }
    };
    show(select, ui.mode === 'arrange' ? ui.selected : null);
    show(hover, ui.mode === 'arrange' && ui.hovered !== ui.selected ? ui.hovered : null);
    select.tick(time);

    // the inspector floats above whatever is in hand
    if (overlay.inspector && overlay.inspector.dataset.float !== '0') {
      const sel = ui.mode === 'arrange' ? ui.selected : null;
      if (sel) {
        const g = objectOf(sel);
        const h = sel === 'rug' ? 0.05 : heightOf(sel, style);
        placeLabel(overlay.inspector, tmp.set(g.position.x, h + 0.18, g.position.z));
      } else placeLabel(overlay.inspector, null);
    }

    // the rug's measurements, along two of its edges, when it is in hand or seen from above
    const showDims = (ui.mode === 'arrange' && ui.selected === 'rug') || ui.view === 'plan';
    if (showDims && rug.roll.value > 0.98) {
      const g = rug.group;
      const a = new THREE.Vector3(0, 0.02, rug.size.width / 2 + 0.2).applyMatrix4(g.matrixWorld);
      const b = new THREE.Vector3(rug.size.length / 2 + 0.2, 0.02, 0).applyMatrix4(g.matrixWorld);
      placeLabel(overlay.dimLength, a, `${toFa(rug.size.length * 100)} سانتی‌متر`);
      placeLabel(overlay.dimWidth, b, `${toFa(rug.size.width * 100)}`);
    } else {
      placeLabel(overlay.dimLength, null);
      placeLabel(overlay.dimWidth, null);
    }
  };

  if (focused) for (const [, it] of items) it.built.group.visible = false;

  const lampAnchor = items.get('lamp')!.built.light!;
  const lampGlow = items.get('lamp')!.built.glow!;
  const screen = items.get('console')!.built.screen!;

  const api: Engine = {
    ready: rug.ready.then(() => {
      playIntro();
    }),
    bind(o) {
      overlay = o;
    },
    setInsets(i) {
      const t = insets.target;
      if (t.left === i.left && t.right === i.right && t.top === i.top && t.bottom === i.bottom) return;
      const shift = Math.abs(t.left - i.left) + Math.abs(t.right - i.right) + Math.abs(t.top - i.top) + Math.abs(t.bottom - i.bottom);
      Object.assign(t, i);
      wake(0.2);
      // a panel opened or closed: re-fit the view, unless the eye has been moved by hand
      const ui = store.get().ui;
      if (shift > 40 && !handHeld && ui.phase === 'live' && !drag) goTo(ui.view, 0.9);
    },
    frame(dt, width, height, dpr) {
      time += dt;
      if (width !== size.w || height !== size.h || dpr !== size.dpr) {
        size.w = width;
        size.h = height;
        size.dpr = dpr;
        post.setSize(width, height, dpr);
        wake(0.3);
      }

      // ease the frame's centre toward the middle of what the panels leave free
      {
        const n = insets.now;
        const t = insets.target;
        const k = 1 - Math.exp(-dt / 0.18);
        let drift = 0;
        for (const key of ['left', 'right', 'top', 'bottom'] as const) {
          const d = t[key] - n[key];
          n[key] = Math.abs(d) < 0.5 ? t[key] : n[key] + d * k;
          drift += Math.abs(d);
        }
        if (drift > 0.5) wake(0.05);
        if (width > 0 && height > 0) {
          const sx = (n.right - n.left) / 2;
          const sy = (n.bottom - n.top) / 2;
          const v = camera.view;
          if (!v || v.offsetX !== sx || v.offsetY !== sy || v.fullWidth !== width || v.fullHeight !== height) {
            camera.setViewOffset(width, height, sx, sy, width, height);
          }
        }
      }

      // the room keeps a few things live whether or not a frame is drawn
      const moved = controls.update(dt);
      if (moved) wake(0.12);
      if (arch.update(camera, dt)) wake(0.05);
      const tweening = anyTween();
      if (tweening || drag) shadowDirty = true;

      // the lens: over the rug, with the loupe out; re-aimed whenever the pointer or the view moves
      const ui = store.get().ui;
      const wasLoupe = loupe.on;
      if (!(ui.loupe && ui.phase === 'live' && pointer.inside && !drag && (loupeTouch >= 0 || !touchOnly))) loupe.on = false;
      else if (awake > 0 || tweening || moved) {
        const r = canvas.getBoundingClientRect();
        const hit = onRug(pointer.x + r.left, pointer.y + r.top);
        loupe.on = !!hit;
        if (hit) loupe.at.copy(hit);
      }
      if (loupe.on !== wasLoupe) {
        wake(0.1);
        canvas.style.cursor = loupe.on ? 'none' : '';
      }

      awake -= dt;
      if (awake <= 0 && !tweening && !drag && !moved) {
        perf.lastRendered = false;
        return;
      }

      // ---- draw ----
      const lv = lights.levels;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = lv.exposure * intro.exposure;
      scene.environmentIntensity = lv.env;
      arch.setCove(lv.cove);
      screen.emissiveIntensity = lv.screen * 0.9;
      const lampOn = room.items.lamp.on && items.get('lamp')!.built.group.visible;
      lampAnchor.getWorldPosition(lights.lamp.position);
      lights.lamp.intensity = lampOn ? lv.lamp : 0;
      const glowK = lampOn ? Math.min(1, lv.lamp / 9) : 0;
      lampGlow[0].emissiveIntensity = 1.6 * glowK;
      lampGlow[1].emissiveIntensity = 9 * glowK;
      updateMarkers();

      if (shadowDirty) {
        renderer.shadowMap.needsUpdate = true;
        shadowDirty = false;
      }

      if (loupe.on) {
        // a few centimetres above the pile, looking down the way the eye already looks
        const dir = camera.position.clone().sub(loupe.at).normalize();
        dir.y = Math.max(dir.y, 0.82);
        dir.normalize();
        loupeCam.position.copy(loupe.at).addScaledVector(dir, loupe.distance);
        loupeCam.lookAt(loupe.at);
        renderer.setRenderTarget(post.loupe);
        renderer.render(scene, loupeCam);
        renderer.setRenderTarget(null);
        renderer.shadowMap.needsUpdate = false;
        const css = Math.min(118, Math.min(width, height) * 0.2);
        // under a finger the lens floats above it, where it can be seen
        const lensY = loupeTouch >= 0 ? Math.max(css + 8, pointer.y - css - 44) : pointer.y;
        post.finish.uniforms.uLoupe.value.set(pointer.x * dpr, (height - lensY) * dpr, css * dpr);
      }
      post.finish.uniforms.uLoupeOn.value = loupe.on ? 1 : 0;
      post.finish.uniforms.uGrain.value = 1;
      post.render(dt);

      // ---- frame budget: lens work first, then resolution, never below 0.6 ----
      if (tier.adaptive && perf.lastRendered && dt < 0.2 && !document.hidden) {
        perf.frames++;
        if (dt > 1 / 28) perf.slow++;
        if (perf.frames >= 90) {
          if (perf.slow > 54 && perf.step < 3) {
            perf.step++;
            perf.dpr = perf.dpr || dpr;
            if (perf.step === 1 && tier.ao) post.setAo(false);
            else {
              perf.dpr = Math.max(0.6, perf.dpr * 0.85);
              setDpr(perf.dpr);
            }
          }
          perf.frames = 0;
          perf.slow = 0;
        }
      }
      perf.lastRendered = true;
    },
    async screenshot() {
      post.finish.uniforms.uLoupeOn.value = 0;
      post.finish.uniforms.uGrain.value = 0.4;
      updateMarkers();
      select.hide();
      hover.hide();
      post.render(0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      wake(0.2);
      return blob;
    },
    skipIntro() {
      if (!introTl || introTl.progress() >= 1) return;
      gsap.to(introTl, { progress: 1, duration: 0.7, ease: 'power2.out', overwrite: true });
    },
    dispose() {
      unsubscribe();
      introTl?.kill();
      swapTl?.kill();
      gsap.killTweensOf([camera.position, controls.target, camera, intro, rug.roll, rug.group.position, rug.group.rotation]);
      camera.clearViewOffset();
      for (const it of items.values()) {
        gsap.killTweensOf([it.built.group.position, it.built.group.rotation, it.built.group.scale]);
        it.built.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.geometry.dispose();
        });
        it.built.group.removeFromParent();
      }
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('dblclick', onDouble);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      controls.dispose();
      arch.dispose();
      lights.dispose();
      rug.dispose();
      rug.group.removeFromParent();
      select.dispose();
      hover.dispose();
      select.mesh.removeFromParent();
      hover.mesh.removeFromParent();
      kit.dispose();
      invisible.dispose();
      post.dispose();
      envMap.dispose();
      scene.environment = null;
    },
  };
  if (process.env.NODE_ENV !== 'production') Object.assign(api, { debug: { gsap, camera, controls, scene, renderer, lights, rug, viewPose, loupe, pointer, onRug } });
  return api;
}
