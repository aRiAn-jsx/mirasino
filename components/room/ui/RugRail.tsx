'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PRODUCTS, SIZES, type SizeClass } from '@/components/site/catalog';
import { cssPersian, suits } from '../model';
import { store, useRoom } from '../store';
import styles from '../room.module.css';

type Filter = 'all' | 'fits' | SizeClass;
const THUMB = '/textures/rug-01-thumb.webp';

/**
 * The collection, along the bottom of the room. Choosing a piece rolls the
 * one on the floor away and rolls the new one out in its place. "Suits this
 * room" filters to the pieces that, laid where the rug lies now, would pass
 * the designer's rules (model.ts → suits).
 */
export function RugRail() {
  const room = useRoom((s) => s.room);
  const current = room.rug.id;
  const swapping = useRoom((s) => s.ui.swapping);
  const [filter, setFilter] = useState<Filter>('all');
  const list = useRef<HTMLUListElement>(null);

  const fitting = useMemo(() => new Set(PRODUCTS.filter((p) => suits(room, p)).map((p) => p.id)), [room]);
  const shown = PRODUCTS.filter((p) => (filter === 'all' ? true : filter === 'fits' ? fitting.has(p.id) : p.sizeClass === filter));

  // keep the piece on the floor in view in the strip
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [current, filter]);

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'همه' },
    { id: 'fits', label: `مناسب این اتاق · ${cssPersian(fitting.size)}` },
    ...(Object.keys(SIZES) as SizeClass[]).map((id) => ({ id, label: SIZES[id] })),
  ];

  return (
    <section className={`${styles.glass} ${styles.rail}`} aria-label="انتخاب فرش" data-ui>
      <div className={styles.railHead}>
        <p className={styles.railTitle}>فرش را روی کف امتحان کنید</p>
        <div className={styles.chips} role="radiogroup" aria-label="پالایش">
          {chips.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={filter === c.id} className={styles.chip} data-on={filter === c.id ? '1' : '0'} onClick={() => setFilter(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <ul className={styles.railList} ref={list}>
        {shown.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={styles.rugTile}
              aria-current={p.id === current ? 'true' : undefined}
              data-busy={swapping && p.id === current ? '1' : '0'}
              onClick={() => store.chooseRug(p.id)}
              aria-label={`${p.title}، ${p.size}`}
            >
              <span className={styles.rugThumb}>
                <img src={THUMB} alt="" draggable={false} style={{ filter: p.filter }} />
              </span>
              <span className={styles.rugMeta}>
                <b>{p.title}</b>
                <span>{p.size.replace(' سانتی‌متر', '')}</span>
              </span>
              {fitting.has(p.id) && <span className={styles.fitDot} title="مناسب این اتاق" aria-hidden="true" />}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className={styles.railEmpty}>با این چیدمان هیچ قطعه‌ای همه‌ی قاعده‌ها را برآورده نمی‌کند؛ فرش را جابه‌جا کنید یا بچرخانید.</li>}
      </ul>
    </section>
  );
}
