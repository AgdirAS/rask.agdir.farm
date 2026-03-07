import type { Binding, Channel, Connection, ConsumerDetail, Exchange, FeatureFlag, NodeStats, Overview, Policy, Queue, QueueMessage, RabbitUser, Vhost, VhostPermission } from "./types";
import { getConnectionConfig } from "./env";

function getRabbitMQBase(): string {
  const config = getConnectionConfig();
  return config.managementUrl.replace(/\/$/, "");
}

function getAuthHeader(): string {
  const config = getConnectionConfig();
  return "Basic " + Buffer.from(`${config.user}:${config.password}`).toString("base64");
}

async function rabbitFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${getRabbitMQBase()}/api${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
        ...options?.headers,
      },
      cache: "no-store",
    });
  } catch (err) {
    console.error("[rabbitmq] fetch failed:", url, err);
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const err = new Error(`RabbitMQ API error: ${response.status} ${response.statusText} (${path})${body ? ` — ${body}` : ""}`);
    console.error("[rabbitmq]", err.message, "\n  URL:", url);
    throw err;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function getQueues(): Promise<Queue[]> {
  return rabbitFetch<Queue[]>("/queues");
}

export async function getQueue(vhost: string, name: string): Promise<Queue> {
  return rabbitFetch<Queue>(`/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`);
}

export async function getOverview(): Promise<Overview> {
  return rabbitFetch<Overview>("/overview");
}

export async function getExchanges(): Promise<Exchange[]> {
  return rabbitFetch<Exchange[]>("/exchanges");
}

export async function getBindings(): Promise<Binding[]> {
  return rabbitFetch<Binding[]>("/bindings");
}

export async function getNodes(): Promise<NodeStats[]> {
  return rabbitFetch<NodeStats[]>("/nodes");
}

export async function getConnections(): Promise<Connection[]> {
  return rabbitFetch<Connection[]>("/connections");
}

export async function getChannels(): Promise<Channel[]> {
  return rabbitFetch<Channel[]>("/channels");
}

export async function getConnectionChannels(connectionName: string): Promise<Channel[]> {
  return rabbitFetch<Channel[]>(`/connections/${encodeURIComponent(connectionName)}/channels`);
}

export async function deleteExchange(vhost: string, name: string): Promise<void> {
  await rabbitFetch<void>(
    `/exchanges/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
}

export async function getVhosts(): Promise<Vhost[]> {
  return rabbitFetch<Vhost[]>("/vhosts");
}

export async function getVhostPermissions(vhost: string): Promise<VhostPermission[]> {
  return rabbitFetch<VhostPermission[]>(`/vhosts/${encodeURIComponent(vhost)}/permissions`);
}

export async function createVhost(
  name: string,
  body: { description?: string; tags?: string; default_queue_type?: string },
): Promise<void> {
  await rabbitFetch<void>(`/vhosts/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteVhost(name: string): Promise<void> {
  await rabbitFetch<void>(`/vhosts/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function setVhostTracing(name: string, tracing: boolean): Promise<void> {
  await rabbitFetch<void>(`/vhosts/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({ tracing }),
  });
}

// ── users ──────────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<RabbitUser[]> {
  return rabbitFetch<RabbitUser[]>("/users");
}

export async function putUser(
  name: string,
  body: { password?: string; password_hash?: string; hashing_algorithm?: string; tags: string },
): Promise<void> {
  await rabbitFetch<void>(`/users/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteUser(name: string): Promise<void> {
  await rabbitFetch<void>(`/users/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// ── permissions ───────────────────────────────────────────────────────────────

export async function getAllPermissions(): Promise<VhostPermission[]> {
  return rabbitFetch<VhostPermission[]>("/permissions");
}

export async function setPermission(
  vhost: string,
  user: string,
  body: { configure: string; write: string; read: string },
): Promise<void> {
  await rabbitFetch<void>(`/permissions/${encodeURIComponent(vhost)}/${encodeURIComponent(user)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deletePermission(vhost: string, user: string): Promise<void> {
  await rabbitFetch<void>(
    `/permissions/${encodeURIComponent(vhost)}/${encodeURIComponent(user)}`,
    { method: "DELETE" },
  );
}

export function getCurrentUser(): string {
  return getConnectionConfig().user;
}

// ── feature flags ─────────────────────────────────────────────────────────────

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  return rabbitFetch<FeatureFlag[]>("/feature-flags");
}

export async function enableFeatureFlag(name: string): Promise<void> {
  await rabbitFetch<void>(`/feature-flags/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({ state: "enabled" }),
  });
}

// ── vhost limits ──────────────────────────────────────────────────────────────

export async function getVhostLimits(): Promise<import("./types").VhostLimit[]> {
  return rabbitFetch<import("./types").VhostLimit[]>("/vhost-limits");
}

export async function setVhostLimit(vhost: string, limitName: string, value: number): Promise<void> {
  await rabbitFetch<void>(`/vhost-limits/${encodeURIComponent(vhost)}/${encodeURIComponent(limitName)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export async function deleteVhostLimit(vhost: string, limitName: string): Promise<void> {
  await rabbitFetch<void>(
    `/vhost-limits/${encodeURIComponent(vhost)}/${encodeURIComponent(limitName)}`,
    { method: "DELETE" },
  );
}

// ── global parameters ─────────────────────────────────────────────────────────

export async function getGlobalParameters(): Promise<import("./types").GlobalParameter[]> {
  return rabbitFetch<import("./types").GlobalParameter[]>("/global-parameters");
}

export async function setGlobalParameter(name: string, value: unknown, component: string): Promise<void> {
  await rabbitFetch<void>(`/global-parameters/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({ value, component }),
  });
}

export async function deleteGlobalParameter(name: string): Promise<void> {
  await rabbitFetch<void>(`/global-parameters/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// ──────────────────────────────────────────────────────────────────────────────

export async function closeConnection(name: string): Promise<void> {
  await rabbitFetch<void>(`/connections/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { "X-Reason": "Closed via Rask" },
  });
}

// ── queue operations ──────────────────────────────────────────────────────────

export async function getQueueConsumers(vhost: string, name: string): Promise<ConsumerDetail[]> {
  // /api/consumers returns all consumers; filter by vhost+queue
  const all = await rabbitFetch<Array<ConsumerDetail & { queue: { name: string; vhost: string } }>>("/consumers");
  return all
    .filter((c) => c.queue.vhost === vhost && c.queue.name === name)
    .map(({ queue: _q, ...rest }) => rest as ConsumerDetail);
}

export async function purgeQueue(vhost: string, name: string): Promise<void> {
  await rabbitFetch<void>(
    `/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}/contents`,
    { method: "DELETE" },
  );
}

export async function deleteQueue(vhost: string, name: string): Promise<void> {
  await rabbitFetch<void>(
    `/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
}

export async function getQueueMessages(
  vhost: string,
  name: string,
  count: number,
): Promise<QueueMessage[]> {
  return rabbitFetch<QueueMessage[]>(
    `/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}/get`,
    {
      method: "POST",
      body: JSON.stringify({
        count,
        ackmode: "ack_requeue_true",
        encoding: "auto",
        truncate: 50000,
      }),
    },
  );
}

export async function publishToQueue(
  vhost: string,
  name: string,
  payload: {
    routing_key: string;
    payload: string;
    payload_encoding: "string" | "base64";
    properties: {
      content_type?: string;
      delivery_mode?: number;
      headers?: Record<string, unknown>;
    };
  },
): Promise<{ routed: boolean }> {
  return rabbitFetch<{ routed: boolean }>(
    `/exchanges/${encodeURIComponent(vhost)}//publish`,
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        routing_key: name,
      }),
    },
  );
}

// ── policies ──────────────────────────────────────────────────────────────────

export async function getPolicies(): Promise<Policy[]> {
  return rabbitFetch<Policy[]>("/policies");
}

export async function putPolicy(
  vhost: string,
  name: string,
  body: {
    pattern: string;
    "apply-to": string;
    priority: number;
    definition: Record<string, unknown>;
  },
): Promise<void> {
  await rabbitFetch<void>(`/policies/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deletePolicy(vhost: string, name: string): Promise<void> {
  await rabbitFetch<void>(
    `/policies/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
}

export async function createQueue(
  vhost: string,
  name: string,
  body: {
    durable: boolean;
    auto_delete: boolean;
    arguments: Record<string, unknown>;
  },
): Promise<void> {
  await rabbitFetch<void>(
    `/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export async function createBinding(
  vhost: string,
  source: string,
  destination: string,
  body: { routing_key: string; arguments?: Record<string, unknown> },
): Promise<void> {
  await rabbitFetch<void>(
    `/bindings/${encodeURIComponent(vhost)}/e/${encodeURIComponent(source)}/q/${encodeURIComponent(destination)}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function deleteBinding(
  vhost: string,
  source: string,
  destination: string,
  propsKey: string,
): Promise<void> {
  await rabbitFetch<void>(
    `/bindings/${encodeURIComponent(vhost)}/e/${encodeURIComponent(source)}/q/${encodeURIComponent(destination)}/${encodeURIComponent(propsKey)}`,
    { method: "DELETE" },
  );
}

export async function getDefinitions(): Promise<unknown> {
  return rabbitFetch<unknown>("/definitions");
}

export async function importDefinitions(body: unknown): Promise<void> {
  await rabbitFetch<void>("/definitions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function publishToExchange(
  vhost: string,
  exchange: string,
  payload: {
    routing_key: string;
    payload: string;
    payload_encoding: "string" | "base64";
    properties: {
      content_type?: string;
      delivery_mode?: number;
      headers?: Record<string, unknown>;
      priority?: number;
    };
  },
): Promise<{ routed: boolean }> {
  return rabbitFetch<{ routed: boolean }>(
    `/exchanges/${encodeURIComponent(vhost)}/${encodeURIComponent(exchange)}/publish`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function getClusterName(): Promise<string> {
  const res = await rabbitFetch<{ name: string }>("/cluster-name");
  return res.name;
}

export async function setClusterName(name: string): Promise<void> {
  await rabbitFetch<void>("/cluster-name", {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}
