using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Rask.Shared.Models;

namespace Rask.Server.Services;

/// <summary>
/// Typed HttpClient that proxies requests to the RabbitMQ Management HTTP API.
/// Reads credentials from the active environment on each request.
/// </summary>
public sealed class RabbitMqManagementClient
{
    private readonly HttpClient _http;
    private readonly EnvironmentService _envService;
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    public RabbitMqManagementClient(HttpClient http, EnvironmentService envService)
    {
        _http = http;
        _envService = envService;
    }

    private async Task<(string BaseUrl, AuthenticationHeaderValue Auth)> GetCredsAsync()
    {
        var config = await _envService.GetConnectionConfigAsync();
        var baseUrl = config.ManagementUrl.TrimEnd('/');
        var auth = new AuthenticationHeaderValue(
            "Basic",
            Convert.ToBase64String(Encoding.UTF8.GetBytes($"{config.User}:{config.Password}"))
        );
        return (baseUrl, auth);
    }

    private async Task<T> FetchAsync<T>(string path, HttpMethod? method = null, object? body = null,
        Dictionary<string, string>? extraHeaders = null)
    {
        var (baseUrl, auth) = await GetCredsAsync();
        var url = $"{baseUrl}/api{path}";

        using var req = new HttpRequestMessage(method ?? HttpMethod.Get, url);
        req.Headers.Authorization = auth;

        if (body is not null)
        {
            req.Content = new StringContent(
                JsonSerializer.Serialize(body, JsonOpts),
                Encoding.UTF8,
                "application/json"
            );
        }

        if (extraHeaders is not null)
        {
            foreach (var (k, v) in extraHeaders)
                req.Headers.TryAddWithoutValidation(k, v);
        }

        var res = await _http.SendAsync(req);

        if (!res.IsSuccessStatusCode)
        {
            var errorBody = await res.Content.ReadAsStringAsync();
            throw new HttpRequestException(
                $"RabbitMQ API error: {(int)res.StatusCode} {res.ReasonPhrase} ({path}){(string.IsNullOrEmpty(errorBody) ? "" : $" — {errorBody}")}");
        }

        var text = await res.Content.ReadAsStringAsync();
        if (string.IsNullOrEmpty(text))
            return default!;
        return JsonSerializer.Deserialize<T>(text, JsonOpts)!;
    }

    private async Task FetchVoidAsync(string path, HttpMethod method, object? body = null,
        Dictionary<string, string>? extraHeaders = null)
    {
        var (baseUrl, auth) = await GetCredsAsync();
        var url = $"{baseUrl}/api{path}";

        using var req = new HttpRequestMessage(method, url);
        req.Headers.Authorization = auth;

        if (body is not null)
        {
            req.Content = new StringContent(
                JsonSerializer.Serialize(body, JsonOpts),
                Encoding.UTF8,
                "application/json"
            );
        }

        if (extraHeaders is not null)
        {
            foreach (var (k, v) in extraHeaders)
                req.Headers.TryAddWithoutValidation(k, v);
        }

        var res = await _http.SendAsync(req);

        if (!res.IsSuccessStatusCode)
        {
            var errorBody = await res.Content.ReadAsStringAsync();
            throw new HttpRequestException(
                $"RabbitMQ API error: {(int)res.StatusCode} {res.ReasonPhrase} ({path}){(string.IsNullOrEmpty(errorBody) ? "" : $" — {errorBody}")}");
        }
    }

    // ── Overview ─────────────────────────────────────────────────────────────

    public Task<Overview> GetOverviewAsync() =>
        FetchAsync<Overview>("/overview");

    public Task<List<NodeStats>> GetNodesAsync() =>
        FetchAsync<List<NodeStats>>("/nodes");

    public async Task<string> GetClusterNameAsync()
    {
        var res = await FetchAsync<ClusterNameResponse>("/cluster-name");
        return res.Name;
    }

    public Task SetClusterNameAsync(string name) =>
        FetchVoidAsync("/cluster-name", HttpMethod.Put, new { name });

    // ── Queues ───────────────────────────────────────────────────────────────

    public Task<List<RabbitQueue>> GetQueuesAsync() =>
        FetchAsync<List<RabbitQueue>>("/queues");

    public Task<RabbitQueue> GetQueueAsync(string vhost, string name) =>
        FetchAsync<RabbitQueue>($"/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}");

    public Task CreateQueueAsync(string vhost, string name, CreateQueueRequest body) =>
        FetchVoidAsync($"/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}", HttpMethod.Put, body);

    public Task DeleteQueueAsync(string vhost, string name) =>
        FetchVoidAsync($"/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}", HttpMethod.Delete);

    public Task PurgeQueueAsync(string vhost, string name) =>
        FetchVoidAsync($"/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}/contents", HttpMethod.Delete);

    public Task<List<QueueMessage>> GetQueueMessagesAsync(string vhost, string name, int count) =>
        FetchAsync<List<QueueMessage>>($"/queues/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}/get",
            HttpMethod.Post, new QueueGetRequest(count));

    public Task<PublishResponse> PublishToQueueAsync(string vhost, string name, PublishRequest payload) =>
        FetchAsync<PublishResponse>($"/exchanges/{Uri.EscapeDataString(vhost)}//publish",
            HttpMethod.Post, payload with { RoutingKey = name });

    public async Task<List<ConsumerDetail>> GetQueueConsumersAsync(string vhost, string name)
    {
        var all = await FetchAsync<JsonElement>("/consumers");
        var result = new List<ConsumerDetail>();
        if (all.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in all.EnumerateArray())
            {
                var q = item.GetProperty("queue");
                var qVhost = q.GetProperty("vhost").GetString();
                var qName = q.GetProperty("name").GetString();
                if (qVhost == vhost && qName == name)
                {
                    var consumer = item.Deserialize<ConsumerDetail>(JsonOpts);
                    if (consumer is not null) result.Add(consumer);
                }
            }
        }
        return result;
    }

    // ── Exchanges ────────────────────────────────────────────────────────────

    public Task<List<RabbitExchange>> GetExchangesAsync() =>
        FetchAsync<List<RabbitExchange>>("/exchanges");

    public Task DeleteExchangeAsync(string vhost, string name) =>
        FetchVoidAsync($"/exchanges/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}", HttpMethod.Delete);

    public Task<PublishResponse> PublishToExchangeAsync(string vhost, string exchange, PublishRequest payload) =>
        FetchAsync<PublishResponse>($"/exchanges/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(exchange)}/publish",
            HttpMethod.Post, payload);

    // ── Bindings ─────────────────────────────────────────────────────────────

    public Task<List<RabbitBinding>> GetBindingsAsync() =>
        FetchAsync<List<RabbitBinding>>("/bindings");

    public Task CreateBindingAsync(string vhost, string source, string destination, CreateBindingRequest body) =>
        FetchVoidAsync($"/bindings/{Uri.EscapeDataString(vhost)}/e/{Uri.EscapeDataString(source)}/q/{Uri.EscapeDataString(destination)}",
            HttpMethod.Post, body);

    public Task DeleteBindingAsync(string vhost, string source, string destination, string propsKey) =>
        FetchVoidAsync($"/bindings/{Uri.EscapeDataString(vhost)}/e/{Uri.EscapeDataString(source)}/q/{Uri.EscapeDataString(destination)}/{Uri.EscapeDataString(propsKey)}",
            HttpMethod.Delete);

    // ── Connections ──────────────────────────────────────────────────────────

    public Task<List<RabbitConnection>> GetConnectionsAsync() =>
        FetchAsync<List<RabbitConnection>>("/connections");

    public Task CloseConnectionAsync(string name) =>
        FetchVoidAsync($"/connections/{Uri.EscapeDataString(name)}", HttpMethod.Delete,
            extraHeaders: new() { ["X-Reason"] = "Closed via Rask" });

    public Task<List<RabbitChannel>> GetConnectionChannelsAsync(string connectionName) =>
        FetchAsync<List<RabbitChannel>>($"/connections/{Uri.EscapeDataString(connectionName)}/channels");

    // ── Channels ─────────────────────────────────────────────────────────────

    public Task<List<RabbitChannel>> GetChannelsAsync() =>
        FetchAsync<List<RabbitChannel>>("/channels");

    // ── Vhosts ───────────────────────────────────────────────────────────────

    public Task<List<RabbitVhost>> GetVhostsAsync() =>
        FetchAsync<List<RabbitVhost>>("/vhosts");

    public Task<List<VhostPermission>> GetVhostPermissionsAsync(string vhost) =>
        FetchAsync<List<VhostPermission>>($"/vhosts/{Uri.EscapeDataString(vhost)}/permissions");

    public Task CreateVhostAsync(string name, CreateVhostRequest body) =>
        FetchVoidAsync($"/vhosts/{Uri.EscapeDataString(name)}", HttpMethod.Put, body);

    public Task DeleteVhostAsync(string name) =>
        FetchVoidAsync($"/vhosts/{Uri.EscapeDataString(name)}", HttpMethod.Delete);

    public Task SetVhostTracingAsync(string name, bool tracing) =>
        FetchVoidAsync($"/vhosts/{Uri.EscapeDataString(name)}", HttpMethod.Put, new SetVhostTracingRequest(tracing));

    // ── Users ────────────────────────────────────────────────────────────────

    public Task<List<RabbitUser>> GetUsersAsync() =>
        FetchAsync<List<RabbitUser>>("/users");

    public Task PutUserAsync(string name, PutUserRequest body) =>
        FetchVoidAsync($"/users/{Uri.EscapeDataString(name)}", HttpMethod.Put, body);

    public Task DeleteUserAsync(string name) =>
        FetchVoidAsync($"/users/{Uri.EscapeDataString(name)}", HttpMethod.Delete);

    // ── Permissions ──────────────────────────────────────────────────────────

    public Task<List<VhostPermission>> GetAllPermissionsAsync() =>
        FetchAsync<List<VhostPermission>>("/permissions");

    public Task SetPermissionAsync(string vhost, string user, SetPermissionRequest body) =>
        FetchVoidAsync($"/permissions/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(user)}", HttpMethod.Put, body);

    public Task DeletePermissionAsync(string vhost, string user) =>
        FetchVoidAsync($"/permissions/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(user)}", HttpMethod.Delete);

    // ── Feature flags ────────────────────────────────────────────────────────

    public Task<List<FeatureFlag>> GetFeatureFlagsAsync() =>
        FetchAsync<List<FeatureFlag>>("/feature-flags");

    public Task EnableFeatureFlagAsync(string name) =>
        FetchVoidAsync($"/feature-flags/{Uri.EscapeDataString(name)}", HttpMethod.Put,
            new { state = "enabled" });

    // ── Policies ─────────────────────────────────────────────────────────────

    public Task<List<RabbitPolicy>> GetPoliciesAsync() =>
        FetchAsync<List<RabbitPolicy>>("/policies");

    public Task PutPolicyAsync(string vhost, string name, PutPolicyRequest body) =>
        FetchVoidAsync($"/policies/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}", HttpMethod.Put, body);

    public Task DeletePolicyAsync(string vhost, string name) =>
        FetchVoidAsync($"/policies/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(name)}", HttpMethod.Delete);

    // ── Vhost limits ─────────────────────────────────────────────────────────

    public Task<List<VhostLimit>> GetVhostLimitsAsync() =>
        FetchAsync<List<VhostLimit>>("/vhost-limits");

    public Task SetVhostLimitAsync(string vhost, string limitName, int value) =>
        FetchVoidAsync($"/vhost-limits/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(limitName)}",
            HttpMethod.Put, new SetVhostLimitRequest(value));

    public Task DeleteVhostLimitAsync(string vhost, string limitName) =>
        FetchVoidAsync($"/vhost-limits/{Uri.EscapeDataString(vhost)}/{Uri.EscapeDataString(limitName)}", HttpMethod.Delete);

    // ── Global parameters ────────────────────────────────────────────────────

    public Task<List<GlobalParameter>> GetGlobalParametersAsync() =>
        FetchAsync<List<GlobalParameter>>("/global-parameters");

    public Task SetGlobalParameterAsync(string name, SetGlobalParameterRequest body) =>
        FetchVoidAsync($"/global-parameters/{Uri.EscapeDataString(name)}", HttpMethod.Put, body);

    public Task DeleteGlobalParameterAsync(string name) =>
        FetchVoidAsync($"/global-parameters/{Uri.EscapeDataString(name)}", HttpMethod.Delete);

    // ── Definitions ──────────────────────────────────────────────────────────

    public Task<JsonElement> GetDefinitionsAsync() =>
        FetchAsync<JsonElement>("/definitions");

    public Task ImportDefinitionsAsync(JsonElement body) =>
        FetchVoidAsync("/definitions", HttpMethod.Post, body);

    // ── Topology (composite) ─────────────────────────────────────────────────

    public async Task<object> GetTopologyAsync()
    {
        var exchanges = await GetExchangesAsync();
        var queues = await GetQueuesAsync();
        var bindings = await GetBindingsAsync();
        return new { exchanges, queues, bindings };
    }

    // ── Connection test ──────────────────────────────────────────────────────

    public async Task<bool> TestConnectionAsync(string managementUrl, string user, string password)
    {
        try
        {
            var url = $"{managementUrl.TrimEnd('/')}/api/overview";
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Authorization = new AuthenticationHeaderValue(
                "Basic",
                Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user}:{password}"))
            );
            var res = await _http.SendAsync(req);
            return res.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}
