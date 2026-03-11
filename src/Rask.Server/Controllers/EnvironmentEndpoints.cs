using Rask.Server.Services;
using Rask.Shared.Models;

namespace Rask.Server.Controllers;

/// <summary>
/// Minimal API endpoints for environment management and settings.
/// Mirrors /api/envs/* and /api/settings/* routes from Next.js.
/// </summary>
public static class EnvironmentEndpoints
{
    public static void MapEnvironmentEndpoints(this WebApplication app)
    {
        // ── Environments ─────────────────────────────────────────────────

        var envs = app.MapGroup("/api/envs").WithTags("Environments");

        envs.MapGet("/", async (EnvironmentService svc) =>
        {
            var list = await svc.ListEnvsAsync();
            var active = await svc.GetActiveSlugAsync();
            return Results.Ok(new EnvListResponse(list, active));
        });

        envs.MapPost("/", async (EnvEntry entry, EnvironmentService svc) =>
        {
            if (!svc.ValidateSlug(entry.Slug))
                return Results.BadRequest(new { error = "Invalid slug" });
            await svc.CreateEnvAsync(entry);
            return Results.Ok();
        });

        envs.MapPut("/{slug}", async (string slug, EnvEntry entry, EnvironmentService svc) =>
        {
            await svc.UpdateEnvAsync(slug, entry);
            return Results.Ok();
        });

        envs.MapDelete("/{slug}", async (string slug, EnvironmentService svc) =>
        {
            await svc.DeleteEnvAsync(slug);
            return Results.Ok();
        });

        envs.MapPost("/{slug}/activate", async (string slug, EnvironmentService svc) =>
        {
            await svc.ActivateEnvAsync(slug);
            return Results.Ok();
        });

        // ── Settings (legacy compat) ────────────────────────────────────

        var settings = app.MapGroup("/api/settings").WithTags("Settings");

        settings.MapGet("/", async (EnvironmentService svc) =>
        {
            var config = await svc.GetConnectionConfigAsync();
            return Results.Ok(new Dictionary<string, string>
            {
                ["RABBITMQ_MANAGEMENT_URL"] = config.ManagementUrl,
                ["RABBITMQ_AMQP_PORT"] = config.AmqpPort,
                ["RABBITMQ_USER"] = config.User,
                ["RABBITMQ_PASSWORD"] = config.Password,
                ["RABBITMQ_VHOST"] = config.Vhost,
            });
        });

        settings.MapPost("/", async (HttpRequest request, EnvironmentService svc) =>
        {
            var vars = await request.ReadFromJsonAsync<Dictionary<string, string>>();
            if (vars is null) return Results.BadRequest();

            var slug = await svc.GetActiveSlugAsync();
            if (slug is null) return Results.Ok();

            var envs2 = await svc.ListEnvsAsync();
            var existing = envs2.FirstOrDefault(e => e.Slug == slug);
            if (existing is null) return Results.Ok();

            var updated = existing with
            {
                ManagementUrl = vars.GetValueOrDefault("RABBITMQ_MANAGEMENT_URL", existing.ManagementUrl),
                AmqpPort = vars.GetValueOrDefault("RABBITMQ_AMQP_PORT", existing.AmqpPort),
                User = vars.GetValueOrDefault("RABBITMQ_USER", existing.User),
                Password = vars.GetValueOrDefault("RABBITMQ_PASSWORD", existing.Password),
                Vhost = vars.GetValueOrDefault("RABBITMQ_VHOST", existing.Vhost),
            };

            await svc.UpdateEnvAsync(slug, updated);
            return Results.Ok();
        });

        settings.MapPost("/test", async (HttpRequest request, RabbitMqManagementClient rmq) =>
        {
            var body = await request.ReadFromJsonAsync<Dictionary<string, string>>();
            if (body is null) return Results.BadRequest();

            var url = body.GetValueOrDefault("RABBITMQ_MANAGEMENT_URL", "http://localhost:15672");
            var user = body.GetValueOrDefault("RABBITMQ_USER", "guest");
            var pass = body.GetValueOrDefault("RABBITMQ_PASSWORD", "guest");

            var ok = await rmq.TestConnectionAsync(url, user, pass);
            return Results.Ok(new { ok });
        });
    }
}
