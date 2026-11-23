'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cart, faDigits, useCart } from './cart';
import {
  COLOURS,
  MATERIALS,
  PRODUCTS,
  REGIONS,
  SIZES,
  type Colour,
  type Material,
  type Product,
  type Region,
  type SizeClass,
} from './catalog';
import shop from './shop.module.css';
import styles from './site.module.css';

type Picks = {
  region: Set<Region>;
  colour: Set<Colour>;
  size: Set<SizeClass>;
  material: Set<Material>;
};

const empty = (): Picks => ({ region: new Set(), colour: new Set(), size: new Set(), material: new Set() });

/** what the catalogue actually has, in the order the labels are written */
const present = <K extends string>(labels: Record<K, unknown>, pick: (p: Product) => K) =>
  (Object.keys(labels) as K[]).filter((key) => PRODUCTS.some((p) => pick(p) === key));

const GROUPS = {
  region: present(REGIONS, (p) => p.region),
  colour: present(COLOURS, (p) => p.colour),
  size: present(SIZES, (p) => p.sizeClass),
  material: present(MATERIALS, (p) => p.material),
};

/**
 * THE SHOP — every piece, as a card, with a filter above them.
 *
 * Within one group the choices widen the list (Kashan or Tabriz); across
 * groups they narrow it (Kashan, and red). The gallery's five can be shown on
 * their own. Each card's picture fades in first, then its words, then its
 * button, the first time it comes into view.
 */
export function ShopView() {
  const [picks, setPicks] = useState<Picks>(empty);
  const [galleryOnly, setGalleryOnly] = useState(false);
  const inCart = useCart();

  const toggle = <K extends keyof Picks>(group: K, value: Picks[K] extends Set<infer V> ? V : never) =>
    setPicks((current) => {
      const next = new Set(current[group]) as Picks[K];
      (next as Set<unknown>).has(value) ? (next as Set<unknown>).delete(value) : (next as Set<unknown>).add(value);
      return { ...current, [group]: next };
    });

  const shown = useMemo(
    () =>
      PRODUCTS.filter(
        (p) =>
          (!galleryOnly || p.gallery !== null) &&
          (picks.region.size === 0 || picks.region.has(p.region)) &&
          (picks.colour.size === 0 || picks.colour.has(p.colour)) &&
          (picks.size.size === 0 || picks.size.has(p.sizeClass)) &&
          (picks.material.size === 0 || picks.material.has(p.material)),
      ),
    [picks, galleryOnly],
  );

  const filtered = galleryOnly || Object.values(picks).some((set) => set.size > 0);
  const clear = () => {
    setPicks(empty());
    setGalleryOnly(false);
  };

  return (
    <>
      <section className={`${styles.glass} ${shop.filters}`} aria-label="فیلترها">
        <div className={shop.filterHead}>
          <p className={shop.count} aria-live="polite">
            {faDigits(shown.length)} قطعه
          </p>
          <label className={shop.switch}>
            <input type="checkbox" checked={galleryOnly} onChange={(e) => setGalleryOnly(e.target.checked)} />
            <span className={shop.switchTrack} aria-hidden="true">
              <span />
            </span>
            فقط آثارِ گالری
          </label>
          {filtered && (
            <button type="button" className={shop.clear} onClick={clear}>
              پاک کردنِ فیلترها
            </button>
          )}
        </div>

        <FilterGroup label="شهر">
          {GROUPS.region.map((key) => (
            <Chip key={key} on={picks.region.has(key)} onClick={() => toggle('region', key)}>
              {REGIONS[key]}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="رنگ">
          {GROUPS.colour.map((key) => (
            <Chip key={key} on={picks.colour.has(key)} onClick={() => toggle('colour', key)}>
              <i className={shop.swatch} style={{ background: COLOURS[key].swatch }} aria-hidden="true" />
              {COLOURS[key].label}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="اندازه">
          {GROUPS.size.map((key) => (
            <Chip key={key} on={picks.size.has(key)} onClick={() => toggle('size', key)}>
              {SIZES[key]}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="جنس">
          {GROUPS.material.map((key) => (
            <Chip key={key} on={picks.material.has(key)} onClick={() => toggle('material', key)}>
              {MATERIALS[key]}
            </Chip>
          ))}
        </FilterGroup>
      </section>

      {shown.length === 0 ? (
        <div className={`${styles.glass} ${styles.empty}`}>
          <p>با این فیلترها قطعه‌ای پیدا نشد.</p>
          <button type="button" className={styles.button} onClick={clear}>
            پاک کردنِ فیلترها
          </button>
        </div>
      ) : (
        <ul className={shop.grid}>
          {shown.map((product, i) => (
            <ProductCard key={product.id} product={product} order={i} added={inCart.includes(product.id)} />
          ))}
        </ul>
      )}
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={shop.group} role="group" aria-label={label}>
      <span className={shop.groupLabel}>{label}</span>
      <div className={shop.chips}>{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={shop.chip} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

function ProductCard({ product, order, added }: { product: Product; order: number; added: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLLIElement>(null);
  const [seen, setSeen] = useState(false);

  // the picture, then the words, then the button — once, as the card comes into view
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const buy = () => {
    if (added) router.push('/cart');
    else cart.add(product.id);
  };

  const picture: CSSProperties = {
    filter: product.filter,
    objectPosition: product.focus,
    transform: `scale(${product.zoom})`,
    transformOrigin: product.focus,
  };

  return (
    <li
      ref={ref}
      className={`${styles.glass} ${shop.card}`}
      data-seen={seen ? '1' : '0'}
      style={{ '--delay': `${(order % 4) * 70}ms` } as CSSProperties}
    >
      <div className={shop.media} data-crop={product.zoom > 1 ? '1' : '0'}>
        <img src={product.image} alt={`قالیچه‌ی ${product.title}`} loading="lazy" draggable={false} style={picture} />
        {product.gallery !== null && (
          <Link href={`/?piece=${product.gallery}`} className={shop.badge}>
            در گالری · <span lang="en" dir="ltr">{product.index}</span>
          </Link>
        )}
      </div>

      <div className={shop.body}>
        <p className={shop.eyebrow}>
          <span>{REGIONS[product.region]}</span>
          <i aria-hidden="true" />
          <span lang="en" dir="ltr">
            N° {product.index}
          </span>
        </p>
        <h3 className={shop.title}>{product.title}</h3>
        <p className={shop.meta}>
          {product.size} · {MATERIALS[product.material]}
        </p>
        <p className={shop.blurb}>{product.blurb}</p>
      </div>

      <div className={shop.foot}>
        <span className={shop.footStart}>
          <span className={shop.price}>قیمت: استعلامی</span>
          <Link href={`/room?rug=${product.id}`} className={shop.tryOn}>
            در اتاق ببینید
          </Link>
        </span>
        <button type="button" className={shop.buy} data-added={added ? '1' : '0'} onClick={buy}>
          {added ? (
            <>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 8.4l3 3 6-6.8" />
              </svg>
              در سبد خرید
            </>
          ) : (
            <>
              <svg viewBox="0 0 22 22" aria-hidden="true">
                <path d="M5.2 7.5h11.6l-.9 10.2a1.4 1.4 0 0 1-1.4 1.3H7.5a1.4 1.4 0 0 1-1.4-1.3L5.2 7.5z" />
                <path d="M8.2 9.6V6.4a2.8 2.8 0 0 1 5.6 0v3.2" />
              </svg>
              خرید
            </>
          )}
        </button>
      </div>
    </li>
  );
}
