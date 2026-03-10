using Bunit;
using Rask.Client.Components;
using Xunit;

namespace Rask.Client.Tests;

public class StatCardTests : TestContext
{
    [Fact]
    public void StatCard_RendersLabelAndValue()
    {
        var cut = RenderComponent<StatCard>(parameters => parameters
            .Add(p => p.Label, "Queues")
            .Add(p => p.Value, "42")
            .Add(p => p.Href, "/queues")
        );

        Assert.Contains("Queues", cut.Markup);
        Assert.Contains("42", cut.Markup);
        Assert.Contains("href=\"/queues\"", cut.Markup);
    }

    [Fact]
    public void StatCard_RendersSubText_WhenProvided()
    {
        var cut = RenderComponent<StatCard>(parameters => parameters
            .Add(p => p.Label, "Test")
            .Add(p => p.Value, "10")
            .Add(p => p.SubText, "extra info")
            .Add(p => p.Href, "#")
        );

        Assert.Contains("extra info", cut.Markup);
    }
}
