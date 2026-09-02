using System.Collections.Generic;

namespace RetailEX.PrintServer.Core.Models;

/// <summary>
/// <c>public.app_settings.key='restaurant_printer_config'</c> icin model.
/// Web tarafi (<c>restaurantPrinterConfigService.ts</c>) ile ayni JSONB sema.
/// </summary>
public sealed class TenantRoutingConfig
{
    public List<PrinterProfile> PrinterProfiles { get; set; } = new();
    public List<PrinterRoute> PrinterRoutes { get; set; } = new();
    public string? DefaultProfileId { get; set; }
    public bool PrintViaWindowsService { get; set; } = true;
}
