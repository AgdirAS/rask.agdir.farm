using Microsoft.Extensions.Configuration;
using Rask.Server.Services;
using Xunit;

namespace Rask.Server.Tests;

public class EncryptionServiceTests
{
    [Fact]
    public void Encode_Decode_WithKey_RoundTrips()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["STORAGE_ENCRYPTION_KEY"] = "my-secret-key-for-testing"
            })
            .Build();

        var svc = new EncryptionService(config);
        var plaintext = "Hello, RabbitMQ!";

        var encoded = svc.Encode(plaintext);
        Assert.NotEqual(plaintext, encoded);
        Assert.Contains(":", encoded); // IV:TAG:CIPHER format

        var decoded = svc.Decode(encoded);
        Assert.Equal(plaintext, decoded);
    }

    [Fact]
    public void Encode_Decode_WithoutKey_PassesThrough()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        var svc = new EncryptionService(config);
        var plaintext = "Hello, RabbitMQ!";

        var encoded = svc.Encode(plaintext);
        Assert.Equal(plaintext, encoded);

        var decoded = svc.Decode(encoded);
        Assert.Equal(plaintext, decoded);
    }

    [Fact]
    public void Encode_ProducesDifferentCiphertext_EachTime()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["STORAGE_ENCRYPTION_KEY"] = "test-key"
            })
            .Build();

        var svc = new EncryptionService(config);
        var plaintext = "Same input";

        var encoded1 = svc.Encode(plaintext);
        var encoded2 = svc.Encode(plaintext);

        Assert.NotEqual(encoded1, encoded2); // Random IV
        Assert.Equal(plaintext, svc.Decode(encoded1));
        Assert.Equal(plaintext, svc.Decode(encoded2));
    }
}
