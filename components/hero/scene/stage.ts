/**
 * THE STAGE — a round plinth of pale grey stone, under the floating rug.
 *
 * Neomorphism as a solid, in two tiers:
 *
 *   · a base ring that meets the floor through a small undercut
 *   · a narrower upper drum that overhangs a shadow gap, so the top surface
 *     reads as a disc hovering a finger's width above its base
 *
 * Every edge is a small machined radius: the rims roll into the spotlight (the
 * highlight), the gap and the undercut turn away from everything (the inner
 * shadow). The top is honed, a touch crowned, and carries two concentric
 * details — an engraved line and a brushed-steel inlay.
 *
 * The stone is light, so it is the key light that draws it: the pool, its
 * fall-off toward the far rim, and the rug's own shadow lying across the back
 * half are all the real spotlight and its shadow map.
 */
import * as THREE from 'three';
import { RUG, STAGE } from '../config';
import type { Live } from '../live';
import { NOISE } from './glsl';

/** quarter-round between two directions, for the turned profile */
function arc(out: THREE.Vector2[], cx: number, cy: number, r: number, a0: number, a1: number, n = 5) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
}

export function createStage(envMap: THREE.Texture) {
  const R0 = STAGE.radius;
  const HB = STAGE.baseHeight;
  const R1 = STAGE.upper;
  const H = STAGE.height;
  const GAP = STAGE.gap;
  const PI = Math.PI;

  // turned profile, floor → centre of the top, so the lathe's normals face out and up
  const p: THREE.Vector2[] = [];
  p.push(new THREE.Vector2(R0 - 0.035, 0)); // undercut at the floor
  arc(p, R0 - 0.018, 0.018, 0.018, -PI / 2, 0, 4); // foot
  arc(p, R0 - 0.022, HB - 0.022, 0.022, 0, PI / 2, 5); // base shoulder
  p.push(new THREE.Vector2(R1 - 0.075, HB)); // ledge, running in under the overhang
  p.push(new THREE.Vector2(R1 - 0.075, HB + GAP)); // back of the shadow gap
  p.push(new THREE.Vector2(R1 - 0.014, HB + GAP)); // underside of the drum
  arc(p, R1 - 0.014, HB + GAP + 0.014, 0.014, -PI / 2, 0, 4); // lower edge of the drum
  arc(p, R1 - 0.03, H - 0.03, 0.03, 0, PI / 2, 7); // rim, rolling over to the top
  const RT = R1 - 0.03;
  for (const s of [0.94, 0.8, 0.6, 0.35, 0.001]) p.push(new THREE.Vector2(RT * s, H + 0.005 * (1 - s * s)));
  const geometry = new THREE.LatheGeometry(p, 200);

  const uniforms = {
    uTiers: { value: new THREE.Vector4(R1, HB, GAP, H) },
    uGroove: { value: R1 - 0.2 },
    uInlay: { value: R1 - 0.42 },
    // the rug's footprint from above: a line along x
    uRugHalf: { value: RUG.planeW / 2 - 0.2 },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xbfc2c7,
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.32,
    clearcoatRoughness: 0.28,
    envMap,
    envMapIntensity: 0,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStageLocal;\nvarying float vTop;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStageLocal = position;\nvTop = normal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         ${NOISE}
         uniform vec4 uTiers;
         uniform float uGroove;
         uniform float uInlay;
         uniform float uRugHalf;
         varying vec3 vStageLocal;
         varying float vTop;
         float stageInlay = 0.0;
         float stageGroove = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        // honed stone, never perfectly even; two concentric details, each held at ≥ 1 px
        `{
           vec2 q = vStageLocal.xz;
           float rr = length(q);
           float top = smoothstep(0.6, 0.95, vTop) * step(uTiers.w - 0.02, vStageLocal.y);
           diffuseColor.rgb *= 0.95 + 0.05 * vnoise(q * 1.9) + 0.025 * vnoise(q * 14.0);
           float w = max(0.0035, fwidth(rr) * 0.85);
           stageGroove = (1.0 - smoothstep(0.0, w, abs(rr - uGroove))) * top * min(1.0, 0.0035 / w * 2.5);
           stageInlay = (1.0 - smoothstep(0.0, w * 1.3, abs(rr - uInlay))) * top * min(1.0, 0.0045 / w * 2.5);
           diffuseColor.rgb *= 1.0 - 0.5 * stageGroove;
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.44, 0.47), stageInlay);
         }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(roughnessFactor, 0.24, stageInlay);`,
      )
      .replace(
        '#include <aomap_fragment>',
        `{
           float rr = length(vStageLocal.xz);
           // the shadow gap between the tiers, and the undercut where the base meets the floor
           float inGap = smoothstep(uTiers.y - 0.004, uTiers.y + 0.004, vStageLocal.y)
                       * (1.0 - smoothstep(uTiers.y + uTiers.z - 0.002, uTiers.y + uTiers.z + 0.012, vStageLocal.y))
                       * (1.0 - smoothstep(uTiers.x - 0.03, uTiers.x - 0.004, rr));
           float foot = 1.0 - smoothstep(0.0, 0.022, vStageLocal.y);
           // the rug hangs over the middle: a soft band of occlusion beneath it
           float under = exp(-pow(vStageLocal.z / 0.3, 2.0)) * (1.0 - smoothstep(uRugHalf - 0.25, uRugHalf + 0.3, abs(vStageLocal.x)))
                       * step(uTiers.w - 0.02, vStageLocal.y);
           float occ = (1.0 - 0.85 * inGap) * (1.0 - 0.55 * foot) * (1.0 - 0.35 * under);
           reflectedLight.indirectDiffuse *= occ;
           reflectedLight.indirectSpecular *= occ;
           reflectedLight.directDiffuse *= (1.0 - 0.7 * inGap) * (1.0 - 0.3 * foot);
           reflectedLight.directSpecular *= 1.0 - 0.8 * inGap;
           #ifdef USE_CLEARCOAT
             clearcoatSpecularIndirect *= occ;
             clearcoatSpecularDirect *= 1.0 - 0.8 * inGap;
           #endif
         }`,
      );
  };
  material.customProgramCacheKey = () => 'nafis-stage';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'stage';

  return {
    mesh,
    update(live: Live) {
      material.envMapIntensity = 0.8 * live.stageRim * (0.5 + 0.5 * live.ambience);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
