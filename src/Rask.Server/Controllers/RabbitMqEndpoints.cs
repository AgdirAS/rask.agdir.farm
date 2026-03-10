using System.Text.Json;
using Rask.Server.Services;
using Rask.Shared.Models;

namespace Rask.Server.Controllers;

/// <summary>
/// Minimal API endpoints that proxy to the RabbitMQ Management HTTP API.
/// Mirrors the Next.js /api/rabbitmq/* routes.
/// </summary>
public static class RabbitMqEndpoints
{
    public static void MapRabbitMqEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api/rabbitmq")
            .WithTags("RabbitMQ");

        // ── Overview ─────────────────────────────────────────────────────

        api.MapGet("/overview", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetOverviewAsync();
            return Results.Ok(new ApiResponse<Overview>(data));
        });

        api.MapGet("/nodes", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetNodesAsync();
            return Results.Ok(new ApiResponse<List<NodeStats>>(data));
        });

        api.MapGet("/cluster-name", async (RabbitMqManagementClient client) =>
        {
            var name = await client.GetClusterNameAsync();
            return Results.Ok(new ApiResponse<string>(name));
        });

        api.MapPut("/cluster-name", async (RabbitMqManagementClient client, ClusterNameResponse body) =>
        {
            await client.SetClusterNameAsync(body.Name);
            return Results.Ok();
        });

        // ── Queues ───────────────────────────────────────────────────────

        api.MapGet("/queues", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetQueuesAsync();
            return Results.Ok(new ApiResponse<List<RabbitQueue>>(data));
        });

        api.MapGet("/queues/{vhost}/{name}", async (string vhost, string name, RabbitMqManagementClient client) =>
        {
            var data = await client.GetQueueAsync(vhost, name);
            return Results.Ok(new ApiResponse<RabbitQueue>(data));
        });

        api.MapPut("/queues/{vhost}/{name}", async (string vhost, string name, CreateQueueRequest body, RabbitMqManagementClient client) =>
        {
            await client.CreateQueueAsync(vhost, name, body);
            return Results.Ok();
        });

        api.MapDelete("/queues/{vhost}/{name}", async (string vhost, string name, RabbitMqManagementClient client) =>
        {
            await client.DeleteQueueAsync(vhost, name);
            return Results.Ok();
        });

        api.MapPost("/queues/{vhost}/{name}/get", async (string vhost, string name, QueueGetRequest body, RabbitMqManagementClient client) =>
        {
            var data = await client.GetQueueMessagesAsync(vhost, name, body.Count);
            return Results.Ok(new ApiResponse<List<QueueMessage>>(data));
        });

        api.MapPost("/queues/{vhost}/{name}/publish", async (string vhost, string name, PublishRequest body, RabbitMqManagementClient client) =>
        {
            var data = await client.PublishToQueueAsync(vhost, name, body);
            return Results.Ok(new ApiResponse<PublishResponse>(data));
        });

        api.MapPost("/queues/{vhost}/{name}/purge", async (string vhost, string name, RabbitMqManagementClient client) =>
        {
            await client.PurgeQueueAsync(vhost, name);
            return Results.Ok();
        });

        api.MapGet("/queues/{vhost}/{name}/consumers", async (string vhost, string name, RabbitMqManagementClient client) =>
        {
            var data = await client.GetQueueConsumersAsync(vhost, name);
            return Results.Ok(new ApiResponse<List<ConsumerDetail>>(data));
        });

        // ── Exchanges ────────────────────────────────────────────────────

        api.MapGet("/exchanges", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetExchangesAsync();
            return Results.Ok(new ApiResponse<List<RabbitExchange>>(data));
        });

        api.MapDelete("/exchanges/{vhost}/{name}", async (string vhost, string name, RabbitMqManagementClient client) =>
        {
            await client.DeleteExchangeAsync(vhost, name);
            return Results.Ok();
        });

        api.MapPost("/exchanges/{vhost}/{name}/publish", async (string vhost, string name, PublishRequest body, RabbitMqManagementClient client) =>
        {
            var data = await client.PublishToExchangeAsync(vhost, name, body);
            return Results.Ok(new ApiResponse<PublishResponse>(data));
        });

        // ── Bindings ─────────────────────────────────────────────────────

        api.MapGet("/bindings", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetBindingsAsync();
            return Results.Ok(new ApiResponse<List<RabbitBinding>>(data));
        });

        api.MapPost("/bindings/{vhost}/e/{source}/q/{destination}", async (string vhost, string source, string destination, CreateBindingRequest body, RabbitMqManagementClient client) =>
        {
            await client.CreateBindingAsync(vhost, source, destination, body);
            return Results.Ok();
        });

        api.MapDelete("/bindings/{vhost}/e/{source}/q/{destination}/{propsKey}", async (string vhost, string source, string destination, string propsKey, RabbitMqManagementClient client) =>
        {
            await client.DeleteBindingAsync(vhost, source, destination, propsKey);
            return Results.Ok();
        });

        // ── Connections ──────────────────────────────────────────────────

        api.MapGet("/connections", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetConnectionsAsync();
            return Results.Ok(new ApiResponse<List<RabbitConnection>>(data));
        });

        api.MapDelete("/connections/close", async (HttpRequest request, RabbitMqManagementClient client) =>
        {
            var body = await request.ReadFromJsonAsync<JsonElement>();
            var name = body.GetProperty("name").GetString()!;
            await client.CloseConnectionAsync(name);
            return Results.Ok();
        });

        api.MapGet("/connections/{name}/channels", async (string name, RabbitMqManagementClient client) =>
        {
            var data = await client.GetConnectionChannelsAsync(name);
            return Results.Ok(new ApiResponse<List<RabbitChannel>>(data));
        });

        // ── Channels ─────────────────────────────────────────────────────

        api.MapGet("/channels", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetChannelsAsync();
            return Results.Ok(new ApiResponse<List<RabbitChannel>>(data));
        });

        // ── Vhosts ───────────────────────────────────────────────────────

        api.MapGet("/vhosts", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetVhostsAsync();
            return Results.Ok(new ApiResponse<List<RabbitVhost>>(data));
        });

        api.MapGet("/vhosts/{name}/permissions", async (string name, RabbitMqManagementClient client) =>
        {
            var data = await client.GetVhostPermissionsAsync(name);
            return Results.Ok(new ApiResponse<List<VhostPermission>>(data));
        });

        api.MapPut("/vhosts/{name}", async (string name, CreateVhostRequest body, RabbitMqManagementClient client) =>
        {
            await client.CreateVhostAsync(name, body);
            return Results.Ok();
        });

        api.MapDelete("/vhosts/{name}", async (string name, RabbitMqManagementClient client) =>
        {
            await client.DeleteVhostAsync(name);
            return Results.Ok();
        });

        api.MapPost("/vhosts/{name}/trace-on", async (string name, RabbitMqManagementClient client) =>
        {
            await client.SetVhostTracingAsync(name, true);
            return Results.Ok();
        });

        api.MapPost("/vhosts/{name}/trace-off", async (string name, RabbitMqManagementClient client) =>
        {
            await client.SetVhostTracingAsync(name, false);
            return Results.Ok();
        });

        // ── Users ────────────────────────────────────────────────────────

        api.MapGet("/users", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetUsersAsync();
            return Results.Ok(new ApiResponse<List<RabbitUser>>(data));
        });

        api.MapPut("/users/{name}", async (string name, PutUserRequest body, RabbitMqManagementClient client) =>
        {
            await client.PutUserAsync(name, body);
            return Results.Ok();
        });

        api.MapDelete("/users/{name}", async (string name, RabbitMqManagementClient client) =>
        {
            await client.DeleteUserAsync(name);
            return Results.Ok();
        });

        // ── Permissions ──────────────────────────────────────────────────

        api.MapGet("/permissions", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetAllPermissionsAsync();
            return Results.Ok(new ApiResponse<List<VhostPermission>>(data));
        });

        api.MapPut("/permissions/{vhost}/{user}", async (string vhost, string user, SetPermissionRequest body, RabbitMqManagementClient client) =>
        {
            await client.SetPermissionAsync(vhost, user, body);
            return Results.Ok();
        });

        api.MapDelete("/permissions/{vhost}/{user}", async (string vhost, string user, RabbitMqManagementClient client) =>
        {
            await client.DeletePermissionAsync(vhost, user);
            return Results.Ok();
        });

        // ── Feature flags ────────────────────────────────────────────────

        api.MapGet("/feature-flags", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetFeatureFlagsAsync();
            return Results.Ok(new ApiResponse<List<FeatureFlag>>(data));
        });

        api.MapPut("/feature-flags/{name}", async (string name, RabbitMqManagementClient client) =>
        {
            await client.EnableFeatureFlagAsync(name);
            return Results.Ok();
        });

        // ── Policies ─────────────────────────────────────────────────────

        api.MapGet("/policies", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetPoliciesAsync();
            return Results.Ok(new ApiResponse<List<RabbitPolicy>>(data));
        });

        api.MapPut("/policies/{vhost}/{name}", async (string vhost, string name, PutPolicyRequest body, RabbitMqManagementClient client) =>
        {
            await client.PutPolicyAsync(vhost, name, body);
            return Results.Ok();
        });

        api.MapDelete("/policies/{vhost}/{name}", async (string vhost, string name, RabbitMqManagementClient client) =>
        {
            await client.DeletePolicyAsync(vhost, name);
            return Results.Ok();
        });

        // ── Vhost limits ─────────────────────────────────────────────────

        api.MapGet("/vhost-limits", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetVhostLimitsAsync();
            return Results.Ok(new ApiResponse<List<VhostLimit>>(data));
        });

        api.MapPut("/vhost-limits/{vhost}/{limitName}", async (string vhost, string limitName, SetVhostLimitRequest body, RabbitMqManagementClient client) =>
        {
            await client.SetVhostLimitAsync(vhost, limitName, body.Value);
            return Results.Ok();
        });

        api.MapDelete("/vhost-limits/{vhost}/{limitName}", async (string vhost, string limitName, RabbitMqManagementClient client) =>
        {
            await client.DeleteVhostLimitAsync(vhost, limitName);
            return Results.Ok();
        });

        // ── Global parameters ────────────────────────────────────────────

        api.MapGet("/global-parameters", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetGlobalParametersAsync();
            return Results.Ok(new ApiResponse<List<GlobalParameter>>(data));
        });

        api.MapPut("/global-parameters/{name}", async (string name, SetGlobalParameterRequest body, RabbitMqManagementClient client) =>
        {
            await client.SetGlobalParameterAsync(name, body);
            return Results.Ok();
        });

        api.MapDelete("/global-parameters/{name}", async (string name, RabbitMqManagementClient client) =>
        {
            await client.DeleteGlobalParameterAsync(name);
            return Results.Ok();
        });

        // ── Definitions ──────────────────────────────────────────────────

        api.MapGet("/definitions", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetDefinitionsAsync();
            return Results.Ok(new ApiResponse<JsonElement>(data));
        });

        api.MapPost("/definitions", async (HttpRequest request, RabbitMqManagementClient client) =>
        {
            var body = await request.ReadFromJsonAsync<JsonElement>();
            await client.ImportDefinitionsAsync(body);
            return Results.Ok();
        });

        // ── Topology (composite) ────────────────────────────────────────

        api.MapGet("/topology", async (RabbitMqManagementClient client) =>
        {
            var data = await client.GetTopologyAsync();
            return Results.Ok(new ApiResponse<object>(data));
        });
    }
}
