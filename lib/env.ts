import crypto from "crypto";
import { mkdirSync } from "fs";
import path from "path";
import Database from "better-sqlite3";
import type { ConnectionConfig, EnvEntry } from "./types";

// ── Storage path ──────────────────────────────────────────────────────────────

const DATA_DIR = process.env.RASK_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "rask.db");

// ── Encryption (optional) ─────────────────────────────────────────────────────

function getEncryptionKey(): Buffer | null {
  const raw = process.env.STORAGE_ENCRYPTION_KEY;
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

function decrypt(data: string, key: Buffer): string {
  const [ivB64, tagB64, encB64] = data.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function encodeData(data: string): string {
  const key = getEncryptionKey();
  return key ? encrypt(data, key) : data;
}

function decodeData(data: string): string {
  const key = getEncryptionKey();
  return key ? decrypt(data, key) : data;
}

// ── DB singleton ──────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;

  mkdirSync(DATA_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS envs (
      slug TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default env if DB is empty, using process.env so Docker overrides work
  const count = (_db.prepare("SELECT COUNT(*) as n FROM envs").get() as { n: number }).n;
  if (count === 0) {
    const host = process.env.RABBITMQ_HOST ?? "localhost";
    const mgmtPort = process.env.RABBITMQ_MANAGEMENT_PORT ?? "15672";
    const defaults: EnvEntry = {
      slug: "localhost",
      name: "Localhost",
      managementUrl: process.env.RABBITMQ_MANAGEMENT_URL ?? `http://${host}:${mgmtPort}`,
      amqpPort: process.env.RABBITMQ_AMQP_PORT ?? "5672",
      user: process.env.RABBITMQ_USER ?? "guest",
      password: process.env.RABBITMQ_PASSWORD ?? "guest",
      vhost: process.env.RABBITMQ_VHOST ?? "/",
    };
    _db
      .prepare("INSERT INTO envs (slug, data) VALUES (?, ?)")
      .run(defaults.slug, encodeData(JSON.stringify(defaults)));
    _db
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_slug', ?)")
      .run(defaults.slug);
  }

  return _db;
}

// ── Slug validation ───────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function validateSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

// ── Env CRUD ──────────────────────────────────────────────────────────────────

function entryToRow(entry: EnvEntry): string {
  return encodeData(JSON.stringify(entry));
}

function rowToEntry(slug: string, data: string): EnvEntry {
  const parsed = JSON.parse(decodeData(data));
  return { slug, ...parsed };
}

export function listEnvs(): EnvEntry[] {
  const rows = db().prepare("SELECT slug, data FROM envs ORDER BY rowid").all() as {
    slug: string;
    data: string;
  }[];
  return rows.map((r) => rowToEntry(r.slug, r.data));
}

export function createEnv(entry: EnvEntry): void {
  db().prepare("INSERT INTO envs (slug, data) VALUES (?, ?)").run(entry.slug, entryToRow(entry));
}

export function updateEnv(slug: string, entry: EnvEntry): void {
  db().prepare("UPDATE envs SET data = ? WHERE slug = ?").run(entryToRow(entry), slug);
}

export function deleteEnv(slug: string): void {
  db().prepare("DELETE FROM envs WHERE slug = ?").run(slug);
  if (getActiveSlug() === slug) {
    db().prepare("DELETE FROM settings WHERE key = 'active_slug'").run();
  }
}

export function getActiveSlug(): string | null {
  const row = db()
    .prepare("SELECT value FROM settings WHERE key = 'active_slug'")
    .get() as { value: string } | undefined;
  return row?.value ?? null;
}

export function activateEnv(slug: string): void {
  const exists = db().prepare("SELECT 1 FROM envs WHERE slug = ?").get(slug);
  if (!exists) throw new Error(`Env not found: ${slug}`);
  db()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_slug', ?)")
    .run(slug);
}

// ── Connection config ─────────────────────────────────────────────────────────

export function getConnectionConfig(): ConnectionConfig {
  const slug = getActiveSlug();
  if (slug) {
    const row = db().prepare("SELECT data FROM envs WHERE slug = ?").get(slug) as
      | { data: string }
      | undefined;
    if (row) {
      const entry = rowToEntry(slug, row.data);
      return {
        managementUrl: entry.managementUrl,
        amqpPort: entry.amqpPort,
        user: entry.user,
        password: entry.password,
        vhost: entry.vhost,
      };
    }
  }

  // Fall back to process.env (e.g. Docker compose env vars)
  return {
    managementUrl: process.env.RABBITMQ_MANAGEMENT_URL ?? "http://localhost:15672",
    amqpPort: process.env.RABBITMQ_AMQP_PORT ?? "5672",
    user: process.env.RABBITMQ_USER ?? "guest",
    password: process.env.RABBITMQ_PASSWORD ?? "guest",
    vhost: process.env.RABBITMQ_VHOST ?? "/",
  };
}

// ── Legacy helpers (used by /api/settings) ────────────────────────────────────
// These proxy through the active env in SQLite.

export function readEnvFile(): Record<string, string> {
  const config = getConnectionConfig();
  return {
    RABBITMQ_MANAGEMENT_URL: config.managementUrl,
    RABBITMQ_AMQP_PORT: config.amqpPort,
    RABBITMQ_USER: config.user,
    RABBITMQ_PASSWORD: config.password,
    RABBITMQ_VHOST: config.vhost,
  };
}

export function writeEnvFile(vars: Record<string, string>): void {
  const slug = getActiveSlug();
  if (!slug) return;

  const row = db().prepare("SELECT data FROM envs WHERE slug = ?").get(slug) as
    | { data: string }
    | undefined;
  if (!row) return;

  const entry = rowToEntry(slug, row.data);
  updateEnv(slug, {
    ...entry,
    managementUrl: vars.RABBITMQ_MANAGEMENT_URL ?? entry.managementUrl,
    amqpPort: vars.RABBITMQ_AMQP_PORT ?? entry.amqpPort,
    user: vars.RABBITMQ_USER ?? entry.user,
    password: vars.RABBITMQ_PASSWORD ?? entry.password,
    vhost: vars.RABBITMQ_VHOST ?? entry.vhost,
  });
}
