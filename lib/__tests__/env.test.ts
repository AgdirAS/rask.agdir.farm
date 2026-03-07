import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// We need to test env.ts functions. Since they rely on process.cwd(), we'll
// import the functions directly and spy on fs operations.

describe("validateSlug", () => {
  it("accepts valid slugs", async () => {
    const { validateSlug } = await import("../env");
    expect(validateSlug("local")).toBe(true);
    expect(validateSlug("prod-eu")).toBe(true);
    expect(validateSlug("staging_1")).toBe(true);
    expect(validateSlug("my-env-2")).toBe(true);
  });

  it("rejects invalid slugs (path traversal, spaces, uppercase)", async () => {
    const { validateSlug } = await import("../env");
    expect(validateSlug("../etc/passwd")).toBe(false);
    expect(validateSlug("../../secret")).toBe(false);
    expect(validateSlug("my env")).toBe(false);
    expect(validateSlug("MyEnv")).toBe(false);
    expect(validateSlug("-invalid")).toBe(false);
    expect(validateSlug("")).toBe(false);
  });
});

describe("readEnvFile / writeEnvFile", () => {
  let tmpDir: string;
  let envPath: string;
  let originalCwd: () => string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rask-test-"));
    envPath = path.join(tmpDir, ".env.local");
    // Override process.cwd to point at tmpDir so env.ts uses our temp file
    originalCwd = process.cwd.bind(process);
    process.cwd = () => tmpDir;
  });

  afterEach(() => {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Reset module cache so next test gets fresh module
    vi.resetModules();
  });

  it("returns empty object when file does not exist", async () => {
    const { readEnvFile } = await import("../env");
    expect(readEnvFile()).toEqual({});
  });

  it("parses key=value pairs, ignoring comments and blanks", async () => {
    fs.writeFileSync(
      envPath,
      `# This is a comment\nRABBITMQ_HOST=localhost\n\nRABBITMQ_USER=guest\n`,
    );
    const { readEnvFile } = await import("../env");
    const result = readEnvFile();
    expect(result.RABBITMQ_HOST).toBe("localhost");
    expect(result.RABBITMQ_USER).toBe("guest");
    expect(Object.keys(result)).not.toContain("# This is a comment");
  });

  it("writeEnvFile creates file with given vars", async () => {
    const { writeEnvFile, readEnvFile } = await import("../env");
    writeEnvFile({ RABBITMQ_HOST: "myhost", RABBITMQ_USER: "admin" });
    const result = readEnvFile();
    expect(result.RABBITMQ_HOST).toBe("myhost");
    expect(result.RABBITMQ_USER).toBe("admin");
  });

  it("writeEnvFile merges with existing values", async () => {
    fs.writeFileSync(envPath, `RABBITMQ_HOST=oldhost\nRABBITMQ_USER=guest\n`);
    const { writeEnvFile, readEnvFile } = await import("../env");
    writeEnvFile({ RABBITMQ_HOST: "newhost" });
    const result = readEnvFile();
    expect(result.RABBITMQ_HOST).toBe("newhost");
    expect(result.RABBITMQ_USER).toBe("guest");
  });
});

// Need vi for resetModules
import { vi } from "vitest";
