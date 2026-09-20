import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
}

export interface StateRow {
  user_id: number;
  /** Estado de la app serializado tal cual lo genera el cliente. */
  payload: string;
  /** Contador que sube en cada escritura; evita pisar cambios más nuevos. */
  revision: number;
  updated_at: number;
}

/**
 * Abre (y crea si hace falta) la base de datos. Se usa SQLite porque para una
 * app personal un fichero basta: la copia de seguridad es copiar ese fichero.
 */
export function openDatabase(file: string): Database.Database {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db = new Database(file);
  // WAL permite leer mientras se escribe; con el modo por defecto una escritura
  // bloquearía al resto de peticiones.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL,
      password_hash TEXT    NOT NULL,
      created_at    INTEGER NOT NULL
    );

    -- El nombre de usuario no distingue mayúsculas: "Enrique" y "enrique" son
    -- la misma cuenta, para que nadie se registre dos veces sin darse cuenta.
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique
      ON users (lower(username));

    CREATE TABLE IF NOT EXISTS states (
      user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload    TEXT    NOT NULL,
      revision   INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );
  `);

  return db;
}

export function findUserByUsername(db: Database.Database, username: string): UserRow | undefined {
  return db
    .prepare('SELECT * FROM users WHERE lower(username) = lower(?)')
    .get(username) as UserRow | undefined;
}

export function findUserById(db: Database.Database, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function createUser(
  db: Database.Database,
  username: string,
  passwordHash: string,
  now = Date.now(),
): UserRow {
  const info = db
    .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, passwordHash, now);
  return findUserById(db, Number(info.lastInsertRowid))!;
}

export function getState(db: Database.Database, userId: number): StateRow | undefined {
  return db.prepare('SELECT * FROM states WHERE user_id = ?').get(userId) as StateRow | undefined;
}

/**
 * Guarda el estado del usuario y devuelve la revisión resultante. Cada
 * escritura incrementa la revisión, que el cliente usa para detectar que otro
 * dispositivo subió algo más nuevo.
 */
export function putState(
  db: Database.Database,
  userId: number,
  payload: string,
  now = Date.now(),
): StateRow {
  db.prepare(
    `INSERT INTO states (user_id, payload, revision, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       payload    = excluded.payload,
       revision   = states.revision + 1,
       updated_at = excluded.updated_at`,
  ).run(userId, payload, now);
  return getState(db, userId)!;
}

export function deleteUser(db: Database.Database, userId: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}
