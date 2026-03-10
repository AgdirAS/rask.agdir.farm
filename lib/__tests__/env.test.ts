import { describe, it, expect, beforeEach, vi } from "vitest";
import os from "os";
import path from "path";

// Point each test at a fresh temp directory so tests don't share state
beforeEach(() => {
  const tmpDir = path.join(os.tmpdir(), `rask-test-${Date.now()}-${Math.random()}`);
  vi.stubEnv("RASK_DATA_DIR", tmpDir);
  vi.resetModules();
});

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

describe("env CRUD", () => {
  it("seeds a default localhost entry on first run", async () => {
    const { listEnvs, getActiveSlug } = await import("../env");
    const envs = listEnvs();
    expect(envs).toHaveLength(1);
    expect(envs[0].slug).toBe("localhost");
    expect(getActiveSlug()).toBe("localhost");
  });

  it("creates and retrieves an env", async () => {
    const { createEnv, listEnvs } = await import("../env");
    createEnv({
      slug: "staging",
      name: "Staging",
      managementUrl: "http://staging:15672",
      amqpPort: "5672",
      user: "admin",
      password: "secret",
      vhost: "/",
    });
    const envs = listEnvs();
    const staging = envs.find((e) => e.slug === "staging");
    expect(staging?.managementUrl).toBe("http://staging:15672");
    expect(staging?.user).toBe("admin");
  });

  it("updates an env", async () => {
    const { createEnv, updateEnv, listEnvs } = await import("../env");
    createEnv({
      slug: "prod",
      name: "Production",
      managementUrl: "http://old:15672",
      amqpPort: "5672",
      user: "guest",
      password: "guest",
      vhost: "/",
    });
    updateEnv("prod", {
      slug: "prod",
      name: "Production",
      managementUrl: "http://new:15672",
      amqpPort: "5672",
      user: "guest",
      password: "guest",
      vhost: "/",
    });
    const envs = listEnvs();
    expect(envs.find((e) => e.slug === "prod")?.managementUrl).toBe("http://new:15672");
  });

  it("deletes an env and clears active slug if it was active", async () => {
    const { createEnv, activateEnv, deleteEnv, getActiveSlug } = await import("../env");
    createEnv({
      slug: "tmp",
      name: "Tmp",
      managementUrl: "http://tmp:15672",
      amqpPort: "5672",
      user: "guest",
      password: "guest",
      vhost: "/",
    });
    activateEnv("tmp");
    expect(getActiveSlug()).toBe("tmp");
    deleteEnv("tmp");
    expect(getActiveSlug()).toBeNull();
  });

  it("activateEnv throws if slug does not exist", async () => {
    const { activateEnv } = await import("../env");
    expect(() => activateEnv("nonexistent")).toThrow("Env not found");
  });
});

describe("getConnectionConfig", () => {
  it("returns active env values when an env is active", async () => {
    const { getConnectionConfig, getActiveSlug } = await import("../env");
    expect(getActiveSlug()).toBe("localhost");
    const config = getConnectionConfig();
    expect(config.managementUrl).toContain("15672");
  });

  it("falls back to process.env when no active slug", async () => {
    vi.stubEnv("RABBITMQ_MANAGEMENT_URL", "http://envhost:15672");
    vi.stubEnv("RABBITMQ_USER", "envuser");
    const { deleteEnv, getConnectionConfig } = await import("../env");
    deleteEnv("localhost"); // remove seeded entry → no active slug
    const config = getConnectionConfig();
    expect(config.managementUrl).toBe("http://envhost:15672");
    expect(config.user).toBe("envuser");
  });
});

describe("readEnvFile / writeEnvFile", () => {
  it("readEnvFile returns connection vars for active env", async () => {
    const { readEnvFile } = await import("../env");
    const result = readEnvFile();
    expect(result.RABBITMQ_MANAGEMENT_URL).toBeDefined();
    expect(result.RABBITMQ_USER).toBeDefined();
  });

  it("writeEnvFile updates the active env", async () => {
    const { writeEnvFile, readEnvFile } = await import("../env");
    writeEnvFile({ RABBITMQ_MANAGEMENT_URL: "http://newhost:15672", RABBITMQ_USER: "admin" });
    const result = readEnvFile();
    expect(result.RABBITMQ_MANAGEMENT_URL).toBe("http://newhost:15672");
    expect(result.RABBITMQ_USER).toBe("admin");
  });
});
