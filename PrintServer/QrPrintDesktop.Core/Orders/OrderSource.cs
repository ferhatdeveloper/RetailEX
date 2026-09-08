namespace QrPrintDesktop.Core.Orders;

public static class OrderSource
{
    public const string Kitchen = "kitchen";
    public const string Account = "account";
    public const string Qr = "qr";

    public static bool IsQr(IncomingOrder order) =>
        IsQr(order.CustomerName, order.CustomerNote, order.OrderNumber, order.Source);

    public static bool IsQr(StoredOrder order) =>
        IsQr(order.CustomerName, order.CustomerNote, order.OrderNumber, order.Source);

    public static bool IsQr(string? waiter, string? note, string? orderNo, string? source = null)
    {
        if (string.Equals(source, Qr, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var blob = $"{waiter} {note} {orderNo}".ToLowerInvariant();
        return blob.Contains("qr", StringComparison.Ordinal)
            || blob.Contains("iqrmenu", StringComparison.Ordinal)
            || blob.Contains("qr_menu", StringComparison.Ordinal)
            || blob.Contains("qr-menu", StringComparison.Ordinal);
    }
}
