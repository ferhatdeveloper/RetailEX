using QrPrintDesktop.Core.Orders;

namespace QrPrintDesktop.Tests;

public class OrderInboxServiceTests
{
    private static OrderInboxService CreateService()
    {
        var path = Path.Combine(Path.GetTempPath(), "qrprint-tests", Guid.NewGuid().ToString("N"), "inbox.json");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        return new OrderInboxService(path);
    }

    [Fact]
    public void AddIncomingOrder_ShouldAppearInPendingList()
    {
        var service = CreateService();
        var order = new IncomingOrder("ord-1", "S-1001", "12", "Ayse", DateTime.UtcNow, 245.50m);

        service.AddOrUpdate(order);

        var pending = service.GetPending().ToList();
        Assert.Single(pending);
        Assert.Equal("ord-1", pending[0].Id);
    }

    [Fact]
    public void MarkPrinted_ShouldSetCompletedAndHiddenFromPending()
    {
        var service = CreateService();
        service.AddOrUpdate(new IncomingOrder("ord-1", "S-1001", "12", "Ayse", DateTime.UtcNow, 245.50m));

        service.MarkPrintedAndCompleted("ord-1");

        Assert.Empty(service.GetPending());
        Assert.Single(service.GetCompleted());
    }

    [Fact]
    public void MarkAllCompleted_ShouldCompleteEveryPendingOrder()
    {
        var service = CreateService();
        service.AddOrUpdate(new IncomingOrder("ord-1", "S-1001", "12", "Ayse", DateTime.UtcNow, 245.50m));
        service.AddOrUpdate(new IncomingOrder("ord-2", "S-1002", "7", "Ali", DateTime.UtcNow, 120.00m));

        service.MarkAllPendingCompleted();

        Assert.Empty(service.GetPending());
        Assert.Equal(2, service.GetCompleted().Count);
    }

    [Fact]
    public void Settings_ShouldNormalizeFirmAndPeriod()
    {
        var settings = new QrPrintDesktop.Core.Config.AppSettings
        {
            FirmNr = "9",
            PeriodNr = "1",
            PollIntervalSeconds = 1
        };

        settings.Normalize();

        Assert.Equal("009", settings.FirmNr);
        Assert.Equal("01", settings.PeriodNr);
        Assert.Equal(2, settings.PollIntervalSeconds);
        Assert.Equal("/rex_009_01_rest_kitchen_orders", settings.RestKitchenOrdersPath());
    }

    [Theory]
    [InlineData("QR Menü", "", "RES-1", true)]
    [InlineData("Garson", "qr_menu", "RES-1", true)]
    [InlineData("Ali", "not", "QR-12", true)]
    [InlineData("Ali", "", "RES-1", false)]
    public void OrderSource_ShouldDetectQrOrders(string waiter, string note, string orderNo, bool expected)
    {
        Assert.Equal(expected, OrderSource.IsQr(waiter, note, orderNo));
    }

    [Fact]
    public void AddOrUpdate_ShouldReturnOnlyNewItemsOnSecondPoll()
    {
        var service = CreateService();
        var first = new IncomingOrder(
            "ord-1",
            "S-1001",
            "12",
            "Ayse",
            DateTime.UtcNow,
            100m,
            Items:
            [
                new OrderLine("item-1", 1, "Adana", "", 100m, 100m, "", "Mutfak")
            ]);

        var firstResult = service.AddOrUpdateReturningNewItems(first);
        Assert.True(firstResult.IsNew);
        Assert.Single(firstResult.NewItems);
        Assert.Equal("Adana", firstResult.NewItems[0].Name);

        service.MarkPrintedAndCompleted("ord-1");

        var second = first with
        {
            TotalAmount = 140m,
            Items =
            [
                new OrderLine("item-1", 1, "Adana", "", 100m, 100m, "", "Mutfak"),
                new OrderLine("item-2", 2, "Ayran", "", 20m, 40m, "", "Bar")
            ]
        };

        var secondResult = service.AddOrUpdateReturningNewItems(second);
        Assert.False(secondResult.IsNew);
        var extra = Assert.Single(secondResult.NewItems);
        Assert.Equal("Ayran", extra.Name);

        Assert.True(service.TryGet("ord-1", out var stored));
        Assert.Equal(2, stored!.Items.Count);
        Assert.True(stored.IsCompleted);
    }

    [Fact]
    public void AddOrUpdate_ShouldTreatSameItemIdAsAlreadyPrinted()
    {
        var service = CreateService();
        var order = new IncomingOrder(
            "ord-1",
            "S-1",
            "1",
            "Ali",
            DateTime.UtcNow,
            50m,
            Items: [new OrderLine("item-1", 1, "Çorba", "", 50m, 50m, "", "Mutfak")]);

        service.AddOrUpdateReturningNewItems(order);
        var again = service.AddOrUpdateReturningNewItems(order);

        Assert.False(again.IsNew);
        Assert.Empty(again.NewItems);
    }
}
