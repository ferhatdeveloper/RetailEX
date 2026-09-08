using QrPrintDesktop.Core.Printing;

namespace QrPrintDesktop.Core.Config;

public sealed class CategoryPrinterRoute
{
    public string Category { get; set; } = string.Empty;
    public string PrinterName { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
    public bool AlsoPrintToShared { get; set; }
}

public sealed class AppSettings
{
    public string ApiBaseUrl { get; set; } = "https://api.retailex.app";
    public string TenantCode { get; set; } = string.Empty;
    public string ApiToken { get; set; } = string.Empty;
    /// <summary>auto | none | bearer | apikey</summary>
    public string AuthMode { get; set; } = "none";
    public string FirmNr { get; set; } = "001";
    public string PeriodNr { get; set; } = "01";
    public string FirmId { get; set; } = string.Empty;
    public string StoreId { get; set; } = string.Empty;
    public string StoreName { get; set; } = string.Empty;
    public string CompanyName { get; set; } = "RetailEX";
    public bool AutoStartWithWindows { get; set; }
    public bool OrdersEnabled { get; set; } = true;
    /// <summary>QR menüden gelen siparişleri mutfak fişi olarak kabul et / yazdır.</summary>
    public bool AcceptQrOrders { get; set; } = true;
    public bool AutoPrintKitchen { get; set; } = true;
    public bool AutoMarkKitchenCooking { get; set; } = true;
    public bool UiPollingWhenServiceStopped { get; set; } = true;
    public int PollIntervalSeconds { get; set; } = 5;
    public string WaiterCallSoundFile { get; set; } = Path.Combine("Sounds", "waiter-call.wav");
    public string ReceiptPrintSoundFile { get; set; } = Path.Combine("Sounds", "receipt-print.wav");
    /// <summary>Kapalıyken atanmayan kategoriler ortak yazıcıya gitmez.</summary>
    public bool UseSharedKitchenPrinter { get; set; }
    public string DefaultKitchenPrinter { get; set; } = string.Empty;
    public string DefaultAccountPrinter { get; set; } = string.Empty;
    public List<CategoryPrinterRoute> PrinterRoutes { get; set; } = [];
    /// <summary>Eski tek dil alanı; Normalize mutfak diline eşitler.</summary>
    public string ReceiptLanguage { get; set; } = "tr";
    /// <summary>Mutfak fişi dili: tr | en | ar | ku | uz</summary>
    public string KitchenReceiptLanguage { get; set; } = string.Empty;
    /// <summary>Hesap fişi dili: tr | en | ar | ku | uz</summary>
    public string AccountReceiptLanguage { get; set; } = string.Empty;

    public string CategoriesPath() => $"/rex_{NormalizeFirmNr(FirmNr)}_categories";

    public string ProductsPath() => $"/rex_{NormalizeFirmNr(FirmNr)}_products";

    public static string NormalizeFirmNr(string? firmNr)
    {
        var digits = new string((firmNr ?? "001").Where(char.IsDigit).ToArray());
        return string.IsNullOrEmpty(digits) ? "001" : digits.PadLeft(3, '0');
    }

    public static string NormalizePeriodNr(string? periodNr)
    {
        var digits = new string((periodNr ?? "01").Where(char.IsDigit).ToArray());
        return string.IsNullOrEmpty(digits) ? "01" : digits.PadLeft(2, '0');
    }

    public string ResolvedApiUrl()
    {
        var baseUrl = (ApiBaseUrl ?? "").Trim().TrimEnd('/');
        var tenant = (TenantCode ?? "").Trim().Trim('/');
        if (string.IsNullOrEmpty(baseUrl))
        {
            return string.Empty;
        }

        if (string.IsNullOrEmpty(tenant))
        {
            return baseUrl;
        }

        if (baseUrl.EndsWith("/" + tenant, StringComparison.OrdinalIgnoreCase))
        {
            return baseUrl;
        }

        return baseUrl + "/" + tenant;
    }

    public string RestOrdersPath()
    {
        return $"/rex_{NormalizeFirmNr(FirmNr)}_{NormalizePeriodNr(PeriodNr)}_rest_orders";
    }

    public string RestOrderItemsPath()
    {
        return $"/rex_{NormalizeFirmNr(FirmNr)}_{NormalizePeriodNr(PeriodNr)}_rest_order_items";
    }

    public string RestKitchenOrdersPath()
    {
        return $"/rex_{NormalizeFirmNr(FirmNr)}_{NormalizePeriodNr(PeriodNr)}_rest_kitchen_orders";
    }

    public string RestKitchenItemsPath()
    {
        return $"/rex_{NormalizeFirmNr(FirmNr)}_{NormalizePeriodNr(PeriodNr)}_rest_kitchen_items";
    }

    public string RestTablesPath()
    {
        return $"/rex_{NormalizeFirmNr(FirmNr)}_rest_tables";
    }

    public void Normalize()
    {
        FirmNr = NormalizeFirmNr(FirmNr);
        PeriodNr = NormalizePeriodNr(PeriodNr);
        if (PollIntervalSeconds < 2)
        {
            PollIntervalSeconds = 2;
        }

        if (string.IsNullOrWhiteSpace(AuthMode))
        {
            AuthMode = "none";
        }

        if (IsPlaceholderToken(ApiToken) &&
            string.Equals(AuthMode, "auto", StringComparison.OrdinalIgnoreCase))
        {
            AuthMode = "none";
        }

        PrinterRoutes ??= [];
        PrinterRoutes = PrinterRoutes
            .Where(r => r is not null && !string.IsNullOrWhiteSpace(r.Category))
            .GroupBy(r => r.Category.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();

        var receiptLanguage = ReceiptCopy.NormalizeLanguage(ReceiptLanguage);
        KitchenReceiptLanguage = ReceiptCopy.NormalizeLanguage(
            string.IsNullOrWhiteSpace(KitchenReceiptLanguage) ? receiptLanguage : KitchenReceiptLanguage);
        AccountReceiptLanguage = ReceiptCopy.NormalizeLanguage(
            string.IsNullOrWhiteSpace(AccountReceiptLanguage) ? receiptLanguage : AccountReceiptLanguage);
        ReceiptLanguage = KitchenReceiptLanguage;
    }

    public static bool IsPlaceholderToken(string? token)
    {
        var t = (token ?? "").Trim();
        if (string.IsNullOrEmpty(t))
        {
            return true;
        }

        return t.Contains("BURAYA", StringComparison.OrdinalIgnoreCase)
            || t.Contains("PLACEHOLDER", StringComparison.OrdinalIgnoreCase)
            || t.Contains("YOUR_", StringComparison.OrdinalIgnoreCase);
    }

    public bool IsReadyForPolling()
    {
        if (string.IsNullOrWhiteSpace(ResolvedApiUrl()))
        {
            return false;
        }

        var mode = (AuthMode ?? "none").Trim().ToLowerInvariant();
        if (mode is "none" or "auto")
        {
            return true;
        }

        return !IsPlaceholderToken(ApiToken);
    }
}
