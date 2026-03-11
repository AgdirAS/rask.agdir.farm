using System.Security.Cryptography;
using System.Text;

namespace Rask.Server.Services;

public sealed class EncryptionService
{
    private readonly byte[]? _key;

    public EncryptionService(IConfiguration configuration)
    {
        var raw = configuration["STORAGE_ENCRYPTION_KEY"];
        if (!string.IsNullOrEmpty(raw))
            _key = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
    }

    public string Encode(string plaintext)
    {
        if (_key is null) return plaintext;
        return Encrypt(plaintext, _key);
    }

    public string Decode(string data)
    {
        if (_key is null) return data;
        return Decrypt(data, _key);
    }

    private static string Encrypt(string text, byte[] key)
    {
        var iv = RandomNumberGenerator.GetBytes(12);
        var plainBytes = Encoding.UTF8.GetBytes(text);
        var cipherBytes = new byte[plainBytes.Length];
        var tag = new byte[16];

        using var aes = new AesGcm(key, 16);
        aes.Encrypt(iv, plainBytes, cipherBytes, tag);

        return $"{Convert.ToBase64String(iv)}:{Convert.ToBase64String(tag)}:{Convert.ToBase64String(cipherBytes)}";
    }

    private static string Decrypt(string data, byte[] key)
    {
        var parts = data.Split(':');
        var iv = Convert.FromBase64String(parts[0]);
        var tag = Convert.FromBase64String(parts[1]);
        var cipher = Convert.FromBase64String(parts[2]);
        var plain = new byte[cipher.Length];

        using var aes = new AesGcm(key, 16);
        aes.Decrypt(iv, cipher, tag, plain);

        return Encoding.UTF8.GetString(plain);
    }
}
