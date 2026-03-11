using Microsoft.AspNetCore.SignalR;
using Rask.Shared.Models;

namespace Rask.Server.Hubs;

/// <summary>
/// SignalR hub for real-time RabbitMQ message tracing.
/// Replaces the SSE EventSource endpoint from Next.js.
///
/// Clients call StartTrace(vhost) to begin receiving trace events,
/// and StopTrace() to stop. The server connects via AMQP to the
/// amq.rabbitmq.trace exchange and forwards events.
/// </summary>
public sealed class TraceHub : Hub
{
    private readonly ILogger<TraceHub> _logger;
    private readonly Services.EnvironmentService _envService;

    // Track active trace connections
    private static readonly Dictionary<string, CancellationTokenSource> ActiveTraces = new();

    public TraceHub(ILogger<TraceHub> logger, Services.EnvironmentService envService)
    {
        _logger = logger;
        _envService = envService;
    }

    public async Task StartTrace(string vhost)
    {
        var connectionId = Context.ConnectionId;

        // Cancel any existing trace for this connection
        await StopTrace();

        var cts = new CancellationTokenSource();
        lock (ActiveTraces)
        {
            ActiveTraces[connectionId] = cts;
        }

        var config = await _envService.GetConnectionConfigAsync();
        _logger.LogInformation("Starting trace for vhost {Vhost} on connection {ConnectionId}", vhost, connectionId);

        // Start AMQP trace consumer in background
        _ = Task.Run(async () =>
        {
            try
            {
                await ConsumeTraceEventsAsync(connectionId, config, vhost, cts.Token);
            }
            catch (OperationCanceledException)
            {
                // Expected on stop
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Trace consumer error for {ConnectionId}", connectionId);
            }
        }, cts.Token);
    }

    public Task StopTrace()
    {
        var connectionId = Context.ConnectionId;
        CancelTrace(connectionId);
        return Task.CompletedTask;
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        CancelTrace(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    private static void CancelTrace(string connectionId)
    {
        lock (ActiveTraces)
        {
            if (ActiveTraces.Remove(connectionId, out var cts))
            {
                cts.Cancel();
                cts.Dispose();
            }
        }
    }

    private async Task ConsumeTraceEventsAsync(
        string connectionId,
        ConnectionConfig config,
        string vhost,
        CancellationToken ct)
    {
        // Parse management URL to get AMQP host
        var uri = new Uri(config.ManagementUrl);
        var amqpHost = uri.Host;
        var amqpPort = int.TryParse(config.AmqpPort, out var p) ? p : 5672;

        var factory = new RabbitMQ.Client.ConnectionFactory
        {
            HostName = amqpHost,
            Port = amqpPort,
            UserName = config.User,
            Password = config.Password,
            VirtualHost = config.Vhost
        };

        await using var connection = await factory.CreateConnectionAsync(ct);
        await using var channel = await connection.CreateChannelAsync(cancellationToken: ct);

        // Declare exclusive queue bound to trace exchange
        var queueDeclare = await channel.QueueDeclareAsync(
            queue: "",
            durable: false,
            exclusive: true,
            autoDelete: true,
            cancellationToken: ct);

        var queueName = queueDeclare.QueueName;

        // Bind to amq.rabbitmq.trace with routing key pattern for the vhost
        var routingKey = vhost == "/" ? "publish.#" : $"publish.{vhost}.#";
        await channel.QueueBindAsync(queueName, "amq.rabbitmq.trace", routingKey, cancellationToken: ct);

        var deliverRoutingKey = vhost == "/" ? "deliver.#" : $"deliver.{vhost}.#";
        await channel.QueueBindAsync(queueName, "amq.rabbitmq.trace", deliverRoutingKey, cancellationToken: ct);

        _logger.LogInformation("Trace queue {Queue} bound for vhost {Vhost}", queueName, vhost);

        // Consume messages
        var consumer = new RabbitMQ.Client.Events.AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += async (_, ea) =>
        {
            if (ct.IsCancellationRequested) return;

            try
            {
                var body = ea.Body.ToArray();
                var payload = System.Text.Encoding.UTF8.GetString(body);
                var rk = ea.RoutingKey;
                var parts = rk.Split('.', 3);
                var type = parts.Length > 0 ? parts[0] : "unknown";

                var traceEvent = new TraceEvent(
                    Type: type,
                    Exchange: ea.Exchange,
                    RoutingKey: ea.RoutingKey,
                    Vhost: vhost,
                    Payload: payload,
                    PayloadEncoding: "string",
                    Properties: new Dictionary<string, object>(),
                    Timestamp: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    Queue: parts.Length > 2 ? parts[2] : null
                );

                await Clients.Client(connectionId).SendAsync("ReceiveTraceEvent", traceEvent, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error processing trace message");
            }
        };

        await channel.BasicConsumeAsync(queueName, autoAck: true, consumerTag: "", noLocal: false, exclusive: false, arguments: null, consumer: consumer, cancellationToken: ct);

        // Keep alive until cancelled
        try
        {
            await Task.Delay(Timeout.Infinite, ct);
        }
        catch (OperationCanceledException)
        {
            // Expected
        }
    }
}
