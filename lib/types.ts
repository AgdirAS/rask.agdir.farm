export interface RateDetail {
  rate: number;
}

export interface MessageStats {
  publish?: number;
  publish_details?: RateDetail;
  deliver?: number;
  deliver_details?: RateDetail;
  deliver_get?: number;
  deliver_get_details?: RateDetail;
  ack?: number;
  ack_details?: RateDetail;
  redeliver?: number;
  redeliver_details?: RateDetail;
}

export interface Queue {
  name: string;
  vhost: string;
  durable: boolean;
  auto_delete: boolean;
  exclusive: boolean;
  type: "classic" | "quorum" | "stream";
  arguments?: Record<string, unknown>;
  state: "running" | "idle" | "stopped" | "crashed" | "flow";
  messages: number;
  messages_ready: number;
  messages_unacknowledged: number;
  consumers: number;
  consumer_utilisation: number | null;
  memory: number;
  message_stats?: MessageStats;
  idle_since?: string;
  node: string;
  consumer_details?: ConsumerDetail[];
}

export interface ConsumerDetail {
  consumer_tag: string;
  channel_details: {
    name: string;
    peer_host?: string;
    peer_port?: number;
    connection_name?: string;
  };
  ack_required: boolean;
  prefetch_count: number;
  exclusive: boolean;
  arguments?: Record<string, unknown>;
}

export interface QueueMessage {
  payload: string;
  payload_encoding: "string" | "base64";
  routing_key: string;
  exchange: string;
  redelivered: boolean;
  properties: {
    content_type?: string;
    content_encoding?: string;
    headers?: Record<string, unknown>;
    delivery_mode?: number;
    priority?: number;
    correlation_id?: string;
    reply_to?: string;
    expiration?: string;
    message_id?: string;
    timestamp?: number;
    type?: string;
    app_id?: string;
  };
  message_count: number;
}

export interface Exchange {
  name: string;
  vhost: string;
  type: "direct" | "fanout" | "topic" | "headers" | "x-delayed-message" | string;
  durable: boolean;
  auto_delete: boolean;
  internal: boolean;
  arguments: Record<string, unknown>;
  message_stats?: MessageStats;
}

export interface Binding {
  source: string;
  vhost: string;
  destination: string;
  destination_type: "queue" | "exchange";
  routing_key: string;
  arguments: Record<string, unknown>;
  properties_key: string;
}

export interface NodeStats {
  name: string;
  type: string;
  running: boolean;
  mem_used: number;
  mem_limit: number;
  fd_used: number;
  fd_total: number;
  sockets_used: number;
  sockets_total: number;
  proc_used: number;
  proc_total: number;
  disk_free: number;
  disk_free_limit: number;
  uptime: number; // milliseconds
}

export interface ObjectTotals {
  consumers: number;
  queues: number;
  exchanges: number;
  connections: number;
  channels: number;
}

export interface Overview {
  rabbitmq_version: string;
  erlang_version: string;
  cluster_name: string;
  management_version: string;
  message_stats: MessageStats;
  object_totals: ObjectTotals;
  queue_totals?: { messages: number; messages_ready: number; messages_unacknowledged: number };
  node: string;
  listeners: Array<{
    node: string;
    protocol: string;
    ip_address: string;
    port: number;
  }>;
}

export interface Connection {
  name: string; // "peer_host:peer_port -> host:port"
  user: string;
  vhost: string;
  state: "running" | "idle" | "blocked" | "blocking" | "flow" | "closing" | "closed";
  channels: number;
  connected_at: number; // ms since epoch
  peer_host: string;
  peer_port: number;
  protocol: string;
  ssl: boolean;
  node: string;
  send_oct_details?: RateDetail;
  recv_oct_details?: RateDetail;
  send_oct?: number;
  recv_oct?: number;
  client_properties?: Record<string, unknown>;
}

export interface Channel {
  name: string; // "connname:N"
  number: number;
  vhost: string;
  user: string;
  state: "running" | "idle" | "flow" | "blocked" | "closing";
  consumer_count: number;
  messages_unacknowledged: number;
  messages_uncommitted: number;
  acks_uncommitted: number;
  prefetch_count: number;
  global_prefetch_count: number;
  confirm: boolean;
  transactional: boolean;
  connection_details: { name: string; peer_address?: string; peer_port?: number };
}

export interface ConnectionConfig {
  managementUrl: string;
  amqpPort: string;
  user: string;
  password: string;
  vhost: string;
}

export interface EnvEntry {
  slug: string;
  name: string;
  managementUrl: string;
  amqpPort: string;
  user: string;
  password: string;
  vhost: string;
}

export interface EnvListResponse {
  envs: EnvEntry[];
  active: string | null;
}

export interface Vhost {
  name: string;
  description?: string;
  tags?: string[] | string;
  tracing: boolean;
  messages?: number;
  messages_ready?: number;
  messages_unacknowledged?: number;
  message_stats?: MessageStats;
  cluster_state?: Record<string, "running" | "stopped" | string>;
  recv_oct?: number;
  send_oct?: number;
}

export interface VhostPermission {
  user: string;
  vhost: string;
  configure: string;
  write: string;
  read: string;
}

export interface FeatureFlag {
  name: string;
  desc: string;
  doc_url?: string;
  stability: "stable" | "experimental" | string;
  provided_by: string;
  state: "enabled" | "disabled" | "unavailable";
  depends_on: string[];
}

export interface RabbitUser {
  name: string;
  tags: string; // comma-separated: "administrator,monitoring" or "" for no tags
  password_hash?: string;
  hashing_algorithm?: string;
}

export interface VhostLimit {
  vhost: string;
  value: {
    "max-connections"?: number;
    "max-queues"?: number;
  };
}

export interface GlobalParameter {
  name: string;
  value: unknown;
  component: string;
}

export interface Policy {
  name: string;
  vhost: string;
  pattern: string;
  "apply-to": "queues" | "exchanges" | "all" | "classic_queues" | "quorum_queues" | "streams";
  priority: number;
  definition: Record<string, unknown>;
}

export interface TraceEvent {
  type: "publish" | "deliver" | "drop";
  exchange: string;
  queue?: string;
  routingKey: string;
  vhost: string;
  payload: string;
  payloadEncoding: "string" | "base64";
  properties: Record<string, unknown>;
  timestamp: number;
}
