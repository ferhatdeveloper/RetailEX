namespace RetailEX.PrintServer.Core.Models;

/// <summary>
/// Hangi job_type/ref_type/category'in hangi PrinterProfile'a yonlendirilecegini tanimlar.
/// TenantRoutingConfig icindeki PrinterRoutes listesinde tutulur.
/// </summary>
public class PrinterRoute
{
    /// <summary>Route kimligi (log / debug icin).</summary>
    public string Id = "";

    /// <summary>Job tipi (kitchen_ticket, invoice_sales, pos_receipt, account_receipt, cash_voucher, "*" fallback).</summary>
    public string Scope = "*";

    /// <summary>Kategori filtresi (ornek: doner, icecek). Bos/null = her kategori.</summary>
    public string? Category;

    /// <summary>Referans tipi filtresi (ornek: sales_invoice, kitchen_order).</summary>
    public string? RefType;

    /// <summary>Hedef PrinterProfile.Id.</summary>
    public string PrinterProfileId = "";

    /// <summary>Routelar arasinda oncelik (yuksek = once).</summary>
    public int Priority = 0;

    /// <summary>false ise bu rota degerlendirilmez.</summary>
    public bool Enabled = true;
}