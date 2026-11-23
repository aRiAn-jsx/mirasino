/**
 * THE FURNITURE — each piece built from the workshop's shapes, standing on
 * its footprint centre with its front toward +z, at the size model.ts gives it.
 *
 *   sofa        low, deep, in velvet; every cushion stuffed and piped; a
 *               walnut plinth set back so it floats; cushions in the rug's
 *               colour, a knitted lumbar, a wool throw over one arm
 *   armchair    a barrel lounge: a curved shell of velvet round a piped seat
 *   coffee      a stadium of Nero Marquina on two fluted walnut drums
 *   side        a travertine drum, a dark vase, three dry stems
 *   console     walnut, fluted along its front, marble top, the screen on it
 *   floor lamp  a brass arc from a marble foot, a dome hanging over the room
 *   plant       an olive tree in a dark pot, leaves that cast real shadows
 *   pouf        a round leather pouf with a welt round its middle
 *
 * Under each piece lies a soft contact shadow, so it stands on the floor
 * (or the rug) even where no light throws one.
 */
import * as THREE from 'three';
import { ITEM_DEFS, type ItemKind, type StyleId } from '../model';
import { blotTexture, leafTexture, screenTexture } from './textures';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cabriole, clad, cushion, drum, fluted, mesh, roundedBox, roundedRect, scroll, shadowed, slab, taperedTube, upholstered, type Kit } from './kit';

export interface Built {
  group: THREE.Group;
  /** the upholstery, for re-covering */
  fabrics: THREE.MeshPhysicalMaterial[];
  /** a floor lamp's bulb, where its light belongs */
  light?: THREE.Object3D;
  /** the shade's inner glow and the bulb, for the lamp key */
  glow?: THREE.MeshStandardMaterial[];
  screen?: THREE.MeshStandardMaterial;
}

const blotMaterials = new Map<number, THREE.MeshBasicMaterial>();
function blot(w: number, d: number, strength: number) {
  let m = blotMaterials.get(strength);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: blotTexture(),
      transparent: true,
      opacity: strength,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    blotMaterials.set(strength, m);
  }
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  plane.rotation.x = -Math.PI / 2;
  // above the rug's pile, so the shadow lies on whichever it stands on
  plane.position.y = 0.019;
  plane.renderOrder = 1;
  plane.name = 'blot';
  return plane;
}

/* ------------------------------------------------------------------- sofa */

/**
 * A deep, low sofa in the Italian manner: a walnut plinth set well back so the
 * body floats; a base and arms that are themselves upholstered, full at the
 * top; three seat cushions and three back cushions, each stuffed and piped;
 * two cushions in the rug's own colour, a pale knitted lumbar between them,
 * and a wool throw over one arm.
 */
function sofa(kit: Kit, fabric: THREE.MeshPhysicalMaterial): Built {
  const { w: W, d: D } = ITEM_DEFS.sofa;
  const g = new THREE.Group();
  const armW = 0.25;
  const baseTop = 0.25;

  g.add(mesh(roundedBox(W - 0.22, 0.06, D - 0.22, 0.015), kit.walnut, 0, 0.03, 0));
  const base = upholstered(fabric, W, 0.19, D, 0.05, { puff: 0.04, welt: false });
  base.position.y = 0.06 + 0.095;
  g.add(base);

  for (const side of [-1, 1]) {
    const arm = upholstered(fabric, armW, 0.4, D, 0.11, { puff: 0.1 });
    arm.position.set(side * (W / 2 - armW / 2), baseTop - 0.02 + 0.2, 0);
    g.add(arm);
  }
  const back = upholstered(fabric, W - 0.04, 0.44, 0.2, 0.09, { puff: 0.08, axis: 'z', welt: false });
  back.position.set(0, baseTop + 0.2, -D / 2 + 0.1);
  g.add(back);

  const inner = W - armW * 2;
  const cw = inner / 3;
  const seatD = D - 0.23;
  for (let i = 0; i < 3; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    const seat = upholstered(fabric, cw - 0.012, 0.17, seatD, 0.075, { puff: 0.24 });
    seat.position.set(x, baseTop + 0.085, D / 2 - seatD / 2 - 0.008);
    g.add(seat);
    const rest = upholstered(fabric, cw - 0.018, 0.4, 0.22, 0.1, { puff: 0.32, axis: 'z' });
    rest.position.set(x, baseTop + 0.17 + 0.2, -D / 2 + 0.3);
    rest.rotation.x = -0.2;
    g.add(rest);
  }

  // cushions: two in the rug's colour, a knitted lumbar between them
  for (const side of [-1, 1]) {
    const pillow = mesh(cushion(0.48, 0.48, 0.17, 0.08, { puff: 0.75, axis: 'z' }), kit.accent, side * 0.7, baseTop + 0.43, -0.04);
    pillow.rotation.set(-0.32, side * -0.14, side * 0.09);
    g.add(pillow);
  }
  const lumbar = mesh(cushion(0.6, 0.3, 0.15, 0.07, { puff: 0.7, axis: 'z' }), kit.knit, 0.08, baseTop + 0.34, 0.04);
  lumbar.rotation.set(-0.26, 0.05, -0.03);
  g.add(lumbar);

  // a throw, folded over the right arm and falling down its outside
  {
    const span = 0.44;
    const ax = W / 2 - armW / 2;
    const top = baseTop - 0.02 + 0.4 + 0.035;
    // the cloth's path across the arm, in (x, y): from the seat, over, and down the outside
    const path = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(ax - armW / 2 - 0.02, baseTop + 0.2, 0),
        new THREE.Vector3(ax - armW / 2 + 0.01, top - 0.03, 0),
        new THREE.Vector3(ax, top, 0),
        new THREE.Vector3(ax + armW / 2 - 0.01, top - 0.03, 0),
        new THREE.Vector3(ax + armW / 2 + 0.02, top - 0.2, 0),
        new THREE.Vector3(ax + armW / 2 + 0.035, 0.12, 0),
      ],
      false,
      'centripetal',
    );
    const along = 60;
    const across = 18;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= along; i++) {
      const t = i / along;
      const p = path.getPointAt(t);
      const n = path.getTangentAt(t);
      const out = new THREE.Vector3(n.y, -n.x, 0).normalize();
      for (let j = 0; j <= across; j++) {
        const u = j / across - 0.5;
        // folds that deepen as the cloth hangs
        const fold = Math.sin(u * Math.PI * 5 + t * 2.2) * 0.012 * Math.min(1, t * 1.8) + Math.sin(u * Math.PI * 2) * 0.006;
        pos.push(p.x + out.x * fold, p.y + out.y * fold, 0.06 + u * span + Math.sin(t * 9) * 0.008 * t);
      }
    }
    for (let i = 0; i < along; i++)
      for (let j = 0; j < across; j++) {
        const a = i * (across + 1) + j;
        idx.push(a, a + 1, a + across + 1, a + 1, a + across + 2, a + across + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const throwMat = kit.knit.clone();
    throwMat.side = THREE.DoubleSide;
    throwMat.color.set('#8a7a66');
    g.add(new THREE.Mesh(geo, throwMat));
  }

  shadowed(g);
  g.add(blot(W + 0.22, D + 0.22, 0.72));
  return { group: g, fabrics: [fabric] };
}

/* --------------------------------------------------------------- armchair */

/**
 * A barrel lounge chair: a curved shell of velvet round a stuffed, piped seat,
 * on a walnut ring; a small cushion in the rug's colour.
 */
function armchair(kit: Kit, fabric: THREE.MeshPhysicalMaterial): Built {
  const g = new THREE.Group();
  g.add(mesh(drum(0.33, 0.07, 0.014, { bottom: 0.008 }), kit.walnut, 0, 0, 0));
  g.add(mesh(drum(0.41, 0.23, 0.07, { bottom: 0.035, bulge: 0.008 }), fabric, 0, 0.07, 0));
  // the seat: a stuffed round cushion with a welt at its top edge
  g.add(mesh(drum(0.31, 0.15, 0.07, { bottom: 0.05, bulge: 0.018, segments: 64 }), fabric, 0, 0.29, 0.05));
  g.add(mesh(new THREE.TorusGeometry(0.29, 0.0055, 6, 96).rotateX(Math.PI / 2), fabric, 0, 0.29 + 0.15 - 0.03, 0.05));

  // the shell: an arc of 230°, open to the front; the bevel adds 4.5 cm all round
  const R = 0.385;
  const r = 0.265;
  const spreadA = (115 * Math.PI) / 180;
  const a0 = Math.PI / 2 - spreadA;
  const a1 = Math.PI / 2 + spreadA;
  const s = new THREE.Shape();
  s.absarc(0, 0, R, a0, a1, false);
  s.absarc(0, 0, r, a1, a0, true);
  s.closePath();
  const shell = new THREE.ExtrudeGeometry(s, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.055, bevelSize: 0.045, bevelSegments: 8, curveSegments: 72 });
  shell.rotateX(-Math.PI / 2);
  shell.translate(0, 0.3 + 0.055, 0);
  g.add(new THREE.Mesh(toCreasedNormals(shell, Math.PI / 3), fabric));

  const pillow = mesh(cushion(0.38, 0.3, 0.13, 0.07, { puff: 0.7, axis: 'z' }), kit.accent, 0, 0.6, -0.14);
  pillow.rotation.set(-0.38, 0, 0.05);
  g.add(pillow);

  shadowed(g);
  g.add(blot(0.98, 0.98, 0.66));
  return { group: g, fabrics: [fabric] };
}

/* ------------------------------------------------------------ coffee table */

function coffeeTable(kit: Kit): Built {
  const { w: W, d: D, h: H } = ITEM_DEFS.coffeeTable;
  const g = new THREE.Group();
  const top = new THREE.Mesh(slab(roundedRect(W, D, D / 2), 0.045, 0.009), kit.marble);
  top.position.y = H;
  g.add(top);
  for (const side of [-1, 1]) g.add(mesh(fluted(0.17, H - 0.045, 20, 0.08), kit.walnut, side * 0.34, 0, 0));

  // on it: two books, a stone, a brass bowl
  const b1 = mesh(roundedBox(0.3, 0.035, 0.23, 0.004), kit.books[1], -0.3, H + 0.0175, 0.04);
  b1.rotation.y = 0.18;
  const b2 = mesh(roundedBox(0.25, 0.03, 0.19, 0.004), kit.books[0], -0.29, H + 0.05, 0.03);
  b2.rotation.y = -0.1;
  const stone = mesh(new THREE.SphereGeometry(0.045, 32, 16), kit.travertine, -0.27, H + 0.065 + 0.04, 0.03);
  stone.scale.y = 0.8;
  const bowl = new THREE.LatheGeometry(
    Array.from({ length: 14 }, (_, i) => {
      const a = (i / 13) * (Math.PI / 2);
      return new THREE.Vector2(Math.sin(a) * 0.15 + 0.001, (1 - Math.cos(a)) * 0.06);
    }),
    48,
  );
  const bowlMesh = new THREE.Mesh(bowl, new THREE.MeshStandardMaterial({ color: '#b8925a', metalness: 1, roughness: 0.25, side: THREE.DoubleSide }));
  bowlMesh.position.set(0.3, H, -0.02);
  g.add(b1, b2, stone, bowlMesh);
  shadowed(g);
  g.add(blot(W + 0.1, D + 0.1, 0.45));
  return { group: g, fabrics: [] };
}

/* -------------------------------------------------------------- side table */

function vase(kit: Kit, height: number, radius: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const belly = Math.sin(Math.min(1, t * 1.25) * Math.PI) * radius;
    const neck = t > 0.8 ? radius * 0.32 + (t - 0.8) * radius * 0.6 : 0;
    pts.push(new THREE.Vector2(Math.max(belly, neck, radius * 0.3) * (t === 0 ? 0.6 : 1), t * height));
  }
  pts.unshift(new THREE.Vector2(0, 0));
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 40), kit.ceramic);
}

function sideTable(kit: Kit): Built {
  const { h: H } = ITEM_DEFS.sideTable;
  const g = new THREE.Group();
  g.add(mesh(drum(0.23, H, 0.018, { bottom: 0.008, segments: 56 }), kit.travertine, 0, 0, 0));
  const v = vase(kit, 0.22, 0.07);
  v.position.set(0.04, H, -0.03);
  g.add(v);
  for (let i = 0; i < 3; i++) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.04, H + 0.18, -0.03),
      new THREE.Vector3(0.04 + (i - 1) * 0.08, H + 0.45, -0.03 + (i === 1 ? 0.06 : -0.02)),
      new THREE.Vector3(0.04 + (i - 1) * 0.22, H + 0.6 + i * 0.04, -0.03 + (i - 1) * 0.08),
    );
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.003, 5), kit.bark));
    // a seed head at the tip
    const head = mesh(new THREE.SphereGeometry(0.018, 10, 8), kit.bark, curve.v2.x, curve.v2.y, curve.v2.z);
    head.scale.set(1, 1.6, 1);
    g.add(head);
  }
  shadowed(g);
  g.add(blot(0.62, 0.62, 0.55));
  return { group: g, fabrics: [] };
}

/* ----------------------------------------------------------------- console */

function consoleUnit(kit: Kit): Built {
  const { w: W, d: D } = ITEM_DEFS.console;
  const g = new THREE.Group();
  g.add(mesh(roundedBox(W - 0.1, 0.07, D - 0.06, 0.01), kit.blackMetal, 0, 0.035, 0));
  g.add(mesh(roundedBox(W, 0.4, D, 0.012), kit.walnut, 0, 0.27, 0));
  g.add(mesh(roundedBox(W + 0.02, 0.03, D + 0.01, 0.008), kit.marble, 0, 0.485, 0));

  // flutes down the whole front: half-round reeds, edge to edge
  const pitch = 0.026;
  const count = Math.floor((W - 0.04) / pitch);
  const reed = new THREE.CylinderGeometry(0.0118, 0.0118, 0.35, 10, 1, false, -Math.PI / 2, Math.PI);
  const reeds = new THREE.InstancedMesh(reed, kit.walnut, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(-((count - 1) * pitch) / 2 + i * pitch, 0.27, D / 2);
    reeds.setMatrixAt(i, m);
  }
  g.add(reeds);
  // the doors' joins
  for (const x of [-W / 4, 0, W / 4]) g.add(mesh(new THREE.BoxGeometry(0.003, 0.36, 0.03), kit.blackMetal, x, 0.27, D / 2 + 0.002));

  // the screen, on a low stand
  g.add(mesh(roundedBox(0.42, 0.014, 0.22, 0.006), kit.blackMetal, 0, 0.507, -0.04));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.13, 0.02), kit.blackMetal, 0, 0.575, -0.06));
  const panelY = 0.62 + 0.83 / 2;
  g.add(mesh(roundedBox(1.46, 0.84, 0.03, 0.006), kit.blackMetal, 0, panelY, -0.05));
  const screen = new THREE.MeshStandardMaterial({
    color: '#050505',
    roughness: 0.12,
    metalness: 0,
    emissive: '#ffffff',
    emissiveMap: screenTexture(),
    emissiveIntensity: 0.6,
  });
  g.add(mesh(new THREE.PlaneGeometry(1.42, 0.8), screen, 0, panelY, -0.05 + 0.0155));

  // on it: a pair of vases, a stack of books
  const v1 = vase(kit, 0.3, 0.09);
  v1.position.set(0.82, 0.5, -0.02);
  const v2 = vase(kit, 0.2, 0.07);
  v2.position.set(0.66, 0.5, 0.05);
  g.add(v1, v2);
  for (let i = 0; i < 3; i++) {
    const book = mesh(roundedBox(0.26 - i * 0.02, 0.032, 0.2 - i * 0.01, 0.004), kit.books[(i + 2) % kit.books.length], -0.8, 0.516 + i * 0.032, 0.02);
    book.rotation.y = (i - 1) * 0.12;
    g.add(book);
  }
  shadowed(g);
  g.add(blot(W + 0.12, D + 0.14, 0.6));
  return { group: g, fabrics: [], screen };
}

/* -------------------------------------------------------------- floor lamp */

function floorLamp(kit: Kit): Built {
  const g = new THREE.Group();
  g.add(mesh(drum(0.2, 0.055, 0.016, { bottom: 0.006 }), kit.marble, 0, 0, 0));
  const reach = 1.32;
  const tip = new THREE.Vector3(0, 1.86, reach);
  const arc = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0.05, 0),
    new THREE.Vector3(0, 1.75, -0.12),
    new THREE.Vector3(0, 2.32, reach * 0.55),
    tip,
  );
  g.add(new THREE.Mesh(new THREE.TubeGeometry(arc, 90, 0.011, 10), kit.brass));
  const shadeR = 0.22;
  const shade = new THREE.SphereGeometry(shadeR, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  const outer = mesh(shade, kit.brass, tip.x, tip.y - shadeR * 0.95, tip.z);
  const glowInner = new THREE.MeshStandardMaterial({ color: '#f2e6d0', emissive: '#ffcf8a', emissiveIntensity: 1.6, side: THREE.BackSide, roughness: 0.6 });
  const inner = mesh(shade, glowInner, tip.x, tip.y - shadeR * 0.95, tip.z);
  inner.scale.setScalar(0.985);
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff4e0', emissive: '#ffd9a0', emissiveIntensity: 9 });
  const bulb = mesh(new THREE.SphereGeometry(0.04, 20, 12), bulbMat, tip.x, tip.y - shadeR * 0.95 + 0.02, tip.z);
  g.add(outer, inner, bulb);
  shadowed(g);
  inner.castShadow = false;
  bulb.castShadow = false;
  const light = new THREE.Object3D();
  light.position.set(tip.x, tip.y - shadeR * 1.05, tip.z);
  g.add(light);
  g.add(blot(0.5, 0.5, 0.6));
  return { group: g, fabrics: [], light, glow: [glowInner, bulbMat] };
}

/* ------------------------------------------------------------------- plant */

function olive(kit: Kit, leaves: number): Built {
  const g = new THREE.Group();
  g.add(mesh(drum(0.26, 0.48, 0.025, { taper: -0.1, bottom: 0.02, segments: 56 }), kit.ceramic, 0, 0, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.01, 40), kit.soil, 0, 0.465, 0));

  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const crowns: THREE.Vector3[] = [
    new THREE.Vector3(-0.16, 1.45, 0.05),
    new THREE.Vector3(0.18, 1.62, -0.06),
    new THREE.Vector3(0.02, 1.86, 0.08),
    new THREE.Vector3(-0.05, 1.28, -0.18),
    new THREE.Vector3(0.22, 1.25, 0.16),
  ];
  // a gnarled trunk that splits toward each crown
  const base = new THREE.Vector3(0, 0.46, 0);
  const fork = new THREE.Vector3(0.03, 0.95, -0.02);
  g.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([base, new THREE.Vector3(-0.04, 0.68, 0.03), fork]), 24, 0.04, 10),
      kit.bark,
    ),
  );
  for (const c of crowns) {
    const mid = fork.clone().lerp(c, 0.5).add(new THREE.Vector3((rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([fork, mid, c]), 20, 0.016, 7), kit.bark));
  }

  const leafMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    alphaMap: leafTexture(),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.72,
  });
  const geo = new THREE.PlaneGeometry(0.024, 0.088);
  geo.translate(0, 0.044, 0);
  const inst = new THREE.InstancedMesh(geo, leafMat, leaves);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const silver = new THREE.Color('#9aa585');
  const deep = new THREE.Color('#47563a');
  const col = new THREE.Color();
  for (let i = 0; i < leaves; i++) {
    const c = crowns[i % crowns.length];
    // a loose ellipsoid of leaves round each crown, thicker toward the outside
    const r = Math.pow(rnd(), 0.4);
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(2 * rnd() - 1);
    p.set(c.x + Math.sin(ph) * Math.cos(th) * 0.3 * r, c.y + Math.cos(ph) * 0.2 * r, c.z + Math.sin(ph) * Math.sin(th) * 0.3 * r);
    e.set((rnd() - 0.5) * 2.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 2.4 + (p.x - c.x) * 3);
    q.setFromEuler(e);
    const k = 0.75 + rnd() * 0.5;
    s.set(k, k, k);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col.copy(deep).lerp(silver, rnd()));
  }
  inst.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: leafTexture(), alphaTest: 0.5 });
  g.add(inst);
  shadowed(g);
  g.add(blot(0.7, 0.7, 0.6));
  return { group: g, fabrics: [] };
}

/* -------------------------------------------------------------------- pouf */

function pouf(kit: Kit, fabric: THREE.MeshPhysicalMaterial): Built {
  const g = new THREE.Group();
  g.add(mesh(drum(0.27, 0.42, 0.1, { bottom: 0.07, bulge: 0.018, segments: 56 }), fabric, 0, 0, 0));
  g.add(mesh(new THREE.TorusGeometry(0.282, 0.005, 6, 72).rotateX(Math.PI / 2), kit.blackMetal, 0, 0.21, 0));
  shadowed(g);
  g.add(blot(0.7, 0.7, 0.6));
  return { group: g, fabrics: [fabric] };
}

/* ---------------------------------------------------------------- classic */

/**
 * THE CLASSIC SALON — the formal set of a Persian reception room, in the
 * French manner it borrowed: frames of carved wood under gold leaf, cabriole
 * legs, backs buttoned in a diamond (capitonné), a carved crest at the top.
 * Each piece stands within its modern twin's footprint.
 */

/** four (or more) cabriole legs, each turned so its knee looks out toward its own corner */
function legs(kit: Kit, spots: [number, number, number][], height: number, thick = 0.03) {
  const g = new THREE.Group();
  for (const [x, z, knee] of spots) {
    const leg = clad(cabriole(height, 0.05 * knee, thick), kit.gilt);
    leg.position.set(x, 0, z);
    leg.rotation.y = Math.atan2(x, z);
    g.add(leg);
  }
  return g;
}

/** a carved crest: two scrolls back to back and a leaf rising between them */
function crest(kit: Kit, size = 1) {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const c = new THREE.Mesh(scroll(0.034 * size, 0.009 * size), kit.gilt);
    c.position.set(side * 0.04 * size, 0, 0);
    c.rotation.set(0, 0, side > 0 ? Math.PI * 0.85 : Math.PI * 0.15);
    c.scale.x = side;
    g.add(c);
  }
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.026 * size, 16, 12), kit.gilt);
  leaf.scale.set(0.8, 1.9, 0.6);
  leaf.position.y = 0.04 * size;
  g.add(leaf);
  const bud = new THREE.Mesh(new THREE.SphereGeometry(0.012 * size, 10, 8), kit.gilt);
  bud.position.y = 0.1 * size;
  g.add(bud);
  return g;
}

/** a diamond grid of buttons over a w × h panel, `rows` deep */
function diamond(w: number, h: number, cols: number, rows: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    const y = -h / 2 + (h * (r + 1)) / (rows + 1);
    const offset = r % 2 === 0 ? 0 : 0.5;
    for (let c = 0; c < cols + (offset ? -1 : 0) + 1; c++) {
      const x = -w / 2 + (w * (c + 0.5 + offset)) / (cols + 1);
      if (Math.abs(x) < w / 2 - 0.05) out.push([x, y]);
    }
  }
  return out;
}

/** buttons sitting in their dimples on a cushion's front face */
function buttons(material: THREE.Material, tufts: [number, number][], face: (x: number, y: number) => THREE.Vector3) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.011, 10, 8);
  for (const [x, y] of tufts) {
    const b = new THREE.Mesh(geo, material);
    b.position.copy(face(x, y));
    b.scale.z = 0.6;
    g.add(b);
  }
  return g;
}

function classicSofa(kit: Kit, fabric: THREE.MeshPhysicalMaterial): Built {
  const W = 2.3;
  const D = 0.9;
  const hw = W / 2;
  const hd = D / 2;
  const legH = 0.24;
  const g = new THREE.Group();

  g.add(
    legs(
      kit,
      [
        [-hw + 0.1, hd - 0.1, 1],
        [hw - 0.1, hd - 0.1, 1],
        [0, hd - 0.08, 0.55],
        [-hw + 0.1, -hd + 0.1, 0.7],
        [hw - 0.1, -hd + 0.1, 0.7],
      ],
      legH + 0.02,
    ),
  );

  // the seat rail: gilt, its lower front edge dipping to a carved medallion
  g.add(mesh(roundedBox(W - 0.08, 0.12, D - 0.1, 0.02), kit.gilt, 0, legH + 0.06, 0));
  const apronEdge = new THREE.CatmullRomCurve3(
    Array.from({ length: 13 }, (_, i) => {
      const x = -hw + 0.06 + ((W - 0.12) * i) / 12;
      const dip = Math.pow(Math.max(0, 1 - (x / hw) ** 2), 2) * 0.04;
      return new THREE.Vector3(x, legH + 0.005 - dip, hd - 0.045);
    }),
  );
  g.add(new THREE.Mesh(taperedTube(apronEdge, 60, 8, () => 0.014), kit.gilt));
  const medallion = crest(kit, 0.9);
  medallion.position.set(0, legH - 0.07, hd - 0.04);
  medallion.rotation.z = Math.PI;
  g.add(medallion);

  // the seat: one long cushion, piped
  const seat = upholstered(fabric, W - 0.2, 0.13, D - 0.2, 0.05, { puff: 0.22 });
  seat.position.set(0, legH + 0.12 + 0.065, 0.03);
  g.add(seat);

  // the back: buttoned in a diamond, rising to a crest in the middle
  const bw = W - 0.28;
  const bh = 0.48;
  const bd = 0.13;
  const crestRise = 0.12;
  const back = new THREE.Group();
  back.position.set(0, legH + 0.12 + 0.13 + bh / 2 - 0.02, -hd + 0.1);
  back.rotation.x = -0.1;
  g.add(back);
  const tufts = diamond(bw, bh, 8, 3);
  back.add(
    new THREE.Mesh(
      cushion(bw, bh, bd, 0.045, { axis: 'z', puff: 0.22, segs: [84, 30, 6], band: 0.2, tufts, tuftDepth: 0.026, tuftRadius: 0.034, crest: crestRise }),
      fabric,
    ),
  );
  const rise = (x: number, y: number) => (y > 0 ? crestRise * (y / (bh / 2)) * Math.pow(Math.max(0, 1 - (x / (bw / 2)) ** 2), 1.2) : 0);
  back.add(
    buttons(fabric, tufts, (x, y) => {
      const s = Math.max(0, 1 - (x / (bw / 2)) ** 2) * Math.max(0, 1 - (y / (bh / 2)) ** 2);
      return new THREE.Vector3(x, y + rise(x, y), bd / 2 + 0.22 * (bd / 2) * Math.pow(s, 0.7) - 0.018);
    }),
  );
  // its frame: one gilt moulding up one side, over the crest, down the other
  const framePts: THREE.Vector3[] = [new THREE.Vector3(-bw / 2 - 0.02, -bh / 2 - 0.02, 0)];
  for (let i = 0; i <= 24; i++) {
    const x = -bw / 2 - 0.02 + ((bw + 0.04) * i) / 24;
    const xc = Math.max(-bw / 2, Math.min(bw / 2, x));
    framePts.push(new THREE.Vector3(x, bh / 2 + rise(xc, bh / 2) + 0.02, 0));
  }
  framePts.push(new THREE.Vector3(bw / 2 + 0.02, -bh / 2 - 0.02, 0));
  back.add(new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3(framePts, false, 'centripetal', 0.2), 160, 8, () => 0.022), kit.gilt));
  const top = crest(kit, 1.2);
  top.position.set(0, bh / 2 + crestRise + 0.04, 0.012);
  back.add(top);

  // the arms: a gilt rail from the seat's front corner up, over and back to the frame;
  // a padded manchette along it, and the side between it and the seat upholstered
  for (const side of [-1, 1]) {
    const x = side * hw;
    const rail = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(x - side * 0.05, legH + 0.12, hd - 0.06),
        new THREE.Vector3(x - side * 0.035, 0.6, hd - 0.07),
        new THREE.Vector3(x - side * 0.025, 0.665, hd - 0.2),
        new THREE.Vector3(x - side * 0.03, 0.675, -0.05),
        new THREE.Vector3(x - side * 0.06, 0.665, -hd + 0.24),
        new THREE.Vector3(x - side * 0.1, 0.63, -hd + 0.12),
      ],
      false,
      'centripetal',
    );
    g.add(new THREE.Mesh(taperedTube(rail, 70, 10, (t) => 0.026 - 0.006 * Math.sin(t * Math.PI)), kit.gilt));
    const curl = new THREE.Mesh(scroll(0.034, 0.012), kit.gilt);
    curl.position.set(x - side * 0.03, 0.6, hd - 0.055);
    curl.rotation.set(0, Math.PI / 2, Math.PI * 0.6);
    g.add(curl);
    const pad = upholstered(fabric, 0.1, 0.05, 0.42, 0.024, { puff: 0.5, welt: false });
    pad.position.set(x - side * 0.028, 0.705, -0.04);
    g.add(pad);
    const panel = new THREE.Mesh(cushion(0.56, 0.2, 0.07, 0.03, { axis: 'z', puff: 0.35 }), fabric);
    panel.rotation.y = Math.PI / 2;
    panel.position.set(x - side * 0.075, 0.56, -0.03);
    g.add(panel);

    // a bolster against each arm, in the rug's colour, a rosette at each end
    const bolster = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.42, 36).rotateX(Math.PI / 2), kit.accent);
    bolster.position.set(x - side * 0.25, legH + 0.25 + 0.085, 0.04);
    g.add(bolster);
    for (const end of [-1, 1]) {
      const rosette = new THREE.Mesh(new THREE.SphereGeometry(0.084, 24, 12), kit.accent);
      rosette.scale.set(1, 1, 0.22);
      rosette.position.set(bolster.position.x, bolster.position.y, bolster.position.z + end * 0.21);
      g.add(rosette);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), kit.gilt);
      knot.position.set(bolster.position.x, bolster.position.y, bolster.position.z + end * 0.23);
      g.add(knot);
    }
  }

  const pillow = mesh(cushion(0.44, 0.44, 0.15, 0.08, { puff: 0.75, axis: 'z' }), kit.accent, 0, 0.7, -0.14);
  pillow.rotation.set(-0.28, 0, 0.04);
  g.add(pillow);

  shadowed(g);
  g.add(blot(W + 0.2, D + 0.2, 0.66));
  return { group: g, fabrics: [fabric] };
}

function classicArmchair(kit: Kit, fabric: THREE.MeshPhysicalMaterial): Built {
  const W = 0.72;
  const D = 0.7;
  const hw = W / 2;
  const hd = D / 2;
  const legH = 0.26;
  const g = new THREE.Group();
  g.add(
    legs(
      kit,
      [
        [-hw + 0.06, hd - 0.06, 1],
        [hw - 0.06, hd - 0.06, 1],
        [-hw + 0.06, -hd + 0.06, 0.7],
        [hw - 0.06, -hd + 0.06, 0.7],
      ],
      legH + 0.02,
      0.027,
    ),
  );
  g.add(mesh(roundedBox(W - 0.04, 0.1, D - 0.06, 0.02), kit.gilt, 0, legH + 0.05, 0));
  const seat = upholstered(fabric, W - 0.08, 0.12, D - 0.1, 0.05, { puff: 0.28 });
  seat.position.set(0, legH + 0.1 + 0.06, 0.02);
  g.add(seat);

  // the medallion back: an oval, buttoned, in a gilt frame with its own crest
  const rx = 0.25;
  const ry = 0.3;
  const back = new THREE.Group();
  back.position.set(0, legH + 0.22 + ry - 0.03, -hd + 0.07);
  back.rotation.x = -0.14;
  g.add(back);
  const oval = new THREE.Mesh(drum(rx, 0.07, 0.03, { bottom: 0.02, segments: 56, bulge: 0.01 }).rotateX(Math.PI / 2), fabric);
  oval.scale.set(1, ry / rx, 1);
  oval.position.z = -0.035;
  back.add(oval);
  const ovalTufts: [number, number][] = [
    [0, 0.14],
    [-0.1, 0.03],
    [0.1, 0.03],
    [0, -0.08],
    [-0.1, -0.18],
    [0.1, -0.18],
  ];
  back.add(buttons(fabric, ovalTufts, (x, y) => new THREE.Vector3(x, y, 0.035 + 0.004)));
  const ring = new THREE.EllipseCurve(0, 0, rx + 0.02, ry + 0.02, 0, Math.PI * 2, false, 0);
  back.add(
    new THREE.Mesh(
      taperedTube(new THREE.CatmullRomCurve3(ring.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0)), true), 128, 8, () => 0.019),
      kit.gilt,
    ),
  );
  const top = crest(kit, 0.85);
  top.position.set(0, ry + 0.03, 0.01);
  back.add(top);

  // stiles down to the seat, and open arms on gilt rails with padded manchettes
  for (const side of [-1, 1]) {
    const x = side * hw;
    const stile = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * (rx + 0.01), legH + 0.22 + ry - 0.06, -hd + 0.06),
      new THREE.Vector3(side * (hw - 0.05), legH + 0.18, -hd + 0.06),
      new THREE.Vector3(side * (hw - 0.04), legH + 0.1, -hd + 0.07),
    ]);
    g.add(new THREE.Mesh(taperedTube(stile, 24, 8, () => 0.019), kit.gilt));
    const rail = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(x - side * 0.035, legH + 0.1, hd - 0.05),
        new THREE.Vector3(x - side * 0.025, 0.6, hd - 0.08),
        new THREE.Vector3(x - side * 0.015, 0.64, hd - 0.2),
        new THREE.Vector3(x - side * 0.03, 0.63, -hd + 0.2),
        new THREE.Vector3(side * (rx + 0.015), 0.68, -hd + 0.09),
      ],
      false,
      'centripetal',
    );
    g.add(new THREE.Mesh(taperedTube(rail, 50, 10, (t) => 0.021 - 0.005 * Math.sin(t * Math.PI)), kit.gilt));
    const curl = new THREE.Mesh(scroll(0.028, 0.01), kit.gilt);
    curl.position.set(x - side * 0.025, 0.6, hd - 0.065);
    curl.rotation.set(0, Math.PI / 2, Math.PI * 0.6);
    g.add(curl);
    const pad = upholstered(fabric, 0.08, 0.045, 0.26, 0.02, { puff: 0.5, welt: false });
    pad.position.set(x - side * 0.02, 0.665, 0.0);
    g.add(pad);
  }

  shadowed(g);
  g.add(blot(0.86, 0.84, 0.62));
  return { group: g, fabrics: [fabric] };
}

function classicTable(kit: Kit): Built {
  const W = 1.22;
  const D = 0.66;
  const H = 0.47;
  const g = new THREE.Group();
  // a slab of cream stone with a moulded edge, on a gilt apron and four cabriole legs
  const top = new THREE.Mesh(slab(roundedRect(W, D, 0.07), 0.04, 0.012), kit.travertine);
  top.position.y = H;
  g.add(top);
  g.add(mesh(roundedBox(W - 0.12, 0.07, D - 0.12, 0.015), kit.gilt, 0, H - 0.04 - 0.035, 0));
  for (const side of [-1, 1]) {
    const c = crest(kit, 0.7);
    c.position.set(0, H - 0.11, side * (D / 2 - 0.055));
    c.rotation.set(0, side > 0 ? 0 : Math.PI, Math.PI);
    g.add(c);
  }
  g.add(
    legs(
      kit,
      [
        [-W / 2 + 0.1, D / 2 - 0.09, 1.1],
        [W / 2 - 0.1, D / 2 - 0.09, 1.1],
        [-W / 2 + 0.1, -D / 2 + 0.09, 1.1],
        [W / 2 - 0.1, -D / 2 + 0.09, 1.1],
      ],
      H - 0.075,
      0.03,
    ),
  );
  // on it: a gilt urn with its lid, two books
  const urn: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    urn.push(new THREE.Vector2(0.03 + Math.sin(Math.min(1, t * 1.2) * Math.PI) * 0.07 + (t > 0.85 ? (t - 0.85) * 0.3 : 0), t * 0.24));
  }
  const vase = new THREE.Mesh(new THREE.LatheGeometry(urn, 40), kit.gilt);
  vase.position.set(0.32, H, -0.04);
  g.add(vase);
  const b1 = mesh(roundedBox(0.28, 0.035, 0.21, 0.004), kit.books[2], -0.28, H + 0.0175, 0.04);
  b1.rotation.y = 0.14;
  const b2 = mesh(roundedBox(0.24, 0.03, 0.18, 0.004), kit.books[4], -0.27, H + 0.05, 0.03);
  b2.rotation.y = -0.08;
  g.add(b1, b2);
  shadowed(g);
  g.add(blot(W + 0.1, D + 0.1, 0.5));
  return { group: g, fabrics: [] };
}

/* ------------------------------------------------------------------- build */

export function buildItem(kind: ItemKind, kit: Kit, fabricHex: string, quality: { leaves: number }, style: StyleId = 'modern'): Built {
  if (style === 'classic') {
    if (kind === 'sofa') return classicSofa(kit, kit.velvet(fabricHex));
    if (kind === 'armchair') return classicArmchair(kit, kit.velvet(fabricHex));
    if (kind === 'coffeeTable') return classicTable(kit);
  }
  switch (kind) {
    case 'sofa':
      return sofa(kit, kit.velvet(fabricHex));
    case 'armchair':
      return armchair(kit, kit.velvet(fabricHex));
    case 'coffeeTable':
      return coffeeTable(kit);
    case 'sideTable':
      return sideTable(kit);
    case 'console':
      return consoleUnit(kit);
    case 'floorLamp':
      return floorLamp(kit);
    case 'plant':
      return olive(kit, quality.leaves);
    case 'pouf':
      return pouf(kit, kit.leather(fabricHex));
  }
}
