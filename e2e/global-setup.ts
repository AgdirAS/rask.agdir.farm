import fs from "fs";
import path from "path";

// process.cwd() is the playwright project root (the worktree directory)
// The standalone server process.chdir()'s to its own directory on start.
const STANDALONE_DIR = path.resolve(
  process.cwd(),
  ".next",
  "standalone"
);

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return result;
}

export default async function globalSetup() {
  // Locate credentials — check worktree root first, then main repo root (2 levels up)
  const envCandidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", "..", ".env.local"),
  ];
  const srcEnvPath = envCandidates.find(fs.existsSync);
  const creds = srcEnvPath ? parseEnvFile(srcEnvPath) : {};

  const envsDir = path.join(STANDALONE_DIR, ".envs");
  const envFilePath = path.join(envsDir, "e2e-test.env");
  const symlinkPath = path.join(STANDALONE_DIR, ".env.local");

  // Write (or overwrite) the e2e-test.env with the correct credentials
  fs.mkdirSync(envsDir, { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      `RABBITMQ_HOST=${creds.RABBITMQ_HOST ?? process.env.RABBITMQ_HOST ?? "localhost"}`,
      `RABBITMQ_MANAGEMENT_PORT=${creds.RABBITMQ_MANAGEMENT_PORT ?? process.env.RABBITMQ_MANAGEMENT_PORT ?? "15672"}`,
      `RABBITMQ_AMQP_PORT=${creds.RABBITMQ_AMQP_PORT ?? process.env.RABBITMQ_AMQP_PORT ?? "5672"}`,
      `RABBITMQ_USER=${creds.RABBITMQ_USER ?? process.env.RABBITMQ_USER ?? "guest"}`,
      `RABBITMQ_PASSWORD=${creds.RABBITMQ_PASSWORD ?? process.env.RABBITMQ_PASSWORD ?? "guest"}`,
      `RABBITMQ_VHOST=${creds.RABBITMQ_VHOST ?? process.env.RABBITMQ_VHOST ?? "/"}`,
      `RASK_ENV_NAME=E2E Test`,
    ].join("\n"),
    "utf-8"
  );

  // Ensure .env.local in the standalone dir points to our env file
  try { fs.unlinkSync(symlinkPath); } catch { /* ok if missing */ }
  fs.symlinkSync(envFilePath, symlinkPath);
}
