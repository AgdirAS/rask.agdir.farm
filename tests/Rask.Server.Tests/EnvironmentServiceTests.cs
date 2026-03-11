using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Rask.Server.Data;
using Rask.Server.Services;
using Rask.Shared.Models;
using Xunit;

namespace Rask.Server.Tests;

public class EnvironmentServiceTests : IAsyncLifetime
{
    private IDbContextFactory<RaskDbContext> _dbFactory = null!;
    private EnvironmentService _svc = null!;

    public async Task InitializeAsync()
    {
        var options = new DbContextOptionsBuilder<RaskDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        // For in-memory SQLite, we need a shared connection that stays open
        var connection = new Microsoft.Data.Sqlite.SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var factoryOptions = new DbContextOptionsBuilder<RaskDbContext>()
            .UseSqlite(connection)
            .Options;

        // Create schema
        using (var ctx = new RaskDbContext(factoryOptions))
        {
            await ctx.Database.EnsureCreatedAsync();
        }

        _dbFactory = new TestDbContextFactory(factoryOptions);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RABBITMQ_HOST"] = "testhost",
                ["RABBITMQ_USER"] = "testuser",
                ["RABBITMQ_PASSWORD"] = "testpass",
            })
            .Build();

        var encryption = new EncryptionService(config);
        _svc = new EnvironmentService(_dbFactory, encryption, config);
        await _svc.InitializeAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task InitializeAsync_SeedsDefaultEnvironment()
    {
        var envs = await _svc.ListEnvsAsync();
        Assert.Single(envs);
        Assert.Equal("localhost", envs[0].Slug);
        Assert.Equal("Localhost", envs[0].Name);
        Assert.Equal("testuser", envs[0].User);
    }

    [Fact]
    public async Task InitializeAsync_SetsActiveSlug()
    {
        var slug = await _svc.GetActiveSlugAsync();
        Assert.Equal("localhost", slug);
    }

    [Fact]
    public async Task CreateEnv_AddsNewEnvironment()
    {
        var entry = new EnvEntry("prod", "Production", "http://prod:15672", "5672", "admin", "secret", "/");
        await _svc.CreateEnvAsync(entry);

        var envs = await _svc.ListEnvsAsync();
        Assert.Equal(2, envs.Count);
        Assert.Contains(envs, e => e.Slug == "prod");
    }

    [Fact]
    public async Task UpdateEnv_ModifiesExistingEnvironment()
    {
        var updated = new EnvEntry("localhost", "Updated", "http://new:15672", "5672", "newuser", "newpass", "/new");
        await _svc.UpdateEnvAsync("localhost", updated);

        var envs = await _svc.ListEnvsAsync();
        var env = envs.First(e => e.Slug == "localhost");
        Assert.Equal("Updated", env.Name);
        Assert.Equal("newuser", env.User);
    }

    [Fact]
    public async Task DeleteEnv_RemovesEnvironment()
    {
        var entry = new EnvEntry("todelete", "To Delete", "http://x:15672", "5672", "u", "p", "/");
        await _svc.CreateEnvAsync(entry);

        await _svc.DeleteEnvAsync("todelete");

        var envs = await _svc.ListEnvsAsync();
        Assert.DoesNotContain(envs, e => e.Slug == "todelete");
    }

    [Fact]
    public async Task DeleteEnv_ClearsActiveSlug_WhenDeletingActiveEnv()
    {
        // Create and activate a second env
        var entry = new EnvEntry("second", "Second", "http://x:15672", "5672", "u", "p", "/");
        await _svc.CreateEnvAsync(entry);
        await _svc.ActivateEnvAsync("second");

        // Delete the active one
        await _svc.DeleteEnvAsync("second");

        var slug = await _svc.GetActiveSlugAsync();
        Assert.Null(slug);
    }

    [Fact]
    public async Task ActivateEnv_SwitchesActiveEnvironment()
    {
        var entry = new EnvEntry("staging", "Staging", "http://staging:15672", "5672", "u", "p", "/");
        await _svc.CreateEnvAsync(entry);

        await _svc.ActivateEnvAsync("staging");

        var slug = await _svc.GetActiveSlugAsync();
        Assert.Equal("staging", slug);
    }

    [Fact]
    public async Task ActivateEnv_ThrowsForNonexistent()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _svc.ActivateEnvAsync("nonexistent"));
    }

    [Fact]
    public async Task GetConnectionConfig_ReturnsActiveEnvConfig()
    {
        var config = await _svc.GetConnectionConfigAsync();
        Assert.Equal("testuser", config.User);
        Assert.Equal("testpass", config.Password);
    }

    [Fact]
    public async Task GetConnectionConfig_FallsBackToEnvVars_WhenNoActiveSlug()
    {
        await _svc.DeleteEnvAsync("localhost");

        var config = await _svc.GetConnectionConfigAsync();
        // Falls back to RABBITMQ_* env vars from config
        Assert.Equal("testuser", config.User);
    }

    [Theory]
    [InlineData("valid-slug", true)]
    [InlineData("my_env_1", true)]
    [InlineData("a", true)]
    [InlineData("", false)]
    [InlineData("Invalid", false)]
    [InlineData("-starts-with-dash", false)]
    [InlineData("has spaces", false)]
    [InlineData("has.dots", false)]
    public void ValidateSlug_ReturnsExpected(string slug, bool expected)
    {
        Assert.Equal(expected, _svc.ValidateSlug(slug));
    }

    /// <summary>
    /// Simple IDbContextFactory for testing with a fixed options instance.
    /// </summary>
    private sealed class TestDbContextFactory(DbContextOptions<RaskDbContext> options)
        : IDbContextFactory<RaskDbContext>
    {
        public RaskDbContext CreateDbContext() => new(options);
    }
}
