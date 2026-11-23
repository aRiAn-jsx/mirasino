/**
 * What a valid name, email and password are, and what to say when one is not.
 *
 * Pure: the form runs these as the visitor leaves each field, and the server
 * runs the same ones again before it trusts anything (components/auth).
 */
import { PROVINCE_NAMES, cityBelongs } from './geo';

export type Mode = 'login' | 'register';
export type Field = 'name' | 'email' | 'province' | 'city' | 'password' | 'confirm';
export type Values = Record<Field, string>;

export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const NAME_MAX = 60;
const EMAIL_MAX = 254;

/** which fields each form has, in the order they are read */
export const FIELDS: Record<Mode, readonly Field[]> = {
  login: ['email', 'password'],
  register: ['name', 'email', 'province', 'city', 'password', 'confirm'],
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** one name, with its inner spaces made single: «علی    محمدی» becomes «علی محمدی» */
export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** one field: the message to show under it, or null */
export function check(field: Field, values: Values, mode: Mode): string | null {
  const value = values[field];
  switch (field) {
    case 'name': {
      const name = normalizeName(value);
      if (!name) return 'نام و نام خانوادگی را بنویسید.';
      if (name.length > NAME_MAX) return 'نام خیلی بلند است.';
      // letters of any alphabet, the zero-width joiner of Persian, hyphen and space — no digits, no symbols
      if (!/^[\p{L}‌' -]+$/u.test(name)) return 'نام فقط باید با حروف نوشته شود.';
      const words = name.split(' ');
      if (words.length < 2 || words.some((word) => word.replace(/[^\p{L}]/gu, '').length < 2)) {
        return 'نام و نام خانوادگی هر دو را کامل بنویسید.';
      }
      return null;
    }
    case 'province':
      if (!value) return 'استان را انتخاب کنید.';
      if (!PROVINCE_NAMES.includes(value)) return 'استان انتخاب‌شده معتبر نیست.';
      return null;
    case 'city':
      if (!value) return 'شهر را انتخاب کنید.';
      if (!cityBelongs(values.province, value)) return 'این شهر در استان انتخاب‌شده نیست.';
      return null;
    case 'email': {
      const email = normalizeEmail(value);
      if (!email) return 'ایمیل را بنویسید.';
      if (email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return 'این ایمیل درست به نظر نمی‌رسد؛ نمونه: name@example.com';
      }
      return null;
    }
    case 'password':
      if (!value) return 'رمز عبور را بنویسید.';
      // signing in, the only test of a password is whether it is the right one
      if (mode === 'login') return null;
      if (value.length < PASSWORD_MIN) return 'رمز عبور باید دست‌کم ۸ نویسه باشد.';
      if (value.length > PASSWORD_MAX) return 'رمز عبور خیلی بلند است.';
      return null;
    case 'confirm':
      if (!value) return 'رمز عبور را یک بار دیگر بنویسید.';
      if (value !== values.password) return 'تکرار رمز با رمز عبور یکی نیست.';
      return null;
  }
}

export function checkAll(values: Values, mode: Mode): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  for (const field of FIELDS[mode]) {
    const message = check(field, values, mode);
    if (message) errors[field] = message;
  }
  return errors;
}

/** 0 (nothing yet) to 4: a rough reading of how hard a password is to guess */
export function strength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  if (password.length < PASSWORD_MIN) return 1;
  let kinds = 0;
  if (/[a-z؀-ۿ]/.test(password)) kinds++;
  if (/[A-Z]/.test(password)) kinds++;
  if (/\d/.test(password)) kinds++;
  if (/[^\w\s؀-ۿ]/.test(password)) kinds++;
  const score = 1 + (kinds >= 2 ? 1 : 0) + (kinds >= 3 ? 1 : 0) + (password.length >= 12 ? 1 : 0);
  return Math.min(4, score) as 1 | 2 | 3 | 4;
}

export const STRENGTH_LABELS = ['', 'ضعیف', 'متوسط', 'خوب', 'قوی'] as const;

/**
 * Where to go after signing in. Only a path on this site is accepted, so a
 * crafted link cannot send a visitor somewhere else with their session.
 */
export function safeNext(next: unknown, fallback = '/account'): string {
  const path = Array.isArray(next) ? next[0] : next;
  if (typeof path !== 'string' || !/^\/(?![/\\])/.test(path) || /[\r\n]/.test(path)) return fallback;
  return path;
}
