import * as THREE from 'three';

/**
 * Uniform objects that several materials reference by identity. The world's
 * frame function writes each of these once; every program that holds the
 * object sees the new value.
 */
export interface Shared {
  uTime: { value: number };
  /** spotlight, world space */
  uLightPos: { value: THREE.Vector3 };
  uLightDir: { value: THREE.Vector3 };
  uLightColor: { value: THREE.Color };
  uConeCos: { value: number };
  uPenumbraCos: { value: number };
  /** 0‥1 lamp power */
  uLightPower: { value: number };
}

export function createShared(): Shared {
  return {
    uTime: { value: 0 },
    uLightPos: { value: new THREE.Vector3() },
    uLightDir: { value: new THREE.Vector3(0, -1, 0) },
    uLightColor: { value: new THREE.Color(1, 1, 1) },
    uConeCos: { value: 0.7 },
    uPenumbraCos: { value: 0.99 },
    uLightPower: { value: 0 },
  };
}
