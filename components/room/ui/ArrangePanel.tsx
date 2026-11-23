'use client';

import { FLOORS, ITEMS, ITEM_DEFS, PRESETS, ROOM_LIMITS, STYLES, WALLS, cssPersian, type ItemId } from '../model';
import { store, useRoom, type Panel } from '../store';
import styles from '../room.module.css';
import { Icon, type IconName } from './Icon';

const TABS: { id: Panel; label: string; icon: IconName }[] = [
  { id: 'layout', label: 'چیدمان', icon: 'layout' },
  { id: 'furniture', label: 'اثاثیه', icon: 'sofa' },
  { id: 'room', label: 'اتاق', icon: 'room' },
];

const metres = (m: number) => `${cssPersian(m.toFixed(1)).replace('.', '٫')} متر`;

/**
 * Arranging: a ready layout to start from, the pieces (in or out of the
 * room), and the room itself — its size, its floor, its walls. The visitor's
 * own room is the point: set the walls to theirs and see what fits.
 */
export function ArrangePanel() {
  const panel = useRoom((s) => s.ui.panel);
  const drawer = useRoom((s) => s.ui.drawer);
  const selected = useRoom((s) => s.ui.selected);
  const room = useRoom((s) => s.room);

  return (
    <aside className={`${styles.glass} ${styles.panel}`} data-open={drawer ? '1' : '0'} data-ui data-inset aria-label="چیدمان اتاق">
      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={panel === t.id}
            className={styles.tab}
            data-on={panel === t.id ? '1' : '0'}
            onClick={() => store.ui({ panel: t.id, drawer: true })}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
        <button type="button" className={styles.drawerClose} onClick={() => store.ui({ drawer: false })} aria-label="بستن">
          <Icon name="close" size={16} />
        </button>
      </div>

      {panel === 'layout' && (
        <div className={styles.panelBody}>
          <ul className={styles.presets}>
            {PRESETS.map((p, i) => (
              <li key={p.id}>
                <button type="button" className={styles.preset} onClick={() => store.applyPreset(p.id)}>
                  <span className={styles.presetNum} lang="en" dir="ltr">
                    0{i + 1}
                  </span>
                  <b>{p.label}</b>
                  <span>{p.note}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className={styles.note}>هر چیز را با کشیدن جابه‌جا کنید. کنار دیوار که برسد، به دیوار می‌چسبد.</p>
          <button type="button" className={styles.ghost} onClick={() => store.reset()}>
            <Icon name="reset" size={16} />
            بازگشت به چیدمان نخست
          </button>
        </div>
      )}

      {panel === 'furniture' && (
        <div className={styles.panelBody}>
          <p className={styles.groupLabel}>سبک مبلمان</p>
          <div className={styles.styles} role="radiogroup" aria-label="سبک مبلمان">
            {STYLES.map((st) => (
              <button
                key={st.id}
                type="button"
                role="radio"
                aria-checked={(room.style ?? 'modern') === st.id}
                className={styles.styleOption}
                data-on={(room.style ?? 'modern') === st.id ? '1' : '0'}
                onClick={() => store.setStyle(st.id)}
              >
                <svg viewBox="0 0 48 28" aria-hidden="true">
                  {st.id === 'modern' ? (
                    <path d="M5 12h38v8H5zM5 12V8h38v4M8 20v3M40 20v3" />
                  ) : (
                    <path d="M7 15c0-6 6-10 17-10s17 4 17 10M5 15h38v5H5zM9 20c0 2-1 3-2 4M39 20c0 2 1 3 2 4M24 3v2" />
                  )}
                </svg>
                <b>{st.label}</b>
                <span>{st.note}</span>
              </button>
            ))}
          </div>
          <p className={styles.groupLabel}>قطعه‌ها</p>
          <ul className={styles.items}>
            {ITEMS.map(({ id, kind }) => {
              const st = room.items[id];
              const def = ITEM_DEFS[kind];
              return (
                <li key={id} data-selected={selected === id ? '1' : '0'}>
                  <button type="button" className={styles.itemName} onClick={() => st.on && store.ui({ selected: id })} disabled={!st.on}>
                    <b>{def.label}</b>
                    <span>
                      {cssPersian(Math.round(def.w * 100))} × {cssPersian(Math.round(def.d * 100))}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={st.on}
                    aria-label={`${def.label} در اتاق`}
                    className={styles.switch}
                    onClick={() => {
                      store.setItem(id as ItemId, { on: !st.on });
                      if (st.on && selected === id) store.ui({ selected: null });
                    }}
                  >
                    <i />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {panel === 'room' && (
        <div className={styles.panelBody}>
          <label className={styles.slider}>
            <span>
              پهنا <b>{metres(room.w)}</b>
            </span>
            <input
              type="range"
              min={ROOM_LIMITS.w[0]}
              max={ROOM_LIMITS.w[1]}
              step={0.1}
              value={room.w}
              onChange={(e) => store.resize(Number(e.target.value), room.d)}
            />
          </label>
          <label className={styles.slider}>
            <span>
              درازا <b>{metres(room.d)}</b>
            </span>
            <input
              type="range"
              min={ROOM_LIMITS.d[0]}
              max={ROOM_LIMITS.d[1]}
              step={0.1}
              value={room.d}
              onChange={(e) => store.resize(room.w, Number(e.target.value))}
            />
          </label>
          <p className={styles.note}>اندازه‌ی اتاقِ خودتان را بدهید؛ همه‌چیز به اندازه‌ی واقعی است.</p>

          <p className={styles.groupLabel}>کف</p>
          <div className={styles.swatches}>
            {FLOORS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={styles.swatch}
                data-on={room.floor === f.id ? '1' : '0'}
                onClick={() => store.room((r) => ({ ...r, floor: f.id }))}
                title={f.label}
              >
                <i style={{ background: f.swatch }} />
                <span>{f.label}</span>
              </button>
            ))}
          </div>

          <p className={styles.groupLabel}>دیوار</p>
          <div className={styles.swatches}>
            {WALLS.map((w) => (
              <button
                key={w.id}
                type="button"
                className={styles.swatch}
                data-on={room.wall === w.id ? '1' : '0'}
                onClick={() => store.room((r) => ({ ...r, wall: w.id }))}
                title={w.label}
              >
                <i style={{ background: w.swatch }} />
                <span>{w.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
