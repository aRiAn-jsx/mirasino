/** Thin-line icons for the room's controls: one stroke weight, drawn on a 24 grid. */
const PATHS = {
  view: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  arrange: 'M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
  overview: 'M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5zM4 8l8 4.5L20 8M12 12.5V20.5',
  plan: 'M4 4h16v16H4zM4 10h7v10M11 4v6h9',
  eye: 'M12 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9.5 21l1-7.5-2.5-1 1.5-3h5l1.5 3-2.5 1 1 7.5',
  detail: 'M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5M8 10.5h5M10.5 8v5',
  night: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z',
  dusk: 'M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 6.5V9M5.5 9.5l1.5 1.5M18.5 9.5 17 11M2 21.5h20',
  day: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  loupe: 'M10 3.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM14.8 14.8 21 21M7 10h6M7 7.5h6M7 12.5h6',
  camera: 'M4 7.5h3l1.5-2h7l1.5 2h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  reset: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v3.5H8',
  rotL: 'M7 8.5a7 7 0 1 1-1.5 7M7 3.5v5h5',
  rotR: 'M17 8.5a7 7 0 1 0 1.5 7M17 3.5v5h-5',
  remove: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13',
  close: 'M6 6l12 12M18 6 6 18',
  cart: 'M5.2 7.5h13.6l-1 11a1.6 1.6 0 0 1-1.6 1.5H7.8a1.6 1.6 0 0 1-1.6-1.5L5.2 7.5zM8.8 9.8V6.4a3.2 3.2 0 0 1 6.4 0v3.4',
  check: 'M5 12.5l4.2 4.2L19 7',
  back: 'M14.5 6l-6 6 6 6',
  forward: 'M9.5 6l6 6-6 6',
  layout: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  sofa: 'M4 11V8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5V11M3 11.5a1.5 1.5 0 0 1 3 0V14h12v-2.5a1.5 1.5 0 0 1 3 0V18H3zM5 18v2M19 18v2',
  room: 'M4 20V4h16v16M4 20h16M9 20v-6h6v6',
  gallery: 'M3 20h18M5 20V9l7-5 7 5v11M9 20v-5h6v5',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5M12 8v.2',
  rug: 'M4 7.5h16v9H4zM2.5 9v6M21.5 9v6M7 10h10v4H7z',
  spot: 'M9 3.5h6l1.5 4h-9L9 3.5zM12 7.5v1M6 20.5l3.5-9h5l3.5 9M4 20.5h16',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  focus: 'M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M7.5 10h9v4h-9z',
  chevronUp: 'M6 14.5l6-6 6 6',
  chevronDown: 'M6 9.5l6 6 6-6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
