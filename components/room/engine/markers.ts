/**
 * MARKS ON THE FLOOR — the outline of a piece's footprint: thin gold when it
 * is in hand, fainter on hover, red where it would stand inside something
 * else. Drawn as a signed-distance rounded rectangle in metres, so the line
 * keeps its width whatever the piece's size.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vP;
uniform vec2 uSize;
void main() {
  vP = (uv - 0.5) * (uSize + 0.5);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec2 vP;
uniform vec2 uSize;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
float sdRound(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  float d = sdRound(vP, uSize * 0.5 + 0.05, 0.08);
  float aa = fwidth(d) * 1.2;
  float line = 1.0 - smoothstep(0.004, 0.004 + aa, abs(d));
  float glow = exp(-max(d, 0.0) * 22.0) * step(0.0, d) * 0.35;
  float fill = (1.0 - step(0.0, d)) * 0.07;
  // corner ticks breathe a little
  vec2 c = abs(vP) - (uSize * 0.5 + 0.05);
  float corner = step(-0.16, c.x) * step(-0.16, c.y);
  float pulse = 0.75 + 0.25 * sin(uTime * 3.0);
  float a = (line * mix(0.6, 1.0, corner * pulse) + glow + fill) * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 + line * 1.5), a);
}
`;

export interface Marker {
  mesh: THREE.Mesh;
  show(x: number, z: number, rot: number, w: number, d: number, y?: number): void;
  hide(): void;
  setTone(tone: 'select' | 'hover' | 'blocked'): void;
  tick(t: number): void;
  dispose(): void;
}

export function createMarker(): Marker {
  const uniforms = {
    uSize: { value: new THREE.Vector2(1, 1) },
    uColor: { value: new THREE.Color('#d8b878') },
    uOpacity: { value: 1 },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
  mesh.renderOrder = 4;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return {
    mesh,
    show(x, z, rot, w, d, y = 0.022) {
      uniforms.uSize.value.set(w, d);
      mesh.scale.set(w + 0.5, 1, d + 0.5);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rot;
      mesh.visible = true;
    },
    hide() {
      mesh.visible = false;
    },
    setTone(tone) {
      uniforms.uColor.value.set(tone === 'blocked' ? '#e0574a' : '#d8b878');
      uniforms.uOpacity.value = tone === 'hover' ? 0.45 : 1;
    },
    tick(t) {
      uniforms.uTime.value = t;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
