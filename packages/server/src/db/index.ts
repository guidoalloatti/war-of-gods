import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', '..', 'data', 'wog.db');

// Ensure data directory exists
import fs from 'node:fs';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// ── Schema migration ────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    picture     TEXT DEFAULT '',
    password_hash TEXT,
    google_id   TEXT UNIQUE,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saved_games (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_mode   TEXT NOT NULL,
    game_state  TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS cards (
    id              TEXT PRIMARY KEY,
    card_type       TEXT NOT NULL,
    name            TEXT NOT NULL,
    name_en         TEXT NOT NULL DEFAULT '',
    flavor_text     TEXT NOT NULL DEFAULT '',
    flavor_text_en  TEXT NOT NULL DEFAULT '',
    mechanical_text TEXT NOT NULL DEFAULT '',
    mechanical_text_en TEXT NOT NULL DEFAULT '',
    effects         TEXT NOT NULL DEFAULT '[]',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS migrations (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS multiplayer_rooms (
    code        TEXT PRIMARY KEY,
    host_user_id TEXT,
    game_state  TEXT NOT NULL,
    player_map  TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_saved_games_user ON saved_games(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
`);

// ── Add role column if missing (migration) ─────────────────────
const userCols = db.pragma('table_info(users)') as Array<{ name: string }>;
if (!userCols.some(c => c.name === 'role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}

// ── Promote admin users ────────────────────────────────────────
const ADMIN_EMAILS = ['guidoalloatti@gmail.com'];
const stmtPromoteAdmin = db.prepare("UPDATE users SET role = 'admin' WHERE email = ? AND role != 'admin'");
for (const email of ADMIN_EMAILS) {
  stmtPromoteAdmin.run(email);
}

// Run card seed migration
import { seedCards } from './seed.js';
seedCards(db);

// db is not exported — consumers use the query functions below

// ── User queries ────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  password_hash: string | null;
  google_id: string | null;
  role: string;
  created_at: number;
}

const stmtFindUserByEmail = db.prepare<{ email: string }, DbUser>(
  'SELECT * FROM users WHERE email = @email',
);
const stmtFindUserByGoogleId = db.prepare<{ google_id: string }, DbUser>(
  'SELECT * FROM users WHERE google_id = @google_id',
);
const stmtFindUserById = db.prepare<{ id: string }, DbUser>(
  'SELECT * FROM users WHERE id = @id',
);
const stmtInsertUser = db.prepare<DbUser>(
  'INSERT INTO users (id, email, name, picture, password_hash, google_id, created_at) VALUES (@id, @email, @name, @picture, @password_hash, @google_id, @created_at)',
);
const stmtUpdateUserGoogle = db.prepare<{ id: string; name: string; picture: string }>(
  'UPDATE users SET name = @name, picture = @picture WHERE id = @id',
);

export function findUserByEmail(email: string): DbUser | undefined {
  return stmtFindUserByEmail.get({ email });
}

export function findUserByGoogleId(googleId: string): DbUser | undefined {
  return stmtFindUserByGoogleId.get({ google_id: googleId });
}

export function findUserById(id: string): DbUser | undefined {
  return stmtFindUserById.get({ id });
}

export function insertUser(user: DbUser): void {
  stmtInsertUser.run(user);
}

export function updateUserGoogle(id: string, name: string, picture: string): void {
  stmtUpdateUserGoogle.run({ id, name, picture });
}

// ── Session queries ─────────────────────────────────────────────

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

const stmtInsertSession = db.prepare<{ id: string; user_id: string; expires_at: number }>(
  'INSERT INTO sessions (id, user_id, expires_at) VALUES (@id, @user_id, @expires_at)',
);
const stmtFindSession = db.prepare<{ id: string }, { id: string; user_id: string; expires_at: number }>(
  'SELECT * FROM sessions WHERE id = @id AND expires_at > unixepoch()',
);
const stmtDeleteSession = db.prepare<{ id: string }>(
  'DELETE FROM sessions WHERE id = @id',
);
const stmtCleanExpiredSessions = db.prepare(
  'DELETE FROM sessions WHERE expires_at <= unixepoch()',
);

export function createSession(token: string, userId: string): void {
  stmtInsertSession.run({ id: token, user_id: userId, expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL });
}

export function findSession(token: string): { user_id: string } | undefined {
  return stmtFindSession.get({ id: token });
}

export function deleteSession(token: string): void {
  stmtDeleteSession.run({ id: token });
}

export function cleanExpiredSessions(): void {
  stmtCleanExpiredSessions.run();
}

// Clean expired sessions every 30 minutes
setInterval(cleanExpiredSessions, 30 * 60 * 1000);

// ── Saved game queries ──────────────────────────────────────────

export interface DbSavedGame {
  id: string;
  user_id: string;
  game_mode: string;
  game_state: string;
  created_at: number;
  updated_at: number;
}

const stmtUpsertSavedGame = db.prepare<DbSavedGame>(
  `INSERT INTO saved_games (id, user_id, game_mode, game_state, created_at, updated_at)
   VALUES (@id, @user_id, @game_mode, @game_state, @created_at, @updated_at)
   ON CONFLICT(id) DO UPDATE SET game_state = @game_state, updated_at = @updated_at`,
);
const stmtFindSavedGames = db.prepare<{ user_id: string }, DbSavedGame>(
  'SELECT * FROM saved_games WHERE user_id = @user_id ORDER BY updated_at DESC LIMIT 10',
);
const stmtFindSavedGame = db.prepare<{ id: string; user_id: string }, DbSavedGame>(
  'SELECT * FROM saved_games WHERE id = @id AND user_id = @user_id',
);
const stmtDeleteSavedGame = db.prepare<{ id: string; user_id: string }>(
  'DELETE FROM saved_games WHERE id = @id AND user_id = @user_id',
);

export function upsertSavedGame(game: DbSavedGame): void {
  stmtUpsertSavedGame.run(game);
}

export function findSavedGames(userId: string): DbSavedGame[] {
  return stmtFindSavedGames.all({ user_id: userId });
}

export function findSavedGame(id: string, userId: string): DbSavedGame | undefined {
  return stmtFindSavedGame.get({ id, user_id: userId });
}

export function deleteSavedGame(id: string, userId: string): void {
  stmtDeleteSavedGame.run({ id, user_id: userId });
}

// ── Multiplayer room queries ───────────────────────────────────

export interface DbRoom {
  code: string;
  host_user_id: string | null;
  game_state: string;
  player_map: string;
  created_at: number;
  updated_at: number;
}

const stmtUpsertRoom = db.prepare<DbRoom>(
  `INSERT INTO multiplayer_rooms (code, host_user_id, game_state, player_map, created_at, updated_at)
   VALUES (@code, @host_user_id, @game_state, @player_map, @created_at, @updated_at)
   ON CONFLICT(code) DO UPDATE SET game_state = @game_state, player_map = @player_map, updated_at = @updated_at`,
);
const stmtFindAllActiveRooms = db.prepare<[], DbRoom>(
  'SELECT * FROM multiplayer_rooms WHERE updated_at > unixepoch() - 7200 ORDER BY updated_at DESC',
);
const stmtDeleteRoom = db.prepare<{ code: string }>(
  'DELETE FROM multiplayer_rooms WHERE code = @code',
);
const stmtDeleteStaleRooms = db.prepare(
  'DELETE FROM multiplayer_rooms WHERE updated_at <= unixepoch() - 7200',
);

export function upsertRoom(room: DbRoom): void {
  stmtUpsertRoom.run(room);
}

export function findAllActiveRooms(): DbRoom[] {
  return stmtFindAllActiveRooms.all();
}

export function deleteRoom(code: string): void {
  stmtDeleteRoom.run({ code });
}

export function deleteStaleRooms(): void {
  stmtDeleteStaleRooms.run();
}

// ── Card queries ───────────��───────────────────────────────────

export interface DbCard {
  id: string;
  card_type: string;
  name: string;
  name_en: string;
  flavor_text: string;
  flavor_text_en: string;
  mechanical_text: string;
  mechanical_text_en: string;
  effects: string;
  sort_order: number;
  active: number;
  created_at: number;
  updated_at: number;
}

const stmtListCards = db.prepare<[], DbCard>(
  'SELECT * FROM cards ORDER BY card_type, sort_order',
);
const stmtListCardsByType = db.prepare<{ card_type: string }, DbCard>(
  'SELECT * FROM cards WHERE card_type = @card_type ORDER BY sort_order',
);
const stmtFindCard = db.prepare<{ id: string }, DbCard>(
  'SELECT * FROM cards WHERE id = @id',
);
const stmtInsertCard = db.prepare<DbCard>(
  `INSERT INTO cards (id, card_type, name, name_en, flavor_text, flavor_text_en, mechanical_text, mechanical_text_en, effects, sort_order, active, created_at, updated_at)
   VALUES (@id, @card_type, @name, @name_en, @flavor_text, @flavor_text_en, @mechanical_text, @mechanical_text_en, @effects, @sort_order, @active, @created_at, @updated_at)`,
);
const stmtUpdateCard = db.prepare(`
  UPDATE cards SET
    card_type = @card_type, name = @name, name_en = @name_en,
    flavor_text = @flavor_text, flavor_text_en = @flavor_text_en,
    mechanical_text = @mechanical_text, mechanical_text_en = @mechanical_text_en,
    effects = @effects, sort_order = @sort_order, active = @active,
    updated_at = @updated_at
  WHERE id = @id
`);
const stmtSoftDeleteCard = db.prepare<{ id: string; updated_at: number }>(
  'UPDATE cards SET active = 0, updated_at = @updated_at WHERE id = @id',
);

export function listCards(type?: string): DbCard[] {
  if (type) return stmtListCardsByType.all({ card_type: type });
  return stmtListCards.all();
}

export function findCard(id: string): DbCard | undefined {
  return stmtFindCard.get({ id });
}

export function insertCard(card: DbCard): void {
  stmtInsertCard.run(card);
}

export function updateCard(card: Partial<DbCard> & { id: string }): void {
  const existing = findCard(card.id);
  if (!existing) throw new Error(`Card not found: ${card.id}`);
  stmtUpdateCard.run({
    ...existing,
    ...card,
    updated_at: Math.floor(Date.now() / 1000),
  });
}

export function softDeleteCard(id: string): void {
  stmtSoftDeleteCard.run({ id, updated_at: Math.floor(Date.now() / 1000) });
}

export function getCardStats(): Record<string, number> {
  const rows = db.prepare('SELECT card_type, COUNT(*) as count FROM cards WHERE active = 1 GROUP BY card_type').all() as Array<{ card_type: string; count: number }>;
  const stats: Record<string, number> = {};
  for (const row of rows) {
    stats[row.card_type] = row.count;
  }
  return stats;
}
