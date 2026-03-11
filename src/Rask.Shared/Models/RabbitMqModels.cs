using System.Text.Json.Serialization;

namespace Rask.Shared.Models;

// ── Rate & message stats ─────────────────────────────────────────────────────

public sealed record RateDetail(
    [property: JsonPropertyName("rate")] double Rate
);

public sealed record MessageStats(
    [property: JsonPropertyName("publish")] long? Publish = null,
    [property: JsonPropertyName("publish_details")] RateDetail? PublishDetails = null,
    [property: JsonPropertyName("deliver")] long? Deliver = null,
    [property: JsonPropertyName("deliver_details")] RateDetail? DeliverDetails = null,
    [property: JsonPropertyName("deliver_get")] long? DeliverGet = null,
    [property: JsonPropertyName("deliver_get_details")] RateDetail? DeliverGetDetails = null,
    [property: JsonPropertyName("ack")] long? Ack = null,
    [property: JsonPropertyName("ack_details")] RateDetail? AckDetails = null,
    [property: JsonPropertyName("redeliver")] long? Redeliver = null,
    [property: JsonPropertyName("redeliver_details")] RateDetail? RedeliverDetails = null
);

// ── Queue ────────────────────────────────────────────────────────────────────

public sealed record ConsumerChannelDetails(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("peer_host")] string? PeerHost = null,
    [property: JsonPropertyName("peer_port")] int? PeerPort = null,
    [property: JsonPropertyName("connection_name")] string? ConnectionName = null
);

public sealed record ConsumerDetail(
    [property: JsonPropertyName("consumer_tag")] string ConsumerTag,
    [property: JsonPropertyName("channel_details")] ConsumerChannelDetails ChannelDetails,
    [property: JsonPropertyName("ack_required")] bool AckRequired,
    [property: JsonPropertyName("prefetch_count")] int PrefetchCount,
    [property: JsonPropertyName("exclusive")] bool Exclusive,
    [property: JsonPropertyName("arguments")] Dictionary<string, object>? Arguments = null
);

public sealed record RabbitQueue(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("vhost")] string Vhost,
    [property: JsonPropertyName("durable")] bool Durable,
    [property: JsonPropertyName("auto_delete")] bool AutoDelete,
    [property: JsonPropertyName("exclusive")] bool Exclusive,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("messages")] long Messages,
    [property: JsonPropertyName("messages_ready")] long MessagesReady,
    [property: JsonPropertyName("messages_unacknowledged")] long MessagesUnacknowledged,
    [property: JsonPropertyName("consumers")] int Consumers,
    [property: JsonPropertyName("memory")] long Memory,
    [property: JsonPropertyName("node")] string Node,
    [property: JsonPropertyName("consumer_utilisation")] double? ConsumerUtilisation = null,
    [property: JsonPropertyName("message_stats")] MessageStats? MessageStats = null,
    [property: JsonPropertyName("idle_since")] string? IdleSince = null,
    [property: JsonPropertyName("consumer_details")] List<ConsumerDetail>? ConsumerDetails = null,
    [property: JsonPropertyName("arguments")] Dictionary<string, object>? Arguments = null
);

// ── Queue message ────────────────────────────────────────────────────────────

public sealed record QueueMessageProperties(
    [property: JsonPropertyName("content_type")] string? ContentType = null,
    [property: JsonPropertyName("content_encoding")] string? ContentEncoding = null,
    [property: JsonPropertyName("headers")] Dictionary<string, object>? Headers = null,
    [property: JsonPropertyName("delivery_mode")] int? DeliveryMode = null,
    [property: JsonPropertyName("priority")] int? Priority = null,
    [property: JsonPropertyName("correlation_id")] string? CorrelationId = null,
    [property: JsonPropertyName("reply_to")] string? ReplyTo = null,
    [property: JsonPropertyName("expiration")] string? Expiration = null,
    [property: JsonPropertyName("message_id")] string? MessageId = null,
    [property: JsonPropertyName("timestamp")] long? Timestamp = null,
    [property: JsonPropertyName("type")] string? Type = null,
    [property: JsonPropertyName("app_id")] string? AppId = null
);

public sealed record QueueMessage(
    [property: JsonPropertyName("payload")] string Payload,
    [property: JsonPropertyName("payload_encoding")] string PayloadEncoding,
    [property: JsonPropertyName("routing_key")] string RoutingKey,
    [property: JsonPropertyName("exchange")] string Exchange,
    [property: JsonPropertyName("redelivered")] bool Redelivered,
    [property: JsonPropertyName("properties")] QueueMessageProperties Properties,
    [property: JsonPropertyName("message_count")] long MessageCount
);

// ── Exchange ─────────────────────────────────────────────────────────────────

public sealed record RabbitExchange(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("vhost")] string Vhost,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("durable")] bool Durable,
    [property: JsonPropertyName("auto_delete")] bool AutoDelete,
    [property: JsonPropertyName("internal")] bool Internal,
    [property: JsonPropertyName("arguments")] Dictionary<string, object>? Arguments = null,
    [property: JsonPropertyName("message_stats")] MessageStats? MessageStats = null
);

// ── Binding ──────────────────────────────────────────────────────────────────

public sealed record RabbitBinding(
    [property: JsonPropertyName("source")] string Source,
    [property: JsonPropertyName("vhost")] string Vhost,
    [property: JsonPropertyName("destination")] string Destination,
    [property: JsonPropertyName("destination_type")] string DestinationType,
    [property: JsonPropertyName("routing_key")] string RoutingKey,
    [property: JsonPropertyName("arguments")] Dictionary<string, object>? Arguments = null,
    [property: JsonPropertyName("properties_key")] string PropertiesKey = ""
);

// ── Node ─────────────────────────────────────────────────────────────────────

public sealed record NodeStats(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("running")] bool Running,
    [property: JsonPropertyName("mem_used")] long MemUsed,
    [property: JsonPropertyName("mem_limit")] long MemLimit,
    [property: JsonPropertyName("fd_used")] int FdUsed,
    [property: JsonPropertyName("fd_total")] int FdTotal,
    [property: JsonPropertyName("sockets_used")] int SocketsUsed,
    [property: JsonPropertyName("sockets_total")] int SocketsTotal,
    [property: JsonPropertyName("proc_used")] int ProcUsed,
    [property: JsonPropertyName("proc_total")] int ProcTotal,
    [property: JsonPropertyName("disk_free")] long DiskFree,
    [property: JsonPropertyName("disk_free_limit")] long DiskFreeLimit,
    [property: JsonPropertyName("uptime")] long Uptime
);

// ── Overview ─────────────────────────────────────────────────────────────────

public sealed record ObjectTotals(
    [property: JsonPropertyName("consumers")] int Consumers,
    [property: JsonPropertyName("queues")] int Queues,
    [property: JsonPropertyName("exchanges")] int Exchanges,
    [property: JsonPropertyName("connections")] int Connections,
    [property: JsonPropertyName("channels")] int Channels
);

public sealed record QueueTotals(
    [property: JsonPropertyName("messages")] long Messages,
    [property: JsonPropertyName("messages_ready")] long MessagesReady,
    [property: JsonPropertyName("messages_unacknowledged")] long MessagesUnacknowledged
);

public sealed record Listener(
    [property: JsonPropertyName("node")] string Node,
    [property: JsonPropertyName("protocol")] string Protocol,
    [property: JsonPropertyName("ip_address")] string IpAddress,
    [property: JsonPropertyName("port")] int Port
);

public sealed record Overview(
    [property: JsonPropertyName("rabbitmq_version")] string RabbitmqVersion,
    [property: JsonPropertyName("erlang_version")] string ErlangVersion,
    [property: JsonPropertyName("cluster_name")] string ClusterName,
    [property: JsonPropertyName("management_version")] string ManagementVersion,
    [property: JsonPropertyName("message_stats")] MessageStats MessageStats,
    [property: JsonPropertyName("object_totals")] ObjectTotals ObjectTotals,
    [property: JsonPropertyName("node")] string Node,
    [property: JsonPropertyName("listeners")] List<Listener> Listeners,
    [property: JsonPropertyName("queue_totals")] QueueTotals? QueueTotals = null
);

// ── Connection ───────────────────────────────────────────────────────────────

public sealed record RabbitConnection(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("user")] string User,
    [property: JsonPropertyName("vhost")] string Vhost,
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("channels")] int Channels,
    [property: JsonPropertyName("connected_at")] long ConnectedAt,
    [property: JsonPropertyName("peer_host")] string PeerHost,
    [property: JsonPropertyName("peer_port")] int PeerPort,
    [property: JsonPropertyName("protocol")] string Protocol,
    [property: JsonPropertyName("ssl")] bool Ssl,
    [property: JsonPropertyName("node")] string Node,
    [property: JsonPropertyName("send_oct_details")] RateDetail? SendOctDetails = null,
    [property: JsonPropertyName("recv_oct_details")] RateDetail? RecvOctDetails = null,
    [property: JsonPropertyName("send_oct")] long? SendOct = null,
    [property: JsonPropertyName("recv_oct")] long? RecvOct = null,
    [property: JsonPropertyName("client_properties")] Dictionary<string, object>? ClientProperties = null
);

// ── Channel ──────────────────────────────────────────────────────────────────

public sealed record ChannelConnectionDetails(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("peer_address")] string? PeerAddress = null,
    [property: JsonPropertyName("peer_port")] int? PeerPort = null
);

public sealed record RabbitChannel(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("number")] int Number,
    [property: JsonPropertyName("vhost")] string Vhost,
    [property: JsonPropertyName("user")] string User,
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("consumer_count")] int ConsumerCount,
    [property: JsonPropertyName("messages_unacknowledged")] long MessagesUnacknowledged,
    [property: JsonPropertyName("messages_uncommitted")] long MessagesUncommitted,
    [property: JsonPropertyName("acks_uncommitted")] long AcksUncommitted,
    [property: JsonPropertyName("prefetch_count")] int PrefetchCount,
    [property: JsonPropertyName("global_prefetch_count")] int GlobalPrefetchCount,
    [property: JsonPropertyName("confirm")] bool Confirm,
    [property: JsonPropertyName("transactional")] bool Transactional,
    [property: JsonPropertyName("connection_details")] ChannelConnectionDetails ConnectionDetails
);

// ── Vhost ────────────────────────────────────────────────────────────────────

public sealed record RabbitVhost(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("tracing")] bool Tracing,
    [property: JsonPropertyName("description")] string? Description = null,
    [property: JsonPropertyName("tags")] object? Tags = null,
    [property: JsonPropertyName("messages")] long? Messages = null,
    [property: JsonPropertyName("messages_ready")] long? MessagesReady = null,
    [property: JsonPropertyName("messages_unacknowledged")] long? MessagesUnacknowledged = null,
    [property: JsonPropertyName("message_stats")] MessageStats? MessageStats = null,
    [property: JsonPropertyName("cluster_state")] Dictionary<string, string>? ClusterState = null,
    [property: JsonPropertyName("recv_oct")] long? RecvOct = null,
    [property: JsonPropertyName("send_oct")] long? SendOct = null
);

// ── User ─────────────────────────────────────────────────────────────────────

public sealed record RabbitUser(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("tags")] string Tags,
    [property: JsonPropertyName("password_hash")] string? PasswordHash = null,
    [property: JsonPropertyName("hashing_algorithm")] string? HashingAlgorithm = null
);

// ── Permissions ──────────────────────────────────────────────────────────────

public sealed record VhostPermission(
    [property: JsonPropertyName("user")] string User,
    [property: JsonPropertyName("vhost")] string Vhost,
    [property: JsonPropertyName("configure")] string Configure,
    [property: JsonPropertyName("write")] string Write,
    [property: JsonPropertyName("read")] string Read
);

// ── Feature flag ─────────────────────────────────────────────────────────────

public sealed record FeatureFlag(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("desc")] string Desc,
    [property: JsonPropertyName("stability")] string Stability,
    [property: JsonPropertyName("provided_by")] string ProvidedBy,
    [property: JsonPropertyName("state")] string State,
    [property: JsonPropertyName("depends_on")] List<string> DependsOn,
    [property: JsonPropertyName("doc_url")] string? DocUrl = null
);

// ── Policy ───────────────────────────────────────────────────────────────────

public sealed record RabbitPolicy(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("vhost")] string Vhost,
    [property: JsonPropertyName("pattern")] string Pattern,
    [property: JsonPropertyName("apply-to")] string ApplyTo,
    [property: JsonPropertyName("priority")] int Priority,
    [property: JsonPropertyName("definition")] Dictionary<string, object> Definition
);

// ── Vhost limit ──────────────────────────────────────────────────────────────

public sealed record VhostLimitValue(
    [property: JsonPropertyName("max-connections")] int? MaxConnections = null,
    [property: JsonPropertyName("max-queues")] int? MaxQueues = null
);

public sealed record VhostLimit(
    [property: JsonPropertyName("vhost")] string Vhost,
    [property: JsonPropertyName("value")] VhostLimitValue Value
);

// ── Global parameter ─────────────────────────────────────────────────────────

public sealed record GlobalParameter(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("value")] object Value,
    [property: JsonPropertyName("component")] string Component
);

// ── Trace event ──────────────────────────────────────────────────────────────

public sealed record TraceEvent(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("exchange")] string Exchange,
    [property: JsonPropertyName("routingKey")] string RoutingKey,
    [property: JsonPropertyName("vhost")] string Vhost,
    [property: JsonPropertyName("payload")] string Payload,
    [property: JsonPropertyName("payloadEncoding")] string PayloadEncoding,
    [property: JsonPropertyName("properties")] Dictionary<string, object> Properties,
    [property: JsonPropertyName("timestamp")] long Timestamp,
    [property: JsonPropertyName("queue")] string? Queue = null
);
