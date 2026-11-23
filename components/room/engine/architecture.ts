/**
 * THE ROOM ITSELF — floor, four walls with real thickness, ceiling.
 *
 *   back wall  (z = −d/2)  solid plaster, cut by one tall arched niche — a
 *                          mihrab's outline — washed from within by hidden
 *                          light, a dark amphora standing in it
 *   left wall  (x = −w/2)  fluted walnut from floor to ceiling, washed from above
 *   right wall (x = +w/2)  one painting, under its own picture light
 *   front wall (z = +d/2)  plain
 *   ceiling                a dropped panel with a cove of warm light round it
 *
 * Seen from outside, the room is a cut-away model: whichever walls stand
 * between the eye and the room dissolve (a dithered fade, so nothing has to
 * be sorted) and the ceiling lifts away. From inside every wall is there.
 *
 * Nothing in the room looks outward: there is no window to compete with the
 * rug for the eye.
 */
import * as THREE from 'three';
import { ROOM_LIMITS, WALLS, type FloorId, type WallId } from '../model';
import { artworkTexture, floorSurface, plasterSurface, type Surface } from './textures';
import { roundedBox } from './kit';

export const ROOM_H = ROOM_LIMITS.height;
const T = 0.16; // wall thickness

interface Faded {
  group: THREE.Object3D;
  /** a point on the inner face and the inward normal; for the ceiling, null (it is decided by height) */
  point: THREE.Vector3 | null;
  normal: THREE.Vector3 | null;
  materials: { m: THREE.Material; base: number }[];
  fade: number;
}

export interface NicheInfo {
  /** centre of the niche's opening, on the room side */
  centre: THREE.Vector3;
  width: number;
  height: number;
}

export interface Architecture {
  group: THREE.Group;
  /** the ceiling, for whatever hangs from it (downlights) */
  ceiling: THREE.Group;
  niche: NicheInfo;
  /** the art, for its picture light */
  art: THREE.Vector3;
  /** the fluted wall, for its wash */
  fluted: { x: number; z: number; width: number };
  /** fade walls toward / away from the eye; true while anything is still changing */
  update(camera: THREE.Camera, dt: number): boolean;
  setFloor(id: FloorId): void;
  setWall(id: WallId): void;
  /** cove, wall-wash and niche glow, 0‥1 */
  setCove(k: number): void;
  dispose(): void;
}

function coveTexture(w: number, d: number) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.max(64, Math.round((256 * d) / w));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  // a ring of light round the dropped panel's edge (0.45 m in), falling off both ways
  ctx.lineWidth = 3;
  for (let i = 0; i < 28; i++) {
    const k = i / 27;
    const inset = 0.45 + (k - 0.5) * 0.6;
    const px = (inset / w) * c.width;
    const py = (inset / d) * c.height;
    ctx.strokeStyle = `rgba(255,255,255,${Math.pow(1 - Math.abs(k - 0.5) * 2, 2.2) * 0.14})`;
    ctx.strokeRect(px, py, c.width - px * 2, c.height - py * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createArchitecture(
  w: number,
  d: number,
  opts: { floor: FloorId; wall: WallId; floorRes: number; anisotropy: number },
): Architecture {
  const H = ROOM_H;
  const group = new THREE.Group();
  group.name = 'architecture';
  const disposables: { dispose(): void }[] = [];
  const own = <X extends { dispose(): void }>(x: X) => (disposables.push(x), x);

  /* ---------------------------------------------------------------- floor */

  const floorMat = own(new THREE.MeshStandardMaterial({ roughness: 1, bumpScale: 1.2, envMapIntensity: 0.9 }));
  let floorMaps: THREE.Texture[] = [];
  const applyFloor = (id: FloorId) => {
    const s: Surface = floorSurface(id, opts.floorRes);
    for (const t of floorMaps) t.dispose();
    const map = s.map.clone();
    const data = s.data.clone();
    for (const t of [map, data]) {
      t.repeat.set(w / s.tile, d / s.tile);
      t.anisotropy = opts.anisotropy;
      t.needsUpdate = true;
    }
    floorMaps = [map, data];
    floorMat.map = map;
    floorMat.roughnessMap = data;
    floorMat.bumpMap = data;
    floorMat.needsUpdate = true;
  };
  applyFloor(opts.floor);
  const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(w, d)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // the model stands on a dark plinth in the void
  const plinthMat = own(new THREE.MeshStandardMaterial({ color: '#0c0c0b', roughness: 0.6 }));
  const plinth = new THREE.Mesh(own(roundedBox(w + T * 2 + 0.24, 0.28, d + T * 2 + 0.24, 0.02, 2)), plinthMat);
  plinth.position.y = -0.14 - 0.002;
  plinth.receiveShadow = true;
  group.add(plinth);

  /* ---------------------------------------------------------------- walls */

  const plaster = plasterSurface();
  const wallMat = own(
    new THREE.MeshStandardMaterial({ color: WALLS[0].swatch, roughness: 1, roughnessMap: plaster.data, bumpMap: plaster.data, bumpScale: 0.4 }),
  );
  const wallMap = own(plaster.map.clone());
  wallMap.repeat.set(1 / plaster.tile, 1 / plaster.tile);
  wallMat.map = wallMap;
  const darkMat = own(new THREE.MeshStandardMaterial({ color: '#0d0c0b', roughness: 0.5, metalness: 0.4 }));
  const skirtingMat = own(new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.55 }));

  const faded: Faded[] = [];
  const wallMats: THREE.MeshStandardMaterial[] = [];

  /** a box in world units, from min to max corner; uv in metres so plaster keeps its scale */
  const block = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, material: THREE.Material) => {
    const geo = own(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0));
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const n = geo.attributes.normal as THREE.BufferAttribute;
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(n.getX(i));
      const nz = Math.abs(n.getZ(i));
      const X = p.getX(i) + (x0 + x1) / 2;
      const Y = p.getY(i) + (y0 + y1) / 2;
      const Z = p.getZ(i) + (z0 + z1) / 2;
      uv.setXY(i, nx > 0.5 ? Z : X, nz > 0.5 || nx > 0.5 ? Y : Z);
    }
    const m = new THREE.Mesh(geo, material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const wallGroup = (point: THREE.Vector3, normal: THREE.Vector3) => {
    const g = new THREE.Group();
    group.add(g);
    const entry: Faded = { group: g, point, normal, materials: [], fade: 1 };
    faded.push(entry);
    return { g, entry };
  };

  /** each wall owns copies of its materials, so it can fade alone */
  const seal = (entry: Faded) => {
    const copies = new Map<THREE.Material, THREE.Material>();
    entry.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => {
        let c = copies.get(m);
        if (!c) {
          c = own(m.clone());
          if (!c.transparent) c.alphaHash = true;
          c.shadowSide = THREE.DoubleSide;
          copies.set(m, c);
          entry.materials.push({ m: c, base: m.opacity });
          if (m === wallMat) wallMats.push(c as THREE.MeshStandardMaterial);
        }
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
    return copies;
  };

  const skirting = (g: THREE.Group, x0: number, z0: number, x1: number, z1: number) => g.add(block(x0, 0, z0, x1, 0.085, z1, skirtingMat));

  /* back: solid, with one arched niche */
  const zb = -d / 2;
  const nicheW = Math.min(1.45, w * 0.24);
  const nicheH = 2.45;
  const nicheX = Math.min(w * 0.18, w / 2 - nicheW / 2 - 0.7);
  const nicheY0 = 0.1;
  const nicheDepth = 0.12;
  /** the niche's outline: straight jambs, a round head */
  const arch = <P extends THREE.Path>(path: P) => {
    const x0 = nicheX - nicheW / 2;
    const x1 = nicheX + nicheW / 2;
    const spring = nicheY0 + nicheH - nicheW / 2;
    path.moveTo(x0, nicheY0);
    path.lineTo(x1, nicheY0);
    path.lineTo(x1, spring);
    path.absarc(nicheX, spring, nicheW / 2, 0, Math.PI, false);
    path.lineTo(x0, nicheY0);
    return path;
  };
  const glowMats: THREE.MeshStandardMaterial[] = [];
  const nicheGlow = (() => {
    // light from a hidden strip under the head of the arch, pooling at the top and falling away
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 10, 4, 64, 40, 230);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 256);
    const t = own(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  {
    const { g, entry } = wallGroup(new THREE.Vector3(0, 1, zb), new THREE.Vector3(0, 0, 1));
    const outline = new THREE.Shape();
    outline.moveTo(-w / 2 - T, 0);
    outline.lineTo(w / 2 + T, 0);
    outline.lineTo(w / 2 + T, H);
    outline.lineTo(-w / 2 - T, H);
    outline.lineTo(-w / 2 - T, 0);
    outline.holes.push(arch(new THREE.Path()));
    const wallGeo = own(new THREE.ExtrudeGeometry(outline, { depth: T, bevelEnabled: false, curveSegments: 40 }));
    wallGeo.translate(0, 0, zb - T);
    const back = new THREE.Mesh(wallGeo, wallMat);
    back.castShadow = true;
    back.receiveShadow = true;
    g.add(back);
    skirting(g, -w / 2, zb, nicheX - nicheW / 2, zb + 0.012);
    skirting(g, nicheX + nicheW / 2, zb, w / 2, zb + 0.012);

    // the niche's back, a shade warmer than the wall, lit from within
    const nicheMat = own(
      new THREE.MeshStandardMaterial({ color: '#3a3029', roughness: 0.95, emissive: '#ffcf96', emissiveMap: nicheGlow, emissiveIntensity: 0 }),
    );
    const panelGeo = own(new THREE.ShapeGeometry(arch(new THREE.Shape()), 40));
    // ShapeGeometry's uv is the shape's own x, y: bring it to 0‥1 over the niche for the glow
    const uv = panelGeo.attributes.uv as THREE.BufferAttribute;
    const pos = panelGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - (nicheX - nicheW / 2)) / nicheW, (pos.getY(i) - nicheY0) / nicheH);
    const panel = new THREE.Mesh(panelGeo, nicheMat);
    panel.position.z = zb - nicheDepth;
    panel.receiveShadow = true;
    g.add(panel);
    // the hidden strip itself, just visible under the head
    const ledMat = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffc98e', emissiveIntensity: 0 }));
    const head = new THREE.ArcCurve(nicheX, nicheY0 + nicheH - nicheW / 2, nicheW / 2 - 0.025, 0.12, Math.PI - 0.12, false);
    const strip = new THREE.Mesh(
      own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(head.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, zb - 0.025))), 60, 0.006, 6)),
      ledMat,
    );
    g.add(strip);

    // in it, on a low travertine block, a tall dark amphora
    const stone = own(new THREE.MeshStandardMaterial({ color: '#b9a689', roughness: 0.7 }));
    g.add(block(nicheX - 0.26, nicheY0, zb - nicheDepth, nicheX + 0.26, nicheY0 + 0.32, zb - 0.015, stone));
    const profile: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const r = 0.07 + Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.15 * (1 - t * 0.35) + (t > 0.86 ? (t - 0.86) * 0.5 : 0);
      profile.push(new THREE.Vector2(r, t * 0.78));
    }
    const amphora = new THREE.Mesh(
      own(new THREE.LatheGeometry(profile, 48)),
      own(new THREE.MeshPhysicalMaterial({ color: '#1e1a17', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.5 })),
    );
    amphora.position.set(nicheX, nicheY0 + 0.32, zb - nicheDepth / 2 - 0.005);
    amphora.castShadow = true;
    g.add(amphora);

    const copies = seal(entry);
    for (const m of [nicheMat, ledMat]) glowMats.push(copies.get(m) as THREE.MeshStandardMaterial);
  }

  /* left: fluted walnut */
  const xl = -w / 2;
  const fluteW = Math.min(d - 0.9, 3.6);
  {
    const { g, entry } = wallGroup(new THREE.Vector3(xl, 1, 0), new THREE.Vector3(1, 0, 0));
    g.add(block(xl - T, 0, -d / 2 - T, xl, H, d / 2 + T, wallMat));
    skirting(g, xl, -d / 2, xl + 0.012, -fluteW / 2);
    skirting(g, xl, fluteW / 2, xl + 0.012, d / 2);
    const backing = block(xl, 0, -fluteW / 2, xl + 0.006, H, fluteW / 2, darkMat);
    g.add(backing);
    const pitch = 0.052;
    const count = Math.floor(fluteW / pitch);
    const slatGeo = own(roundedBox(0.032, H - 0.004, 0.034, 0.008, 2));
    const walnutLike = own(new THREE.MeshStandardMaterial({ color: '#5a3a24', roughness: 0.5 }));
    const slats = new THREE.InstancedMesh(slatGeo, walnutLike, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m.makeTranslation(xl + 0.006 + 0.016, H / 2, -((count - 1) * pitch) / 2 + i * pitch);
      slats.setMatrixAt(i, m);
    }
    slats.castShadow = true;
    slats.receiveShadow = true;
    g.add(slats);
    seal(entry);
  }

  /* right: the painting */
  const xr = w / 2;
  const art = new THREE.Vector3(xr - 0.03, 1.55, -0.15);
  {
    const { g, entry } = wallGroup(new THREE.Vector3(xr, 1, 0), new THREE.Vector3(-1, 0, 0));
    g.add(block(xr, 0, -d / 2 - T, xr + T, H, d / 2 + T, wallMat));
    skirting(g, xr - 0.012, -d / 2, xr, d / 2);
    const aw = 1.05;
    const ah = 1.4;
    const frame = block(xr - 0.05, art.y - ah / 2 - 0.025, art.z - aw / 2 - 0.025, xr, art.y + ah / 2 + 0.025, art.z + aw / 2 + 0.025, darkMat);
    g.add(frame);
    const canvasMat = own(new THREE.MeshStandardMaterial({ map: own(artworkTexture()), roughness: 0.85 }));
    const painting = new THREE.Mesh(own(new THREE.PlaneGeometry(aw, ah)), canvasMat);
    painting.rotation.y = -Math.PI / 2;
    painting.position.set(xr - 0.0505, art.y, art.z);
    painting.receiveShadow = true;
    g.add(painting);
    // the picture light: a brass bar on a short arm
    const brass = own(new THREE.MeshStandardMaterial({ color: '#c09a5b', metalness: 1, roughness: 0.3 }));
    g.add(block(xr - 0.16, art.y + ah / 2 + 0.11, art.z - 0.3, xr - 0.11, art.y + ah / 2 + 0.15, art.z + 0.3, brass));
    g.add(block(xr - 0.13, art.y + ah / 2 + 0.11, art.z - 0.01, xr, art.y + ah / 2 + 0.13, art.z + 0.01, brass));
    seal(entry);
  }

  /* front: plain */
  {
    const zf = d / 2;
    const { g, entry } = wallGroup(new THREE.Vector3(0, 1, zf), new THREE.Vector3(0, 0, -1));
    g.add(block(-w / 2 - T, 0, zf, w / 2 + T, H, zf + T, wallMat));
    skirting(g, -w / 2, zf - 0.012, w / 2, zf);
    seal(entry);
  }

  /* ---------------------------------------------------------------- ceiling */

  const ceiling = new THREE.Group();
  ceiling.name = 'ceiling';
  group.add(ceiling);
  const coveMap = own(coveTexture(w, d));
  const ceilMat = own(new THREE.MeshStandardMaterial({ color: '#cfc6b8', roughness: 0.95, emissive: '#ffbf80', emissiveMap: coveMap, emissiveIntensity: 0 }));
  const ceil = new THREE.Mesh(own(new THREE.PlaneGeometry(w, d)), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  ceiling.add(ceil);
  const drop = new THREE.Mesh(own(roundedBox(w - 0.9, 0.12, d - 0.9, 0.01, 1)), own(new THREE.MeshStandardMaterial({ color: '#d6cec1', roughness: 0.9 })));
  drop.position.y = H - 0.06;
  ceiling.add(drop);
  const ledMat = own(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffc58a', emissiveIntensity: 0 }));
  for (const [sx, sz, lx, lz] of [
    [0, -(d - 0.9) / 2 - 0.01, w - 0.9, 0.012],
    [0, (d - 0.9) / 2 + 0.01, w - 0.9, 0.012],
    [-(w - 0.9) / 2 - 0.01, 0, 0.012, d - 0.9],
    [(w - 0.9) / 2 + 0.01, 0, 0.012, d - 0.9],
  ]) {
    const strip = new THREE.Mesh(own(new THREE.BoxGeometry(lx, 0.012, lz)), ledMat);
    strip.position.set(sx, H - 0.006, sz);
    ceiling.add(strip);
  }
  // the wash along the top of the fluted wall
  const wash = new THREE.Mesh(own(new THREE.BoxGeometry(0.02, 0.012, fluteW)), ledMat);
  wash.position.set(xl + 0.09, H - 0.02, 0);
  ceiling.add(wash);
  // the ceiling does not dissolve: it simply lifts away once the eye is above it
  faded.push({ group: ceiling, point: null, normal: null, materials: [], fade: 1 });

  /* ----------------------------------------------------------------- api */

  const v = new THREE.Vector3();
  const api: Architecture = {
    group,
    ceiling,
    niche: { centre: new THREE.Vector3(nicheX, nicheY0 + nicheH / 2, zb), width: nicheW, height: nicheH },
    art,
    fluted: { x: xl, z: 0, width: fluteW },
    update(camera, dt) {
      let moving = false;
      const k = 1 - Math.exp(-dt / 0.12);
      for (const f of faded) {
        let target: number;
        if (f.point && f.normal) target = v.copy(camera.position).sub(f.point).dot(f.normal) > 0.05 ? 1 : 0;
        else target = camera.position.y < H - 0.02 ? 1 : 0;
        const next = Math.abs(target - f.fade) < 0.01 ? target : f.fade + (target - f.fade) * k;
        if (next !== f.fade) {
          moving = true;
          f.fade = next;
          for (const { m, base } of f.materials) m.opacity = base * next;
          f.group.visible = next > 0.01;
        }
      }
      return moving;
    },
    setFloor: applyFloor,
    setWall(id) {
      const hex = WALLS.find((x) => x.id === id)?.swatch ?? WALLS[0].swatch;
      for (const m of [wallMat, ...wallMats]) m.color.set(hex);
    },
    setCove(k) {
      ledMat.emissiveIntensity = 7 * k;
      ceilMat.emissiveIntensity = 3 * k;
      // the niche keeps a little of its glow even by day: besides the rug, it is the one lit thing in the room
      const n = 0.25 + 0.75 * k;
      glowMats[0].emissiveIntensity = 0.55 * n;
      glowMats[1].emissiveIntensity = 8 * n;
    },
    dispose() {
      for (const t of floorMaps) t.dispose();
      for (const x of disposables) x.dispose();
      group.removeFromParent();
    },
  };
  api.setWall(opts.wall);
  return api;
}
