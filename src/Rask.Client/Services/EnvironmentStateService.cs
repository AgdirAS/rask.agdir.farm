using System.Net.Http.Json;
using Rask.Shared.Models;

namespace Rask.Client.Services;

/// <summary>
/// Client-side state for environment management.
/// Manages the list of environments and the active one.
/// </summary>
public sealed class EnvironmentStateService
{
    private readonly HttpClient _http;

    public event Action? OnChange;

    public List<EnvEntry> Environments { get; private set; } = [];
    public string? ActiveSlug { get; private set; }
    public bool IsLoaded { get; private set; }

    public EnvironmentStateService(HttpClient http) => _http = http;

    public async Task LoadAsync()
    {
        var response = await _http.GetFromJsonAsync<EnvListResponse>("/api/envs");
        if (response is not null)
        {
            Environments = response.Envs;
            ActiveSlug = response.Active;
        }
        IsLoaded = true;
        OnChange?.Invoke();
    }

    public async Task ActivateAsync(string slug)
    {
        await _http.PostAsync($"/api/envs/{Uri.EscapeDataString(slug)}/activate", null);
        ActiveSlug = slug;
        OnChange?.Invoke();
    }

    public async Task CreateAsync(EnvEntry entry)
    {
        await _http.PostAsJsonAsync("/api/envs", entry);
        await LoadAsync();
    }

    public async Task UpdateAsync(string slug, EnvEntry entry)
    {
        await _http.PutAsJsonAsync($"/api/envs/{Uri.EscapeDataString(slug)}", entry);
        await LoadAsync();
    }

    public async Task DeleteAsync(string slug)
    {
        await _http.DeleteAsync($"/api/envs/{Uri.EscapeDataString(slug)}");
        await LoadAsync();
    }

    public async Task<bool> TestConnectionAsync(string managementUrl, string user, string password)
    {
        var response = await _http.PostAsJsonAsync("/api/settings/test", new Dictionary<string, string>
        {
            ["RABBITMQ_MANAGEMENT_URL"] = managementUrl,
            ["RABBITMQ_USER"] = user,
            ["RABBITMQ_PASSWORD"] = password,
        });
        var result = await response.Content.ReadFromJsonAsync<Dictionary<string, bool>>();
        return result?.GetValueOrDefault("ok") ?? false;
    }
}
