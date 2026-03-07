import fs from "fs";
import path from "path";
import type { ConnectionConfig, EnvEntry } from "./types";

const ENV_PATH = path.join(process.cwd(), ".env.local");

export function readEnvFile(): Record<string, string> {
  try {
    const content = fs.readFileSync(ENV_PATH, "utf-8");
    const result: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function writeEnvFile(vars: Record<string, string>): void {
  let existing: Record<string, string> = {};
  let existingContent = "";

  try {
    existingContent = fs.readFileSync(ENV_PATH, "utf-8");
    existing = readEnvFile();
  } catch {
    // File doesn't exist yet — start fresh
  }

  const merged = { ...existing, ...vars };

  // Rebuild file preserving comments, updating known keys
  const lines = existingContent ? existingContent.split("\n") : [];
  const writtenKeys = new Set<string>();
  const updatedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      updatedLines.push(line);
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      updatedLines.push(line);
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    if (key in merged) {
      updatedLines.push(`${key}=${merged[key]}`);
      writtenKeys.add(key);
    } else {
      updatedLines.push(line);
    }
  }

  // Append any new keys not already in the file
  for (const [key, value] of Object.entries(merged)) {
    if (!writtenKeys.has(key)) {
      updatedLines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(ENV_PATH, updatedLines.join("\n"), "utf-8");
}

export function getConnectionConfig(): ConnectionConfig {
  const env = readEnvFile();
  return {
    managementUrl: env.RABBITMQ_MANAGEMENT_URL ?? process.env.RABBITMQ_MANAGEMENT_URL ?? "http://localhost:15672",
    amqpPort: env.RABBITMQ_AMQP_PORT ?? process.env.RABBITMQ_AMQP_PORT ?? "5672",
    user: env.RABBITMQ_USER ?? process.env.RABBITMQ_USER ?? "guest",
    password: env.RABBITMQ_PASSWORD ?? process.env.RABBITMQ_PASSWORD ?? "guest",
    vhost: env.RABBITMQ_VHOST ?? process.env.RABBITMQ_VHOST ?? "/",
  };
}

const ENVS_DIR = path.join(process.cwd(), ".envs");
const SYMLINK_PATH = path.join(process.cwd(), ".env.local");
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function validateSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

function envFilePath(slug: string): string {
  return path.join(ENVS_DIR, `${slug}.env`);
}

function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    result[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
  }
  return result;
}

function serializeEnv(entry: EnvEntry): string {
  return [
    `RABBITMQ_MANAGEMENT_URL=${entry.managementUrl}`,
    `RABBITMQ_AMQP_PORT=${entry.amqpPort}`,
    `RABBITMQ_USER=${entry.user}`,
    `RABBITMQ_PASSWORD=${entry.password}`,
    `RABBITMQ_VHOST=${entry.vhost}`,
    `RASK_ENV_NAME=${entry.name}`,
  ].join("\n");
}

export function getActiveSlug(): string | null {
  try {
    const target = fs.readlinkSync(SYMLINK_PATH);
    const basename = path.basename(target, ".env");
    return basename || null;
  } catch {
    return null;
  }
}

export function listEnvs(): EnvEntry[] {
  try {
    fs.mkdirSync(ENVS_DIR, { recursive: true });
    const files = fs.readdirSync(ENVS_DIR).filter((f) => f.endsWith(".env"));
    return files.map((file) => {
      const slug = path.basename(file, ".env");
      const content = fs.readFileSync(path.join(ENVS_DIR, file), "utf-8");
      const vars = parseEnvContent(content);
      return {
        slug,
        name: vars.RASK_ENV_NAME ?? slug,
        managementUrl: vars.RABBITMQ_MANAGEMENT_URL ?? "http://localhost:15672",
        amqpPort: vars.RABBITMQ_AMQP_PORT ?? "5672",
        user: vars.RABBITMQ_USER ?? "guest",
        password: vars.RABBITMQ_PASSWORD ?? "guest",
        vhost: vars.RABBITMQ_VHOST ?? "/",
      };
    });
  } catch {
    return [];
  }
}

export function createEnv(entry: EnvEntry): void {
  fs.mkdirSync(ENVS_DIR, { recursive: true });
  fs.writeFileSync(envFilePath(entry.slug), serializeEnv(entry), "utf-8");
}

export function updateEnv(slug: string, entry: EnvEntry): void {
  fs.writeFileSync(envFilePath(slug), serializeEnv(entry), "utf-8");
}

export function deleteEnv(slug: string): void {
  const filePath = envFilePath(slug);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  if (getActiveSlug() === slug) {
    try { fs.unlinkSync(SYMLINK_PATH); } catch { /* already gone */ }
  }
}

export function activateEnv(slug: string): void {
  const target = envFilePath(slug);
  if (!fs.existsSync(target)) throw new Error(`Env not found: ${slug}`);
  try { fs.unlinkSync(SYMLINK_PATH); } catch { /* doesn't exist */ }
  fs.symlinkSync(target, SYMLINK_PATH);
}
