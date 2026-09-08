using System.Text.Json;
using QrPrintDesktop.Core.Config;

namespace QrPrintDesktop.Core.Orders;

public sealed class OrderInboxService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly Dictionary<string, StoredOrder> _orders = new(StringComparer.OrdinalIgnoreCase);
    private readonly string _path;
    private readonly object _gate = new();

    public OrderInboxService(string? path = null)
    {
        _path = path ?? SettingsService.DefaultInboxPath;
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        Load();
    }

    public void AddOrUpdate(IncomingOrder order) => AddOrUpdateReturningNewItems(order);

    public (bool IsNew, IReadOnlyList<OrderLine> NewItems) AddOrUpdateReturningNewItems(IncomingOrder order)
    {
        lock (_gate)
        {
            var existed = _orders.TryGetValue(order.Id, out var existing);
            var previous = existed ? existing!.Items ?? [] : [];
            var previousKeys = previous
                .Select(LineKey)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var incomingItems = order.Items;
            var newItems = incomingItems is null
                ? []
                : incomingItems.Where(line => !previousKeys.Contains(LineKey(line))).ToList();

            IReadOnlyList<OrderLine> merged = previous;
            if (incomingItems is not null)
            {
                var union = previous.ToList();
                foreach (var line in incomingItems)
                {
                    if (previousKeys.Add(LineKey(line)))
                    {
                        union.Add(line);
                    }
                }

                merged = union;
            }

            if (existed)
            {
                _orders[order.Id] = existing! with
                {
                    OrderNumber = order.OrderNumber,
                    TableNumber = order.TableNumber,
                    CustomerName = order.CustomerName,
                    CreatedAt = order.CreatedAt,
                    TotalAmount = order.TotalAmount,
                    SubtotalAmount = order.SubtotalAmount,
                    DiscountAmount = order.DiscountAmount,
                    Currency = order.Currency,
                    CustomerNote = order.CustomerNote,
                    Items = merged,
                    Source = order.Source,
                    Fields = order.Fields ?? existing.Fields
                };
            }
            else
            {
                _orders[order.Id] = new StoredOrder(
                    order.Id,
                    order.OrderNumber,
                    order.TableNumber,
                    order.CustomerName,
                    order.CreatedAt,
                    order.TotalAmount,
                    order.SubtotalAmount,
                    order.DiscountAmount,
                    order.Currency,
                    order.CustomerNote,
                    merged,
                    IsCompleted: false,
                    PrintedAt: null,
                    Source: order.Source,
                    Fields: order.Fields);
            }

            Persist();
            return (!existed, newItems);
        }
    }

    public static string LineKey(OrderLine line)
    {
        if (!string.IsNullOrWhiteSpace(line.MenuItemId))
        {
            return "id:" + line.MenuItemId.Trim();
        }

        return string.Join("|",
            "n:" + (line.Name ?? string.Empty).Trim(),
            "q:" + line.Quantity,
            "c:" + (line.Category ?? string.Empty).Trim(),
            "note:" + (line.Note ?? string.Empty).Trim());
    }

    public IReadOnlyList<string> GetRecentKitchenOrderIds(TimeSpan window, int limit)
    {
        var cutoff = DateTime.UtcNow - window;
        lock (_gate)
        {
            return _orders.Values
                .Where(o => string.Equals(o.Source, OrderSource.Kitchen, StringComparison.OrdinalIgnoreCase))
                .Where(o => !o.Id.StartsWith("demo-", StringComparison.OrdinalIgnoreCase))
                .Where(o => !o.IsCompleted || (o.PrintedAt ?? o.CreatedAt) >= cutoff)
                .OrderByDescending(o => o.PrintedAt ?? o.CreatedAt)
                .Select(o => o.Id)
                .Take(Math.Max(1, limit))
                .ToList();
        }
    }

    public IReadOnlyList<StoredOrder> GetPending()
    {
        lock (_gate)
        {
            return _orders.Values
                .Where(x => !x.IsCompleted)
                .OrderBy(x => x.CreatedAt)
                .ToList();
        }
    }

    public IReadOnlyList<StoredOrder> GetCompleted()
    {
        lock (_gate)
        {
            return _orders.Values
                .Where(x => x.IsCompleted)
                .OrderByDescending(x => x.PrintedAt ?? x.CreatedAt)
                .ToList();
        }
    }

    public IReadOnlyList<StoredOrder> GetAll()
    {
        lock (_gate)
        {
            return _orders.Values
                .OrderByDescending(x => x.CreatedAt)
                .ToList();
        }
    }

    public bool MarkPrintedAndCompleted(string orderId)
    {
        lock (_gate)
        {
            if (!_orders.TryGetValue(orderId, out var order))
            {
                return false;
            }

            _orders[orderId] = order with
            {
                IsCompleted = true,
                PrintedAt = DateTime.UtcNow
            };
            Persist();
            return true;
        }
    }

    public int MarkAllPendingCompleted()
    {
        lock (_gate)
        {
            var now = DateTime.UtcNow;
            var ids = _orders.Values.Where(x => !x.IsCompleted).Select(x => x.Id).ToList();
            foreach (var id in ids)
            {
                var order = _orders[id];
                _orders[id] = order with
                {
                    IsCompleted = true,
                    PrintedAt = now
                };
            }

            Persist();
            return ids.Count;
        }
    }

    public bool TryGet(string orderId, out StoredOrder? order)
    {
        lock (_gate)
        {
            if (_orders.TryGetValue(orderId, out var existing))
            {
                order = existing;
                return true;
            }

            order = null;
            return false;
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path))
            {
                return;
            }

            var json = File.ReadAllText(_path);
            var list = JsonSerializer.Deserialize<List<StoredOrder>>(json, JsonOptions);
            if (list is null)
            {
                return;
            }

            foreach (var order in list)
            {
                _orders[order.Id] = order;
            }
        }
        catch
        {
            // bozuk kutu dosyası yok sayılır
        }
    }

    private void Persist()
    {
        try
        {
            var snapshot = _orders.Values
                .OrderByDescending(x => x.CreatedAt)
                .Take(400)
                .ToList();
            File.WriteAllText(_path, JsonSerializer.Serialize(snapshot, JsonOptions));
        }
        catch
        {
            // disk hatası poll döngüsünü durdurmasın
        }
    }
}
