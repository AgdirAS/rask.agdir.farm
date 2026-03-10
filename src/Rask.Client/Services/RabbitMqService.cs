using System.Net.Http.Json;
using Rask.Shared.Models;

namespace Rask.Client.Services;

/// <summary>
/// Client-side service that calls the server API proxy endpoints.
/// Replaces TanStack React Query with manual HTTP + polling.
/// </summary>
public sealed class RabbitMqService
{
    private readonly HttpClient _http;

    public RabbitMqService(HttpClient http) => _http = http;

    // ── Generic fetch helpers ────────────────────────────────────────────────

    private async Task<T?> GetDataAsync<T>(string url)
    {
        var response = await _http.GetFromJsonAsync<ApiResponse<T>>(url);
        return response is not null ? response.Data : default;
    }

    // ── Overview ─────────────────────────────────────────────────────────────

    public Task<Overview?> GetOverviewAsync() =>
        GetDataAsync<Overview>("/api/rabbitmq/overview");

    public Task<List<NodeStats>?> GetNodesAsync() =>
        GetDataAsync<List<NodeStats>>("/api/rabbitmq/nodes");

    // ── Queues ───────────────────────────────────────────────────────────────

    public Task<List<RabbitQueue>?> GetQueuesAsync() =>
        GetDataAsync<List<RabbitQueue>>("/api/rabbitmq/queues");

    public Task<RabbitQueue?> GetQueueAsync(string vhost, string name) =>
        GetDataAsync<RabbitQueue>($"/api/rabbitmq/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}");

    public async Task CreateQueueAsync(string vhost, string name, CreateQueueRequest body) =>
        await _http.PutAsJsonAsync($"/api/rabbitmq/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}", body);

    public async Task DeleteQueueAsync(string vhost, string name) =>
        await _http.DeleteAsync($"/api/rabbitmq/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}");

    public async Task PurgeQueueAsync(string vhost, string name) =>
        await _http.PostAsync($"/api/rabbitmq/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}/purge", null);

    public async Task<List<QueueMessage>?> GetQueueMessagesAsync(string vhost, string name, int count = 5)
    {
        var response = await _http.PostAsJsonAsync(
            $"/api/rabbitmq/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}/get",
            new QueueGetRequest(count));
        var result = await response.Content.ReadFromJsonAsync<ApiResponse<List<QueueMessage>>>();
        return result?.Data;
    }

    public async Task<PublishResponse?> PublishToQueueAsync(string vhost, string name, PublishRequest payload)
    {
        var response = await _http.PostAsJsonAsync(
            $"/api/rabbitmq/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}/publish", payload);
        var result = await response.Content.ReadFromJsonAsync<ApiResponse<PublishResponse>>();
        return result?.Data;
    }

    public Task<List<ConsumerDetail>?> GetQueueConsumersAsync(string vhost, string name) =>
        GetDataAsync<List<ConsumerDetail>>($"/api/rabbitmq/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}/consumers");

    // ── Exchanges ────────────────────────────────────────────────────────────

    public Task<List<RabbitExchange>?> GetExchangesAsync() =>
        GetDataAsync<List<RabbitExchange>>("/api/rabbitmq/exchanges");

    public async Task DeleteExchangeAsync(string vhost, string name) =>
        await _http.DeleteAsync($"/api/rabbitmq/exchanges/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}");

    public async Task<PublishResponse?> PublishToExchangeAsync(string vhost, string exchange, PublishRequest payload)
    {
        var response = await _http.PostAsJsonAsync(
            $"/api/rabbitmq/exchanges/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(exchange)}/publish", payload);
        var result = await response.Content.ReadFromJsonAsync<ApiResponse<PublishResponse>>();
        return result?.Data;
    }

    // ── Bindings ─────────────────────────────────────────────────────────────

    public Task<List<RabbitBinding>?> GetBindingsAsync() =>
        GetDataAsync<List<RabbitBinding>>("/api/rabbitmq/bindings");

    public async Task CreateBindingAsync(string vhost, string source, string destination, CreateBindingRequest body) =>
        await _http.PostAsJsonAsync(
            $"/api/rabbitmq/bindings/{Uri.EscapeDataString(vhost)}/e/{Uri.EscapeDataString(source)}/q/{Uri.EscapeDataString(destination)}", body);

    public async Task DeleteBindingAsync(string vhost, string source, string destination, string propsKey) =>
        await _http.DeleteAsync(
            $"/api/rabbitmq/bindings/{Uri.EscapeDataString(vhost)}/e/{Uri.EscapeDataString(source)}/q/{Uri.EscapeDataString(destination)}/{Uri.EscapeDataString(propsKey)}");

    // ── Connections ──────────────────────────────────────────────────────────

    public Task<List<RabbitConnection>?> GetConnectionsAsync() =>
        GetDataAsync<List<RabbitConnection>>("/api/rabbitmq/connections");

    public async Task CloseConnectionAsync(string name) =>
        await _http.PostAsJsonAsync("/api/rabbitmq/connections/close", new { name });

    public Task<List<RabbitChannel>?> GetConnectionChannelsAsync(string connectionName) =>
        GetDataAsync<List<RabbitChannel>>($"/api/rabbitmq/connections/{Uri.EscapeDataString(connectionName)}/channels");

    // ── Channels ─────────────────────────────────────────────────────────────

    public Task<List<RabbitChannel>?> GetChannelsAsync() =>
        GetDataAsync<List<RabbitChannel>>("/api/rabbitmq/channels");

    // ── Vhosts ───────────────────────────────────────────────────────────────

    public Task<List<RabbitVhost>?> GetVhostsAsync() =>
        GetDataAsync<List<RabbitVhost>>("/api/rabbitmq/vhosts");

    public async Task CreateVhostAsync(string name, CreateVhostRequest body) =>
        await _http.PutAsJsonAsync($"/api/rabbitmq/vhosts/{Uri.EscapeDataString(name)}", body);

    public async Task DeleteVhostAsync(string name) =>
        await _http.DeleteAsync($"/api/rabbitmq/vhosts/{Uri.EscapeDataString(name)}");

    public async Task SetVhostTracingAsync(string name, bool tracing) =>
        await _http.PostAsync($"/api/rabbitmq/vhosts/{Uri.EscapeDataString(name)}/{(tracing ? "trace-on" : "trace-off")}", null);

    // ── Users ────────────────────────────────────────────────────────────────

    public Task<List<RabbitUser>?> GetUsersAsync() =>
        GetDataAsync<List<RabbitUser>>("/api/rabbitmq/users");

    public async Task PutUserAsync(string name, PutUserRequest body) =>
        await _http.PutAsJsonAsync($"/api/rabbitmq/users/{Uri.EscapeDataString(name)}", body);

    public async Task DeleteUserAsync(string name) =>
        await _http.DeleteAsync($"/api/rabbitmq/users/{Uri.EscapeDataString(name)}");

    // ── Permissions ──────────────────────────────────────────────────────────

    public Task<List<VhostPermission>?> GetPermissionsAsync() =>
        GetDataAsync<List<VhostPermission>>("/api/rabbitmq/permissions");

    public async Task SetPermissionAsync(string vhost, string user, SetPermissionRequest body) =>
        await _http.PutAsJsonAsync($"/api/rabbitmq/permissions/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(user)}", body);

    public async Task DeletePermissionAsync(string vhost, string user) =>
        await _http.DeleteAsync($"/api/rabbitmq/permissions/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(user)}");

    // ── Feature flags ────────────────────────────────────────────────────────

    public Task<List<FeatureFlag>?> GetFeatureFlagsAsync() =>
        GetDataAsync<List<FeatureFlag>>("/api/rabbitmq/feature-flags");

    public async Task EnableFeatureFlagAsync(string name) =>
        await _http.PutAsync($"/api/rabbitmq/feature-flags/{Uri.EscapeDataString(name)}", null);

    // ── Policies ─────────────────────────────────────────────────────────────

    public Task<List<RabbitPolicy>?> GetPoliciesAsync() =>
        GetDataAsync<List<RabbitPolicy>>("/api/rabbitmq/policies");

    public async Task PutPolicyAsync(string vhost, string name, PutPolicyRequest body) =>
        await _http.PutAsJsonAsync($"/api/rabbitmq/policies/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}", body);

    public async Task DeletePolicyAsync(string vhost, string name) =>
        await _http.DeleteAsync($"/api/rabbitmq/policies/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}");

    // ── Vhost limits ─────────────────────────────────────────────────────────

    public Task<List<VhostLimit>?> GetVhostLimitsAsync() =>
        GetDataAsync<List<VhostLimit>>("/api/rabbitmq/vhost-limits");

    public async Task SetVhostLimitAsync(string vhost, string limitName, int value) =>
        await _http.PutAsJsonAsync(
            $"/api/rabbitmq/vhost-limits/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(limitName)}",
            new SetVhostLimitRequest(value));

    public async Task DeleteVhostLimitAsync(string vhost, string limitName) =>
        await _http.DeleteAsync(
            $"/api/rabbitmq/vhost-limits/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(limitName)}");

    // ── Global parameters ────────────────────────────────────────────────────

    public Task<List<GlobalParameter>?> GetGlobalParametersAsync() =>
        GetDataAsync<List<GlobalParameter>>("/api/rabbitmq/global-parameters");

    public async Task SetGlobalParameterAsync(string name, SetGlobalParameterRequest body) =>
        await _http.PutAsJsonAsync($"/api/rabbitmq/global-parameters/{Uri.EscapeDataString(name)}", body);

    public async Task DeleteGlobalParameterAsync(string name) =>
        await _http.DeleteAsync($"/api/rabbitmq/global-parameters/{Uri.EscapeDataString(name)}");

    // ── Definitions ──────────────────────────────────────────────────────────

    public async Task<string?> GetDefinitionsJsonAsync()
    {
        var response = await _http.GetAsync("/api/rabbitmq/definitions");
        if (!response.IsSuccessStatusCode) return null;
        return await response.Content.ReadAsStringAsync();
    }

    public async Task ImportDefinitionsAsync(string json) =>
        await _http.PostAsync("/api/rabbitmq/definitions",
            new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
}
