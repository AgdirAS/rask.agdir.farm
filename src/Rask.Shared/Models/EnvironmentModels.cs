using System.Text.Json.Serialization;

namespace Rask.Shared.Models;

// ── Connection config ────────────────────────────────────────────────────────

public sealed record ConnectionConfig(
    string ManagementUrl,
    string AmqpPort,
    string User,
    string Password,
    string Vhost
);

// ── Environment entry ────────────────────────────────────────────────────────

public sealed record EnvEntry(
    string Slug,
    string Name,
    string ManagementUrl,
    string AmqpPort,
    string User,
    string Password,
    string Vhost
);

public sealed record EnvListResponse(
    List<EnvEntry> Envs,
    string? Active
);

// ── API response envelope ────────────────────────────────────────────────────

public sealed record ApiResponse<T>(
    [property: JsonPropertyName("data")] T? Data = default,
    [property: JsonPropertyName("error")] string? Error = null
);

// ── Publish request ──────────────────────────────────────────────────────────

public sealed record PublishRequest(
    [property: JsonPropertyName("routing_key")] string RoutingKey,
    [property: JsonPropertyName("payload")] string Payload,
    [property: JsonPropertyName("payload_encoding")] string PayloadEncoding,
    [property: JsonPropertyName("properties")] PublishProperties Properties
);

public sealed record PublishProperties(
    [property: JsonPropertyName("content_type")] string? ContentType = null,
    [property: JsonPropertyName("delivery_mode")] int? DeliveryMode = null,
    [property: JsonPropertyName("headers")] Dictionary<string, object>? Headers = null,
    [property: JsonPropertyName("priority")] int? Priority = null
);

public sealed record PublishResponse(
    [property: JsonPropertyName("routed")] bool Routed
);

// ── Queue get request ────────────────────────────────────────────────────────

public sealed record QueueGetRequest(
    [property: JsonPropertyName("count")] int Count,
    [property: JsonPropertyName("ackmode")] string Ackmode = "ack_requeue_true",
    [property: JsonPropertyName("encoding")] string Encoding = "auto",
    [property: JsonPropertyName("truncate")] int Truncate = 50000
);

// ── Create/update bodies ─────────────────────────────────────────────────────

public sealed record CreateQueueRequest(
    [property: JsonPropertyName("durable")] bool Durable,
    [property: JsonPropertyName("auto_delete")] bool AutoDelete,
    [property: JsonPropertyName("arguments")] Dictionary<string, object>? Arguments = null
);

public sealed record CreateVhostRequest(
    [property: JsonPropertyName("description")] string? Description = null,
    [property: JsonPropertyName("tags")] string? Tags = null,
    [property: JsonPropertyName("default_queue_type")] string? DefaultQueueType = null
);

public sealed record SetVhostTracingRequest(
    [property: JsonPropertyName("tracing")] bool Tracing
);

public sealed record PutUserRequest(
    [property: JsonPropertyName("tags")] string Tags,
    [property: JsonPropertyName("password")] string? Password = null,
    [property: JsonPropertyName("password_hash")] string? PasswordHash = null,
    [property: JsonPropertyName("hashing_algorithm")] string? HashingAlgorithm = null
);

public sealed record SetPermissionRequest(
    [property: JsonPropertyName("configure")] string Configure,
    [property: JsonPropertyName("write")] string Write,
    [property: JsonPropertyName("read")] string Read
);

public sealed record PutPolicyRequest(
    [property: JsonPropertyName("pattern")] string Pattern,
    [property: JsonPropertyName("apply-to")] string ApplyTo,
    [property: JsonPropertyName("priority")] int Priority,
    [property: JsonPropertyName("definition")] Dictionary<string, object> Definition
);

public sealed record SetGlobalParameterRequest(
    [property: JsonPropertyName("value")] object Value,
    [property: JsonPropertyName("component")] string Component
);

public sealed record SetVhostLimitRequest(
    [property: JsonPropertyName("value")] int Value
);

public sealed record CreateBindingRequest(
    [property: JsonPropertyName("routing_key")] string RoutingKey,
    [property: JsonPropertyName("arguments")] Dictionary<string, object>? Arguments = null
);

public sealed record ClusterNameResponse(
    [property: JsonPropertyName("name")] string Name
);
