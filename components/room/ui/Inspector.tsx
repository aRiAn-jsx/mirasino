'use client';

import { forwardRef } from 'react';
import { PRODUCTS } from '@/components/site/catalog';
import { FABRICS, defOf } from '../model';
import { store, useRoom } from '../store';
import styles from '../room.module.css';
import { Icon } from './Icon';

/**
 * Held above whatever is in hand (the engine moves it with the piece): turn
 * it, re-cover it, take it out of the room. On a phone it is pinned above the
 * collection instead, where a thumb can reach it.
 */
export const Inspector = forwardRef<HTMLDivElement, { pinned: boolean }>(function Inspector({ pinned }, ref) {
  const selected = useRoom((s) => (s.ui.mode === 'arrange' ? s.ui.selected : null));
  const blocked = useRoom((s) => s.ui.blocked);
  const fabric = useRoom((s) => (s.ui.selected && s.ui.selected !== 'rug' ? s.room.items[s.ui.selected].fabric : null));
  const rugId = useRoom((s) => s.room.rug.id);

  const isRug = selected === 'rug';
  const def = selected && !isRug ? defOf(selected) : null;
  const name = isRug ? (PRODUCTS.find((p) => p.id === rugId)?.title ?? 'فرش') : (def?.label ?? '');
  const step = isRug ? Math.PI / 2 : Math.PI / 4;

  return (
    <div ref={ref} className={styles.inspectorAnchor} data-on={selected ? '1' : '0'} data-float={pinned ? '0' : '1'}>
      {selected && (
        <div className={`${styles.glass} ${styles.inspector}`} data-ui data-blocked={blocked ? '1' : '0'}>
          <span className={styles.inspectorName}>{blocked ? 'این‌جا جا نمی‌شود' : name}</span>
          <button type="button" className={styles.iconButton} onClick={() => store.rotate(selected, step)} aria-label="چرخش به راست" title="چرخش (R)">
            <Icon name="rotR" />
          </button>
          <button type="button" className={styles.iconButton} onClick={() => store.rotate(selected, -step)} aria-label="چرخش به چپ" title="چرخش (E)">
            <Icon name="rotL" />
          </button>
          {def?.fabric && (
            <span className={styles.fabrics} role="radiogroup" aria-label="رنگ پارچه">
              {FABRICS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={fabric === f.id}
                  aria-label={f.label}
                  title={f.label}
                  className={styles.fabric}
                  data-on={fabric === f.id ? '1' : '0'}
                  style={{ background: f.color }}
                  onClick={() => selected !== 'rug' && store.setItem(selected, { fabric: f.id })}
                />
              ))}
            </span>
          )}
          {!isRug && (
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => {
                store.setItem(selected, { on: false });
                store.ui({ selected: null });
              }}
              aria-label="برداشتن از اتاق"
              title="برداشتن از اتاق (Delete)"
            >
              <Icon name="remove" />
            </button>
          )}
          <button type="button" className={styles.iconButton} onClick={() => store.ui({ selected: null })} aria-label="بستن" title="بستن (Esc)">
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
});
