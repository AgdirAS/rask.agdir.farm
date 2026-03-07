import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getConnectionConfig so tests don't require .env.local
vi.mock("../env", () => ({
  getConnectionConfig: () => ({
    managementUrl: "http://testhost:15672",
    amqpPort: "5672",
    user: "testuser",
    password: "testpass",
    vhost: "/",
  }),
}));

describe("RabbitMQ fetch URL construction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls correct URL for getQueues", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "[]",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getQueues } = await import("../rabbitmq");
    await getQueues();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://testhost:15672/api/queues");
  });

  it("sends Basic Auth header with base64-encoded credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "[]",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getQueues } = await import("../rabbitmq");
    await getQueues();

    const [, options] = fetchMock.mock.calls[0];
    const expected = "Basic " + Buffer.from("testuser:testpass").toString("base64");
    expect(options.headers.Authorization).toBe(expected);
  });

  it("encodes vhost correctly in URL (/ becomes %2F)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ messages: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getQueue } = await import("../rabbitmq");
    await getQueue("/", "my-queue");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("%2F");
    expect(url).toContain("my-queue");
  });

  it("encodes special characters in queue name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ messages: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getQueue } = await import("../rabbitmq");
    await getQueue("myvhost", "queue with spaces");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("queue%20with%20spaces");
  });

  it("throws on non-ok response (network/502)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getQueues } = await import("../rabbitmq");
    await expect(getQueues()).rejects.toThrow("502");
  });
});
