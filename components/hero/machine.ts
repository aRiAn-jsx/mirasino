/**
 * INTERACTION STATE MACHINE
 * =========================
 *
 * Two orthogonal regions: what the camera/rug are doing, and whether the room
 * is lit.
 *
 *   view                                              light
 *   ────                                              ─────
 *   INTRO ──INTRO_DONE──▶ IDLE                         LIGHT_ON ◀──LAMP_CLICK──▶ LIGHT_OFF
 *     │ any input = SKIP (fast-forwards, input is swallowed)      (any click relights)
 *
 *   IDLE ──RUG_ENTER──▶ RUG_HOVER ──ZOOM_IN_DONE──▶ RUG_ZOOMED
 *     ▲                     │                           │
 *     │                     └──────── RUG_LEAVE ────────┤
 *     │                                                 ▼
 *     └────── ZOOM_OUT_DONE (nothing queued) ────── RETURNING
 *                                                       │ ZOOM_OUT_DONE (flip queued)
 *   IDLE ──RUG_CLICK / NAVIGATE──▶ FLIPPING ◀───────────┘
 *     ▲                               │
 *     └────────── FLIP_DONE ──────────┘
 *
 * In the gallery FLIPPING covers the two things that take the piece out of
 * the visitor's hands for a moment: a click turns the rug over on its rod to
 * show its back (or turns it back again) — effect `turn` — and prev / next
 * walks the visitor along the hall to the neighbouring piece — effect `walk`.
 *
 * Rules (all enforced in `transition`, nowhere else):
 *
 *   1. INTRO blocks everything. Any press / key / wheel skips it.
 *   2. FLIPPING ignores lamp clicks, rug hover, rug clicks and navigation.
 *   3. A rug click (or prev/next) while RUG_HOVER / RUG_ZOOMED first pulls the
 *      camera back, then flips — always in that order, never a flip from depth.
 *   4. The lamp may be switched off in every state except INTRO and FLIPPING.
 *      If the lens is in the weave when that happens it is pulled back first.
 *   5. LIGHT_OFF is total: the room is black and only the typed title shows.
 *      Hover-zoom, rug clicks and navigation do nothing; a click anywhere in
 *      the room (or the lamp key) switches the light back on.
 *   6. After a flip the pointer is still resting on the rug. Hover-zoom is
 *      disarmed until the pointer leaves or travels (REARM), so a click does
 *      not immediately dive back in.
 *
 * RETURNING is the one state the brief does not name: the camera travelling
 * back out. It needs to exist so "leave, then re-enter mid-flight" and
 * "click mid-flight" have defined answers.
 *
 * The reducer is pure. It returns the next state and a list of effects for the
 * controller (Hero.tsx) to perform — tweens and sound live there, not here.
 */

export type ViewState = 'INTRO' | 'IDLE' | 'RUG_HOVER' | 'RUG_ZOOMED' | 'RETURNING' | 'FLIPPING';
export type LightState = 'LIGHT_ON' | 'LIGHT_OFF';

export interface MachineState {
  view: ViewState;
  light: LightState;
  /** what is waiting for the camera to finish pulling back: a walk (±1), a turn (2), or nothing */
  queuedFlip: Queued;
  hoverArmed: boolean;
}

/** 0: nothing · ±1: a walk to the previous / next piece · 2: turning the piece over */
export type Queued = 0 | 1 | -1 | 2;

export type MachineEvent =
  | { type: 'SKIP' }
  | { type: 'INTRO_DONE' }
  | { type: 'RUG_ENTER' }
  | { type: 'RUG_LEAVE' }
  | { type: 'REARM' }
  | { type: 'ZOOM_IN_DONE' }
  | { type: 'ZOOM_OUT_DONE' }
  | { type: 'RUG_CLICK' }
  /** a click that landed on nothing in particular */
  | { type: 'ROOM_CLICK' }
  /** `to`: a particular piece (a thumbnail); otherwise the neighbour in `dir` */
  | { type: 'NAVIGATE'; dir: 1 | -1; to?: number }
  | { type: 'FLIP_DONE' }
  | { type: 'LAMP_CLICK' };

export type Effect =
  | { type: 'skipIntro' }
  | { type: 'zoomIn' }
  | { type: 'zoomOut'; hurried: boolean }
  | { type: 'walk'; dir: 1 | -1; to?: number }
  | { type: 'turn' }
  | { type: 'light'; on: boolean };

export interface Transition {
  state: MachineState;
  effects: Effect[];
}

export const initialState: MachineState = {
  view: 'INTRO',
  light: 'LIGHT_OFF',
  queuedFlip: 0,
  hoverArmed: true,
};

const stay = (state: MachineState): Transition => ({ state, effects: [] });

export function transition(state: MachineState, event: MachineEvent): Transition {
  // Leaving the rug (or travelling far enough) always re-arms hover, whatever else is going on.
  if (event.type === 'REARM') return stay({ ...state, hoverArmed: true });
  if (event.type === 'RUG_LEAVE') state = { ...state, hoverArmed: true };

  if (state.view === 'INTRO') {
    if (event.type === 'SKIP') return { state, effects: [{ type: 'skipIntro' }] };
    // the intro itself switches the lamp on as part of its choreography
    if (event.type === 'INTRO_DONE') return stay({ ...state, view: 'IDLE', light: 'LIGHT_ON' });
    return stay(state);
  }

  if (state.view === 'FLIPPING') {
    // hoverArmed was cleared when the flip began; a RUG_LEAVE meanwhile re-armed it (rule 6)
    if (event.type === 'FLIP_DONE') return stay({ ...state, view: 'IDLE' });
    return stay(state); // rule 2
  }

  // rule 5 — the dark room
  if (state.light === 'LIGHT_OFF') {
    switch (event.type) {
      case 'LAMP_CLICK':
      case 'RUG_CLICK':
      case 'ROOM_CLICK':
        return { state: { ...state, light: 'LIGHT_ON' }, effects: [{ type: 'light', on: true }] };
      case 'ZOOM_OUT_DONE':
        return stay({ ...state, view: 'IDLE', queuedFlip: 0 });
      default:
        return stay(state);
    }
  }

  switch (state.view) {
    case 'IDLE':
      switch (event.type) {
        case 'RUG_ENTER':
          if (!state.hoverArmed) return stay(state);
          return { state: { ...state, view: 'RUG_HOVER' }, effects: [{ type: 'zoomIn' }] };
        case 'RUG_CLICK':
          return { state: { ...state, view: 'FLIPPING', hoverArmed: false }, effects: [{ type: 'turn' }] };
        case 'NAVIGATE':
          return {
            state: { ...state, view: 'FLIPPING', hoverArmed: false },
            effects: [{ type: 'walk', dir: event.dir, to: event.to }],
          };
        case 'LAMP_CLICK':
          return { state: { ...state, light: 'LIGHT_OFF' }, effects: [{ type: 'light', on: false }] };
        default:
          return stay(state);
      }

    case 'RUG_HOVER':
    case 'RUG_ZOOMED':
      switch (event.type) {
        case 'ZOOM_IN_DONE':
          return stay({ ...state, view: 'RUG_ZOOMED' });
        case 'RUG_LEAVE':
          return { state: { ...state, view: 'RETURNING' }, effects: [{ type: 'zoomOut', hurried: false }] };
        case 'RUG_CLICK':
          return {
            state: { ...state, view: 'RETURNING', queuedFlip: 2, hoverArmed: false },
            effects: [{ type: 'zoomOut', hurried: true }],
          };
        case 'NAVIGATE':
          return {
            state: { ...state, view: 'RETURNING', queuedFlip: event.dir, hoverArmed: false },
            effects: [{ type: 'zoomOut', hurried: true }],
          };
        case 'LAMP_CLICK':
          // rule 4: out of the weave first, lights out with it
          return {
            state: { ...state, view: 'RETURNING', light: 'LIGHT_OFF', queuedFlip: 0, hoverArmed: false },
            effects: [
              { type: 'zoomOut', hurried: true },
              { type: 'light', on: false },
            ],
          };
        default:
          return stay(state);
      }

    case 'RETURNING':
      switch (event.type) {
        case 'ZOOM_OUT_DONE':
          if (state.queuedFlip !== 0) {
            return {
              state: { ...state, view: 'FLIPPING', queuedFlip: 0, hoverArmed: false },
              effects: [state.queuedFlip === 2 ? { type: 'turn' } : { type: 'walk', dir: state.queuedFlip }],
            };
          }
          return stay({ ...state, view: 'IDLE' });
        case 'RUG_ENTER':
          if (state.queuedFlip !== 0 || !state.hoverArmed) return stay(state);
          return { state: { ...state, view: 'RUG_HOVER' }, effects: [{ type: 'zoomIn' }] };
        case 'RUG_CLICK':
          if (state.queuedFlip !== 0) return stay(state);
          return {
            state: { ...state, queuedFlip: 2, hoverArmed: false },
            effects: [{ type: 'zoomOut', hurried: true }],
          };
        case 'NAVIGATE':
          if (state.queuedFlip !== 0) return stay(state);
          return {
            state: { ...state, queuedFlip: event.dir, hoverArmed: false },
            effects: [{ type: 'zoomOut', hurried: true }],
          };
        case 'LAMP_CLICK':
          return {
            state: { ...state, light: 'LIGHT_OFF', queuedFlip: 0 },
            effects: [{ type: 'light', on: false }],
          };
        default:
          return stay(state);
      }

    default:
      return stay(state);
  }
}

/** The brief's flat vocabulary, for data attributes and debugging. */
export function label(state: MachineState): string {
  if (state.view === 'IDLE' && state.light === 'LIGHT_OFF') return 'LIGHT_OFF';
  return state.view === 'RETURNING' ? 'RUG_HOVER' : state.view;
}
