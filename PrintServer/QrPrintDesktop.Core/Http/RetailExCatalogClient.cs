using System.Text.Json;
using QrPrintDesktop.Core.Config;

namespace QrPrintDesktop.Core.Http;

public sealed class FirmDto
{
    public string Id { get; set; } = string.Empty;
    public string FirmNr { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;

    public string DisplayName =>
        string.IsNullOrWhiteSpace(Title) ? (string.IsNullOrWhiteSpace(Name) ? FirmNr : Name) : Title;

    public override string ToString() => $"{FirmNr} — {DisplayName}";
}

public sealed class PeriodDto
{
    public int Nr { get; set; }
    public string FirmId { get; set; } = string.Empty;
    public bool IsDefault { get; set; }

    public string PeriodNr => Nr.ToString("00");

    public override string ToString() => PeriodNr;
}

public sealed class StoreDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string FirmNr { get; set; } = string.Empty;

    public override string ToString() => string.IsNullOrWhiteSpace(Name) ? Id : Name;
}

public sealed class CategoryDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public bool IsRestaurant { get; set; }

    public override string ToString() => Name;
}

public sealed class RetailExCatalogClient
{
    public async Task<(bool Success, string Message)> HealthCheckAsync(AppSettings settings, CancellationToken cancellationToken)
    {
        if (!settings.IsReadyForPolling())
        {
            return (false, "API adresi veya kimlik bilgisi eksik.");
        }

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            var json = await RetailExHttp.GetAsync(settings, "/firms?select=id,firm_nr&limit=1");
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "[]" : json);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                return (true, "RetailEX API bağlantısı başarılı.");
            }

            return (true, "RetailEX API yanıt verdi.");
        }
        catch (Exception ex)
        {
            return (false, "RetailEX hata: " + ex.Message);
        }
    }

    public async Task<IReadOnlyList<FirmDto>> FetchFirmsAsync(AppSettings settings, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var json = await RetailExHttp.GetAsync(
            settings,
            "/firms?is_active=eq.true&select=id,firm_nr,name,title&order=firm_nr");
        return ParseArray(json, row => new FirmDto
        {
            Id = ReadString(row, "id"),
            FirmNr = AppSettings.NormalizeFirmNr(ReadString(row, "firm_nr")),
            Name = ReadString(row, "name"),
            Title = ReadString(row, "title")
        }).Where(f => !string.IsNullOrWhiteSpace(f.FirmNr)).ToList();
    }

    public async Task<IReadOnlyList<PeriodDto>> FetchPeriodsAsync(AppSettings settings, string firmId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(firmId))
        {
            return [];
        }

        cancellationToken.ThrowIfCancellationRequested();
        var json = await RetailExHttp.GetAsync(
            settings,
            "/periods?is_active=eq.true&firm_id=eq." + Uri.EscapeDataString(firmId)
            + "&select=nr,firm_id,default&order=nr");
        return ParseArray(json, row => new PeriodDto
        {
            Nr = ReadInt(row, "nr"),
            FirmId = ReadString(row, "firm_id"),
            IsDefault = ReadBool(row, "default")
        }).Where(p => p.Nr > 0).ToList();
    }

    public async Task<IReadOnlyList<StoreDto>> FetchStoresAsync(AppSettings settings, string? firmNr = null, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = "/stores?select=id,name,firm_nr&order=name";
        if (!string.IsNullOrWhiteSpace(firmNr))
        {
            path += "&firm_nr=eq." + Uri.EscapeDataString(AppSettings.NormalizeFirmNr(firmNr));
        }

        var json = await RetailExHttp.GetAsync(settings, path);
        return ParseArray(json, row => new StoreDto
        {
            Id = ReadString(row, "id"),
            Name = ReadString(row, "name"),
            FirmNr = ReadString(row, "firm_nr")
        }).Where(s => !string.IsNullOrWhiteSpace(s.Id)).ToList();
    }

    public async Task<IReadOnlyList<CategoryDto>> FetchCategoriesAsync(AppSettings settings, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var json = await RetailExHttp.GetAsync(
            settings,
            settings.CategoriesPath() + "?select=id,name,code,is_restaurant,is_active&is_active=eq.true&order=name");
        return ParseArray(json, row => new CategoryDto
        {
            Id = ReadString(row, "id"),
            Name = ReadString(row, "name"),
            Code = ReadString(row, "code"),
            IsRestaurant = ReadBool(row, "is_restaurant")
        }).Where(c => !string.IsNullOrWhiteSpace(c.Name)).ToList();
    }

    public async Task<Dictionary<string, string>> FetchProductCategoryMapAsync(AppSettings settings, CancellationToken cancellationToken = default)
    {
        var categories = await FetchCategoriesAsync(settings, cancellationToken).ConfigureAwait(false);
        var byId = categories
            .Where(c => !string.IsNullOrWhiteSpace(c.Id))
            .ToDictionary(c => c.Id, c => c.Name, StringComparer.OrdinalIgnoreCase);

        cancellationToken.ThrowIfCancellationRequested();
        var productsJson = await RetailExHttp.GetAsync(
            settings,
            settings.ProductsPath() + "?select=id,category_id,name&limit=4000");
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(productsJson))
        {
            return map;
        }

        using var doc = JsonDocument.Parse(productsJson);
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
        {
            return map;
        }

        foreach (var row in doc.RootElement.EnumerateArray())
        {
            var id = ReadString(row, "id");
            if (string.IsNullOrWhiteSpace(id))
            {
                continue;
            }

            var categoryId = ReadString(row, "category_id");
            if (!string.IsNullOrWhiteSpace(categoryId) && byId.TryGetValue(categoryId, out var name))
            {
                map[id] = name;
            }
        }

        return map;
    }

    private static List<T> ParseArray<T>(string json, Func<JsonElement, T> map)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return doc.RootElement.EnumerateArray().Select(map).ToList();
    }

    private static string ReadString(JsonElement row, string name)
    {
        return row.TryGetProperty(name, out var el) && el.ValueKind != JsonValueKind.Null
            ? el.ToString()
            : string.Empty;
    }

    private static int ReadInt(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var el) || el.ValueKind == JsonValueKind.Null)
        {
            return 0;
        }

        if (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var n))
        {
            return n;
        }

        return int.TryParse(el.ToString(), out var parsed) ? parsed : 0;
    }

    private static bool ReadBool(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var el) || el.ValueKind == JsonValueKind.Null)
        {
            return false;
        }

        return el.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => bool.TryParse(el.ToString(), out var b) && b
        };
    }
}
