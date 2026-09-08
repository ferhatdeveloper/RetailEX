using System.Data;
using System.Globalization;
using System.Reflection;
using QrPrintDesktop.Core.Config;
using QrPrintDesktop.Core.Orders;

namespace QrPrintDesktop.Core.Printing;

public static class ReceiptDataBinder
{
    public static readonly string[] OrderColumns =
    [
        "Id", "OrderNumber", "ReceiptNo", "TableNumber", "CustomerName", "Waiter", "Cashier",
        "CreatedAt", "CreatedAtRaw", "TotalAmount", "SubtotalAmount", "DiscountAmount",
        "PaidAmount", "RemainingAmount", "Currency", "CustomerNote", "Note", "Source",
        "CompanyName", "KitchenTitle", "Banner", "FloorName", "Status", "SentAt",
        "OrderId", "KitchenOrderId", "IsCompleted", "PrintedAt"
    ];

    public static readonly string[] ItemColumns =
    [
        "Qty", "Quantity", "Name", "ProductName", "Description", "Price", "UnitPrice",
        "LineTotal", "Subtotal", "Note", "Category", "Course", "Status", "MenuItemId",
        "ProductId", "OrderItemId", "KitchenItemId", "KitchenOrderId", "OrderId",
        "Modifiers", "Options", "Seat", "IsVoid", "SentToKitchenAt"
    ];

    public static readonly string[] KnownDbOrderColumns =
    [
        "id", "order_id", "order_no", "kitchen_order_id", "table_id", "table_number",
        "floor_name", "waiter", "cashier", "status", "note", "sent_at", "opened_at",
        "created_at", "updated_at", "closed_at", "total_amount", "discount_amount",
        "paid_amount", "remaining_amount", "subtotal", "guest_count", "store_id",
        "firm_id", "period_nr", "customer_name", "customer_note", "payment_type",
        "currency", "printer_name", "source"
    ];

    public static readonly string[] KnownDbItemColumns =
    [
        "id", "kitchen_order_id", "kitchen_item_id", "order_id", "order_item_id",
        "product_id", "product_name", "quantity", "unit_price", "subtotal", "note",
        "status", "course", "sent_to_kitchen_at", "is_void", "modifiers", "options",
        "seat", "category", "category_id", "product_code", "unit", "vat_rate",
        "is_combo", "parent_item_id"
    ];

    public static DataSet BuildDataSet(StoredOrder order, AppSettings settings, string heading, string language)
    {
        var ds = new DataSet("Receipt");
        ds.Tables.Add(BuildOrderTable(order, settings, heading, language));
        ds.Tables.Add(BuildItemsTable(order, language));
        var orderFields = CatalogOrderFields(order, settings, heading, language);
        ds.Tables.Add(BuildDbTable("kitchen_orders", KnownDbOrderColumns, orderFields));
        ds.Tables.Add(BuildDbTable("rest_orders", KnownDbOrderColumns, orderFields));
        ds.Tables.Add(BuildDbItemsTable("kitchen_order_items", order));
        ds.Tables.Add(BuildDbItemsTable("rest_order_items", order));
        return ds;
    }

    public static Dictionary<string, object?> BuildParameters(StoredOrder order, AppSettings settings, string heading, string language)
    {
        var company = string.IsNullOrWhiteSpace(settings.CompanyName) ? "RetailEX" : settings.CompanyName;
        var created = order.CreatedAt.ToLocalTime().ToString("dd.MM.yyyy HH:mm", ReceiptCopy.Culture(language));
        var map = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["OrderNumber"] = order.OrderNumber,
            ["TableNumber"] = order.TableNumber,
            ["CustomerName"] = order.CustomerName,
            ["Waiter"] = order.CustomerName,
            ["CustomerNote"] = order.CustomerNote,
            ["CreatedAt"] = created,
            ["Total"] = FormatAmount(order.TotalAmount, language),
            ["Subtotal"] = FormatAmount(order.SubtotalAmount, language),
            ["DiscountAmount"] = FormatAmount(order.DiscountAmount, language),
            ["PaidAmount"] = FormatAmount(0m, language),
            ["RemainingAmount"] = FormatAmount(order.TotalAmount, language),
            ["ReceiptNo"] = order.OrderNumber,
            ["Cashier"] = order.CustomerName,
            ["CompanyName"] = company,
            ["KitchenTitle"] = heading,
            ["Banner"] = heading,
            ["Source"] = order.Source,
            ["Currency"] = order.Currency
        };

        foreach (var pair in CatalogOrderFields(order, settings, heading, language))
        {
            if (!map.ContainsKey(pair.Key))
            {
                map[pair.Key] = pair.Value;
            }
        }

        return map;
    }

    public static void Bind(Type reportType, object report, StoredOrder order, AppSettings settings, string heading, string language)
    {
        var dataSet = BuildDataSet(order, settings, heading, language);
        RegisterAllData(reportType, report, dataSet);
        foreach (DataTable table in dataSet.Tables)
        {
            EnableDataSource(reportType, report, table.TableName);
        }

        foreach (var pair in BuildParameters(order, settings, heading, language))
        {
            reportType.GetMethod("SetParameterValue")?.Invoke(report, [pair.Key, pair.Value ?? string.Empty]);
        }
    }

    public static StoredOrder SampleOrder(AppSettings settings)
    {
        return new StoredOrder(
            "sample",
            "RES-2026-00001",
            "12",
            "Garson",
            DateTime.Now,
            245.50m,
            245.50m,
            0m,
            "TRY",
            "Az pişmiş",
            [
                new OrderLine("p1", 1, "Adana Kebap", "Acılı", 180m, 180m, "Soğansız", "Ana Yemekler",
                    new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ["product_name"] = "Adana Kebap",
                        ["quantity"] = "1",
                        ["course"] = "Ana Yemekler",
                        ["note"] = "Soğansız",
                        ["status"] = "new"
                    }),
                new OrderLine("p2", 2, "Ayran", "", 25m, 50m, "", "İçecekler",
                    new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ["product_name"] = "Ayran",
                        ["quantity"] = "2",
                        ["course"] = "İçecekler"
                    })
            ],
            false,
            null,
            "kitchen",
            CatalogOrderFields(null, settings, "MUTFAK FİŞİ", "tr"));
    }

    private static DataTable BuildOrderTable(StoredOrder order, AppSettings settings, string heading, string language)
    {
        var table = new DataTable("Order");
        foreach (var name in OrderColumns.Concat(KnownDbOrderColumns))
        {
            EnsureColumn(table, name);
        }

        foreach (var key in CatalogOrderFields(order, settings, heading, language).Keys)
        {
            EnsureColumn(table, SafeColumn(key));
        }

        var company = string.IsNullOrWhiteSpace(settings.CompanyName) ? "RetailEX" : settings.CompanyName;
        var created = order.CreatedAt.ToLocalTime().ToString("dd.MM.yyyy HH:mm", ReceiptCopy.Culture(language));
        var row = table.NewRow();
        row["Id"] = order.Id;
        row["OrderNumber"] = order.OrderNumber;
        row["ReceiptNo"] = order.OrderNumber;
        row["TableNumber"] = order.TableNumber;
        row["CustomerName"] = order.CustomerName;
        row["Waiter"] = order.CustomerName;
        row["Cashier"] = order.CustomerName;
        row["CreatedAt"] = created;
        row["CreatedAtRaw"] = order.CreatedAt.ToString("O");
        row["TotalAmount"] = FormatAmount(order.TotalAmount, language);
        row["SubtotalAmount"] = FormatAmount(order.SubtotalAmount, language);
        row["DiscountAmount"] = FormatAmount(order.DiscountAmount, language);
        row["PaidAmount"] = FormatAmount(0m, language);
        row["RemainingAmount"] = FormatAmount(order.TotalAmount, language);
        row["Currency"] = order.Currency;
        row["CustomerNote"] = order.CustomerNote;
        row["Note"] = order.CustomerNote;
        row["Source"] = order.Source;
        row["CompanyName"] = company;
        row["KitchenTitle"] = heading;
        row["Banner"] = heading;
        row["IsCompleted"] = order.IsCompleted ? "true" : "false";
        row["PrintedAt"] = order.PrintedAt?.ToLocalTime().ToString("dd.MM.yyyy HH:mm", ReceiptCopy.Culture(language)) ?? "";
        foreach (var pair in CatalogOrderFields(order, settings, heading, language))
        {
            var col = SafeColumn(pair.Key);
            EnsureColumn(table, col);
            row[col] = pair.Value ?? "";
        }

        table.Rows.Add(row);
        return table;
    }

    private static DataTable BuildItemsTable(StoredOrder order, string language)
    {
        var table = new DataTable("OrderItems");
        foreach (var name in ItemColumns.Concat(KnownDbItemColumns))
        {
            EnsureColumn(table, name);
        }

        foreach (var item in order.Items ?? [])
        {
            foreach (var key in CatalogItemFields(item).Keys)
            {
                EnsureColumn(table, SafeColumn(key));
            }
        }

        foreach (var item in order.Items ?? [])
        {
            var row = table.NewRow();
            row["Qty"] = $"{item.Quantity}x";
            row["Quantity"] = item.Quantity.ToString(CultureInfo.InvariantCulture);
            row["Name"] = item.Name;
            row["ProductName"] = item.Name;
            row["Description"] = item.Description;
            row["Price"] = FormatAmount(item.UnitPrice, language);
            row["UnitPrice"] = FormatAmount(item.UnitPrice, language);
            row["LineTotal"] = FormatAmount(item.LineTotal, language);
            row["Subtotal"] = FormatAmount(item.LineTotal, language);
            row["Note"] = string.Join(" · ", new[] { item.Description, item.Note, item.Category }
                .Where(v => !string.IsNullOrWhiteSpace(v)));
            row["Category"] = item.Category;
            row["Course"] = item.Category;
            row["MenuItemId"] = item.MenuItemId;
            row["ProductId"] = item.MenuItemId;
            row["OrderItemId"] = item.MenuItemId;
            foreach (var pair in CatalogItemFields(item))
            {
                var col = SafeColumn(pair.Key);
                EnsureColumn(table, col);
                row[col] = pair.Value ?? "";
            }

            table.Rows.Add(row);
        }

        if (table.Rows.Count == 0)
        {
            table.Rows.Add(table.NewRow());
        }

        return table;
    }

    private static DataTable BuildDbTable(string name, IReadOnlyList<string> knownColumns, IReadOnlyDictionary<string, string> values)
    {
        var table = new DataTable(name);
        foreach (var col in knownColumns)
        {
            EnsureColumn(table, col);
        }

        foreach (var key in values.Keys)
        {
            EnsureColumn(table, SafeColumn(key));
        }

        var row = table.NewRow();
        foreach (DataColumn column in table.Columns)
        {
            row[column] = "";
        }

        foreach (var pair in values)
        {
            var col = SafeColumn(pair.Key);
            EnsureColumn(table, col);
            row[col] = pair.Value ?? "";
        }

        table.Rows.Add(row);
        return table;
    }

    private static DataTable BuildDbItemsTable(string name, StoredOrder order)
    {
        var table = new DataTable(name);
        foreach (var col in KnownDbItemColumns)
        {
            EnsureColumn(table, col);
        }

        foreach (var item in order.Items ?? [])
        {
            foreach (var key in CatalogItemFields(item).Keys)
            {
                EnsureColumn(table, SafeColumn(key));
            }
        }

        foreach (var item in order.Items ?? [])
        {
            var row = table.NewRow();
            foreach (DataColumn column in table.Columns)
            {
                row[column] = "";
            }

            foreach (var pair in CatalogItemFields(item))
            {
                var col = SafeColumn(pair.Key);
                EnsureColumn(table, col);
                row[col] = pair.Value ?? "";
            }

            table.Rows.Add(row);
        }

        if (table.Rows.Count == 0)
        {
            table.Rows.Add(table.NewRow());
        }

        return table;
    }

    private static Dictionary<string, string> CatalogOrderFields(StoredOrder? order, AppSettings settings, string heading, string language)
    {
        var company = string.IsNullOrWhiteSpace(settings.CompanyName) ? "RetailEX" : settings.CompanyName;
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in KnownDbOrderColumns)
        {
            map[key] = "";
        }

        if (order is null)
        {
            map["id"] = "sample";
            map["order_id"] = "sample-order";
            map["order_no"] = "RES-2026-00001";
            map["table_number"] = "12";
            map["floor_name"] = "Salon";
            map["waiter"] = "Garson";
            map["status"] = "new";
            map["note"] = "Az pişmiş";
            map["source"] = "kitchen";
            map["currency"] = "TRY";
            map["total_amount"] = "245,5";
            return map;
        }

        var created = order.CreatedAt.ToLocalTime().ToString("dd.MM.yyyy HH:mm", ReceiptCopy.Culture(language));
        map["id"] = order.Id;
        map["order_id"] = order.Id;
        map["kitchen_order_id"] = order.Id;
        map["order_no"] = order.OrderNumber;
        map["table_number"] = order.TableNumber;
        map["waiter"] = order.CustomerName;
        map["cashier"] = order.CustomerName;
        map["customer_name"] = order.CustomerName;
        map["customer_note"] = order.CustomerNote;
        map["note"] = order.CustomerNote;
        map["status"] = order.IsCompleted ? "completed" : "new";
        map["source"] = order.Source;
        map["currency"] = order.Currency;
        map["total_amount"] = FormatAmount(order.TotalAmount, language);
        map["discount_amount"] = FormatAmount(order.DiscountAmount, language);
        map["subtotal"] = FormatAmount(order.SubtotalAmount, language);
        map["remaining_amount"] = FormatAmount(order.TotalAmount, language);
        map["created_at"] = created;
        map["opened_at"] = created;
        map["sent_at"] = created;
        map["printer_name"] = heading;
        if (order.Fields is not null)
        {
            foreach (var pair in order.Fields)
            {
                if (!string.IsNullOrWhiteSpace(pair.Key))
                {
                    map[pair.Key] = pair.Value ?? "";
                }
            }
        }

        map["company_name"] = company;
        return map;
    }

    private static Dictionary<string, string> CatalogItemFields(OrderLine item)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in KnownDbItemColumns)
        {
            map[key] = "";
        }

        map["id"] = item.MenuItemId;
        map["order_item_id"] = item.MenuItemId;
        map["product_id"] = item.MenuItemId;
        map["product_name"] = item.Name;
        map["quantity"] = item.Quantity.ToString(CultureInfo.InvariantCulture);
        map["unit_price"] = item.UnitPrice.ToString(CultureInfo.InvariantCulture);
        map["subtotal"] = item.LineTotal.ToString(CultureInfo.InvariantCulture);
        map["note"] = item.Note;
        map["course"] = item.Category;
        map["category"] = item.Category;
        map["status"] = "new";
        if (item.Fields is not null)
        {
            foreach (var pair in item.Fields)
            {
                if (!string.IsNullOrWhiteSpace(pair.Key))
                {
                    map[pair.Key] = pair.Value ?? "";
                }
            }
        }

        return map;
    }

    private static void RegisterAllData(Type reportType, object report, DataSet dataSet)
    {
        foreach (var method in reportType.GetMethods().Where(m => m.Name == "RegisterData"))
        {
            TryInvokeRegister(method, report, dataSet);
        }

        var dictionary = reportType.GetProperty("Dictionary")?.GetValue(report);
        if (dictionary is not null)
        {
            foreach (var method in dictionary.GetType().GetMethods().Where(m => m.Name == "RegisterData"))
            {
                TryInvokeRegister(method, dictionary, dataSet);
            }
        }
    }

    private static void TryInvokeRegister(MethodInfo method, object target, DataSet dataSet)
    {
        try
        {
            var ps = method.GetParameters();
            if (ps.Length == 1 && typeof(DataSet).IsAssignableFrom(ps[0].ParameterType))
            {
                method.Invoke(target, [dataSet]);
            }
            else if (ps.Length == 2 && typeof(DataSet).IsAssignableFrom(ps[0].ParameterType) && ps[1].ParameterType == typeof(string))
            {
                method.Invoke(target, [dataSet, dataSet.DataSetName]);
            }
            else if (ps.Length == 3 && typeof(DataSet).IsAssignableFrom(ps[0].ParameterType) && ps[1].ParameterType == typeof(string) && ps[2].ParameterType == typeof(bool))
            {
                method.Invoke(target, [dataSet, dataSet.DataSetName, true]);
            }
            else if (ps.Length == 2 && typeof(DataTable).IsAssignableFrom(ps[0].ParameterType) && ps[1].ParameterType == typeof(string))
            {
                foreach (DataTable table in dataSet.Tables)
                {
                    method.Invoke(target, [table, table.TableName]);
                }
            }
            else if (ps.Length == 3 && typeof(DataTable).IsAssignableFrom(ps[0].ParameterType) && ps[1].ParameterType == typeof(string) && ps[2].ParameterType == typeof(bool))
            {
                foreach (DataTable table in dataSet.Tables)
                {
                    method.Invoke(target, [table, table.TableName, true]);
                }
            }
        }
        catch
        {
            // FastReport sürümüne göre imza değişebilir
        }
    }

    private static void EnableDataSource(Type reportType, object report, string name)
    {
        try
        {
            var dataSource = reportType.GetMethod("GetDataSource", [typeof(string)])?.Invoke(report, [name]);
            if (dataSource is null)
            {
                return;
            }

            dataSource.GetType().GetProperty("Enabled")?.SetValue(dataSource, true);
            dataSource.GetType().GetMethod("CreateColumns", Type.EmptyTypes)?.Invoke(dataSource, null);
            foreach (var method in dataSource.GetType().GetMethods().Where(m => m.Name is "Refresh" or "RefreshColumns" or "UpdateColumns"))
            {
                if (method.GetParameters().Length == 0)
                {
                    method.Invoke(dataSource, null);
                }
            }
        }
        catch
        {
            // kaynak zaten açıksa tasarım devam eder
        }
    }

    private static void EnsureColumn(DataTable table, string name)
    {
        if (!table.Columns.Contains(name))
        {
            table.Columns.Add(name, typeof(string));
        }
    }

    private static string SafeColumn(string name)
    {
        var value = (name ?? string.Empty).Trim();
        if (value.Length == 0)
        {
            return "Field";
        }

        var chars = value.Select(ch => char.IsLetterOrDigit(ch) ? ch : '_').ToArray();
        if (!char.IsLetter(chars[0]) && chars[0] != '_')
        {
            return "F_" + new string(chars);
        }

        return new string(chars);
    }

    private static string FormatAmount(decimal amount, string? language)
    {
        return amount.ToString("#,0.##", ReceiptCopy.Culture(language));
    }
}
