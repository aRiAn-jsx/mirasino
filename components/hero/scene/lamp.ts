/**
 * THE LAMP — a precision museum projector on a slim drop-rod.
 *
 * Committed direction: option 2 of the brief. A machined cylinder with visible
 * seams and a finned driver section, carried in a two-arm yoke on a 9 mm rod
 * that leaves the top of frame. The emitter is small and buried in an
 * anti-glare snoot; what the viewer sees of it is the lit crescent of the
 * inner wall. A pin-point status LED sits on the near yoke arm.
 *
 * It hangs in front of the rug and throws away from the viewer, so the room
 * sees its back and flank: fins, seams, yoke, and the beam leaving the snoot.
 *
 * The SpotLight itself lives here too, at the mouth of the snoot, so fixture,
 * beam and pool can never disagree.
 */
import * as THREE from 'three';
import { LAMP, type Tier } from '../config';
import type { Live } from '../live';

/** Lathe profile with duplicated corners → machined edges instead of smoothed ones. */
function hardLathe(profile: [number, number][], segments: number) {
  const pts: THREE.Vector2[] = [];
  const EPS = 1e-4;
  for (let i = 0; i < profile.length; i++) {
    const p = new THREE.Vector2(...profile[i]);
    if (i > 0 && i < profile.length - 1) {
      const prev = new THREE.Vector2(...profile[i - 1]);
      const next = new THREE.Vector2(...profile[i + 1]);
      pts.push(p.clone().add(prev.sub(p).setLength(EPS)));
      pts.push(p.clone().add(next.sub(p).setLength(EPS)));
    } else {
      pts.push(p);
    }
  }
  const g = new THREE.LatheGeometry(pts, segments);
  g.rotateX(Math.PI / 2); // lathe axis (+y) → optical axis (+z)
  return g;
}

export function createLamp(envMap: THREE.Texture, tier: Tier) {
  const root = new THREE.Group();
  root.name = 'lamp';

  const pivot = new THREE.Vector3(...LAMP.pivot);
  const aim = new THREE.Vector3(...LAMP.aim);
  const dir = aim.clone().sub(pivot).normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  const pitch = Math.asin(-dir.y);

  const yoke = new THREE.Group();
  yoke.position.copy(pivot);
  yoke.rotation.y = yaw;
  yoke.scale.setScalar(LAMP.scale);
  root.add(yoke);

  const head = new THREE.Group();
  head.rotation.x = pitch;
  yoke.add(head);

  /* materials */
  const graphite = new THREE.MeshStandardMaterial({ color: 0x4b4f56, metalness: 0.92, roughness: 0.42, envMap, envMapIntensity: 0 });
  const satin = new THREE.MeshStandardMaterial({ color: 0x7c8088, metalness: 0.95, roughness: 0.3, envMap, envMapIntensity: 0 });
  const baffle = new THREE.MeshStandardMaterial({
    color: 0x0a0b0c,
    metalness: 0.4,
    roughness: 0.7,
    emissive: new THREE.Color(...LAMP.color),
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  });
  const reflector = new THREE.MeshStandardMaterial({
    color: 0x8f9399,
    metalness: 1,
    roughness: 0.22,
    emissive: new THREE.Color(...LAMP.color),
    emissiveIntensity: 0,
    envMap,
    envMapIntensity: 0,
    side: THREE.DoubleSide,
  });
  const emitter = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });

  /* housing: driver fins → body with two seams → front lip */
  const R = 0.046;
  const body: [number, number][] = [
    [0.0, -0.122],
    [0.03, -0.122],
    [0.034, -0.118],
    [0.034, -0.11],
  ];
  for (let i = 0; i < 4; i++) {
    const y = -0.11 + i * 0.0125;
    body.push([0.034, y + 0.001], [0.0435, y + 0.0015], [0.0435, y + 0.0075], [0.034, y + 0.008]);
  }
  body.push(
    [0.034, -0.058],
    [R, -0.056],
    [R, -0.021],
    [R - 0.0016, -0.0205],
    [R - 0.0016, -0.0185],
    [R, -0.018],
    [R, 0.061],
    [R - 0.0016, 0.0615],
    [R - 0.0016, 0.0635],
    [R, 0.064],
    [R, 0.103],
    [R - 0.0015, 0.106],
    [0.0405, 0.106],
  );
  const housing = new THREE.Mesh(hardLathe(body, 72), graphite);
  head.add(housing);

  /* snoot interior, cone reflector, emitter */
  const snoot = new THREE.Mesh(
    hardLathe(
      [
        [0.0405, 0.106],
        [0.0395, 0.103],
        [0.0395, 0.05],
        [0.036, 0.048],
        [0.036, 0.042],
      ],
      56,
    ),
    baffle,
  );
  head.add(snoot);
  const cone = new THREE.Mesh(
    hardLathe(
      [
        [0.036, 0.042],
        [0.015, 0.027],
      ],
      48,
    ),
    reflector,
  );
  head.add(cone);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.015, 32), emitter);
  led.position.z = 0.027;
  head.add(led);

  /* trunnions */
  const knobGeo = new THREE.CylinderGeometry(0.0115, 0.0115, 0.012, 28);
  knobGeo.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) {
    const knob = new THREE.Mesh(knobGeo, satin);
    knob.position.x = sx * (R + 0.012);
    yoke.add(knob);
  }

  /* yoke: two arms, a bridge, a collar, the drop-rod */
  const armX = R + 0.0065;
  const ARM_H = 0.108;
  const armGeo = new THREE.BoxGeometry(0.005, ARM_H + 0.012, 0.022);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, graphite);
    arm.position.set(sx * armX, ARM_H / 2 - 0.006, 0);
    yoke.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(armX * 2 + 0.005, 0.006, 0.022), graphite);
  bridge.position.y = ARM_H + 0.003;
  yoke.add(bridge);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.02, 24), satin);
  collar.position.y = ARM_H + 0.016;
  yoke.add(collar);
  const ROD = 7;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, ROD, 12), graphite);
  rod.position.y = ARM_H + 0.026 + ROD / 2;
  yoke.add(rod);

  /* status LED — on the arm that faces the room */
  const indicator = new THREE.Mesh(new THREE.CircleGeometry(0.0021, 16), ledMat);
  indicator.position.set(-(armX + 0.0027), ARM_H - 0.016, 0);
  indicator.rotation.y = -Math.PI / 2;
  yoke.add(indicator);

  /* the light */
  const lightColor = new THREE.Color(...LAMP.color);
  // range-limited so the key never reaches the back wall: the wall belongs to the wash
  const spot = new THREE.SpotLight(lightColor, 0, 7.6, LAMP.angle, LAMP.penumbra, 2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
  spot.shadow.camera.near = 0.25;
  spot.shadow.camera.far = 11;
  spot.shadow.bias = -0.0006;
  spot.shadow.normalBias = 0.012;
  spot.shadow.radius = tier.shadowSize >= 2048 ? 3.2 : 2.0;
  const origin = pivot.clone().addScaledVector(dir, 0.085 * LAMP.scale);
  spot.position.copy(origin);
  spot.target.position.copy(aim);
  root.add(spot, spot.target);

  const metals = [graphite, satin];

  return {
    root,
    spot,
    origin,
    dir,
    pivot,
    update(live: Live) {
      const a = live.aperture;
      emitter.color.copy(lightColor).multiplyScalar(a * a * 26);
      reflector.emissiveIntensity = a * 1.6;
      baffle.emissiveIntensity = a * 0.22;
      // status LED: a dead grey bead when off, a cool pin-point when on
      ledMat.color.setRGB(0.012 + live.led * 5.2, 0.013 + live.led * 5.6, 0.015 + live.led * 6.2);
      // the housing only "exists" by what the room and its own spill put on it
      const env = 0.6 * live.ambience + 3.2 * live.stageRim * (0.4 + 0.6 * live.light);
      for (const m of metals) m.envMapIntensity = env;
      reflector.envMapIntensity = env;
      spot.intensity = LAMP.intensity * live.light;
    },
    dispose() {
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
      });
      [graphite, satin, baffle, reflector, emitter, ledMat].forEach((m) => m.dispose());
      spot.dispose();
    },
  };
}
