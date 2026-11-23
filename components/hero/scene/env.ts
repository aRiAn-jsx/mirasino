/**
 * A dark-room environment for the two materials that need something to
 * reflect: the lamp's graphite and the stage's clearcoat rim.
 *
 * It is the room itself — a long, dim ceiling slot behind the stage and a
 * weaker return from the front — in cool neutrals only. It is assigned per
 * material (never as scene.environment) so the pile and the floor stay out of it.
 */
import * as THREE from 'three';

export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];

  const add = (w: number, h: number, pos: [number, number, number], rgb: [number, number, number]) => {
    const g = new THREE.PlaneGeometry(w, h);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    disposables.push(g, m);
  };

  const shellG = new THREE.BoxGeometry(40, 40, 40);
  const shellM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.004, 0.0042, 0.0048), side: THREE.BackSide });
  scene.add(new THREE.Mesh(shellG, shellM));
  disposables.push(shellG, shellM);

  add(14, 1.1, [0, 9, -7], [3.0, 3.12, 3.35]); // ceiling slot, behind
  add(3, 7, [11, 3, 2], [0.42, 0.44, 0.48]); // wall return, right
  add(8, 2.5, [-4, 2.5, 12], [0.2, 0.21, 0.23]); // front, low
  add(5, 5, [0, -9, 0], [0.05, 0.052, 0.056]); // floor return

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());
  return target.texture;
}
