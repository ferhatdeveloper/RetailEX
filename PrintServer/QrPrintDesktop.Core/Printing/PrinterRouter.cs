using QrPrintDesktop.Core.Config;
using QrPrintDesktop.Core.Orders;

namespace QrPrintDesktop.Core.Printing;

public sealed class CategoryPrintJob
{
    public string PrinterName { get; init; } = string.Empty;
    public string Title { get; init; } = "MUTFAK";
    public StoredOrder Order { get; init; } = null!;
}

public static class PrinterRouter
{
    public const string Uncategorized = "Genel";
    public const string SharedPrinterLabel = "Ortak yazıcı";
    public const string UnassignedPrinterLabel = "(Yazıcı seçin)";

    public static string NormalizeCategory(string? category)
    {
        var value = (category ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(value) ? Uncategorized : value;
    }

    public static bool IsSharedPrinterChoice(string? printerName)
    {
        var value = (printerName ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(value)
            || value is "*" or "Varsayılan" or "Ortak" or SharedPrinterLabel;
    }

    public static bool IsSharedEnabled(AppSettings settings) => settings.UseSharedKitchenPrinter;

    public static string ResolveSharedPrinter(AppSettings settings)
    {
        if (!settings.UseSharedKitchenPrinter)
        {
            return string.Empty;
        }

        if (!string.IsNullOrWhiteSpace(settings.DefaultKitchenPrinter))
        {
            return settings.DefaultKitchenPrinter.Trim();
        }

        return PrinterInventory.GetDefaultPrinterName();
    }

    public static CategoryPrinterRoute? FindRoute(string? category, AppSettings settings)
    {
        var routes = settings.PrinterRoutes ?? [];
        var key = NormalizeCategory(category);
        var exact = routes.FirstOrDefault(r =>
            r.Enabled &&
            string.Equals(NormalizeCategory(r.Category), key, StringComparison.OrdinalIgnoreCase));
        if (exact is not null)
        {
            return exact;
        }

        return routes.FirstOrDefault(r =>
            r.Enabled &&
            (r.Category ?? string.Empty).Trim() is "*" or "Varsayılan" or "Ortak");
    }

    public static string ResolvePrinter(string? category, AppSettings settings, string fallback)
    {
        var route = FindRoute(category, settings);
        if (route is not null && !IsSharedPrinterChoice(route.PrinterName))
        {
            return route.PrinterName.Trim();
        }

        return string.IsNullOrWhiteSpace(fallback) ? ResolveSharedPrinter(settings) : fallback;
    }

    public static IReadOnlyList<CategoryPrintJob> CreateKitchenJobs(StoredOrder order, AppSettings settings)
    {
        var shared = ResolveSharedPrinter(settings);
        var items = order.Items ?? [];
        if (items.Count == 0)
        {
            if (string.IsNullOrWhiteSpace(shared))
            {
                return [];
            }

            return
            [
                new CategoryPrintJob
                {
                    PrinterName = shared,
                    Title = "MUTFAK",
                    Order = order
                }
            ];
        }

        var buckets = new Dictionary<string, List<OrderLine>>(StringComparer.OrdinalIgnoreCase);
        var unassigned = new List<OrderLine>();
        void Add(string printer, OrderLine line)
        {
            if (string.IsNullOrWhiteSpace(printer))
            {
                return;
            }

            var key = printer.Trim();
            if (!buckets.TryGetValue(key, out var list))
            {
                buckets[key] = list = [];
            }

            list.Add(line);
        }

        foreach (var line in items)
        {
            var printer = ResolvePrinter(line.Category, settings, shared);
            if (string.IsNullOrWhiteSpace(printer))
            {
                unassigned.Add(line);
            }
            else
            {
                Add(printer, line);
            }

            var route = FindRoute(line.Category, settings);
            if (route is { AlsoPrintToShared: true } &&
                !string.IsNullOrWhiteSpace(shared) &&
                !string.Equals(printer, shared, StringComparison.OrdinalIgnoreCase))
            {
                Add(shared, line);
            }
        }

        if (unassigned.Count > 0)
        {
            var fallback = buckets.Keys.FirstOrDefault()
                ?? PrinterInventory.GetDefaultPrinterName();
            foreach (var line in unassigned)
            {
                Add(fallback, line);
            }
        }

        return buckets.Select(group =>
        {
            var categories = group.Value
                .Select(x => NormalizeCategory(x.Category))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var isShared = string.Equals(group.Key, shared, StringComparison.OrdinalIgnoreCase);
            var title = isShared
                ? "MUTFAK · Ortak"
                : categories.Count == 1
                    ? "MUTFAK · " + categories[0]
                    : "MUTFAK";
            return new CategoryPrintJob
            {
                PrinterName = group.Key,
                Title = title,
                Order = order with { Items = group.Value }
            };
        }).ToList();
    }

    public static IReadOnlyList<CategoryPrinterRoute> MergeListedCategories(
        IEnumerable<string> listedCategories,
        IEnumerable<CategoryPrinterRoute>? existing)
    {
        var saved = (existing ?? [])
            .Where(r => r is not null && !string.IsNullOrWhiteSpace(r.Category))
            .GroupBy(r => NormalizeCategory(r.Category), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var merged = new List<CategoryPrinterRoute>();
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in listedCategories.Where(n => !string.IsNullOrWhiteSpace(n)))
        {
            var key = NormalizeCategory(name);
            if (!used.Add(key))
            {
                continue;
            }

            if (saved.TryGetValue(key, out var route))
            {
                merged.Add(new CategoryPrinterRoute
                {
                    Category = route.Category,
                    PrinterName = route.PrinterName,
                    Enabled = route.Enabled,
                    AlsoPrintToShared = route.AlsoPrintToShared
                });
            }
            else
            {
                merged.Add(new CategoryPrinterRoute { Category = name.Trim(), Enabled = true });
            }
        }

        foreach (var extra in saved)
        {
            if (used.Contains(extra.Key))
            {
                continue;
            }

            merged.Add(extra.Value);
        }

        return merged;
    }

    public static string ResolveAccountPrinter(AppSettings settings)
    {
        if (!string.IsNullOrWhiteSpace(settings.DefaultAccountPrinter))
        {
            return settings.DefaultAccountPrinter.Trim();
        }

        if (settings.UseSharedKitchenPrinter)
        {
            return ResolveSharedPrinter(settings);
        }

        return PrinterInventory.GetDefaultPrinterName();
    }
}
