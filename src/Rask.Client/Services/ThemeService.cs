using Microsoft.JSInterop;

namespace Rask.Client.Services;

/// <summary>
/// Manages dark/light theme preference, persisted to localStorage.
/// </summary>
public sealed class ThemeService
{
    private readonly IJSRuntime _js;
    private bool _isDarkMode;
    private bool _initialized;

    public event Action? OnChange;

    public bool IsDarkMode
    {
        get => _isDarkMode;
        set
        {
            if (_isDarkMode == value) return;
            _isDarkMode = value;
            OnChange?.Invoke();
            _ = PersistAsync();
        }
    }

    public ThemeService(IJSRuntime js) => _js = js;

    public async Task InitializeAsync()
    {
        if (_initialized) return;
        try
        {
            var stored = await _js.InvokeAsync<string?>("localStorage.getItem", "rask-theme");
            _isDarkMode = stored == "dark" || (stored is null && await PrefersDarkAsync());
        }
        catch
        {
            // SSR or JS not ready
        }
        _initialized = true;
        OnChange?.Invoke();
    }

    public void Toggle()
    {
        IsDarkMode = !IsDarkMode;
    }

    private async Task PersistAsync()
    {
        try
        {
            await _js.InvokeVoidAsync("localStorage.setItem", "rask-theme", _isDarkMode ? "dark" : "light");
        }
        catch
        {
            // Ignore
        }
    }

    private async Task<bool> PrefersDarkAsync()
    {
        try
        {
            return await _js.InvokeAsync<bool>("eval", "window.matchMedia('(prefers-color-scheme: dark)').matches");
        }
        catch
        {
            return false;
        }
    }
}
