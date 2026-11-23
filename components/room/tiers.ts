/**
 * TWO LEVELS OF GRAPHICS, chosen by the visitor:
 *
 *   max     everything the room can draw — ground-truth ambient occlusion,
 *           2K shadow maps with soft edges, 4× MSAA, full resolution on a
 *           retina screen, every leaf on the olive tree
 *   normal  the same room for any machine — no AO, lighter shadows, a capped
 *           resolution that is stepped down further if frames run long
 *
 * The first visit starts on what the device can comfortably do: max on a
 * desktop with a discrete GPU, normal on integrated graphics and phones.
 */
import { WEAK_GPU } from '@/components/hero/config';
import type { Quality } from './store';

export interface RoomTier {
  name: Quality;
  maxPixels: number;
  maxDpr: number;
  msaa: number;
  /** the sky's shadow map, and the one over the rug */
  shadow: number;
  keyShadow: number;
  /** soft-shadow kernel, in texels */
  shadowRadius: number;
  ao: boolean;
  bloom: boolean;
  extraLights: boolean;
  leaves: number;
  /** the loupe's render target, px */
  loupe: number;
  floorRes: number;
  anisotropy: number;
  /** step resolution down when frames run long */
  adaptive: boolean;
}

export interface RoomEnv {
  webgl: boolean;
  reduced: boolean;
  touch: boolean;
  /** what the device should start on */
  suggested: Quality;
  /** a phone or small tablet */
  small: boolean;
}

export function detectRoomEnv(): RoomEnv {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  let webgl = false;
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    webgl = !!gl;
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && info) gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
  } catch {
    webgl = false;
  }
  const small = touch || Math.min(window.innerWidth, window.innerHeight) < 640;
  const suggested: Quality = small || WEAK_GPU.test(gpu) ? 'normal' : 'max';
  return { webgl, reduced, touch, suggested, small };
}

/** the tier for a quality on this device, and the pixel ratio to start at */
export function tierFor(quality: Quality, small: boolean): { tier: RoomTier; dpr: number } {
  const tier: RoomTier =
    quality === 'max'
      ? {
          name: 'max',
          maxPixels: small ? 2.6e6 : 5e6,
          maxDpr: 2,
          msaa: 4,
          shadow: 2048,
          keyShadow: 2048,
          shadowRadius: 5,
          ao: true,
          bloom: true,
          extraLights: true,
          leaves: 1800,
          loupe: 512,
          floorRes: 2048,
          anisotropy: 16,
          adaptive: false,
        }
      : {
          name: 'normal',
          maxPixels: small ? 0.9e6 : 1.1e6,
          maxDpr: small ? 1.5 : 1.25,
          msaa: small ? 0 : 2,
          shadow: 1024,
          keyShadow: 1024,
          shadowRadius: 3,
          ao: false,
          bloom: !small,
          extraLights: !small,
          leaves: small ? 500 : 900,
          loupe: 320,
          floorRes: 1024,
          anisotropy: 8,
          adaptive: true,
        };
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, tier.maxDpr, Math.sqrt(tier.maxPixels / (w * h))));
  return { tier, dpr: Math.round(dpr * 100) / 100 };
}
