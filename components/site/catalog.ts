/**
 * THE SHOP'S CATALOGUE — every piece the house offers, twenty of them.
 *
 * The first five are the gallery's own (components/hero/config.ts RUGS): they
 * hang in the hall on the first page and are marked as such here. The other
 * fifteen are only in the shop.
 *
 * PLACEHOLDER: one photograph was supplied. Every card shows that same rug,
 * re-coloured (a CSS filter) and sometimes cropped closer to show a detail;
 * names, origins, sizes and materials are illustrative. Replace `image`,
 * `filter` and the copy with the real pieces before launch. There are no
 * prices: every piece is priced on request, as the cart says.
 */
import { RUGS } from '@/components/hero/config';

export type Region = 'kashan' | 'tabriz' | 'isfahan' | 'nain' | 'qom' | 'kerman' | 'heriz' | 'bijar';
export type Colour = 'red' | 'navy' | 'ivory' | 'turquoise' | 'grey' | 'saffron' | 'green';
export type SizeClass = 'small' | 'medium' | 'large' | 'runner';
export type Material = 'wool' | 'wool-silk' | 'silk';

export interface Product {
  id: string;
  /** two digits, Latin, for the catalogue number */
  index: string;
  title: string;
  region: Region;
  colour: Colour;
  sizeClass: SizeClass;
  /** e.g. ۳۰۰ × ۱۵۸ سانتی‌متر */
  size: string;
  material: Material;
  /** knot and density, one line */
  knot: string;
  blurb: string;
  image: string;
  /** css filter that re-colours the photograph for this piece */
  filter: string;
  /** how close the card's picture is cropped: 1 = the whole piece */
  zoom: number;
  /** where the crop is centred, as a css object-position */
  focus: string;
  /** hangs in the gallery on the first page; the number is its place on the wall */
  gallery: number | null;
}

export const REGIONS: Record<Region, string> = {
  kashan: 'کاشان',
  tabriz: 'تبریز',
  isfahan: 'اصفهان',
  nain: 'نائین',
  qom: 'قم',
  kerman: 'کرمان',
  heriz: 'هریس',
  bijar: 'بیجار',
};

/** swatch and name for each colour family */
export const COLOURS: Record<Colour, { label: string; swatch: string }> = {
  red: { label: 'لاکی', swatch: '#7d1426' },
  navy: { label: 'سرمه‌ای', swatch: '#1c2540' },
  ivory: { label: 'شیری', swatch: '#e9e1cf' },
  turquoise: { label: 'فیروزه‌ای', swatch: '#1b6b70' },
  grey: { label: 'دودی', swatch: '#5d5f63' },
  saffron: { label: 'زعفرانی', swatch: '#b9781e' },
  green: { label: 'سبز', swatch: '#2f5a3c' },
};

export const SIZES: Record<SizeClass, string> = {
  small: 'کوچک',
  medium: 'متوسط',
  large: 'بزرگ',
  runner: 'کناره',
};

export const MATERIALS: Record<Material, string> = {
  wool: 'کرک',
  'wool-silk': 'کرک و ابریشم',
  silk: 'تمام‌ابریشم',
};

const PHOTO = '/textures/rug-01-poster.webp';

/* the gallery's five, as the shop describes them */
const GALLERY_TRAITS: Pick<Product, 'region' | 'colour' | 'material'>[] = [
  { region: 'kashan', colour: 'red', material: 'wool-silk' },
  { region: 'kashan', colour: 'navy', material: 'wool-silk' },
  { region: 'tabriz', colour: 'grey', material: 'wool' },
  { region: 'isfahan', colour: 'saffron', material: 'wool-silk' },
  { region: 'nain', colour: 'turquoise', material: 'wool-silk' },
];

const fromGallery: Product[] = RUGS.map((rug, i) => ({
  id: rug.id,
  index: rug.index,
  title: rug.fa.title,
  ...GALLERY_TRAITS[i],
  sizeClass: 'large',
  size: rug.fa.specs[1],
  knot: rug.fa.specs[2],
  blurb: rug.fa.lines.join(' '),
  image: PHOTO,
  filter: rug.fallbackFilter,
  zoom: 1,
  focus: '50% 50%',
  gallery: i,
}));

type Row = [
  id: string,
  title: string,
  region: Region,
  colour: Colour,
  sizeClass: SizeClass,
  size: string,
  material: Material,
  knot: string,
  blurb: string,
  filter: string,
  zoom: number,
  focus: string,
];

/* fifteen more, shop only — every value here is a placeholder */
const ROWS: Row[] = [
  ['qom-silk-ivory', 'قمِ ابریشمیِ شیری', 'qom', 'ivory', 'small', '۱۵۰ × ۱۰۰ سانتی‌متر', 'silk', 'گره‌ی فارسی، ۸۰ رج', 'ابریشمی که با هر قدم رنگ عوض می‌کند؛ زمینه‌ی شیری و گل‌های ریزِ صورتی.', 'sepia(0.25) saturate(0.55) brightness(1.18) contrast(0.92)', 1.35, '40% 45%'],
  ['tabriz-mahi-red', 'تبریزِ ماهی‌درهم', 'tabriz', 'red', 'large', '۳۵۰ × ۲۵۰ سانتی‌متر', 'wool-silk', 'گره‌ی ترکی، ۵۰ رج', 'نقشِ ماهی‌درهم بر زمینه‌ی لاکی؛ نقشی قدیمی که در تبریز بارها بازآفرینی شده است.', 'saturate(1.12) contrast(1.06)', 1.6, '30% 40%'],
  ['kerman-garden-green', 'کرمانِ باغی', 'kerman', 'green', 'large', '۳۰۰ × ۲۰۰ سانتی‌متر', 'wool', 'گره‌ی فارسی، ۴۰ رج', 'نقشِ باغ با جوی‌ها و درختانِ سرو؛ سبزِ ملایم و حاشیه‌ای به رنگِ گندم.', 'hue-rotate(95deg) saturate(0.7) brightness(1.02)', 1, '50% 50%'],
  ['heriz-geometric-red', 'هریسِ هندسی', 'heriz', 'red', 'large', '۳۲۰ × ۲۴۰ سانتی‌متر', 'wool', 'گره‌ی ترکی، ۳۰ رج', 'ترنجِ درشت و هندسی، بافتی محکم و پرزی بلند؛ برای اتاقی که زیاد پا می‌خورد.', 'saturate(1.25) contrast(1.12) brightness(0.96)', 1.9, '70% 50%'],
  ['bijar-iron-navy', 'بیجارِ سرمه‌ای', 'bijar', 'navy', 'medium', '۲۲۰ × ۱۵۰ سانتی‌متر', 'wool', 'گره‌ی ترکی، ۴۰ رج', 'بیجار را «فرشِ آهنین» می‌گویند؛ فشرده، سنگین و ماندگار.', 'hue-rotate(205deg) saturate(0.75) brightness(0.92)', 1.45, '60% 40%'],
  ['nain-runner-ivory', 'کناره‌ی نائین', 'nain', 'ivory', 'runner', '۳۰۰ × ۸۰ سانتی‌متر', 'wool-silk', 'گره‌ی فارسی، ۶۰ رج', 'کناره‌ای باریک برای راهرو؛ شیری و آبیِ کم‌رنگ با خطوطِ ابریشمی.', 'hue-rotate(185deg) saturate(0.35) brightness(1.2)', 2.2, '50% 50%'],
  ['isfahan-medallion-navy', 'اصفهانِ ترنج‌دار', 'isfahan', 'navy', 'medium', '۲۴۰ × ۱۶۰ سانتی‌متر', 'wool-silk', 'گره‌ی فارسی، ۷۰ رج', 'ترنجی ظریف بر زمینه‌ی سرمه‌ای؛ اسلیمی‌ها با ابریشم برجسته شده‌اند.', 'hue-rotate(220deg) saturate(0.8) contrast(1.05)', 1.25, '50% 50%'],
  ['kashan-small-red', 'پشتیِ کاشان', 'kashan', 'red', 'small', '۹۰ × ۶۰ سانتی‌متر', 'wool', 'گره‌ی فارسی، ۴۰ رج', 'یک پشتیِ کوچک از همان دار؛ برای کنارِ تخت یا جلوی در.', 'saturate(1.05)', 2.6, '22% 50%'],
  ['tabriz-saffron', 'تبریزِ عسلی', 'tabriz', 'saffron', 'medium', '۲۵۰ × ۱۷۰ سانتی‌متر', 'wool-silk', 'گره‌ی ترکی، ۵۰ رج', 'عسلی و کرم، با ترنجی نرم؛ رنگی که در نورِ روز گرم و در شب آرام است.', 'sepia(0.45) hue-rotate(-8deg) saturate(1.15) brightness(1.06)', 1.15, '50% 50%'],
  ['qom-turquoise', 'قمِ فیروزه‌ای', 'qom', 'turquoise', 'medium', '۲۰۰ × ۱۳۰ سانتی‌متر', 'silk', 'گره‌ی فارسی، ۸۰ رج', 'تمام‌ابریشم با زمینه‌ی فیروزه‌ای؛ نقش‌ها در هر زاویه‌ی نور دیگرگون می‌شوند.', 'hue-rotate(165deg) saturate(1.05) brightness(1.06)', 1.5, '35% 55%'],
  ['kerman-ivory', 'کرمانِ شیری', 'kerman', 'ivory', 'large', '۳۵۰ × ۲۵۰ سانتی‌متر', 'wool', 'گره‌ی فارسی، ۴۰ رج', 'زمینه‌ی شیری با دسته‌گل‌های رنگارنگ؛ کرمان را با همین گل‌ها می‌شناسند.', 'sepia(0.2) saturate(0.6) brightness(1.15)', 1, '50% 50%'],
  ['heriz-runner-grey', 'کناره‌ی دودی', 'heriz', 'grey', 'runner', '۳۵۰ × ۹۰ سانتی‌متر', 'wool', 'گره‌ی ترکی، ۳۰ رج', 'کناره‌ای امروزی در خاکستری و استخوانی، با همان نقشِ هندسیِ هریس.', 'grayscale(0.9) contrast(1.1) brightness(1.04)', 2.1, '75% 50%'],
  ['bijar-green', 'بیجارِ سبز', 'bijar', 'green', 'medium', '۲۳۰ × ۱۶۰ سانتی‌متر', 'wool', 'گره‌ی ترکی، ۴۰ رج', 'سبزِ زیتونی با حاشیه‌ی لاکی؛ رنگی کمیاب در بیجار.', 'hue-rotate(75deg) saturate(0.65) brightness(0.98)', 1.3, '45% 45%'],
  ['nain-silk-grey', 'نائینِ نقره‌ای', 'nain', 'grey', 'small', '۱۶۰ × ۱۰۵ سانتی‌متر', 'wool-silk', 'گره‌ی فارسی، ۷۰ رج', 'خاکستریِ نقره‌ای و آبیِ یخی؛ ابریشم در نقش‌ها نور را برمی‌گرداند.', 'grayscale(0.7) hue-rotate(190deg) saturate(0.6) brightness(1.1)', 1.7, '55% 50%'],
  ['isfahan-red-large', 'اصفهانِ لاکیِ بزرگ', 'isfahan', 'red', 'large', '۴۰۰ × ۳۰۰ سانتی‌متر', 'wool-silk', 'گره‌ی فارسی، ۶۵ رج', 'برای سالنی بزرگ: لاکیِ عمیق، ترنجی پرکار و حاشیه‌ای سه‌لایه.', 'saturate(1.18) contrast(1.04) brightness(0.98)', 1.1, '50% 50%'],
];

const shopOnly: Product[] = ROWS.map(
  ([id, title, region, colour, sizeClass, size, material, knot, blurb, filter, zoom, focus], i) => ({
    id,
    index: String(i + 6).padStart(2, '0'),
    title,
    region,
    colour,
    sizeClass,
    size,
    material,
    knot,
    blurb,
    image: PHOTO,
    filter,
    zoom,
    focus,
    gallery: null,
  }),
);

export const PRODUCTS: Product[] = [...fromGallery, ...shopOnly];

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);
