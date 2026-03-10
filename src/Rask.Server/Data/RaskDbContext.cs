using Microsoft.EntityFrameworkCore;

namespace Rask.Server.Data;

public class EnvironmentEntity
{
    public string Slug { get; set; } = "";
    public string Data { get; set; } = "";
}

public class SettingEntity
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
}

public class RaskDbContext : DbContext
{
    public DbSet<EnvironmentEntity> Environments => Set<EnvironmentEntity>();
    public DbSet<SettingEntity> Settings => Set<SettingEntity>();

    public RaskDbContext(DbContextOptions<RaskDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<EnvironmentEntity>(e =>
        {
            e.ToTable("envs");
            e.HasKey(x => x.Slug);
            e.Property(x => x.Slug).HasColumnName("slug");
            e.Property(x => x.Data).HasColumnName("data");
        });

        modelBuilder.Entity<SettingEntity>(e =>
        {
            e.ToTable("settings");
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasColumnName("key");
            e.Property(x => x.Value).HasColumnName("value");
        });
    }
}
