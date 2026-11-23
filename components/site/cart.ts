'use client';

/**
 * The cart: a list of rug ids in localStorage. Every piece is one of a kind,
 * so there are no quantities — a rug is either in the cart or it is not.
 *
 * Components read it through `useCart()`; writes broadcast an event so the
 * header badge, the buy button and the cart page stay in step, and the
 * `storage` event keeps other tabs honest.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'nafis.cart.v1';
const EVENT = 'nafis:cart';
const EMPTY: string[] = [];

let cache: string[] | null = null;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function snapshot(): string[] {
  if (cache === null) cache = read();
  return cache;
}

function write(next: string[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: the cart simply lasts for this page */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    cache = null;
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export const cart = {
  add(id: string) {
    const items = snapshot();
    if (!items.includes(id)) write([...items, id]);
  },
  remove(id: string) {
    write(snapshot().filter((x) => x !== id));
  },
  clear() {
    write([]);
  },
};

export function useCart(): string[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** ۰۱۲۳۴۵۶۷۸۹ */
export const faDigits = (value: number | string) => String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
