/**
 * `Live` is the single mutable score the whole hero plays from.
 *
 * GSAP writes to it (intro choreography, zoom, flip, lamp), the pointer writes
 * to it, and the render loop reads it once per frame. It is intentionally not
 * React state: nothing here should ever cause a re-render.
 */
export interface Live {
  /* ---- reveal / lighting, all 0‥1 ---- */
  /** room tone: hemisphere fill + wall hint */
  ambience: number;
  /** ceiling-slot reflection on the stage rim (the rim appears before the body) */
  stageRim: number;
  /** lamp status LED */
  led: number;
  /** glowing aperture inside the snoot */
  aperture: number;
  /** spotlight power */
  light: number;
  /** architectural accents: wall wash behind the stele, column uplights */
  accent: number;
  /** volumetric density */
  beam: number;
  /** dust visibility inside the cone */
  dust: number;
  /** rug colour emerging from its silhouette */
  rugSat: number;
  /** textile detail "focus pull" */
  rugDetail: number;
  /** floor reflection strength, and how unresolved it still is */
  reflection: number;
  reflSoft: number;
  /** extra lens blur during the intro */
  introBlur: number;
  /** master fade (reduced-motion intro, close-up dips) */
  fade: number;
  /** 0 during the intro; 1 once the eye is allowed to adapt to a dark room */
  adapt: number;

  /* ---- interaction ---- */
  /** 0 = full rug, 1 = individual fibres. Eased by GSAP; the rig maps it to a log dolly. */
  zoom: number;
  /** textile flip progress, direction, and its companions */
  flip: number;
  flipDir: number;
  lift: number;
  /** 1 = rug relaxed into its resting undulation / lifted corner */
  shape: number;
  ripple: number;
  blur: number;
  /** reduced-motion cross-dissolve between rugs */
  cross: number;
  /** where the visitor stands along the hall, in pieces (0 = in front of the first); eased by GSAP */
  travel: number;

  /* ---- pointer, −1‥1, y up ---- */
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  /** where the pointer really is (not parked at the centre when it leaves), whether it is over the room, and a count of presses */
  px: number;
  py: number;
  pOn: boolean;
  taps: number;
  /** pointer position when the zoom latched, for relative panning */
  anchorX: number;
  anchorY: number;
  /** point on the hung rug the camera is diving toward: metres right of / above its centre */
  focusU: number;
  focusV: number;

  /* ---- flags ---- */
  reduced: boolean;
}

export function createLive(): Live {
  return {
    ambience: 0,
    stageRim: 0,
    led: 0,
    aperture: 0,
    light: 0,
    accent: 0,
    beam: 0,
    dust: 0,
    rugSat: 0,
    rugDetail: 0,
    reflection: 0,
    reflSoft: 1,
    introBlur: 1,
    fade: 1,
    adapt: 0,
    zoom: 0,
    flip: 0,
    flipDir: 1,
    lift: 0,
    shape: 1,
    ripple: 0,
    blur: 0,
    cross: 0,
    travel: 0,
    targetX: 0,
    targetY: 0,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    pOn: false,
    taps: 0,
    anchorX: 0,
    anchorY: 0,
    focusU: 0,
    focusV: 0,
    reduced: false,
  };
}

/** The settled composition — where the intro ends up, and where reduced motion starts. */
export function settle(live: Live) {
  live.ambience = 1;
  live.stageRim = 1;
  live.led = 1;
  live.aperture = 1;
  live.light = 1;
  live.accent = 1;
  live.beam = 1;
  live.dust = 1;
  live.rugSat = 1;
  live.rugDetail = 1;
  live.reflection = 1;
  live.reflSoft = 0;
  live.introBlur = 0;
}
