using QrPrintDesktop.Core.Audio;
using QrPrintDesktop.Core.Config;
using QrPrintDesktop.Core.Http;
using QrPrintDesktop.Core.Orders;
using QrPrintDesktop.Core.Printing;
using QrPrintDesktop.Core.Windows;

namespace QrPrintDesktop.Core.Engine;

public sealed class PrintCycleResult
{
    public int NewKitchenOrders { get; init; }
    public int PrintedCount { get; init; }
    public int OpenAccountOrders { get; init; }
    public string Message { get; init; } = string.Empty;
}

public sealed class PrintAgentEngine
{
    private readonly SettingsService _settingsService;
    private readonly OrderInboxService _inbox;
    private readonly RetailExOrderClient _orders = new();
    private readonly RetailExCatalogClient _catalog = new();
    private readonly ReceiptPrinterService _printer;
    private readonly AudioService _audio;
    private readonly SemaphoreSlim _pollLock = new(1, 1);
    private AppSettings _settings;
    private int _demoCounter = 1000;

    public PrintAgentEngine(SettingsService? settingsService = null, OrderInboxService? inbox = null, AudioService? audio = null)
    {
        _settingsService = settingsService ?? new SettingsService();
        _inbox = inbox ?? new OrderInboxService();
        _audio = audio ?? new AudioService();
        _printer = new ReceiptPrinterService(_audio);
        _settings = _settingsService.Load();
    }

    public AppSettings Settings => _settings;
    public OrderInboxService Inbox => _inbox;
    public AudioService Audio => _audio;
    public RetailExCatalogClient Catalog => _catalog;
    public DateTime? LastPollAt { get; private set; }
    public string LastStatus { get; private set; } = "Hazır";

    public event Action? InboxChanged;

    public void ReloadSettings()
    {
        _settings = _settingsService.Load();
    }

    public void SaveSettings(AppSettings settings)
    {
        _settings = settings;
        _settings.Normalize();
        _settingsService.Save(_settings);
    }

    public async Task<(bool Success, string Message)> HealthCheckAsync(CancellationToken cancellationToken = default)
    {
        return await _catalog.HealthCheckAsync(_settings, cancellationToken).ConfigureAwait(false);
    }

    public IncomingOrder AddDemoOrder()
    {
        _demoCounter++;
        var order = new IncomingOrder(
            $"demo-{_demoCounter}",
            $"S-{_demoCounter}",
            (_demoCounter % 20 + 1).ToString(),
            "Demo Garson",
            DateTime.UtcNow,
            150 + (_demoCounter % 9) * 10,
            150 + (_demoCounter % 9) * 10,
            0m,
            "TRY",
            "Demo sipariş",
            [
                new OrderLine("demo", 1, "Adana Kebap", "Acılı", 180m, 180m, "", "Mutfak",
                    new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ["product_name"] = "Adana Kebap",
                        ["quantity"] = "1",
                        ["course"] = "Mutfak"
                    }),
                new OrderLine("demo2", 2, "Ayran", "", 25m, 50m, "", "Bar",
                    new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ["product_name"] = "Ayran",
                        ["quantity"] = "2",
                        ["course"] = "Bar"
                    })
            ],
            "kitchen",
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["table_number"] = (_demoCounter % 20 + 1).ToString(),
                ["waiter"] = "Demo Garson",
                ["status"] = "new"
            });
        _inbox.AddOrUpdate(order);
        InboxChanged?.Invoke();
        AgentLog.Write($"Demo sipariş eklendi: {order.OrderNumber} masa {order.TableNumber}");
        return order;
    }

    public async Task<PrintCycleResult> PollAsync(bool force = false, CancellationToken cancellationToken = default)
    {
        if (!await _pollLock.WaitAsync(0, cancellationToken).ConfigureAwait(false))
        {
            return new PrintCycleResult { Message = "Tarama zaten sürüyor." };
        }

        try
        {
            if (!_settings.OrdersEnabled && !force)
            {
                LastStatus = "Sipariş alma kapalı";
                return new PrintCycleResult { Message = LastStatus };
            }

            if (!_settings.IsReadyForPolling())
            {
                LastStatus = "API ayarları eksik";
                AgentLog.Write(LastStatus);
                return new PrintCycleResult { Message = LastStatus };
            }

            var kitchen = await _orders.GetPendingKitchenOrdersAsync(_settings, cancellationToken).ConfigureAwait(false);
            if (!_settings.AcceptQrOrders)
            {
                kitchen = kitchen.Where(o => !OrderSource.IsQr(o)).ToList();
            }
            else
            {
                var qrOrders = await _orders.GetPendingQrOrdersAsync(_settings, cancellationToken).ConfigureAwait(false);
                kitchen = kitchen.Concat(qrOrders).ToList();
            }

            kitchen = await RefreshKitchenItemsBeforePrintAsync(kitchen, cancellationToken).ConfigureAwait(false);
            if (kitchen.Count > 0)
            {
                AgentLog.Write($"Mutfak taraması: {kitchen.Count} aday sipariş, {kitchen.Count(o => (o.Items?.Count ?? 0) > 0)} kalemli.");
            }

            var printed = 0;
            var added = 0;
            foreach (var incoming in kitchen)
            {
                if ((incoming.Items?.Count ?? 0) == 0)
                {
                    continue;
                }

                var (isNew, newItems) = _inbox.AddOrUpdateReturningNewItems(incoming);
                if (newItems.Count == 0)
                {
                    continue;
                }

                added++;
                AgentLog.Write(
                    (isNew ? "Yeni mutfak siparişi: " : "Mutfak siparişine ek ürün: ")
                    + $"#{incoming.OrderNumber} masa {incoming.TableNumber} ({newItems.Count} kalem)"
                    + (OrderSource.IsQr(incoming) ? " (QR)" : ""));
                if (_settings.AutoPrintKitchen)
                {
                    if (await PrintKitchenDeltaAsync(incoming.Id, newItems, followUp: !isNew, cancellationToken).ConfigureAwait(false))
                    {
                        printed++;
                    }
                }
            }

            var accounts = await _orders.GetOpenAccountOrdersAsync(_settings, cancellationToken).ConfigureAwait(false);
            foreach (var incoming in accounts)
            {
                _inbox.AddOrUpdate(incoming);
            }

            LastPollAt = DateTime.Now;
            LastStatus = added == 0
                ? $"Tarama tamam. Açık hesap: {accounts.Count}"
                : $"{added} yeni mutfak siparişi, {printed} fiş yazdırıldı.";
            InboxChanged?.Invoke();
            AgentLog.Write(LastStatus);
            return new PrintCycleResult
            {
                NewKitchenOrders = added,
                PrintedCount = printed,
                OpenAccountOrders = accounts.Count,
                Message = LastStatus
            };
        }
        catch (Exception ex)
        {
            LastStatus = "Tarama hatası: " + ex.Message;
            AgentLog.Write(LastStatus);
            return new PrintCycleResult { Message = LastStatus };
        }
        finally
        {
            _pollLock.Release();
        }
    }

    public async Task<bool> PrintKitchenAndCompleteAsync(string orderId, CancellationToken cancellationToken = default)
    {
        if (!_inbox.TryGet(orderId, out var order) || order is null)
        {
            return false;
        }

        return await PrintKitchenDeltaAsync(orderId, order.Items, followUp: false, cancellationToken).ConfigureAwait(false);
    }

    public bool ReprintKitchen(string orderId)
    {
        if (!_inbox.TryGet(orderId, out var order) || order is null)
        {
            return false;
        }

        var ok = PrintKitchenJobs(order, PrinterRouter.CreateKitchenJobs(order, _settings));
        AgentLog.Write(ok ? $"Mutfak fişi tekrar yazdırıldı: {order.OrderNumber}" : $"Tekrar yazdırma hatası: {order.OrderNumber}");
        return ok;
    }

    public bool ReprintAccount(string orderId)
    {
        if (!TryResolveAccountOrder(orderId, out var order) || order is null)
        {
            return false;
        }

        var printer = PrinterRouter.ResolveAccountPrinter(_settings);
        var ok = PrintOnSta(() => _printer.PrintAccountReceipt(order, _settings, printer));
        AgentLog.Write(ok ? $"Hesap fişi yazdırıldı ({printer}): {order.OrderNumber}" : $"Hesap fişi hatası: {order.OrderNumber}");
        return ok;
    }

    private bool TryResolveAccountOrder(string orderId, out StoredOrder? order)
    {
        order = null;
        if (!_inbox.TryGet(orderId, out var selected) || selected is null)
        {
            return false;
        }

        if (string.Equals(selected.Source, OrderSource.Account, StringComparison.OrdinalIgnoreCase))
        {
            order = selected;
            return true;
        }

        var parentId = "";
        selected.Fields?.TryGetValue("order_id", out parentId);
        if (!string.IsNullOrWhiteSpace(parentId) && _inbox.TryGet("acc-" + parentId, out var byParent) && byParent is not null)
        {
            order = byParent;
            return true;
        }

        order = _inbox.GetAll().FirstOrDefault(o =>
            string.Equals(o.Source, OrderSource.Account, StringComparison.OrdinalIgnoreCase)
            && string.Equals(o.OrderNumber, selected.OrderNumber, StringComparison.OrdinalIgnoreCase));
        return order is not null;
    }

    public bool PreviewOrder(string orderId)
    {
        if (!_inbox.TryGet(orderId, out var order) || order is null)
        {
            return false;
        }

        var ok = string.Equals(order.Source, OrderSource.Account, StringComparison.OrdinalIgnoreCase)
            ? PreviewAccount(order)
            : PreviewKitchen(order);
        AgentLog.Write(ok
            ? $"Fiş önizleme: {order.OrderNumber}"
            : $"Önizleme açılamadı: {order.OrderNumber}");
        return ok;
    }

    private bool PreviewKitchen(StoredOrder order)
    {
        var jobs = PrinterRouter.CreateKitchenJobs(order, _settings);
        var job = jobs.FirstOrDefault(j => !string.IsNullOrWhiteSpace(j.PrinterName)) ?? jobs.FirstOrDefault();
        var printer = job?.PrinterName;
        var title = job?.Title ?? "MUTFAK";
        var previewOrder = job?.Order ?? order;
        return PrintOnSta(() => _printer.PreviewKitchenReceipt(previewOrder, _settings, printer, title));
    }

    private bool PreviewAccount(StoredOrder order)
    {
        var printer = PrinterRouter.ResolveAccountPrinter(_settings);
        return PrintOnSta(() => _printer.PreviewAccountReceipt(order, _settings, printer));
    }

    public bool PrintTestPage(string printerName)
    {
        var ok = PrintOnSta(() => _printer.PrintTestPage(printerName, _settings));
        AgentLog.Write(ok ? $"Test sayfası yazdırıldı: {printerName}" : $"Test yazdırma hatası: {printerName}");
        return ok;
    }

    public async Task<bool> CompleteOnlyAsync(string orderId, CancellationToken cancellationToken = default)
    {
        if (!_inbox.TryGet(orderId, out var order) || order is null)
        {
            return false;
        }

        if (_settings.AutoMarkKitchenCooking && order.Source == "kitchen" && !order.Id.StartsWith("demo-", StringComparison.OrdinalIgnoreCase))
        {
            await _orders.MarkKitchenCookingAsync(order.Id, _settings, cancellationToken).ConfigureAwait(false);
        }

        var ok = _inbox.MarkPrintedAndCompleted(orderId);
        if (ok)
        {
            InboxChanged?.Invoke();
        }

        return ok;
    }

    private async Task<IReadOnlyList<IncomingOrder>> RefreshKitchenItemsBeforePrintAsync(
        IReadOnlyList<IncomingOrder> kitchen,
        CancellationToken cancellationToken)
    {
        var byId = new Dictionary<string, IncomingOrder>(StringComparer.OrdinalIgnoreCase);
        foreach (var incoming in kitchen)
        {
            byId[incoming.Id] = incoming;
        }

        var newKitchenIds = kitchen
            .Where(o => string.Equals(o.Source, OrderSource.Kitchen, StringComparison.OrdinalIgnoreCase))
            .Where(o => !_inbox.TryGet(o.Id, out _))
            .Select(o => o.Id)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (newKitchenIds.Count > 0)
        {
            await Task.Delay(800, cancellationToken).ConfigureAwait(false);
            await MergeLatestKitchenItemsAsync(byId, newKitchenIds, cancellationToken).ConfigureAwait(false);
        }

        var recentIds = _inbox.GetRecentKitchenOrderIds(TimeSpan.FromMinutes(15), 40)
            .Where(id => !newKitchenIds.Contains(id, StringComparer.OrdinalIgnoreCase))
            .ToList();
        if (recentIds.Count > 0)
        {
            await MergeLatestKitchenItemsAsync(byId, recentIds, cancellationToken).ConfigureAwait(false);
        }

        return byId.Values.ToList();
    }

    private async Task MergeLatestKitchenItemsAsync(
        Dictionary<string, IncomingOrder> byId,
        IReadOnlyList<string> kitchenIds,
        CancellationToken cancellationToken)
    {
        Dictionary<string, List<OrderLine>> itemsMap;
        try
        {
            itemsMap = await _orders.GetKitchenItemsByIdsAsync(_settings, kitchenIds, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            AgentLog.Write("Mutfak kalemleri yenilenemedi: " + ex.Message);
            return;
        }

        foreach (var id in kitchenIds)
        {
            if (!itemsMap.TryGetValue(id, out var lines) || lines.Count == 0)
            {
                continue;
            }

            if (byId.TryGetValue(id, out var incoming))
            {
                if (lines.Count >= (incoming.Items?.Count ?? 0))
                {
                    byId[id] = incoming with
                    {
                        Items = lines,
                        TotalAmount = lines.Sum(l => l.LineTotal),
                        SubtotalAmount = lines.Sum(l => l.LineTotal)
                    };
                }

                continue;
            }

            if (!_inbox.TryGet(id, out var stored) || stored is null)
            {
                continue;
            }

            byId[id] = new IncomingOrder(
                stored.Id,
                stored.OrderNumber,
                stored.TableNumber,
                stored.CustomerName,
                stored.CreatedAt,
                lines.Sum(l => l.LineTotal),
                lines.Sum(l => l.LineTotal),
                stored.DiscountAmount,
                stored.Currency,
                stored.CustomerNote,
                lines,
                stored.Source,
                stored.Fields);
        }
    }

    private async Task<bool> PrintKitchenDeltaAsync(
        string orderId,
        IReadOnlyList<OrderLine> items,
        bool followUp,
        CancellationToken cancellationToken)
    {
        if (!_inbox.TryGet(orderId, out var order) || order is null || items.Count == 0)
        {
            return false;
        }

        var slice = order with { Items = items.ToList() };
        var jobs = PrinterRouter.CreateKitchenJobs(slice, _settings);
        var routedItems = jobs.Sum(j => j.Order.Items.Count);
        if (routedItems < items.Count)
        {
            AgentLog.Write(
                $"Yazıcısı olmayan {items.Count - routedItems} kalem atlandı: {order.OrderNumber}. Yazıcılar sekmesinde kategori atayın.");
        }
        if (!PrintKitchenJobs(slice, jobs, followUp ? "EK" : null))
        {
            return false;
        }

        if (_settings.AutoMarkKitchenCooking && !order.Id.StartsWith("demo-", StringComparison.OrdinalIgnoreCase))
        {
            if (order.Source == OrderSource.Qr)
            {
                await _orders.MarkQrItemsSentAsync(items, _settings, cancellationToken).ConfigureAwait(false);
            }
            else if (order.Source == OrderSource.Kitchen && !followUp)
            {
                var remote = await _orders.MarkKitchenCookingAsync(order.Id, _settings, cancellationToken).ConfigureAwait(false);
                if (!remote)
                {
                    AgentLog.Write($"Mutfak durumu güncellenemedi: {order.OrderNumber}");
                }
            }
        }

        _inbox.MarkPrintedAndCompleted(orderId);
        InboxChanged?.Invoke();
        AgentLog.Write($"Mutfak fişi yazdırıldı: {order.OrderNumber}" + (followUp ? " (ek)" : ""));
        return true;
    }

    private bool PrintKitchenJobs(StoredOrder order, IReadOnlyList<CategoryPrintJob> jobs, string? titleSuffix = null)
    {
        var printable = jobs.Where(j => !string.IsNullOrWhiteSpace(j.PrinterName)).ToList();
        if (printable.Count == 0)
        {
            AgentLog.Write($"Yazıcı ataması yok, fiş basılmadı: {order.OrderNumber}");
            return false;
        }

        var printedAll = true;
        foreach (var job in printable)
        {
            var title = string.IsNullOrWhiteSpace(titleSuffix) ? job.Title : job.Title + " · " + titleSuffix;
            var printerLabel = job.PrinterName;
            var printSuccess = PrintOnSta(() => _printer.PrintKitchenReceipt(job.Order, _settings, job.PrinterName, title));
            if (!printSuccess)
            {
                printedAll = false;
                AgentLog.Write($"Yazdırma hatası ({printerLabel}): {order.OrderNumber} / {title}");
                continue;
            }

            AgentLog.Write($"Mutfak fişi yazdırıldı ({printerLabel}): {order.OrderNumber} / {title}");
        }

        return printedAll;
    }

    private static bool PrintOnSta(Func<bool> action)
    {
        try
        {
            return UiPrintDispatcher.Run(action);
        }
        catch (Exception ex)
        {
            AgentLog.Write("Yazdırma iş parçacığı hatası: " + ex.Message);
            return false;
        }
    }
}
