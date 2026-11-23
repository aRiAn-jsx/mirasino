/**
 * FLOOR + BACK WALL
 *
 * The floor is not stone. It is a shallow sheet of black liquid, and all the
 * room ever shows of it is what it reflects:
 *
 *   · a planar reflection, Fresnel-attenuated (≈4 % head-on, rising toward
 *     the horizon)
 *   · contact-hardening — blur grows with the length of the reflected ray, so
 *     the column bases (standing in it) stay sharper than the rug (floating
 *     above it)
 *   · drawn out toward the viewer into long soft streaks (post.ts)
 *   · never still: two slow swells bend the lookup, and a fine chop — thin
 *     bands, seen edge-on — slips the streaks sideways against each other
 *   · it answers the pointer with waves. The surface itself is simulated
 *     (liquid.ts); here its slope bends the reflection, and the faces a wave
 *     turns toward the lens catch a little of the room's cool tone — so the
 *     liquid answers even where it has nothing but darkness to reflect.
 *
 * One thin steel inlay at the foot of the back wall gives the floor a scale.
 * The wall itself is only ever seen by the wash light behind the stage.
 */
import * as THREE from 'three';
import { STAGE, WALL_Z } from '../config';
import { NOISE, REFLECTION_PARS } from './glsl';

/** a steel inlay where floor meets wall: the horizon line of the room */
export const SEAM_Z = WALL_Z + 0.02;

export function createFloor() {
  const uniforms = {
    tRefl: { value: null as THREE.Texture | null },
    tReflShort: { value: null as THREE.Texture | null },
    tReflLong: { value: null as THREE.Texture | null },
    uReflMatrix: { value: new THREE.Matrix4() },
    uReflTexel: { value: new THREE.Vector2(1, 1) },
    uReflShift: { value: new THREE.Vector2(0, 0) },
    uReflStrength: { value: 0 },
    uReflSoft: { value: 1 },
    uNearFar: { value: new THREE.Vector2(0.5, 60) },
    uSeamZ: { value: SEAM_Z },
    uReflTime: { value: 0 },
    uReflRipple: { value: 0.0085 },
    // the simulated surface: its texture, and the square of floor it covers (x, z, 1 / side)
    tWave: { value: null as THREE.Texture | null },
    uWaveBox: { value: new THREE.Vector3(0, 0, 1) },
    uWaveGain: { value: 0 },
    uSheen: { value: 0 },
  };

  const material = new THREE.MeshStandardMaterial({
    color: 0x070709,
    roughness: 0.14,
    metalness: 0,
    envMapIntensity: 0,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform mat4 uReflMatrix;\nvarying vec4 vReflUv;\nvarying vec3 vFloorWorld;',
      )
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
         uniform float uSeamZ;
         uniform float uReflTime;
         uniform float uReflRipple;
         uniform sampler2D tWave;
         uniform vec3 uWaveBox;
         uniform float uWaveGain;
         uniform float uSheen;
         varying vec4 vReflUv;
         varying vec3 vFloorWorld;
         float floorSeam = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        // steel inlay: held at ≥ 1 px so it never shimmers
        `{
           float w = max(0.004, fwidth(vFloorWorld.z) * 0.8);
           floorSeam = (1.0 - smoothstep(0.0, w, abs(vFloorWorld.z - uSeamZ))) * min(1.0, 0.004 / w * 2.5);
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.44, 0.47), floorSeam);
         }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         {
           vec2 p = vFloorWorld.xz;
           float t = uReflTime;
           // metres of floor under one pixel, front to back: what is too fine to draw is left out
           float px = fwidth(p.y);

           // the surface is never still: two slow swells…
           vec2 swell = vec2(
             vnoise(p * vec2(1.25, 2.9) + vec2(t * 0.055, t * 0.04)),
             vnoise(p * vec2(1.6, 2.4) + vec2(5.2 - t * 0.045, 1.3 + t * 0.035))
           ) - 0.5;
           // …and a fine chop across them. Seen this close to edge-on it is thin bands that slip sideways
           float chop = vnoise(vec2(p.x * 0.8 + t * 0.07, p.y * 4.0 - t * 0.13)) - 0.5;
           chop += (vnoise(vec2(p.x * 1.7 - t * 0.05, p.y * 9.0 + t * 0.19)) - 0.5) * 0.35;
           chop *= 1.0 - smoothstep(0.013, 0.045, px);

           // the waves the pointer raised: the slope of the simulated surface along x and z
           vec2 slope = texture2D(tWave, (p - uWaveBox.xy) * uWaveBox.z).ba * uWaveGain;
           slope *= 1.0 - smoothstep(0.05, 0.11, px);

           vec2 warp = swell * uReflRipple + vec2(chop * uReflRipple, 0.0) + vec2(slope.x, slope.y * 0.7) * 0.42;
           // a long slow change in how much of the picture the surface holds together
           float soften = mix(0.85, 1.3, vnoise(p * vec2(0.5, 0.8) + vec2(t * 0.02, 7.0)));
           totalEmissiveRadiance += planarReflection(vReflUv, saturate(dot(normalize(vViewPosition), normal)), warp, soften)
             * (1.0 - floorSeam * 0.7);

           // the faces a wave turns toward the lens look higher into the room than the flat
           // surface does, and bring back a little of its cool tone
           vec2 toLens = normalize(cameraPosition.xz - p);
           float facing = max(-dot(slope, toLens), 0.0);
           float glint = facing * 5.0 / (1.0 + facing * 8.0);
           float lift = max(swell.y * 0.8 + chop * 0.5, 0.0);
           totalEmissiveRadiance += vec3(0.6, 0.67, 0.8) * uSheen * (glint + lift * lift * 0.05) * (1.0 - floorSeam);
         }`,
      );
  };
  material.customProgramCacheKey = () => 'nafis-floor';

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  floor.receiveShadow = true;
  floor.name = 'floor';

  /* Wall wash: a source hidden behind the back rim of the stage, thrown up onto
     the wall so the floating rug and the capitals read in silhouette. It lights
     only this wall, so it is evaluated here (inverse-square Lambert, soft cone)
     instead of as a scene light. */
  const washPos = new THREE.Vector3(0, 0.14, -STAGE.radius + 0.1);
  const wash = {
    uWashPos: { value: washPos },
    uWashAxis: { value: new THREE.Vector3(0, 2.5, WALL_Z).sub(washPos).normalize() },
    uWashCone: { value: new THREE.Vector2(Math.cos(1.05), 1) },
    uWashColor: { value: new THREE.Color(0.8, 0.86, 1.0) },
    uWashPower: { value: 0 },
  };
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3d43, roughness: 0.95, metalness: 0, envMapIntensity: 0 });
  wallMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wash);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWallWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uWashPos;
         uniform vec3 uWashAxis;
         uniform vec2 uWashCone;
         uniform vec3 uWashColor;
         uniform float uWashPower;
         varying vec3 vWallWorld;`,
      )
      .replace(
        '#include <aomap_fragment>',
        `{
           vec3 toL = uWashPos - vWallWorld;
           float d2 = dot(toL, toL);
           vec3 L = toL * inversesqrt(d2);
           float cone = smoothstep(uWashCone.x, uWashCone.y, dot(-L, uWashAxis));
           reflectedLight.directDiffuse += uWashColor * (uWashPower * cone * max(L.z, 0.0) / d2) * diffuseColor.rgb * RECIPROCAL_PI;
         }`,
      );
  };
  wallMaterial.customProgramCacheKey = () => 'nafis-wall';
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 24), wallMaterial);
  wall.position.set(0, 12, WALL_Z);
  wall.receiveShadow = true;
  wall.name = 'wall';

  return {
    floor,
    wall,
    uniforms,
    wash,
    dispose() {
      floor.geometry.dispose();
      wall.geometry.dispose();
      material.dispose();
      wallMaterial.dispose();
    },
  };
}
