using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Rask.Client;
using Rask.Client.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// ── HttpClient (calls back to host server) ───────────────────────────────────

builder.Services.AddScoped(sp =>
    new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });

// ── Application services ─────────────────────────────────────────────────────

builder.Services.AddScoped<RabbitMqService>();
builder.Services.AddScoped<EnvironmentStateService>();
builder.Services.AddScoped<ThemeService>();

await builder.Build().RunAsync();
