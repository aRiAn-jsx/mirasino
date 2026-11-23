/**
 * DUST — exists only inside the light volume.
 *
 * Particles are *seeded in cone coordinates* (distance along the optical axis,
 * radius as a fraction of the cone, angle), so there is nothing to cull from
 * the dark: no particle is ever placed outside the beam. After the slow drift
 * is applied, each particle evaluates the same angular profile the spotlight
 * uses; below threshold it is thrown out of clip space.
 *
 * Tiny (1–3 px), dim, and proportional to lamp power. A rare slow "glint" —
 * a fleck turning face-on to the light — is the only sparkle in the piece.
 */
import * as THREE from 'three';
import { RUG } from '../config';
import type { Shared } from './shared';

export function createDust(shared: Shared, count: number) {
  const seeds = new Float32Array(count * 4);
  const positions = new Float32Array(count * 3);
  // deterministic: the room should look the same every visit
  let s = 20260214;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count * 4; i++) seeds[i] = rnd();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));

  const uniforms = {
    uTime: shared.uTime,
    uLightPos: shared.uLightPos,
    uLightDir: shared.uLightDir,
    uLightColor: shared.uLightColor,
    uConeCos: shared.uConeCos,
    uPenumbraCos: shared.uPenumbraCos,
    uLightPower: shared.uLightPower,
    uDust: { value: 0 },
    uPx: { value: 1 },
    uPlaneZ: { value: RUG.z + 0.06 },
    uMotion: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uMotion;
      uniform vec3 uLightPos;
      uniform vec3 uLightDir;
      uniform float uConeCos;
      uniform float uPenumbraCos;
      uniform float uLightPower;
      uniform float uDust;
      uniform float uPx;
      uniform float uPlaneZ;
      varying float vBright;

      void main() {
        // cone coordinates → world
        vec3 up = abs(uLightDir.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 U = normalize(cross(up, uLightDir));
        vec3 V = cross(uLightDir, U);
        float along = mix(0.3, 3.6, pow(aSeed.x, 1.35));            // denser near the lamp
        float tanOuter = sqrt(1.0 - uConeCos * uConeCos) / uConeCos;
        float radius = pow(aSeed.y, 0.72) * along * tanOuter * 0.62;
        float ang = aSeed.z * 6.2831853;
        vec3 p = uLightPos + uLightDir * along + (U * cos(ang) + V * sin(ang)) * radius;

        // extremely slow drift: tens of seconds per wander, a few centimetres
        float t = uTime * uMotion;
        float k = aSeed.w * 97.0;
        p += vec3(
          sin(t * 0.031 + k) + 0.5 * sin(t * 0.017 + k * 1.7),
          0.6 * sin(t * 0.023 + k * 2.3) - 0.25 * sin(t * 0.011 + k),
          cos(t * 0.027 + k * 1.3) + 0.5 * cos(t * 0.013 + k * 0.7)
        ) * 0.11;

        // the same angular profile the spotlight uses
        vec3 lp = p - uLightPos;
        float d = length(lp);
        float cone = smoothstep(uConeCos, uPenumbraCos, dot(lp / d, uLightDir));
        float fall = 1.0 / (0.35 + d * d);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float nearFade = smoothstep(0.5, 1.6, -mv.z);

        // a fleck turning face-on — rare, slow, only in the bright core
        float glint = pow(max(0.0, sin(t * (0.09 + aSeed.w * 0.2) + k * 3.1)), 140.0) * step(0.55, cone);

        float shimmer = 0.6 + 0.4 * sin(t * 0.35 + k * 5.0);
        vBright = uDust * nearFade * cone * cone * (uLightPower * fall * (shimmer + glint * 7.0) * 0.3 + 0.006 * shimmer);

        gl_Position = projectionMatrix * mv;
        // threshold: outside the volume a particle does not exist
        if (cone < 0.12 || p.y < 0.03 || p.z < uPlaneZ || vBright < 0.0012) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = (1.2 + aSeed.w * 1.3 + glint * 1.2) * uPx;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightColor;
      varying float vBright;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.12, r);
        gl_FragColor = vec4(uLightColor * vBright * a, 1.0);
      }`,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.name = 'dust';

  return {
    points,
    uniforms,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
