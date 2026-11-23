/**
 * THE GALLERY — the hall the pieces hang in.
 *
 *   wall      white plaster, a shadow gap where it meets the floor. Each piece
 *             hangs a hand's breadth off it, so its light throws a soft
 *             shadow down the wall below and the plaster darkens a little
 *             all round it (computed here: a rug is a rectangle parallel to
 *             the wall, so its shadow can be drawn exactly, penumbra and all,
 *             without a shadow map).
 *   floor     pale polished concrete, holding a faint, very soft reflection.
 *   pool      the hoz: a long, shallow, black-lined pool flush with the floor,
 *             running in front of all the pieces. It holds their reflections
 *             sharp and dark, and its surface is simulated (liquid.ts).
 *   ceiling   white, with the track let into it.
 *   lights    one track spot per piece, black, aimed a little below its middle.
 *   rods      each piece hangs from a black rod on two small brackets.
 *   labels    a card on the wall beside each piece: its number, name, origin.
 *   benches   crimson velvet on black steel, in the hall between the pieces.
 *
 * Everything that is lit is lit by the same lights: the three spots, a soft
 * fill from the room (hemisphere), and the room itself for what is glossy
 * (environment). All of it answers `live.light` / `live.ambience`, so the
 * lamp key still puts the whole hall into darkness.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GALLERY, RUG, RUGS, pieceX } from '../config';
import type { Live } from '../live';
import { NOISE, REFLECTION_PARS } from './glsl';
import type { PoolBox } from './liquid';

const N = RUGS.length;
const MAX_PIECES = 6;
const MAX_BENCHES = 7;

/** the pool, from the catalogue and the layout */
export function poolBox(): PoolBox {
  const x0 = pieceX(0) - GALLERY.pool.overrun;
  const x1 = pieceX(N - 1) + GALLERY.pool.overrun;
  return { x: x0, z: GALLERY.pool.z0, w: x1 - x0, h: GALLERY.pool.z1 - GALLERY.pool.z0 };
}

/** where the benches stand: between neighbouring pieces, and one past each end */
const benchX = Array.from({ length: N + 1 }, (_, i) => pieceX(i) - GALLERY.spacing / 2);

/** label card beside each piece */
const LABEL = { w: 0.36, h: 0.235, x: RUG.planeW / 2 + 0.36, y: 1.42 };

export function createGallery() {
  const group = new THREE.Group();
  group.name = 'gallery';
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T) => {
    disposables.push(thing);
    return thing;
  };

  const pool = poolBox();
  const hallX0 = pool.x - 6;
  const hallX1 = pool.x + pool.w + 6;
  const hallW = hallX1 - hallX0;
  const hallMid = (hallX0 + hallX1) / 2;
  const wallZ = GALLERY.wallZ;

  /* where the pieces hang, for the wall's shadows: centre x, centre y, half size */
  const pieces = Array.from({ length: MAX_PIECES }, (_, i) =>
    i < N ? new THREE.Vector4(pieceX(i), RUG.cy, RUG.bodyHalfX + 0.02, RUG.bodyHalfZ + 0.02) : new THREE.Vector4(0, -10, 0, 0),
  );

  /* ================================================================ wall */

  const wallUniforms = {
    uPieces: { value: pieces },
    uCount: { value: N },
    uLabel: { value: new THREE.Vector3(LABEL.x, LABEL.y, LABEL.w / 2) },
    uLabelH: { value: LABEL.h / 2 },
    uGap: { value: RUG.z - wallZ },
  };
  const wallMaterial = keep(
    new THREE.MeshStandardMaterial({ color: 0xd7d3cd, roughness: 0.92, metalness: 0, envMapIntensity: 0.6 }),
  );
  wallMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wallUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWallWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         ${NOISE}
         uniform vec4 uPieces[${MAX_PIECES}];
         uniform int uCount;
         uniform vec3 uLabel;
         uniform float uLabelH;
         uniform float uGap;
         varying vec3 vWallWorld;
         float wallShade = 1.0;
         float wallAo = 1.0;
         float sdBox(vec2 p, vec2 b) {
           vec2 d = abs(p) - b;
           return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
         }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         {
           vec2 p = vWallWorld.xy;
           // plaster: never quite flat in colour
           diffuseColor.rgb *= 0.975 + 0.035 * vnoise(p * 1.3) + 0.012 * vnoise(p * 23.0);
           for (int i = 0; i < ${MAX_PIECES}; i++) {
             if (i >= uCount) break;
             vec4 r = uPieces[i];
             // the light comes from above and in front: the shadow falls a little below the piece,
             // and blurs the further the cloth stands off the wall
             float d = sdBox(p - vec2(r.x, r.y - uGap * 0.95), r.zw);
             wallShade *= 1.0 - 0.62 * (1.0 - smoothstep(-0.03, 0.05 + uGap * 0.6, d));
             // the room's light is kept off the wall all round the piece, a little
             float halo = sdBox(p - r.xy, r.zw);
             wallAo *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.42, halo));
             // the label card, standing a few millimetres proud
             float c = sdBox(p - vec2(r.x + uLabel.x, uLabel.y - 0.006), vec2(uLabel.z, uLabelH));
             wallShade *= 1.0 - 0.35 * (1.0 - smoothstep(-0.004, 0.018, c));
           }
           // the shadow gap at the foot of the wall, and the plaster darkening into the ceiling
           float gap = 1.0 - smoothstep(0.022, 0.03, p.y);
           diffuseColor.rgb *= mix(1.0, 0.06, gap);
           wallAo *= mix(1.0, 0.72, smoothstep(${(GALLERY.ceiling - 0.6).toFixed(2)}, ${GALLERY.ceiling.toFixed(2)}, p.y));
           wallAo *= mix(0.8, 1.0, smoothstep(0.03, 0.5, p.y));
         }`,
      )
      .replace(
        '#include <aomap_fragment>',
        `reflectedLight.directDiffuse *= wallShade;
         reflectedLight.indirectDiffuse *= wallAo;`,
      );
  };
  wallMaterial.customProgramCacheKey = () => 'nafis-gallery-wall';

  const wall = new THREE.Mesh(keep(new THREE.PlaneGeometry(hallW, GALLERY.ceiling, 1, 1)), wallMaterial);
  wall.position.set(hallMid, GALLERY.ceiling / 2, wallZ);
  wall.name = 'wall';
  group.add(wall);

  /* the ends of the hall: two more white walls, coming toward the visitor */
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(keep(new THREE.PlaneGeometry(14, GALLERY.ceiling)), wallMaterial);
    end.position.set(side < 0 ? hallX0 : hallX1, GALLERY.ceiling / 2, wallZ + 7);
    end.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(end);
  }

  /* ============================================================= ceiling */

  const ceilingMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xd2cec8, roughness: 0.95, envMapIntensity: 0.5 }));
  const ceiling = new THREE.Mesh(keep(new THREE.PlaneGeometry(hallW, 16)), ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(hallMid, GALLERY.ceiling, wallZ + 8);
  group.add(ceiling);

  const steel = keep(
    new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.38, metalness: 0.65, envMapIntensity: 1.0 }),
  );

  // the track, let into the ceiling
  const track = new THREE.Mesh(keep(new THREE.BoxGeometry(hallW, 0.034, 0.05)), steel);
  track.position.set(hallMid, GALLERY.ceiling - 0.012, GALLERY.light.z);
  group.add(track);

  /* ======================================================== track lights */

  const L = GALLERY.light;
  const lightColor = new THREE.Color(...L.color);
  const headGeo = keep(new THREE.CylinderGeometry(0.062, 0.062, 0.2, 28, 1, false));
  headGeo.rotateX(Math.PI / 2); // axis along +z, so lookAt aims it
  const backGeo = keep(new THREE.CylinderGeometry(0.05, 0.062, 0.05, 28));
  backGeo.rotateX(Math.PI / 2);
  const lensGeo = keep(new THREE.CircleGeometry(0.048, 28));
  const stemGeo = keep(new THREE.CylinderGeometry(0.008, 0.008, 1, 8));
  const adapterGeo = keep(new THREE.BoxGeometry(0.07, 0.045, 0.06));
  const lensMaterial = keep(new THREE.MeshBasicMaterial({ color: lightColor.clone(), toneMapped: false }));

  const spots: THREE.SpotLight[] = [];
  const heads: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const x = pieceX(i);
    const headPos = new THREE.Vector3(x, L.y, L.z);
    const aim = new THREE.Vector3(x, L.aimY, RUG.z);
    heads.push(headPos.clone());

    const fixture = new THREE.Group();
    fixture.position.copy(headPos);
    fixture.lookAt(aim);
    const head = new THREE.Mesh(headGeo, steel);
    const back = new THREE.Mesh(backGeo, steel);
    back.position.z = -0.12;
    const lens = new THREE.Mesh(lensGeo, lensMaterial);
    lens.position.z = 0.101;
    fixture.add(head, back, lens);
    group.add(fixture);

    const stemLength = GALLERY.ceiling - L.y - 0.03;
    const stem = new THREE.Mesh(stemGeo, steel);
    stem.scale.y = stemLength;
    stem.position.set(x, L.y + stemLength / 2 + 0.02, L.z - 0.035);
    group.add(stem);
    const adapter = new THREE.Mesh(adapterGeo, steel);
    adapter.position.set(x, GALLERY.ceiling - 0.05, L.z);
    group.add(adapter);

    const spot = new THREE.SpotLight(lightColor, 0, 9, L.angle, L.penumbra, 2);
    spot.position.copy(headPos);
    spot.target.position.copy(aim);
    group.add(spot, spot.target);
    spots.push(spot);
  }

  /* ================================================================ rods */

  const rodGeo = keep(new THREE.CylinderGeometry(0.011, 0.011, RUG.bodyHalfX * 2 + 0.34, 12));
  rodGeo.rotateZ(Math.PI / 2);
  const capGeo = keep(new THREE.SphereGeometry(0.02, 12, 8));
  const bracketGeo = keep(new THREE.BoxGeometry(0.018, 0.03, RUG.z - wallZ + 0.03));
  const rodY = RUG.cy + RUG.bodyHalfZ + 0.022;
  for (let i = 0; i < N; i++) {
    const x = pieceX(i);
    const rod = new THREE.Mesh(rodGeo, steel);
    rod.position.set(x, rodY, RUG.z + 0.012);
    group.add(rod);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, steel);
      cap.position.set(x + s * (RUG.bodyHalfX + 0.17), rodY, RUG.z + 0.012);
      const bracket = new THREE.Mesh(bracketGeo, steel);
      bracket.position.set(x + s * (RUG.bodyHalfX + 0.06), rodY, (RUG.z + wallZ) / 2);
      group.add(cap, bracket);
    }
  }

  /* ============================================================== labels */

  const cardMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 0.7 }));
  const cardGeo = keep(new THREE.BoxGeometry(LABEL.w, LABEL.h, 0.01));
  const labels: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; face: THREE.MeshStandardMaterial }[] = [];
  for (let i = 0; i < N; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 470;
    const texture = keep(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const face = keep(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 }));
    // box faces: +x, −x, +y, −y, +z (front), −z
    const card = new THREE.Mesh(cardGeo, [cardMaterial, cardMaterial, cardMaterial, cardMaterial, face, cardMaterial]);
    card.position.set(pieceX(i) + LABEL.x, LABEL.y, wallZ + 0.006);
    group.add(card);
    labels.push({ canvas, texture, face });
  }
  const drawLabels = () => {
    labels.forEach(({ canvas, texture }, i) => {
      const rug = RUGS[i];
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width;
      ctx.fillStyle = '#f6f4f0';
      ctx.fillRect(0, 0, W, canvas.height);
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#8a8580';
      ctx.font = '300 40px Jost, sans-serif';
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.fillText(rug.index, 56, 96);
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#7a1424';
      ctx.fillRect(W - 56 - 70, 122, 70, 4);
      ctx.fillStyle = '#141414';
      ctx.font = '700 68px "Vazirmatn Variable", Vazirmatn, sans-serif';
      ctx.fillText(rug.fa.title, W - 56, 236);
      ctx.fillStyle = '#5c5955';
      ctx.font = '400 40px "Vazirmatn Variable", Vazirmatn, sans-serif';
      ctx.fillText(`${rug.fa.origin} · ${rug.fa.specs[0]}`, W - 56, 318);
      ctx.fillText(rug.fa.specs[1], W - 56, 386);
      texture.needsUpdate = true;
    });
  };
  drawLabels();
  // the house face arrives a moment later than the page; set the cards again when it does
  if (typeof document !== 'undefined' && document.fonts) {
    Promise.all([document.fonts.load('700 68px "Vazirmatn Variable"'), document.fonts.load('300 40px Jost')])
      .then(drawLabels)
      .catch(() => undefined);
  }

  /* ============================================================= benches */

  const velvet = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0x5a0a15,
      roughness: 0.82,
      sheen: 1,
      sheenColor: new THREE.Color(0.85, 0.32, 0.36),
      sheenRoughness: 0.42,

      envMapIntensity: 0.6,
    }),
  );
  const B = GALLERY.bench;
  const seatGeo = keep(new RoundedBoxGeometry(B.width, 0.13, B.depth, 4, 0.035));
  const legGeo = keep(new THREE.BoxGeometry(0.03, B.height - 0.13, B.depth - 0.06));
  const railGeo = keep(new THREE.BoxGeometry(0.03, 0.03, B.depth - 0.06));
  for (const x of benchX) {
    const seat = new THREE.Mesh(seatGeo, velvet);
    seat.position.set(x, B.height - 0.065, B.z);
    group.add(seat);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, steel);
      leg.position.set(x + s * (B.width / 2 - 0.14), (B.height - 0.13) / 2, B.z);
      const rail = new THREE.Mesh(railGeo, steel);
      rail.position.set(x + s * (B.width / 2 - 0.14), 0.015, B.z);
      group.add(leg, rail);
    }
  }

  /* ======================================================= floor and pool */

  const benchSpots = Array.from({ length: MAX_BENCHES }, (_, i) =>
    i < benchX.length ? new THREE.Vector2(benchX[i], B.z) : new THREE.Vector2(0, 1e4),
  );
  const floorUniforms = {
    tRefl: { value: null as THREE.Texture | null },
    tReflShort: { value: null as THREE.Texture | null },
    tReflLong: { value: null as THREE.Texture | null },
    uReflMatrix: { value: new THREE.Matrix4() },
    uReflTexel: { value: new THREE.Vector2(1, 1) },
    uReflShift: { value: new THREE.Vector2(0, 0) },
    uReflStrength: { value: 0 },
    uReflSoft: { value: 1 },
    uNearFar: { value: new THREE.Vector2(0.5, 60) },
    uReflTime: { value: 0 },
    uReflRipple: { value: 0.0045 },
    tWave: { value: null as THREE.Texture | null },
    uPool: { value: new THREE.Vector4(pool.x, pool.z, pool.w, pool.h) },
    uWaveGain: { value: 0 },
    uSheen: { value: 0 },
    uWallZ: { value: wallZ },
    uBenches: { value: benchSpots },
    uBench: { value: new THREE.Vector2(B.width / 2, B.depth / 2) },
  };

  const floorMaterial = keep(
    new THREE.MeshStandardMaterial({ color: 0xb3afa9, roughness: 0.55, metalness: 0, envMapIntensity: 0.35 }),
  );
  floorMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, floorUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflMatrix;\nvarying vec4 vReflUv;\nvarying vec3 vFloorWorld;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 floorWorld = modelMatrix * vec4(transformed, 1.0);
         vFloorWorld = floorWorld.xyz;
         vReflUv = uReflMatrix * floorWorld;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         ${REFLECTION_PARS}
         ${NOISE}
         uniform float uReflTime;
         uniform float uReflRipple;
         uniform sampler2D tWave;
         uniform vec4 uPool;
         uniform float uWaveGain;
         uniform float uSheen;
         uniform float uWallZ;
         uniform vec2 uBenches[${MAX_BENCHES}];
         uniform vec2 uBench;
         varying vec4 vReflUv;
         varying vec3 vFloorWorld;
         float water = 0.0;
         float coping = 0.0;
         float floorAo = 1.0;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         {
           vec2 p = vFloorWorld.xz;
           float px = max(fwidth(p.x), fwidth(p.y));
           // where the pool is: inside its rectangle, held at a crisp edge whatever the distance
           vec2 lo = p - uPool.xy;
           vec2 hi = uPool.xy + uPool.zw - p;
           float inside = min(min(lo.x, hi.x), min(lo.y, hi.y));
           water = smoothstep(0.05 - px, 0.05 + px, inside);
           // a band of dark stone round the water
           coping = smoothstep(-px, px, inside) * (1.0 - water);

           // polished concrete: cloudy, with the trowel's sweep in it
           float cloud = vnoise(p * 0.55) * 0.55 + vnoise(p * 2.3 + 4.0) * 0.3 + vnoise(p * 9.0) * 0.15;
           float sweep = vnoise(vec2(p.x * 0.6 + p.y * 1.8, p.y * 0.6 - p.x * 0.3) * 3.0);
           diffuseColor.rgb *= 0.9 + 0.12 * cloud + 0.04 * sweep;
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.2, 0.205), coping);
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006, 0.006, 0.007), water);

           // the room's light kept off the floor where the wall meets it, and under the benches
           floorAo *= mix(0.62, 1.0, smoothstep(0.0, 0.7, p.y - uWallZ));
           for (int i = 0; i < ${MAX_BENCHES}; i++) {
             vec2 b = (p - uBenches[i]) / (uBench + 0.18);
             floorAo *= 1.0 - 0.42 * (1.0 - smoothstep(0.35, 1.05, length(b)));
           }
         }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(mix(0.5, 0.32, coping), 0.06, water);`,
      )
      .replace(
        '#include <aomap_fragment>',
        `reflectedLight.indirectDiffuse *= floorAo;
         reflectedLight.directDiffuse *= mix(1.0, floorAo, 0.6);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         {
           vec2 p = vFloorWorld.xz;
           float t = uReflTime;
           float px = fwidth(p.y);
           // the water is never quite still…
           vec2 swell = vec2(
             vnoise(p * vec2(1.25, 2.9) + vec2(t * 0.055, t * 0.04)),
             vnoise(p * vec2(1.6, 2.4) + vec2(5.2 - t * 0.045, 1.3 + t * 0.035))
           ) - 0.5;
           float chop = vnoise(vec2(p.x * 0.8 + t * 0.07, p.y * 4.0 - t * 0.13)) - 0.5;
           chop *= 1.0 - smoothstep(0.013, 0.045, px);
           // …and the pointer raises waves on it (liquid.ts)
           vec2 slope = texture2D(tWave, (p - uPool.xy) / uPool.zw).ba * uWaveGain * water;
           slope *= 1.0 - smoothstep(0.05, 0.11, px);

           vec2 warp = (swell * uReflRipple + vec2(chop * uReflRipple, 0.0)) * water
                     + vec2(slope.x, slope.y * 0.7) * 0.42;
           // the water holds the picture; the concrete smears it, and gives back much less of it
           float soften = mix(2.6, 0.012, water);
           float gain = mix(0.12, 0.52, water) * (1.0 - coping * 0.85);
           totalEmissiveRadiance += planarReflection(vReflUv, saturate(dot(normalize(vViewPosition), normal)), warp, soften) * gain;

           // the faces a wave turns toward the visitor look up into the bright hall
           vec2 toLens = normalize(cameraPosition.xz - p);
           float facing = max(-dot(slope, toLens), 0.0);
           totalEmissiveRadiance += vec3(0.92, 0.92, 0.9) * uSheen * water * facing * 4.0 / (1.0 + facing * 7.0);
         }`,
      );
  };
  floorMaterial.customProgramCacheKey = () => 'nafis-gallery-floor';

  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(hallW, 18)), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(hallMid, 0, wallZ + 9);
  floor.name = 'floor';
  group.add(floor);

  return {
    group,
    floor,
    floorUniforms,
    spots,
    /** where each track head hangs: for picking the lamp, and for the pile's micro-shadows */
    heads,
    pool,
    update(live: Live) {
      for (const spot of spots) spot.intensity = L.intensity * live.light;
      lensMaterial.color.copy(lightColor).multiplyScalar(0.4 + 2.6 * live.aperture * live.light);
      floorUniforms.uSheen.value = live.light * live.reflection;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
