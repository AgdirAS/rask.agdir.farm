using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Rask.Server.Data;
using Rask.Shared.Models;
using Xunit;

namespace Rask.Server.Tests;

public class ApiIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public ApiIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                // Replace SQLite with in-memory for tests
                var descriptor = services.SingleOrDefault(
                    d => d.ServiceType == typeof(DbContextOptions<RaskDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                // Remove the factory registration too
                var factoryDescriptor = services.SingleOrDefault(
                    d => d.ServiceType == typeof(IDbContextFactory<RaskDbContext>));
                if (factoryDescriptor != null) services.Remove(factoryDescriptor);

                services.AddDbContextFactory<RaskDbContext>(options =>
                    options.UseSqlite("Data Source=integration_test.db;Mode=ReadWriteCreate"));
            });
        }).CreateClient();
    }

    [Fact]
    public async Task GetEnvs_ReturnsEnvList()
    {
        var response = await _client.GetAsync("/api/envs");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<EnvListResponse>();
        Assert.NotNull(result);
        Assert.NotNull(result.Envs);
        // Should have at least the default "localhost" env
        Assert.True(result.Envs.Count >= 1);
    }

    [Fact]
    public async Task GetSettings_ReturnsConnectionConfig()
    {
        var response = await _client.GetAsync("/api/settings");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<Dictionary<string, string>>();
        Assert.NotNull(result);
        Assert.True(result.ContainsKey("RABBITMQ_MANAGEMENT_URL"));
        Assert.True(result.ContainsKey("RABBITMQ_USER"));
    }

    [Fact]
    public async Task PostEnv_CreateAndList()
    {
        var slug = $"test-{Guid.NewGuid():N}"[..16];
        var entry = new EnvEntry(slug, "Test Env", "http://test:15672", "5672", "user", "pass", "/");

        var createResponse = await _client.PostAsJsonAsync("/api/envs", entry);
        Assert.Equal(HttpStatusCode.OK, createResponse.StatusCode);

        var listResponse = await _client.GetAsync("/api/envs");
        var result = await listResponse.Content.ReadFromJsonAsync<EnvListResponse>();
        Assert.Contains(result!.Envs, e => e.Slug == slug);

        // Cleanup
        await _client.DeleteAsync($"/api/envs/{slug}");
    }

    [Fact]
    public async Task PostEnv_InvalidSlug_ReturnsBadRequest()
    {
        var entry = new EnvEntry("INVALID SLUG", "Bad", "http://x:15672", "5672", "u", "p", "/");
        var response = await _client.PostAsJsonAsync("/api/envs", entry);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ActivateEnv_SetsActiveSlug()
    {
        var response = await _client.PostAsync("/api/envs/localhost/activate", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var listResponse = await _client.GetAsync("/api/envs");
        var result = await listResponse.Content.ReadFromJsonAsync<EnvListResponse>();
        Assert.Equal("localhost", result!.Active);
    }

    [Fact]
    public async Task TestConnection_ReturnsResult()
    {
        var body = new Dictionary<string, string>
        {
            ["RABBITMQ_MANAGEMENT_URL"] = "http://localhost:99999", // Won't connect
            ["RABBITMQ_USER"] = "guest",
            ["RABBITMQ_PASSWORD"] = "guest",
        };

        var response = await _client.PostAsJsonAsync("/api/settings/test", body);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<Dictionary<string, bool>>();
        Assert.NotNull(result);
        Assert.False(result["ok"]); // Should fail since no RabbitMQ is running
    }

    [Fact]
    public async Task RabbitMqOverview_Returns500_WhenNoRabbitMq()
    {
        // Without a real RabbitMQ, the proxy will fail
        var response = await _client.GetAsync("/api/rabbitmq/overview");
        // Should be 500 since we can't reach RabbitMQ
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }
}
