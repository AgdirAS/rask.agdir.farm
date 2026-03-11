using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Rask.Server.Data;
using Rask.Shared.Models;

namespace Rask.Server.Services;

public sealed partial class EnvironmentService
{
    private readonly IDbContextFactory<RaskDbContext> _dbFactory;
    private readonly EncryptionService _encryption;
    private readonly IConfiguration _config;

    public EnvironmentService(
        IDbContextFactory<RaskDbContext> dbFactory,
        EncryptionService encryption,
        IConfiguration config)
    {
        _dbFactory = dbFactory;
        _encryption = encryption;
        _config = config;
    }

    [GeneratedRegex(@"^[a-z0-9][a-z0-9_-]*$")]
    private static partial Regex SlugPattern();

    public bool ValidateSlug(string slug) => SlugPattern().IsMatch(slug);

    public async Task InitializeAsync()
    {
        await using var db = await _dbFactory.CreateDbContextAsync();
        await db.Database.EnsureCreatedAsync();

        var count = await db.Environments.CountAsync();
        if (count == 0)
        {
            var host = _config["RABBITMQ_HOST"] ?? "localhost";
            var mgmtPort = _config["RABBITMQ_MANAGEMENT_PORT"] ?? "15672";
            var defaults = new EnvEntry(
                Slug: "localhost",
                Name: "Localhost",
                ManagementUrl: _config["RABBITMQ_MANAGEMENT_URL"] ?? $"http://{host}:{mgmtPort}",
                AmqpPort: _config["RABBITMQ_AMQP_PORT"] ?? "5672",
                User: _config["RABBITMQ_USER"] ?? "guest",
                Password: _config["RABBITMQ_PASSWORD"] ?? "guest",
                Vhost: _config["RABBITMQ_VHOST"] ?? "/"
            );

            db.Environments.Add(new EnvironmentEntity
            {
                Slug = defaults.Slug,
                Data = _encryption.Encode(JsonSerializer.Serialize(defaults))
            });

            var existing = await db.Settings.FindAsync("active_slug");
            if (existing is null)
                db.Settings.Add(new SettingEntity { Key = "active_slug", Value = defaults.Slug });
            else
                existing.Value = defaults.Slug;

            await db.SaveChangesAsync();
        }
    }

    public async Task<List<EnvEntry>> ListEnvsAsync()
    {
        await using var db = await _dbFactory.CreateDbContextAsync();
        var rows = await db.Environments.OrderBy(e => e.Slug).ToListAsync();
        return rows.Select(r => RowToEntry(r.Slug, r.Data)).ToList();
    }

    public async Task CreateEnvAsync(EnvEntry entry)
    {
        await using var db = await _dbFactory.CreateDbContextAsync();
        db.Environments.Add(new EnvironmentEntity
        {
            Slug = entry.Slug,
            Data = _encryption.Encode(JsonSerializer.Serialize(entry))
        });
        await db.SaveChangesAsync();
    }

    public async Task UpdateEnvAsync(string slug, EnvEntry entry)
    {
        await using var db = await _dbFactory.CreateDbContextAsync();
        var row = await db.Environments.FindAsync(slug);
        if (row is not null)
        {
            row.Data = _encryption.Encode(JsonSerializer.Serialize(entry));
            await db.SaveChangesAsync();
        }
    }

    public async Task DeleteEnvAsync(string slug)
    {
        await using var db = await _dbFactory.CreateDbContextAsync();
        var row = await db.Environments.FindAsync(slug);
        if (row is not null)
        {
            db.Environments.Remove(row);

            var activeSlug = await GetActiveSlugAsync(db);
            if (activeSlug == slug)
            {
                var setting = await db.Settings.FindAsync("active_slug");
                if (setting is not null) db.Settings.Remove(setting);
            }

            await db.SaveChangesAsync();
        }
    }

    public async Task<string?> GetActiveSlugAsync()
    {
        await using var db = await _dbFactory.CreateDbContextAsync();
        return await GetActiveSlugAsync(db);
    }

    private static async Task<string?> GetActiveSlugAsync(RaskDbContext db)
    {
        var setting = await db.Settings.FindAsync("active_slug");
        return setting?.Value;
    }

    public async Task ActivateEnvAsync(string slug)
    {
        await using var db = await _dbFactory.CreateDbContextAsync();
        var exists = await db.Environments.AnyAsync(e => e.Slug == slug);
        if (!exists) throw new InvalidOperationException($"Env not found: {slug}");

        var setting = await db.Settings.FindAsync("active_slug");
        if (setting is null)
            db.Settings.Add(new SettingEntity { Key = "active_slug", Value = slug });
        else
            setting.Value = slug;

        await db.SaveChangesAsync();
    }

    public async Task<ConnectionConfig> GetConnectionConfigAsync()
    {
        await using var db = await _dbFactory.CreateDbContextAsync();
        var slug = await GetActiveSlugAsync(db);

        if (slug is not null)
        {
            var row = await db.Environments.FindAsync(slug);
            if (row is not null)
            {
                var entry = RowToEntry(slug, row.Data);
                return new ConnectionConfig(
                    ManagementUrl: entry.ManagementUrl,
                    AmqpPort: entry.AmqpPort,
                    User: entry.User,
                    Password: entry.Password,
                    Vhost: entry.Vhost
                );
            }
        }

        // Fall back to environment variables
        return new ConnectionConfig(
            ManagementUrl: _config["RABBITMQ_MANAGEMENT_URL"] ?? "http://localhost:15672",
            AmqpPort: _config["RABBITMQ_AMQP_PORT"] ?? "5672",
            User: _config["RABBITMQ_USER"] ?? "guest",
            Password: _config["RABBITMQ_PASSWORD"] ?? "guest",
            Vhost: _config["RABBITMQ_VHOST"] ?? "/"
        );
    }

    private EnvEntry RowToEntry(string slug, string data)
    {
        var decoded = _encryption.Decode(data);
        var entry = JsonSerializer.Deserialize<EnvEntry>(decoded)!;
        return entry with { Slug = slug };
    }
}
