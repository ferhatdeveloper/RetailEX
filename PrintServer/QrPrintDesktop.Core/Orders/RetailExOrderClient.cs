using System.Globalization;
using System.Text.Json;
using QrPrintDesktop.Core.Config;
using QrPrintDesktop.Core.Http;

namespace QrPrintDesktop.Core.Orders;

public sealed class RetailExOrderClient
{
    public async Task<IReadOnlyList<IncomingOrder>> GetPendingKitchenOrdersAsync(
        AppSettings settings,
        CancellationToken cancellationToken)
    {
        if (!settings.IsReadyForPolling())
        {
            return [];
        }

        cancellationToken.ThrowIfCancellationRequested();
        var json = await RetailExHttp.GetAsync(
            settings,
            settings.RestKitchenOrdersPath()
            + "?status=in.(new,pending,queued)"
            + "&select=*"
            + "&order=sent_at.asc&limit=40",
            "rest");

        var kitchenRows = ParseArray(json);
        if (kitchenRows.Count == 0)
        {
            return [];
        }

        var kitchenIds = kitchenRows
            .Select(x => ReadString(x, "id"))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .ToList();
        var parentOrderIds = kitchenRows
            .Select(x => ReadString(x, "order_id"))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var itemsMap = await GetKitchenItemsByIdsAsync(settings, kitchenIds, cancellationToken);
        var orderNos = await GetOrderNumbersAsync(settings, parentOrderIds, cancellationToken);
        return kitchenRows.Select(row =>
        {
            var id = ReadString(row, "id");
            var orderId = ReadString(row, "order_id");
            orderNos.TryGetValue(orderId, out var orderNo);
            var table = ReadString(row, "table_number");
            var waiter = ReadString(row, "waiter");
            var note = ReadString(row, "note");
            var sentAt = ReadDate(row, "sent_at");
            itemsMap.TryGetValue(id, out var lines);
            lines ??= [];
            var total = lines.Sum(l => l.LineTotal);
            return new IncomingOrder(
                id,
                string.IsNullOrWhiteSpace(orderNo)
                    ? (string.IsNullOrWhiteSpace(orderId) ? id[..Math.Min(8, id.Length)] : orderId)
                    : orderNo,
                string.IsNullOrWhiteSpace(table) ? "-" : table,
                string.IsNullOrWhiteSpace(waiter) ? "-" : waiter,
                sentAt,
                total,
                total,
                0m,
                "TRY",
                note,
                lines,
                "kitchen",
                ReadAllFields(row));
        }).ToList();
    }

    public async Task<IReadOnlyList<IncomingOrder>> GetPendingQrOrdersAsync(
        AppSettings settings,
        CancellationToken cancellationToken)
    {
        if (!settings.IsReadyForPolling())
        {
            return [];
        }

        cancellationToken.ThrowIfCancellationRequested();
        var json = await RetailExHttp.GetAsync(
            settings,
            settings.RestOrdersPath()
            + "?status=eq.open"
            + "&select=*"
            + "&order=opened_at.desc&limit=40",
            "rest");

        var rows = ParseArray(json)
            .Where(row => OrderSource.IsQr(ReadString(row, "waiter"), ReadString(row, "note"), ReadString(row, "order_no")))
            .ToList();
        if (rows.Count == 0)
        {
            return [];
        }

        var orderIds = rows.Select(x => ReadString(x, "id")).Where(id => !string.IsNullOrWhiteSpace(id)).ToList();
        var (itemsMap, itemProducts) = await GetUnsentOrderItemsMapAsync(settings, orderIds, cancellationToken);
        var productCategories = await TryGetProductCategoriesAsync(settings, cancellationToken);
        itemsMap = EnrichCategories(itemsMap, productCategories, itemProducts);
        var tables = await GetTableMapAsync(settings, cancellationToken);

        return rows.Select(row =>
        {
            var id = ReadString(row, "id");
            itemsMap.TryGetValue(id, out var lines);
            lines ??= [];
            tables.TryGetValue(ReadString(row, "table_id"), out var tableNumber);
            var total = lines.Count > 0 ? lines.Sum(l => l.LineTotal) : ReadDecimal(row, "total_amount");
            var waiter = ReadString(row, "waiter");
            return new IncomingOrder(
                "qr-" + id,
                ReadString(row, "order_no"),
                string.IsNullOrWhiteSpace(tableNumber) ? "-" : tableNumber,
                string.IsNullOrWhiteSpace(waiter) ? "QR Menü" : waiter,
                ReadDate(row, "opened_at") == default ? ReadDate(row, "created_at") : ReadDate(row, "opened_at"),
                total,
                total,
                ReadDecimal(row, "discount_amount"),
                "TRY",
                ReadString(row, "note"),
                lines,
                OrderSource.Qr,
                ReadAllFields(row));
        }).Where(o => o.Items is { Count: > 0 }).ToList();
    }

    public async Task<bool> MarkQrItemsSentAsync(
        IReadOnlyList<OrderLine> items,
        AppSettings settings,
        CancellationToken cancellationToken)
    {
        var itemIds = (items ?? [])
            .Select(x => x.MenuItemId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (itemIds.Count == 0)
        {
            return false;
        }

        cancellationToken.ThrowIfCancellationRequested();
        var ok = true;
        foreach (var id in itemIds)
        {
            try
            {
                await RetailExHttp.PatchAsync(
                    settings,
                    settings.RestOrderItemsPath() + "?id=eq." + Uri.EscapeDataString(id),
                    new { sent_to_kitchen_at = DateTime.UtcNow },
                    "rest");
            }
            catch
            {
                ok = false;
            }
        }

        return ok;
    }

    public async Task<IReadOnlyList<IncomingOrder>> GetOpenAccountOrdersAsync(
        AppSettings settings,
        CancellationToken cancellationToken)
    {
        if (!settings.IsReadyForPolling())
        {
            return [];
        }

        cancellationToken.ThrowIfCancellationRequested();
        var json = await RetailExHttp.GetAsync(
            settings,
            settings.RestOrdersPath()
            + "?status=eq.open"
            + "&select=*"
            + "&order=opened_at.desc&limit=40",
            "rest");

        var rows = ParseArray(json);
        if (rows.Count == 0)
        {
            return [];
        }

        var orderIds = rows.Select(x => ReadString(x, "id")).Where(id => !string.IsNullOrWhiteSpace(id)).ToList();
        var itemsMap = await GetOrderItemsMapAsync(settings, orderIds, cancellationToken);
        var tables = await GetTableMapAsync(settings, cancellationToken);

        return rows.Select(row =>
        {
            var id = ReadString(row, "id");
            var tableId = ReadString(row, "table_id");
            tables.TryGetValue(tableId, out var tableNumber);
            itemsMap.TryGetValue(id, out var lines);
            lines ??= [];
            var total = ReadDecimal(row, "total_amount");
            if (total == 0m)
            {
                total = lines.Sum(l => l.LineTotal);
            }

            var discount = ReadDecimal(row, "discount_amount");
            return new IncomingOrder(
                "acc-" + id,
                ReadString(row, "order_no"),
                string.IsNullOrWhiteSpace(tableNumber) ? "-" : tableNumber,
                string.IsNullOrWhiteSpace(ReadString(row, "waiter")) ? "-" : ReadString(row, "waiter"),
                ReadDate(row, "opened_at") == default ? ReadDate(row, "created_at") : ReadDate(row, "opened_at"),
                total,
                Math.Max(0m, total - discount),
                discount,
                "TRY",
                ReadString(row, "note"),
                lines,
                "account",
                ReadAllFields(row));
        }).ToList();
    }

    public async Task<bool> MarkKitchenCookingAsync(string kitchenOrderId, AppSettings settings, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(kitchenOrderId))
        {
            return false;
        }

        cancellationToken.ThrowIfCancellationRequested();
        try
        {
            await RetailExHttp.PatchAsync(
                settings,
                settings.RestKitchenOrdersPath() + "?id=eq." + Uri.EscapeDataString(kitchenOrderId),
                new { status = "cooking" },
                "rest");
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static async Task<Dictionary<string, string>> GetOrderNumbersAsync(
        AppSettings settings,
        IReadOnlyList<string> orderIds,
        CancellationToken cancellationToken)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (orderIds.Count == 0)
        {
            return map;
        }

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            var json = await RetailExHttp.GetAsync(
                settings,
                settings.RestOrdersPath()
                + "?id=" + FormatIn(orderIds)
                + "&select=id,order_no",
                "rest");
            foreach (var row in ParseArray(json))
            {
                var id = ReadString(row, "id");
                if (!string.IsNullOrWhiteSpace(id))
                {
                    map[id] = ReadString(row, "order_no");
                }
            }
        }
        catch
        {
            // sipariş numarası yoksa uuid kısaltması kullanılır
        }

        return map;
    }

    public async Task<Dictionary<string, List<OrderLine>>> GetKitchenItemsByIdsAsync(
        AppSettings settings,
        IReadOnlyList<string> kitchenIds,
        CancellationToken cancellationToken)
    {
        var itemsMap = await GetKitchenItemsMapAsync(settings, kitchenIds, cancellationToken).ConfigureAwait(false);
        var productCategories = await TryGetProductCategoriesAsync(settings, cancellationToken).ConfigureAwait(false);
        var itemProducts = await TryGetOrderItemProductMapAsync(settings, itemsMap, cancellationToken).ConfigureAwait(false);
        return EnrichCategories(itemsMap, productCategories, itemProducts);
    }

    private static async Task<Dictionary<string, List<OrderLine>>> GetKitchenItemsMapAsync(
        AppSettings settings,
        IReadOnlyList<string> kitchenIds,
        CancellationToken cancellationToken)
    {
        var map = new Dictionary<string, List<OrderLine>>(StringComparer.OrdinalIgnoreCase);
        if (kitchenIds.Count == 0)
        {
            return map;
        }

        cancellationToken.ThrowIfCancellationRequested();
        var json = await RetailExHttp.GetAsync(
            settings,
            settings.RestKitchenItemsPath()
            + "?kitchen_order_id=" + FormatIn(kitchenIds)
            + "&select=*",
            "rest");

        foreach (var row in ParseArray(json))
        {
            var kitchenId = ReadString(row, "kitchen_order_id");
            if (string.IsNullOrWhiteSpace(kitchenId))
            {
                continue;
            }

            if (!map.TryGetValue(kitchenId, out var list))
            {
                list = [];
                map[kitchenId] = list;
            }

            var qty = (int)Math.Max(1, Math.Round(ReadDecimal(row, "quantity")));
            var name = ReadString(row, "product_name");
            var course = ReadString(row, "course");
            list.Add(new OrderLine(
                ReadString(row, "order_item_id"),
                qty,
                string.IsNullOrWhiteSpace(name) ? "Ürün" : name,
                course,
                0m,
                0m,
                ReadString(row, "note"),
                course,
                ReadAllFields(row)));
        }

        return map;
    }

    private static async Task<(Dictionary<string, List<OrderLine>> Items, Dictionary<string, string> ItemProducts)> GetUnsentOrderItemsMapAsync(
        AppSettings settings,
        IReadOnlyList<string> orderIds,
        CancellationToken cancellationToken)
    {
        var map = new Dictionary<string, List<OrderLine>>(StringComparer.OrdinalIgnoreCase);
        var itemProducts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (orderIds.Count == 0)
        {
            return (map, itemProducts);
        }

        cancellationToken.ThrowIfCancellationRequested();
        string json;
        try
        {
            json = await RetailExHttp.GetAsync(
                settings,
                settings.RestOrderItemsPath()
                + "?order_id=" + FormatIn(orderIds)
                + "&is_void=eq.false"
                + "&select=*",
                "rest");
        }
        catch
        {
            json = await RetailExHttp.GetAsync(
                settings,
                settings.RestOrderItemsPath()
                + "?order_id=" + FormatIn(orderIds)
                + "&select=*",
                "rest");
        }

        foreach (var row in ParseArray(json))
        {
            var sent = ReadString(row, "sent_to_kitchen_at");
            if (!string.IsNullOrWhiteSpace(sent))
            {
                continue;
            }

            var orderId = ReadString(row, "order_id");
            var itemId = ReadString(row, "id");
            if (string.IsNullOrWhiteSpace(orderId) || string.IsNullOrWhiteSpace(itemId))
            {
                continue;
            }

            if (!map.TryGetValue(orderId, out var list))
            {
                list = [];
                map[orderId] = list;
            }

            var qty = (int)Math.Max(1, Math.Round(ReadDecimal(row, "quantity")));
            var unit = ReadDecimal(row, "unit_price");
            var lineTotal = ReadDecimal(row, "subtotal");
            if (lineTotal == 0m)
            {
                lineTotal = unit * qty;
            }

            var course = ReadString(row, "course");
            var productId = ReadString(row, "product_id");
            if (!string.IsNullOrWhiteSpace(productId))
            {
                itemProducts[itemId] = productId;
            }

            list.Add(new OrderLine(
                itemId,
                qty,
                ReadString(row, "product_name"),
                course,
                unit,
                lineTotal,
                ReadString(row, "note"),
                course,
                ReadAllFields(row)));
        }

        return (map, itemProducts);
    }

    private static async Task<Dictionary<string, List<OrderLine>>> GetOrderItemsMapAsync(
        AppSettings settings,
        IReadOnlyList<string> orderIds,
        CancellationToken cancellationToken)
    {
        var map = new Dictionary<string, List<OrderLine>>(StringComparer.OrdinalIgnoreCase);
        if (orderIds.Count == 0)
        {
            return map;
        }

        cancellationToken.ThrowIfCancellationRequested();
        var json = await RetailExHttp.GetAsync(
            settings,
            settings.RestOrderItemsPath()
            + "?order_id=" + FormatIn(orderIds)
            + "&is_void=eq.false"
            + "&select=*",
            "rest");

        foreach (var row in ParseArray(json))
        {
            var orderId = ReadString(row, "order_id");
            if (string.IsNullOrWhiteSpace(orderId))
            {
                continue;
            }

            if (!map.TryGetValue(orderId, out var list))
            {
                list = [];
                map[orderId] = list;
            }

            var qty = (int)Math.Max(1, Math.Round(ReadDecimal(row, "quantity")));
            var unit = ReadDecimal(row, "unit_price");
            var lineTotal = ReadDecimal(row, "subtotal");
            if (lineTotal == 0m)
            {
                lineTotal = unit * qty;
            }

            list.Add(new OrderLine(
                ReadString(row, "product_id"),
                qty,
                ReadString(row, "product_name"),
                ReadString(row, "course"),
                unit,
                lineTotal,
                ReadString(row, "note"),
                ReadString(row, "course"),
                ReadAllFields(row)));
        }

        return map;
    }

    private async Task<Dictionary<string, string>> TryGetProductCategoriesAsync(AppSettings settings, CancellationToken cancellationToken)
    {
        try
        {
            return await new RetailExCatalogClient().FetchProductCategoryMapAsync(settings, cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private async Task<Dictionary<string, string>> TryGetOrderItemProductMapAsync(
        AppSettings settings,
        Dictionary<string, List<OrderLine>> itemsMap,
        CancellationToken cancellationToken)
    {
        var ids = itemsMap.Values
            .SelectMany(x => x)
            .Select(x => x.MenuItemId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            var json = await RetailExHttp.GetAsync(
                settings,
                settings.RestOrderItemsPath()
                + "?id=" + FormatIn(ids)
                + "&select=id,product_id,course",
                "rest");
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var row in ParseArray(json))
            {
                var id = ReadString(row, "id");
                var productId = ReadString(row, "product_id");
                if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(productId))
                {
                    map[id] = productId;
                }
            }

            return map;
        }
        catch
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static Dictionary<string, List<OrderLine>> EnrichCategories(
        Dictionary<string, List<OrderLine>> itemsMap,
        IReadOnlyDictionary<string, string> productCategories,
        IReadOnlyDictionary<string, string>? orderItemProducts = null)
    {
        foreach (var key in itemsMap.Keys.ToList())
        {
            itemsMap[key] = itemsMap[key].Select(line =>
            {
                var productId = line.MenuItemId;
                if (orderItemProducts is not null && orderItemProducts.TryGetValue(line.MenuItemId, out var mapped) && !string.IsNullOrWhiteSpace(mapped))
                {
                    productId = mapped;
                }

                if (productCategories.TryGetValue(productId, out var fromProduct) && !string.IsNullOrWhiteSpace(fromProduct))
                {
                    return line with { Category = fromProduct };
                }

                var fallback = string.IsNullOrWhiteSpace(line.Category) ? line.Description : line.Category;
                return line with { Category = string.IsNullOrWhiteSpace(fallback) ? "Genel" : fallback };
            }).ToList();
        }

        return itemsMap;
    }

    private static async Task<Dictionary<string, string>> GetTableMapAsync(AppSettings settings, CancellationToken cancellationToken)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            var json = await RetailExHttp.GetAsync(
                settings,
                settings.RestTablesPath() + "?select=id,number",
                "rest");
            foreach (var row in ParseArray(json))
            {
                var id = ReadString(row, "id");
                if (!string.IsNullOrWhiteSpace(id))
                {
                    map[id] = ReadString(row, "number");
                }
            }
        }
        catch
        {
            // masa kartı yoksa sipariş yine listelenir
        }

        return map;
    }

    private static string FormatIn(IReadOnlyList<string> ids)
    {
        var values = ids
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (values.Count == 0)
        {
            return "in.()";
        }

        if (values.Count == 1)
        {
            return "eq." + Uri.EscapeDataString(values[0]);
        }

        return "in.(" + string.Join(",", values.Select(id => "%22" + Uri.EscapeDataString(id) + "%22")) + ")";
    }

    private static List<JsonElement> ParseArray(string json)
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

        return doc.RootElement.EnumerateArray().Select(e => e.Clone()).ToList();
    }

    private static string ReadString(JsonElement row, string name)
    {
        return row.TryGetProperty(name, out var el) && el.ValueKind != JsonValueKind.Null
            ? el.ToString()
            : string.Empty;
    }

    private static decimal ReadDecimal(JsonElement row, string name)
    {
        if (!row.TryGetProperty(name, out var el) || el.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return 0m;
        }

        if (el.ValueKind == JsonValueKind.Number && el.TryGetDecimal(out var d))
        {
            return d;
        }

        return decimal.TryParse(el.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : 0m;
    }

    private static Dictionary<string, string> ReadAllFields(JsonElement row)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (row.ValueKind != JsonValueKind.Object)
        {
            return map;
        }

        foreach (var prop in row.EnumerateObject())
        {
            map[prop.Name] = JsonValueToString(prop.Value);
        }

        return map;
    }

    private static string JsonValueToString(JsonElement el)
    {
        return el.ValueKind switch
        {
            JsonValueKind.Null or JsonValueKind.Undefined => string.Empty,
            JsonValueKind.String => el.GetString() ?? string.Empty,
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Number => el.ToString(),
            _ => el.GetRawText()
        };
    }

    private static DateTime ReadDate(JsonElement row, string name)
    {
        var raw = ReadString(row, name);
        return DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dt)
            ? dt
            : DateTime.UtcNow;
    }
}
