using Microsoft.EntityFrameworkCore;
using Rask.Server.Controllers;
using Rask.Server.Data;
using Rask.Server.Hubs;
using Rask.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Data directory ───────────────────────────────────────────────────────────

var dataDir = builder.Configuration["RASK_DATA_DIR"]
    ?? Path.Combine(Directory.GetCurrentDirectory(), "data");
Directory.CreateDirectory(dataDir);
var dbPath = Path.Combine(dataDir, "rask.db");

// ── Services ─────────────────────────────────────────────────────────────────

builder.Services.AddDbContextFactory<RaskDbContext>(options =>
    options.UseSqlite($"Data Source={dbPath};Mode=ReadWriteCreate;Cache=Shared"));

builder.Services.AddSingleton<EncryptionService>();
builder.Services.AddSingleton<EnvironmentService>();

builder.Services.AddHttpClient<RabbitMqManagementClient>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});

builder.Services.AddSignalR();
builder.Services.AddControllersWithViews();
builder.Services.AddRazorPages();

var app = builder.Build();

// ── Initialize database ──────────────────────────────────────────────────────

using (var scope = app.Services.CreateScope())
{
    var envService = scope.ServiceProvider.GetRequiredService<EnvironmentService>();
    await envService.InitializeAsync();
}

// ── Middleware ────────────────────────────────────────────────────────────────

if (app.Environment.IsDevelopment())
{
    app.UseWebAssemblyDebugging();
}

app.UseBlazorFrameworkFiles();
app.UseStaticFiles();
app.UseRouting();

// ── API endpoints ────────────────────────────────────────────────────────────

app.MapRabbitMqEndpoints();
app.MapEnvironmentEndpoints();

// ── SignalR ──────────────────────────────────────────────────────────────────

app.MapHub<TraceHub>("/hubs/trace");

// ── Blazor fallback ──────────────────────────────────────────────────────────

app.MapRazorPages();
app.MapControllers();
app.MapFallbackToFile("index.html");

await app.RunAsync();

// Expose for WebApplicationFactory in integration tests
public partial class Program { }
