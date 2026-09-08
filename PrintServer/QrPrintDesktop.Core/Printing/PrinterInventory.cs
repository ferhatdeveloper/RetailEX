using System.Drawing.Printing;

namespace QrPrintDesktop.Core.Printing;

public sealed class InstalledPrinterInfo
{
    public string Name { get; init; } = string.Empty;
    public bool IsDefault { get; init; }
}

public static class PrinterInventory
{
    public static string GetDefaultPrinterName()
    {
        try
        {
            var printer = new PrinterSettings();
            if (!printer.IsValid || string.IsNullOrWhiteSpace(printer.PrinterName))
            {
                return string.Empty;
            }

            return printer.PrinterName;
        }
        catch
        {
            return string.Empty;
        }
    }

    public static string ResolveInstalledName(string? printerName)
    {
        var requested = (printerName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(requested))
        {
            return string.Empty;
        }

        var match = ListInstalled().FirstOrDefault(p =>
            string.Equals(p.Name, requested, StringComparison.OrdinalIgnoreCase));
        return match?.Name ?? requested;
    }

    public static IReadOnlyList<InstalledPrinterInfo> ListInstalled()
    {
        try
        {
            var def = GetDefaultPrinterName();
            return PrinterSettings.InstalledPrinters
                .Cast<string>()
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .OrderBy(name => name, StringComparer.CurrentCultureIgnoreCase)
                .Select(name => new InstalledPrinterInfo
                {
                    Name = name,
                    IsDefault = string.Equals(name, def, StringComparison.OrdinalIgnoreCase)
                })
                .ToList();
        }
        catch
        {
            return [];
        }
    }

    public static bool Exists(string? printerName)
    {
        if (string.IsNullOrWhiteSpace(printerName))
        {
            return false;
        }

        return ListInstalled().Any(p => string.Equals(p.Name, printerName, StringComparison.OrdinalIgnoreCase));
    }
}
