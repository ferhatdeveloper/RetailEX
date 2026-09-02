using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Core.Models;

namespace RetailEX.PrintServer.Core.Discovery;

/// <summary>
/// Windows'ta PowerShell uzerinden yazici listesini kesfeder.
/// Sonuclar <c>printer_scan_cache.json</c> icinde 5 dakika TTL ile saklanir.
/// </summary>
public sealed class PrinterDiscoveryService
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    private readonly PrintServerConfig _cfg;
    private readonly ILogger _log;
    private readonly string _cachePath;

    private List<DiscoveredPrinter>? _cache;
    private DateTime _cacheLoadedAt = DateTime.MinValue;
    private readonly object _lock = new();

    public PrinterDiscoveryService(PrintServerConfig cfg, ILogger log)
    {
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
        _cachePath = PrintServerPaths.DefaultScanCachePath;
    }

    /// <summary>Cache'li veya canli sonuc doner. Cache TTL gectiyse yeniden tarar.</summary>
    public async Task<IReadOnlyList<DiscoveredPrinter>> DiscoverAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        lock (_lock)
        {
            if (_cache != null && now - _cacheLoadedAt < CacheTtl)
            {
                return _cache;
            }
        }

        var fresh = await DiscoverNowAsync(ct).ConfigureAwait(false);
        lock (_lock)
        {
            _cache = new List<DiscoveredPrinter>(fresh);
            _cacheLoadedAt = now;
        }
        await WriteCacheFileAsync(fresh, ct).ConfigureAwait(false);
        return fresh;
    }

    /// <summary>Cache'i yenilemek zorlamak icin (admin UI'dan).</summary>
    public async Task<IReadOnlyList<DiscoveredPrinter>> RefreshAsync(CancellationToken ct)
    {
        var fresh = await DiscoverNowAsync(ct).ConfigureAwait(false);
        lock (_lock)
        {
            _cache = new List<DiscoveredPrinter>(fresh);
            _cacheLoadedAt = DateTime.UtcNow;
        }
        await WriteCacheFileAsync(fresh, ct).ConfigureAwait(false);
        return fresh;
    }

    private async Task<List<DiscoveredPrinter>> DiscoverNowAsync(CancellationToken ct)
    {
        var result = new List<DiscoveredPrinter>();
        if (!OperatingSystem.IsWindows())
        {
            _log.LogInformation("PrinterDiscovery: Windows disi platform; bos liste doner.");
            return result;
        }

        // 1) PowerShell ile Get-Printer
        var psScript = "Get-Printer | Select-Object Name,ShareName,PortName,DriverName,Type,Published | ConvertTo-Json -Depth 4";
        var (exit, json) = await RunPowerShellAsync(psScript, ct).ConfigureAwait(false);
        if (exit == 0 && !string.IsNullOrWhiteSpace(json))
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in doc.RootElement.EnumerateArray())
                    {
                        result.Add(ParsePrinter(el));
                    }
                }
                else if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    result.Add(ParsePrinter(doc.RootElement));
                }
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "PrinterDiscovery: PowerShell cikti JSON'u parse edilemedi.");
            }
        }
        else
        {
            _log.LogWarning("PrinterDiscovery: PowerShell exit={Exit}; cikti bos.", exit);
        }

        // 2) Default yaziciyi isaretle
        var (defExit, defJson) = await RunPowerShellAsync("(Get-CimInstance -ClassName Win32_Printer -Filter \\\"Default = TRUE\\\") | Select-Object Name,Default | ConvertTo-Json -Depth 2", ct).ConfigureAwait(false);
        if (defExit == 0 && !string.IsNullOrWhiteSpace(defJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(defJson);
                var defaultName = doc.RootElement.ValueKind switch
                {
                    JsonValueKind.Object => doc.RootElement.GetProperty("Name").GetString(),
                    JsonValueKind.Array when doc.RootElement.GetArrayLength() > 0 => doc.RootElement[0].GetProperty("Name").GetString(),
                    _ => null,
                };
                if (!string.IsNullOrWhiteSpace(defaultName))
                {
                    foreach (var p in result)
                    {
                        if (string.Equals(p.Name, defaultName, StringComparison.OrdinalIgnoreCase))
                        {
                            p.IsDefault = true;
                            break;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _log.LogDebug(ex, "PrinterDiscovery: default yazici parse edilemedi.");
            }
        }

        // 3) Get-CimInstance fallback
        if (result.Count == 0)
        {
            var (wmiExit, wmiJson) = await RunPowerShellAsync(
                "Get-CimInstance -ClassName Win32_Printer | Select-Object Name,ShareName,PortName,DriverName,Default,Network,Local,Published | ConvertTo-Json -Depth 4",
                ct).ConfigureAwait(false);
            if (wmiExit == 0 && !string.IsNullOrWhiteSpace(wmiJson))
            {
                try
                {
                    using var doc = JsonDocument.Parse(wmiJson);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var el in doc.RootElement.EnumerateArray())
                        {
                            var p = ParsePrinter(el);
                            p.IsDefault = el.TryGetProperty("Default", out var d) && d.ValueKind == JsonValueKind.True;
                            result.Add(p);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "PrinterDiscovery: WMI fallback parse hatasi.");
                }
            }
        }

        _log.LogInformation("PrinterDiscovery: {Count} yazici bulundu.", result.Count);
        return result;
    }

    private static DiscoveredPrinter ParsePrinter(JsonElement el)
    {
        var p = new DiscoveredPrinter();
        if (el.TryGetProperty("Name", out var n)) p.Name = n.GetString() ?? "";
        if (el.TryGetProperty("ShareName", out var sn) && sn.ValueKind != JsonValueKind.Null) p.ShareName = sn.GetString();
        if (el.TryGetProperty("PortName", out var pn) && pn.ValueKind != JsonValueKind.Null) p.Port = pn.GetString();
        if (el.TryGetProperty("DriverName", out var dn) && dn.ValueKind != JsonValueKind.Null) p.DriverName = dn.GetString();
        if (el.TryGetProperty("DeviceId", out var did) && did.ValueKind != JsonValueKind.Null) p.DeviceId = did.GetString();
        if (el.TryGetProperty("Type", out var ty) && ty.ValueKind != JsonValueKind.Null)
        {
            var type = ty.GetString() ?? "";
            p.IsNetwork = type.Contains("Network", StringComparison.OrdinalIgnoreCase);
        }
        if (el.TryGetProperty("Network", out var nw) && nw.ValueKind == JsonValueKind.True) p.IsNetwork = true;
        return p;
    }

    private static async Task<(int exit, string json)> RunPowerShellAsync(string script, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "powershell",
            Arguments = $"-NoProfile -NonInteractive -Command \"{script.Replace("\"", "\\\"")}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
        };
        using var p = Process.Start(psi);
        if (p == null) return (-1, "");
        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        p.OutputDataReceived += (s, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };
        p.ErrorDataReceived += (s, e) => { if (e.Data != null) stderr.AppendLine(e.Data); };
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        try
        {
            await p.WaitForExitAsync(ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            try { if (!p.HasExited) p.Kill(); } catch { /* sessiz */ }
            throw;
        }
        var json = stdout.ToString().Trim();
        if (string.IsNullOrWhiteSpace(json) && stderr.Length > 0)
        {
            // Bazi PS hata durumlarinda JSON stderr'a dusmus olabilir
            json = stderr.ToString().Trim();
        }
        return (p.ExitCode, json);
    }

    private async Task WriteCacheFileAsync(IReadOnlyList<DiscoveredPrinter> printers, CancellationToken ct)
    {
        try
        {
            PrintServerPaths.EnsureDirectory(Path.GetDirectoryName(_cachePath) ?? "");
            var payload = new
            {
                cached_at = DateTime.UtcNow,
                printers,
            };
            var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = false });
            await File.WriteAllTextAsync(_cachePath, json, new UTF8Encoding(false), ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "PrinterDiscovery: cache dosyasi yazilamadi: {Path}", _cachePath);
        }
    }
}
