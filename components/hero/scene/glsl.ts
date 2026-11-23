/** GLSL shared by more than one material. */

export const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}
`;

/** Interleaved gradient noise — cheap, well-distributed per-pixel jitter. */
export const IGN = /* glsl */ `
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
`;

/** Full-screen triangle-strip vertex shader for the post passes. */
export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Planar reflection in the floor plane.
 *
 * Deliberately not a mirror — it is a dark floor with a film of polish on it:
 *   · Fresnel-attenuated (≈4 % head-on, rising toward the horizon)
 *   · contact-hardening: blur grows with the length of the reflected ray, read
 *     from the mirror pass's depth, so what touches the floor stays crisp and
 *     what floats above it dissolves
 *   · drawn out along the view direction into long soft streaks, the way a wet
 *     or polished floor carries a light
 *   · `warp` bends the lookup (ripple), `soften` scales the blur (uneven polish)
 *
 * The streaks are not sampled here. The pipeline draws the mirror picture out
 * twice (post.ts, STREAK) into `tReflShort` and `tReflLong`; their alpha holds
 * the blurred length of the reflected ray, so this only has to choose between
 * three pictures — which is why the reflection has no silhouette to cut it off.
 */
export const REFLECTION_PARS = /* glsl */ `
uniform sampler2D tRefl;
uniform sampler2D tReflShort;
uniform sampler2D tReflLong;
uniform vec2 uReflTexel;
uniform vec2 uReflShift;
uniform float uReflStrength;
uniform float uReflSoft;
uniform vec2 uNearFar;

float reflViewZ(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - z * (uNearFar.y - uNearFar.x));
}

// reflUv: the surface point, mirrored in y = 0 and projected by the mirror camera
vec3 planarReflection(vec4 reflUv, float cosT, vec2 warp, float soften) {
  vec3 proj = reflUv.xyz / reflUv.w;
  vec2 ruv = proj.xy + uReflShift + warp;
  float zSurf = reflViewZ(proj.z);

  vec4 drawn = texture2D(tReflShort, ruv);
  vec4 streak = texture2D(tReflLong, ruv);

  // how unresolved the reflection is here, in mirror texels: it grows with the
  // length of the reflected ray (drawn.a), with the film on the floor, and in the intro
  float blur = (drawn.a / zSurf * 230.0 + 2.0) * soften + uReflSoft * 190.0;

  // what touches the floor stays a picture: a small turned ring on the mirror's own mips
  float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float rNear = clamp(blur, 1.0, 10.0);
  float lod = log2(rNear) * 0.8;
  vec3 near = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float th = float(i) * 1.5707963 + turn;
    near += textureLod(tRefl, ruv + vec2(cos(th), sin(th)) * (rNear * 0.55) * uReflTexel, lod).rgb;
  }
  near *= 0.25;

  // what stands off it is drawn out toward the viewer, further the further it stands
  vec3 c = mix(near, drawn.rgb, smoothstep(5.0, 30.0, blur));
  c = mix(c, streak.rgb, smoothstep(55.0, 230.0, blur));

  float fresnel = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
  return c * (fresnel * uReflStrength * 3.6);
}
`;
