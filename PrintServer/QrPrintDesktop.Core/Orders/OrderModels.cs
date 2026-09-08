namespace QrPrintDesktop.Core.Orders;

public sealed record OrderLine(
    string MenuItemId,
    int Quantity,
    string Name,
    string Description,
    decimal UnitPrice,
    decimal LineTotal,
    string Note,
    string Category = "",
    Dictionary<string, string>? Fields = null);

public sealed record IncomingOrder(
    string Id,
    string OrderNumber,
    string TableNumber,
    string CustomerName,
    DateTime CreatedAt,
    decimal TotalAmount,
    decimal SubtotalAmount = 0m,
    decimal DiscountAmount = 0m,
    string Currency = "TRY",
    string CustomerNote = "",
    IReadOnlyList<OrderLine>? Items = null,
    string Source = "kitchen",
    Dictionary<string, string>? Fields = null);

public sealed record StoredOrder(
    string Id,
    string OrderNumber,
    string TableNumber,
    string CustomerName,
    DateTime CreatedAt,
    decimal TotalAmount,
    decimal SubtotalAmount,
    decimal DiscountAmount,
    string Currency,
    string CustomerNote,
    IReadOnlyList<OrderLine> Items,
    bool IsCompleted,
    DateTime? PrintedAt,
    string Source = "kitchen",
    Dictionary<string, string>? Fields = null);
