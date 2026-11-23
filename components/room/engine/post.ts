/**
 * THE LENS
 *
 *   scene (HDR, MSAA)
 *     → ground-truth ambient occlusion (top tier): the dark where things meet
 *     → bloom, held back: only what is itself a light (LED cove, bulb, the
 *       lit windows of the city) blooms
 *     → FINISH: the loupe composited in, vignette, a fine grain
 *     → output: tone curve (AgX) and sRGB
 *
 * The loupe is a second camera a few centimetres above the pile, rendered
 * into its own target and set into the frame as a lens of glass that follows
 * the pointer: the knots under it, at their own scale.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { RoomTier } from '../tiers';

const FINISH = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tLoupe: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    /** centre (px, from bottom-left) and radius (px) */
    uLoupe: { value: new THREE.Vector3(0, 0, 100) },
    uLoupeOn: { value: 0 },
    uTime: { value: 0 },
    uGrain: { value: 1 },
    uVignette: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tLoupe;
    uniform vec2 uRes;
    uniform vec3 uLoupe;
    uniform float uLoupeOn;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;
    float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec2 p = vUv * uRes;
      if (uLoupeOn > 0.001) {
        float r = uLoupe.z;
        vec2 o = p - uLoupe.xy;
        float d = length(o);
        // the frame around the lens darkens a little, as a held glass shades what it sits on
        float shade = smoothstep(r + r * 0.35, r, d) * step(r, d);
        col *= 1.0 - shade * 0.5 * uLoupeOn;
        float inside = 1.0 - smoothstep(r - 1.5, r, d);
        // a touch of barrel: the glass is thicker in the middle
        vec2 lo = o / r;
        lo *= 1.0 - 0.08 * (1.0 - dot(lo, lo));
        vec3 lens = texture2D(tLoupe, lo * 0.5 + 0.5).rgb;
        // a rim of light along the upper edge of the glass
        float rim = smoothstep(r - 3.0, r - 1.0, d) * (1.0 - smoothstep(r - 0.5, r + 1.0, d));
        float catchLight = rim * (0.55 + 0.45 * clamp(dot(normalize(o + 1e-4), vec2(-0.5, 0.86)), 0.0, 1.0));
        col = mix(col, lens, inside * uLoupeOn);
        col += vec3(1.0, 0.95, 0.88) * catchLight * 1.4 * uLoupeOn;
      }
      vec2 q = vUv - 0.5;
      q.x *= uRes.x / uRes.y;
      col *= mix(1.0, smoothstep(1.25, 0.2, length(q)), 0.38 * uVignette);
      float g = hash(p + fract(uTime * 7.31) * 173.0) - 0.5;
      col += g * uGrain * (0.006 + col * 0.035);
      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `,
};

export interface Post {
  composer: EffectComposer;
  loupe: THREE.WebGLRenderTarget;
  finish: ShaderPass;
  setSize(width: number, height: number, dpr: number): void;
  setAo(on: boolean): void;
  render(dt: number): void;
  dispose(): void;
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, tier: RoomTier): Post {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: tier.msaa });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  let gtao: GTAOPass | null = null;
  if (tier.ao) {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(gtao);
  }

  let bloom: UnrealBloomPass | null = null;
  if (tier.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.38, 0.6, 2.4);
    composer.addPass(bloom);
  }

  const finish = new ShaderPass(FINISH);
  composer.addPass(finish);
  composer.addPass(new OutputPass());

  const loupe = new THREE.WebGLRenderTarget(tier.loupe, tier.loupe, { type: THREE.HalfFloatType, samples: tier.msaa > 0 ? 4 : 0 });
  finish.uniforms.tLoupe.value = loupe.texture;

  let time = 0;
  return {
    composer,
    loupe,
    finish,
    setSize(width, height, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(width, height);
      finish.uniforms.uRes.value.set(width * dpr, height * dpr);
      gtao?.setSize(width * dpr, height * dpr);
    },
    setAo(on) {
      if (gtao) gtao.enabled = on;
    },
    render(dt) {
      time += dt;
      finish.uniforms.uTime.value = time;
      composer.render(dt);
    },
    dispose() {
      composer.dispose();
      gtao?.dispose();
      bloom?.dispose();
      loupe.dispose();
      target.dispose();
    },
  };
}
