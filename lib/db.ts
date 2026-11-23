/**
 * THE DATABASE — one SQLite file, opened once per server process.
 *
 * It uses the SQLite that ships inside Node (`node:sqlite`, Node 22.13 or
 * later), so there is nothing native to install or build. The file lives at
 * `data/nafis.db` beside the project unless `NAFIS_DB` points somewhere else;
 * `data/` is git-ignored, because it holds accounts.
 *
 *   users            who has an account. Email is the identity (compared
 *                    without regard to case); the password is kept only as a
 *                    salted scrypt hash (lib/auth.ts). Province and city are
 *                    chosen from lib/geo.ts at sign-up; accounts made before
 *                    those were asked for have them empty.
 *   sessions         who is signed in. Only the SHA-256 of each session token
 *                    is stored, so a copy of this file is not a set of keys.
 *   login_attempts   failed sign-ins, kept for a quarter of an hour, to slow
 *                    down guessing at one account.
 *
 * Every query in the project is a prepared statement with bound values.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const FILE = process.env.NAFIS_DB ?? path.join(process.cwd(), 'data', 'nafis.db');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

  CREATE TABLE IF NOT EXISTS login_attempts (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT    NOT NULL COLLATE NOCASE,
    at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS login_attempts_email ON login_attempts (email, at);
`;

/** columns added after the first release: CREATE TABLE IF NOT EXISTS will not add them to an existing file */
const LATER_COLUMNS: readonly { table: string; column: string; type: string }[] = [
  { table: 'users', column: 'province', type: 'TEXT' },
  { table: 'users', column: 'city', type: 'TEXT' },
];

function open() {
  mkdirSync(path.dirname(FILE), { recursive: true });
  const database = new DatabaseSync(FILE);
  // WAL: readers never wait on the writer. Foreign keys are off in SQLite until asked for.
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;');
  database.exec(SCHEMA);
  for (const { table, column, type } of LATER_COLUMNS) {
    const present = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!present.some((existing) => existing.name === column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
  return database;
}

// In development the module is evaluated again on every edit; the connection must not be.
const held = globalThis as typeof globalThis & { __nafisDb?: DatabaseSync };

/** The connection, opened (and the tables made) the first time anything asks for it. */
export function db(): DatabaseSync {
  return (held.__nafisDb ??= open());
}
