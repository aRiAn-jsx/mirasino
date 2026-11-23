/**
 * RENDER PIPELINE
 *
 *   shadow map ─┐
 *   mirror pass ┼─▶ STREAK: the mirror picture drawn out for the floor (3 small passes)
 *               ├─▶ scene (HDR, MSAA, depth)
 *               │      │
 *               │      ▼
 *               │   LENS: depth of field  +  VOLUME: the beam, integrated
 *               │      │                     along each view ray up to scene depth
 *               │      ▼
 *               │   bloom (restrained, HDR threshold — the aperture and LED only)
 *               │      ▼
 *               └─▶ GRADE: exposure → filmic tone curve (hue-preserving, highlights
 *                          fall to neutral) → vignette → animated grain → sRGB
 *
 * Nothing here adds light that the scene did not produce. The beam is the same
 * cone, colour and power as the SpotLight; the vignette and grain are the lens
 * and the stock.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Tier } from '../config';
import { FULLSCREEN_VERT, IGN, NOISE } from './glsl';
import type { Shared } from './shared';

const LENS_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uAperture;
uniform float uMaxBlur;
uniform float uFrame;
uniform int uTaps;

uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uCamFwd;
uniform vec3 uLightPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uConeCos;
uniform float uPenumbraCos;
uniform float uBeam;
uniform float uTime;
uniform float uClipY;
uniform float uHazePlane;
uniform int uSteps;

varying vec2 vUv;

${IGN}
${NOISE}

float viewZ(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
}
// where does a ray run inside the (outer) light cone? one nappe only
bool coneSpan(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 co = ro - uLightPos;
  float dv = dot(rd, uLightDir);
  float cv = dot(co, uLightDir);
  float c2 = uConeCos * uConeCos;
  float a = dv * dv - c2;
  float b = 2.0 * (dv * cv - dot(rd, co) * c2);
  float c = cv * cv - dot(co, co) * c2;
  float disc = b * b - 4.0 * a * c;
  if (disc <= 0.0 || abs(a) < 1e-6) return false;
  float sq = sqrt(disc);
  float ta = (-b - sq) / (2.0 * a);
  float tb = (-b + sq) / (2.0 * a);
  float lo = min(ta, tb);
  float hi = max(ta, tb);
  if (a < 0.0) {
    if (cv + 0.5 * (lo + hi) * dv <= 0.0) return false;
    t0 = lo; t1 = hi;
  } else if (dv > 0.0) {
    t0 = hi; t1 = 1e3;
  } else {
    t0 = -1e3; t1 = lo;
  }
  return true;
}
float coc(float z) {
  return clamp(uAperture * abs(z - uFocus) / max(z, 1e-4), 0.0, 1.0) * uMaxBlur;
}

void main() {
  float depth = texture2D(tDepth, vUv).x;
  float z = viewZ(depth);
  vec3 col = texture2D(tColor, vUv).rgb;
  float jitter = ign(gl_FragCoord.xy + uFrame * 5.588);

  /* ---- depth of field: golden-spiral gather, each tap weighted by whether
          its own blur disc reaches this pixel ---- */
  float c0 = coc(z);
  if (uTaps > 0 && c0 > 1.0) {
    vec3 acc = col;
    float wsum = 1.0;
    float n = float(uTaps);
    for (int i = 0; i < 32; i++) {
      if (i >= uTaps) break;
      float fi = float(i) + 0.5;
      float r = sqrt(fi / n);
      // a small per-pixel turn of the spiral hides its arms without turning the blur into dither
      float th = fi * 2.39996323 + jitter * 0.9;
      vec2 uv2 = vUv + vec2(cos(th), sin(th)) * r * c0 * uTexel;
      float z2 = viewZ(texture2D(tDepth, uv2).x);
      float w = z2 >= z * 0.99 ? 1.0 : clamp(coc(z2) / (r * c0 + 0.5), 0.0, 1.0);
      acc += texture2D(tColor, uv2).rgb * w;
      wsum += w;
    }
    col = acc / wsum;
  }

  /* ---- the beam ----
     In-scattering from a point source falls as 1/r². Along a view ray that
     integral has a closed form (an arctangent), so each segment is integrated
     analytically — no under-sampling near the aperture — and only the angular
     cone profile, haze density and phase are sampled. */
  if (uSteps > 0 && uBeam > 0.001) {
    vec4 far4 = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 rd = normalize(far4.xyz / far4.w - uCamPos);
    float tMax = depth >= 0.99999 ? 1e3 : z / max(dot(rd, uCamFwd), 1e-3);
    if (rd.y < -1e-4 && uCamPos.y > uClipY) tMax = min(tMax, (uClipY - uCamPos.y) / rd.y);

    // exact span of the view ray inside the light cone, capped by a sphere of useful range
    float t0; float t1;
    vec3 oc = uCamPos - uLightPos;
    float sb = dot(oc, rd);
    float sd = sb * sb - (dot(oc, oc) - 5.2 * 5.2);
    if (sd > 0.0 && coneSpan(uCamPos, rd, t0, t1)) {
      t0 = max(t0, max(-sb - sqrt(sd), 0.0));
      t1 = min(t1, min(-sb + sqrt(sd), tMax));
      if (t1 > t0) {
        vec3 q = uLightPos - uCamPos;
        float tc = dot(q, rd);
        float h = sqrt(max(dot(q, q) - tc * tc, 4e-4));
        float seg = (t1 - t0) / float(uSteps);
        float acc = 0.0;
        for (int i = 0; i < 24; i++) {
          if (i >= uSteps) break;
          float ta = t0 + seg * float(i);
          float tb = ta + seg;
          // mostly mid-segment: the 1/r² term is already exact, so only a little jitter is needed
          vec3 p = uCamPos + rd * (ta + seg * (0.5 + (jitter - 0.5) * 0.3));
          vec3 lp = p - uLightPos;
          float dl = length(lp);
          vec3 ln = lp / dl;
          float cone = smoothstep(uConeCos, uPenumbraCos, dot(ln, uLightDir));
          if (cone > 0.0) {
            float w = (atan((tb - tc) / h) - atan((ta - tc) / h)) / h;
            // slow, uneven haze
            vec3 np = p * 0.85 + vec3(uTime * 0.021, -uTime * 0.013, uTime * 0.017);
            float haze = 0.7 + 0.6 * vnoise3(np);
            // mild forward scattering: brighter looking back up the beam
            float mu = dot(ln, -rd);
            float phase = 0.0842 / pow(1.1225 - 0.7 * mu, 1.5);   // HG, g = 0.35
            // density: heaviest by the fixture, thinning with range and toward the hung rug
            float thin = (1.0 / (1.0 + dl * dl * 0.3)) * mix(0.14, 1.0, smoothstep(uHazePlane, uHazePlane + 1.3, p.z));
            acc += w * cone * cone * haze * phase * thin * smoothstep(0.05, 0.22, dl);
          }
        }
        col += uLightColor * (acc * uBeam);
      }
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

const GRADE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform vec2 uRes;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uGrainSize;
uniform float uTime;
uniform float uFade;
varying vec2 vUv;

float h21(vec2 p, float s) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + s * 0.137);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float curve(float x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec3 col = texture2D(tColor, vUv).rgb * uExposure;

  // lens vignette, in scene-linear so it behaves like light falloff
  vec2 vc = (vUv - 0.5) * vec2(min(uRes.x / uRes.y, 2.0) * 0.8, 1.0) * 2.0;
  float vig = smoothstep(0.35, 1.5, length(vc));
  col *= 1.0 - uVignette * vig;

  // filmic curve on luminance: hue is preserved, and as a surface nears clip
  // its chroma drains to neutral — lit burgundy goes silver, never pink
  float l = mix(dot(col, vec3(0.2126, 0.7152, 0.0722)), max(col.r, max(col.g, col.b)), 0.62);
  float lt = curve(l);
  vec3 c = col * (lt / max(l, 1e-5));
  c = mix(c, vec3(lt), smoothstep(0.5, 1.0, lt) * 0.8);
  float mx = max(c.r, max(c.g, c.b));
  if (mx > 1.0) c = vec3(lt) + (c - lt) * ((1.0 - lt) / max(mx - lt, 1e-5));
  c = clamp(c, 0.0, 1.0);

  c = toSRGB(c) * uFade;

  // the room's black is a cool near-black, not zero
  c = vec3(0.031, 0.032, 0.035) + c * (1.0 - 0.033);

  // film grain: re-seeded at a 24 fps cadence, gaussian-ish (sum of uniforms),
  // strongest in shadows and mid-tones, absent from highlights
  float seed = floor(uTime * 24.0);
  vec2 gp = floor(gl_FragCoord.xy / uGrainSize);
  float g = h21(gp, seed) + h21(gp + 19.19, seed + 7.0) + h21(gp + 47.71, seed + 13.0) + h21(gp + 83.3, seed + 29.0) - 2.0;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float mask = (1.0 - smoothstep(0.45, 0.9, lum)) * mix(0.6, 1.0, smoothstep(0.03, 0.22, lum));
  c += g * uGrain * mask;

  gl_FragColor = vec4(c, 1.0);
}
`;

/**
 * STREAK — the floor's reflection, drawn out before the floor ever samples it.
 *
 * A polished floor does not blur what it reflects evenly: it pulls it toward
 * the viewer into long vertical streaks and keeps most of its width. Done per
 * floor pixel that costs dozens of taps and still leaves grain; done here it is
 * three separable passes over a picture a quarter the area of the mirror.
 *
 *   prepare  mirror colour × how much of it survives the trip to the floor
 *            (falls off with the length of the reflected ray), narrow
 *            horizontal blur. Alpha carries the ray length.
 *   short    vertical blur                → what stands a little off the floor
 *   long     vertical blur of the above   → what floats high above it
 *
 * Because the falloff is blurred along with the colour, the reflection of a
 * floating object fades out at its edges instead of being cut along them.
 */
const STREAK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uStep;
uniform vec2 uBias;
uniform float uFalloff;
uniform float uLod;
uniform bool uPrepare;
uniform vec2 uNearFar;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uCamFwd;
varying vec2 vUv;

float viewZ(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - z * (uNearFar.y - uNearFar.x));
}

// the mirror picture, weighted by how far its light travelled after leaving the floor
vec4 arriving(vec2 uv) {
  vec4 far = uInvViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(far.xyz / far.w - uCamPos);
  // the mirror camera looks up through the floor: where does this ray cross y = 0?
  float ray = 12.0;
  if (rd.y > 1e-4) ray = clamp(viewZ(texture2D(tDepth, uv).x) + uCamPos.y / rd.y * dot(rd, uCamFwd), 0.0, 12.0);
  float reach = (1.0 - smoothstep(7.0, 12.0, ray)) / (1.0 + ray * ray * 0.06);
  return vec4(textureLod(tColor, uv, uLod).rgb * reach, min(ray, 6.0));
}

void main() {
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -8; i <= 8; i++) {
    float f = float(i);
    float w = exp(-f * f * uFalloff);
    vec2 uv = vUv + uBias + uStep * f;
    acc += (uPrepare ? arriving(uv) : texture2D(tColor, uv)) * w;
    wsum += w;
  }
  gl_FragColor = acc / wsum;
}
`;

export interface FrameParams {
  dt: number;
  time: number;
  frame: number;
  focus: number;
  aperture: number;
  exposure: number;
  beam: number;
  fade: number;
  grain: number;
  clipY: number;
  /** redraw the shadow map / the floor mirror this frame */
  shadows: boolean;
  mirror: boolean;
}

export function createPipeline(renderer: THREE.WebGLRenderer, shared: Shared, tier: Tier) {
  const size = new THREE.Vector2(2, 2);

  const rtScene = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    samples: tier.msaa,
    depthBuffer: true,
  });
  rtScene.depthTexture = new THREE.DepthTexture(2, 2);

  const rtLens = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });

  const rtMirror = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  rtMirror.depthTexture = new THREE.DepthTexture(2, 2);

  // the mirror picture, drawn out for the floor: prepared → short streak → long streak
  const streakTarget = () => new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
  const rtStreakPrep = streakTarget();
  const rtStreakShort = streakTarget();
  const rtStreakLong = streakTarget();
  const streak = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null as THREE.Texture | null },
      tDepth: { value: rtMirror.depthTexture },
      uStep: { value: new THREE.Vector2() },
      uBias: { value: new THREE.Vector2() },
      uFalloff: { value: 0.1 },
      uLod: { value: 0 },
      uPrepare: { value: false },
      uNearFar: { value: new THREE.Vector2(0.5, 60) },
      uInvViewProj: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uCamFwd: { value: new THREE.Vector3() },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: STREAK_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  // threshold sits above anything a lit surface can reach: only the aperture, the LED and true glints bloom
  const bloom = tier.bloom ? new UnrealBloomPass(new THREE.Vector2(2, 2), 0.3, 0.55, 1.9) : null;

  const lens = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rtScene.texture },
      tDepth: { value: rtScene.depthTexture },
      uTexel: { value: new THREE.Vector2() },
      uNear: { value: 0.5 },
      uFar: { value: 60 },
      uFocus: { value: 7 },
      uAperture: { value: 0 },
      uMaxBlur: { value: 12 },
      uFrame: { value: 0 },
      uTaps: { value: tier.dofTaps },
      uInvViewProj: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uCamFwd: { value: new THREE.Vector3() },
      uLightPos: shared.uLightPos,
      uLightDir: shared.uLightDir,
      uLightColor: shared.uLightColor,
      uConeCos: shared.uConeCos,
      uPenumbraCos: shared.uPenumbraCos,
      uBeam: { value: 0 },
      uTime: shared.uTime,
      uClipY: { value: 0 },
      uHazePlane: { value: 0.05 },
      uSteps: { value: tier.beamSteps },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: LENS_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const grade = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rtLens.texture },
      uRes: { value: new THREE.Vector2(2, 2) },
      uExposure: { value: 1 },
      uVignette: { value: 0.62 },
      uGrain: { value: 0.03 },
      uGrainSize: { value: 1 },
      uTime: shared.uTime,
      uFade: { value: 1 },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: GRADE_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const quad = new FullScreenQuad(lens);

  /* mirror camera — the main camera reflected in y = 0 */
  const mirrorCamera = new THREE.PerspectiveCamera();
  const mirrorMatrix = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const viewProj = new THREE.Matrix4();

  function updateMirror(camera: THREE.PerspectiveCamera) {
    rot.extractRotation(camera.matrixWorld);
    v0.setFromMatrixPosition(camera.matrixWorld);
    v1.set(0, 0, -1).applyMatrix4(rot).add(v0); // look-at point
    mirrorCamera.position.set(v0.x, -v0.y, v0.z);
    mirrorCamera.up.set(0, 1, 0).applyMatrix4(rot);
    mirrorCamera.up.y *= -1;
    mirrorCamera.lookAt(v1.x, -v1.y, v1.z);
    mirrorCamera.near = camera.near;
    mirrorCamera.far = camera.far;
    mirrorCamera.updateMatrixWorld();
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    mirrorMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    mirrorMatrix.multiply(mirrorCamera.projectionMatrix);
    mirrorMatrix.multiply(mirrorCamera.matrixWorldInverse);
  }

  function setSize(w: number, h: number) {
    if (w === size.x && h === size.y) return;
    size.set(w, h);
    rtScene.setSize(w, h);
    rtLens.setSize(w, h);
    const mw = Math.max(2, Math.round(w * tier.mirrorScale));
    const mh = Math.max(2, Math.round(h * tier.mirrorScale));
    rtMirror.setSize(mw, mh);
    const sw = Math.max(2, Math.round(mw / 2));
    const sh = Math.max(2, Math.round(mh / 2));
    rtStreakPrep.setSize(sw, sh);
    rtStreakShort.setSize(sw, sh);
    rtStreakLong.setSize(sw, sh);
    bloom?.setSize(Math.round(w / 2), Math.round(h / 2));
    lens.uniforms.uTexel.value.set(1 / w, 1 / h);
    grade.uniforms.uRes.value.set(w, h);
    // blur radii are authored at 1080p
    lens.uniforms.uMaxBlur.value = 13 * (h / 1080);
  }

  /** one separable pass: 17 gaussian taps, `stride` texels apart, along x or y */
  function drawOut(
    from: THREE.Texture,
    to: THREE.WebGLRenderTarget,
    axis: 'x' | 'y',
    stride: number,
    sigmaTaps: number,
    bias = 0,
  ) {
    const su = streak.uniforms;
    su.tColor.value = from;
    su.uStep.value.set(axis === 'x' ? stride / to.width : 0, axis === 'y' ? stride / to.height : 0);
    su.uBias.value.set(0, bias / to.height);
    su.uFalloff.value = 1 / (2 * sigmaTaps * sigmaTaps);
    renderer.setRenderTarget(to);
    quad.render(renderer);
  }

  function updateStreaks() {
    const su = streak.uniforms;
    su.uInvViewProj.value.multiplyMatrices(mirrorCamera.matrixWorld, mirrorCamera.projectionMatrixInverse);
    su.uCamPos.value.setFromMatrixPosition(mirrorCamera.matrixWorld);
    mirrorCamera.getWorldDirection(su.uCamFwd.value);
    su.uNearFar.value.set(mirrorCamera.near, mirrorCamera.far);
    quad.material = streak;

    // the targets are half the mirror's size, so read its first mip
    su.uPrepare.value = true;
    su.uLod.value = 1;
    drawOut(rtMirror.texture, rtStreakPrep, 'x', 1, 2.4);

    su.uPrepare.value = false;
    su.uLod.value = 0;
    // short: soft, but the bands of a rug still read in it…
    drawOut(rtStreakPrep.texture, rtStreakShort, 'y', 1, 3.0);
    // …and that is smooth enough to be stepped through four rows at a time for the long one
    drawOut(rtStreakShort.texture, rtStreakLong, 'y', 4, 3.3);
  }

  return {
    mirror: {
      camera: mirrorCamera,
      matrix: mirrorMatrix,
      target: rtMirror,
      short: rtStreakShort,
      long: rtStreakLong,
    },
    setSize,
    setQuality(dofTaps: number, beamSteps: number) {
      lens.uniforms.uTaps.value = dofTaps;
      lens.uniforms.uSteps.value = beamSteps;
    },
    render(
      scene: THREE.Scene,
      camera: THREE.PerspectiveCamera,
      hideFromMirror: THREE.Object3D[],
      p: FrameParams,
      grainSize: number,
    ) {
      // at most one shadow-map update per frame, shared by both scene passes
      if (p.shadows) renderer.shadowMap.needsUpdate = true;

      if (p.mirror) {
        updateMirror(camera);
        for (const o of hideFromMirror) o.visible = false;
        renderer.setRenderTarget(rtMirror);
        renderer.render(scene, mirrorCamera);
        for (const o of hideFromMirror) o.visible = true;
        updateStreaks();
      }

      renderer.setRenderTarget(rtScene);
      renderer.render(scene, camera);

      viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const lu = lens.uniforms;
      lu.uInvViewProj.value.copy(viewProj).invert();
      lu.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      camera.getWorldDirection(lu.uCamFwd.value);
      lu.uNear.value = camera.near;
      lu.uFar.value = camera.far;
      lu.uFocus.value = p.focus;
      lu.uAperture.value = p.aperture;
      lu.uFrame.value = p.frame % 64;
      lu.uBeam.value = p.beam;
      lu.uClipY.value = p.clipY;
      quad.material = lens;
      renderer.setRenderTarget(rtLens);
      quad.render(renderer);

      bloom?.render(renderer, rtLens, rtLens, p.dt, false);

      const gu = grade.uniforms;
      gu.uExposure.value = p.exposure;
      gu.uFade.value = p.fade;
      gu.uGrain.value = p.grain;
      gu.uGrainSize.value = grainSize;
      quad.material = grade;
      renderer.setRenderTarget(null);
      quad.render(renderer);
    },
    dispose() {
      rtScene.depthTexture?.dispose();
      rtScene.dispose();
      rtLens.dispose();
      rtMirror.depthTexture?.dispose();
      rtMirror.dispose();
      rtStreakPrep.dispose();
      rtStreakShort.dispose();
      rtStreakLong.dispose();
      streak.dispose();
      bloom?.dispose();
      lens.dispose();
      grade.dispose();
      quad.dispose();
    },
  };
}
