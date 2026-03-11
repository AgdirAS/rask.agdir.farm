using Bunit;
using Rask.Client.Components;
using Xunit;

namespace Rask.Client.Tests;

public class ProgressBarTests : TestContext
{
    [Fact]
    public void ProgressBar_RendersUsedAndTotal()
    {
        var cut = RenderComponent<ProgressBar>(parameters => parameters
            .Add(p => p.Used, 50)
            .Add(p => p.Total, 100)
        );

        Assert.Contains("50", cut.Markup);
        Assert.Contains("100", cut.Markup);
    }

    [Fact]
    public void ProgressBar_ShowsSuccessColor_WhenLow()
    {
        var cut = RenderComponent<ProgressBar>(parameters => parameters
            .Add(p => p.Used, 10)
            .Add(p => p.Total, 100)
        );

        Assert.Contains("bg-success", cut.Markup);
    }

    [Fact]
    public void ProgressBar_ShowsWarningColor_WhenMedium()
    {
        var cut = RenderComponent<ProgressBar>(parameters => parameters
            .Add(p => p.Used, 60)
            .Add(p => p.Total, 100)
        );

        Assert.Contains("bg-warning", cut.Markup);
    }

    [Fact]
    public void ProgressBar_ShowsErrorColor_WhenHigh()
    {
        var cut = RenderComponent<ProgressBar>(parameters => parameters
            .Add(p => p.Used, 90)
            .Add(p => p.Total, 100)
        );

        Assert.Contains("bg-error", cut.Markup);
    }

    [Fact]
    public void ProgressBar_HandlesZeroTotal()
    {
        var cut = RenderComponent<ProgressBar>(parameters => parameters
            .Add(p => p.Used, 0)
            .Add(p => p.Total, 0)
        );

        // Should render without crashing
        Assert.Contains("0", cut.Markup);
    }
}
