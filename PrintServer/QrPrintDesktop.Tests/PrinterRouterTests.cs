using QrPrintDesktop.Core.Config;
using QrPrintDesktop.Core.Orders;
using QrPrintDesktop.Core.Printing;

namespace QrPrintDesktop.Tests;

public class PrinterRouterTests
{
    [Fact]
    public void CreateKitchenJobs_ShouldSplitItemsByCategoryPrinter()
    {
        var settings = new AppSettings
        {
            DefaultKitchenPrinter = "MutfakYazici",
            PrinterRoutes =
            [
                new CategoryPrinterRoute { Category = "Bar", PrinterName = "BarYazici", Enabled = true },
                new CategoryPrinterRoute { Category = "Mutfak", PrinterName = "MutfakYazici", Enabled = true }
            ]
        };
        var order = CreateOrder(
            new OrderLine("1", 1, "Adana", "", 100m, 100m, "", "Mutfak"),
            new OrderLine("2", 2, "Ayran", "", 20m, 40m, "", "Bar"),
            new OrderLine("3", 1, "Cola", "", 15m, 15m, "", "Bar"));

        var jobs = PrinterRouter.CreateKitchenJobs(order, settings);

        Assert.Equal(2, jobs.Count);
        var bar = Assert.Single(jobs, j => j.PrinterName == "BarYazici");
        Assert.Equal(2, bar.Order.Items.Count);
        Assert.Contains("BAR", bar.Title, StringComparison.OrdinalIgnoreCase);
        var kitchen = Assert.Single(jobs, j => j.PrinterName == "MutfakYazici");
        Assert.Single(kitchen.Order.Items);
        Assert.Equal("Adana", kitchen.Order.Items[0].Name);
    }

    [Fact]
    public void FindRoute_ShouldMatchTurkishCategoryLetters()
    {
        var settings = new AppSettings
        {
            PrinterRoutes =
            [
                new CategoryPrinterRoute { Category = "İçecekler", PrinterName = "BarYazici", Enabled = true }
            ]
        };

        Assert.Equal("BarYazici", PrinterRouter.ResolvePrinter("Icecekler", settings, ""));
        Assert.Equal("BarYazici", PrinterRouter.ResolvePrinter("içecekler", settings, ""));
    }

    [Fact]
    public void CreateKitchenJobs_ShouldNotUseWindowsDefaultWhenSharedDisabled()
    {
        var settings = new AppSettings
        {
            UseSharedKitchenPrinter = false,
            DefaultKitchenPrinter = "OrtakYazici",
            PrinterRoutes =
            [
                new CategoryPrinterRoute { Category = "Bar", PrinterName = "BarYazici", Enabled = true }
            ]
        };
        var order = CreateOrder(new OrderLine("1", 1, "Çorba", "", 50m, 50m, "", "Mutfak"));

        var jobs = PrinterRouter.CreateKitchenJobs(order, settings);

        Assert.Empty(jobs);
    }

    [Fact]
    public void CreateKitchenJobs_ShouldUseDefaultPrinterWhenNoRoute()
    {
        var settings = new AppSettings
        {
            UseSharedKitchenPrinter = true,
            DefaultKitchenPrinter = "GenelYazici"
        };
        var order = CreateOrder(new OrderLine("1", 1, "Çorba", "", 50m, 50m, "", "Mutfak"));

        var jobs = PrinterRouter.CreateKitchenJobs(order, settings);

        var job = Assert.Single(jobs);
        Assert.Equal("GenelYazici", job.PrinterName);
        Assert.Equal("MUTFAK · Ortak", job.Title);
    }

    [Fact]
    public void CreateKitchenJobs_ShouldUseSharedPrinterWhenCategoryChoosesOrtak()
    {
        var settings = new AppSettings
        {
            UseSharedKitchenPrinter = true,
            DefaultKitchenPrinter = "OrtakYazici",
            PrinterRoutes =
            [
                new CategoryPrinterRoute { Category = "Salata", PrinterName = "Ortak yazıcı", Enabled = true },
                new CategoryPrinterRoute { Category = "Bar", PrinterName = "BarYazici", Enabled = true }
            ]
        };
        var order = CreateOrder(
            new OrderLine("1", 1, "Çoban", "", 40m, 40m, "", "Salata"),
            new OrderLine("2", 1, "Ayran", "", 20m, 20m, "", "Bar"));

        var jobs = PrinterRouter.CreateKitchenJobs(order, settings);

        Assert.Equal(2, jobs.Count);
        Assert.Contains(jobs, j => j.PrinterName == "OrtakYazici" && j.Order.Items.Any(i => i.Name == "Çoban"));
        Assert.Contains(jobs, j => j.PrinterName == "BarYazici");
    }

    [Fact]
    public void CreateKitchenJobs_ShouldAlsoPrintToSharedWhenRequested()
    {
        var settings = new AppSettings
        {
            UseSharedKitchenPrinter = true,
            DefaultKitchenPrinter = "OrtakYazici",
            PrinterRoutes =
            [
                new CategoryPrinterRoute
                {
                    Category = "Bar",
                    PrinterName = "BarYazici",
                    Enabled = true,
                    AlsoPrintToShared = true
                }
            ]
        };
        var order = CreateOrder(new OrderLine("1", 1, "Ayran", "", 20m, 20m, "", "Bar"));

        var jobs = PrinterRouter.CreateKitchenJobs(order, settings);

        Assert.Equal(2, jobs.Count);
        Assert.Contains(jobs, j => j.PrinterName == "BarYazici");
        var shared = Assert.Single(jobs, j => j.PrinterName == "OrtakYazici");
        Assert.Equal("Ayran", shared.Order.Items[0].Name);
    }

    [Fact]
    public void ResolvePrinter_ShouldHonorWildcardAndIgnoreDisabled()
    {
        var settings = new AppSettings
        {
            DefaultKitchenPrinter = "Fallback",
            PrinterRoutes =
            [
                new CategoryPrinterRoute { Category = "Bar", PrinterName = "KapaliBar", Enabled = false },
                new CategoryPrinterRoute { Category = "*", PrinterName = "Joker", Enabled = true }
            ]
        };

        Assert.Equal("Joker", PrinterRouter.ResolvePrinter("Bar", settings, "Fallback"));
        Assert.Equal("Joker", PrinterRouter.ResolvePrinter("Tatlı", settings, "Fallback"));
    }

    [Fact]
    public void ResolveAccountPrinter_ShouldPreferAccountThenKitchen()
    {
        var settings = new AppSettings
        {
            DefaultKitchenPrinter = "MutfakYazici",
            DefaultAccountPrinter = "KasaYazici"
        };

        Assert.Equal("KasaYazici", PrinterRouter.ResolveAccountPrinter(settings));
        settings.DefaultAccountPrinter = "";
        settings.UseSharedKitchenPrinter = true;
        Assert.Equal("MutfakYazici", PrinterRouter.ResolveAccountPrinter(settings));
    }

    [Fact]
    public void CreateKitchenJobs_ShouldKeepUnassignedItemsOnAssignedPrinter()
    {
        var settings = new AppSettings
        {
            UseSharedKitchenPrinter = false,
            DefaultKitchenPrinter = "OrtakYazici",
            PrinterRoutes =
            [
                new CategoryPrinterRoute { Category = "Bar", PrinterName = "BarYazici", Enabled = true },
                new CategoryPrinterRoute { Category = "Mutfak", PrinterName = "", Enabled = true, AlsoPrintToShared = true }
            ]
        };
        var order = CreateOrder(
            new OrderLine("1", 1, "Ayran", "", 20m, 20m, "", "Bar"),
            new OrderLine("2", 1, "Adana", "", 100m, 100m, "", "Mutfak"));

        var jobs = PrinterRouter.CreateKitchenJobs(order, settings);

        var job = Assert.Single(jobs);
        Assert.Equal("BarYazici", job.PrinterName);
        Assert.Equal(2, job.Order.Items.Count);
        Assert.Contains(job.Order.Items, i => i.Name == "Ayran");
        Assert.Contains(job.Order.Items, i => i.Name == "Adana");
    }

    [Fact]
    public void ResolveSharedPrinter_ShouldBeEmptyWhenDisabled()
    {
        var settings = new AppSettings
        {
            UseSharedKitchenPrinter = false,
            DefaultKitchenPrinter = "OrtakYazici"
        };

        Assert.Equal("", PrinterRouter.ResolveSharedPrinter(settings));
    }

    [Fact]
    public void MergeListedCategories_ShouldKeepSavedPrinterAssignments()
    {
        var saved = new[]
        {
            new CategoryPrinterRoute { Category = "Bar", PrinterName = "BarYazici", Enabled = true },
            new CategoryPrinterRoute { Category = "Eski", PrinterName = "Depo", Enabled = true }
        };

        var merged = PrinterRouter.MergeListedCategories(["Bar", "Mutfak"], saved);

        Assert.Equal(3, merged.Count);
        Assert.Equal("BarYazici", merged.First(r => r.Category == "Bar").PrinterName);
        Assert.Equal("", merged.First(r => r.Category == "Mutfak").PrinterName);
        Assert.Equal("Depo", merged.First(r => r.Category == "Eski").PrinterName);
    }

    private static StoredOrder CreateOrder(params OrderLine[] items)
    {
        return new StoredOrder(
            "ord-1",
            "S-1",
            "12",
            "Garson",
            DateTime.UtcNow,
            100m,
            100m,
            0m,
            "TRY",
            "",
            items,
            false,
            null,
            "kitchen");
    }
}
