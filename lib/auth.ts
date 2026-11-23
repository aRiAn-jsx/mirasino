/**
 * ACCOUNTS AND SESSIONS — server only.
 *
 *   Passwords   scrypt, a random 16-byte salt each, compared in constant time.
 *               The cost is OWASP's setting in production and lighter in
 *               development, where the machine is slower and the accounts are
 *               not real. It is stored with each hash, and a hash made at a
 *               lower cost is quietly redone at the current one the next time
 *               its owner signs in — so the cost can be raised at any time.
 *   Sessions    a random 256-bit token in an HttpOnly, SameSite=Lax cookie
 *               (Secure in production). The database holds its SHA-256 only.
 *               "Remember me" keeps it thirty days; otherwise it ends with the
 *               browser and is refused after a day in any case.
 *   Guessing    eight failed sign-ins for one email inside fifteen minutes
 *               close that email until the window has passed. A sign-in for an
 *               email with no account costs the same time as a wrong password,
 *               and gets the same answer.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { db } from './db';

const COOKIE = 'nafis_session';
const DAY = 24 * 60 * 60;
const REMEMBERED = 30 * DAY;
const BRIEF = DAY;

const ATTEMPT_WINDOW = 15 * 60;
const ATTEMPT_LIMIT = 8;

const now = () => Math.floor(Date.now() / 1000);
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export interface User {
  id: number;
  name: string;
  email: string;
  /** seconds since the epoch */
  createdAt: number;
}

/* ---------------------------------------------------------------- passwords */

type Cost = { logN: number; r: number; p: number };
/** production: N = 2^15, r = 8, p = 3 — 32 MiB a hash, three passes (OWASP's scrypt guidance) */
const COST: Cost = process.env.NODE_ENV === 'production' ? { logN: 15, r: 8, p: 3 } : { logN: 14, r: 8, p: 1 };
const KEY_BYTES = 32;

function derive(password: string, salt: Buffer, cost: Cost): Promise<Buffer> {
  const options: ScryptOptions = { N: 2 ** cost.logN, r: cost.r, p: cost.p, maxmem: 256 * 2 ** cost.logN * cost.r };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_BYTES, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return ['scrypt', COST.logN, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$');
}

function parse(stored: string) {
  const [scheme, logN, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return null;
  const expected = Buffer.from(key, 'base64');
  const cost: Cost = { logN: Number(logN), r: Number(r), p: Number(p) };
  if (!(cost.logN >= 10 && cost.logN <= 20 && cost.r > 0 && cost.p > 0) || expected.length !== KEY_BYTES) return null;
  return { cost, salt: Buffer.from(salt, 'base64'), expected };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const hash = parse(stored);
  if (!hash) return false;
  return timingSafeEqual(await derive(password, hash.salt, hash.cost), hash.expected);
}

/** was this hash made at a lower cost than today's? */
function outdated(stored: string): boolean {
  const cost = parse(stored)?.cost;
  return !cost || cost.logN < COST.logN || cost.r < COST.r || cost.p < COST.p;
}

/** a hash nobody's password matches, so "no such account" takes as long as "wrong password" */
let decoy: Promise<string> | null = null;
const decoyHash = () => (decoy ??= hashPassword(randomBytes(24).toString('base64')));

/* ----------------------------------------------------------------- accounts */

export function emailTaken(email: string): boolean {
  return db().prepare('SELECT 1 FROM users WHERE email = ?').get(email) !== undefined;
}

/** returns the new account's id, or null if the email already has one */
export async function createUser(
  name: string,
  email: string,
  password: string,
  province: string,
  city: string,
): Promise<number | null> {
  const hash = await hashPassword(password);
  try {
    const result = db()
      .prepare('INSERT INTO users (name, email, password_hash, province, city, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, email, hash, province, city, now());
    return Number(result.lastInsertRowid);
  } catch (error) {
    // two registrations for one email at the same moment: the second loses
    if (error instanceof Error && /UNIQUE/i.test(error.message)) return null;
    throw error;
  }
}

/** the account for this email and password, or null — never which of the two was wrong */
export async function authenticate(email: string, password: string): Promise<number | null> {
  const row = db().prepare('SELECT id, password_hash AS hash FROM users WHERE email = ?').get(email) as
    | { id: number; hash: string }
    | undefined;
  const ok = await verifyPassword(password, row?.hash ?? (await decoyHash()));
  if (!row || !ok) return null;
  // the one moment the password is in hand: bring an older hash up to today's cost
  if (outdated(row.hash)) {
    db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), row.id);
  }
  return row.id;
}

/* ----------------------------------------------------------------- guessing */

export function tooManyAttempts(email: string): boolean {
  const row = db()
    .prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND at > ?')
    .get(email, now() - ATTEMPT_WINDOW) as { n: number };
  return row.n >= ATTEMPT_LIMIT;
}

export function noteFailedAttempt(email: string) {
  const database = db();
  database.prepare('DELETE FROM login_attempts WHERE at <= ?').run(now() - ATTEMPT_WINDOW);
  database.prepare('INSERT INTO login_attempts (email, at) VALUES (?, ?)').run(email, now());
}

export function clearAttempts(email: string) {
  db().prepare('DELETE FROM login_attempts WHERE email = ?').run(email);
}

/* ----------------------------------------------------------------- sessions */

export async function startSession(userId: number, remember: boolean) {
  const token = randomBytes(32).toString('base64url');
  const life = remember ? REMEMBERED : BRIEF;
  const database = db();
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
  database
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(digest(token), userId, now(), now() + life);

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // without "remember me" the cookie goes when the browser closes
    ...(remember ? { maxAge: life } : {}),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  jar.delete(COOKIE);
}

/** Who is signed in on this request, if anyone. Read once per request however often it is asked. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.name, u.email, u.created_at AS createdAt
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(digest(token), now()) as User | undefined;
  return row ? { id: Number(row.id), name: row.name, email: row.email, createdAt: Number(row.createdAt) } : null;
});
