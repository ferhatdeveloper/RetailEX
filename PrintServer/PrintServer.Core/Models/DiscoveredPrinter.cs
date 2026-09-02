using System;

namespace RetailEX.PrintServer.Core.Models;

/// <summary>
/// PowerShell Get-Printer / Win32_Printer ciktisi — PrinterDiscoveryService tarafindan uretilir.
/// </summary>
public sealed class DiscoveredPrinter
{
    public string Name { get; set; } = "";
    public string? ShareName { get; set; }
    public string? Port { get; set; }
    public string? DriverName { get; set; }
    public bool IsDefault { get; set; }
    public bool IsNetwork { get; set; }
    public string? DeviceId { get; set; }
    public string? Type { get; set; }
    public DateTime DiscoveredAt { get; set; } = DateTime.UtcNow;
}
