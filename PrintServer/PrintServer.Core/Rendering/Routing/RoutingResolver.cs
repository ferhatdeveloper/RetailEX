using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Core.Models;
using RetailEX.PrintServer.Core.PrintQueue;
using RetailEX.PrintServer.Core.PostgRest;

namespace RetailEX.PrintServer.Core.Rendering.Routing;

/// <summary>
/// Tenant (firm) icin yazici yonlendirme kararini verir.
/// public.app_settings icindeki <c>restaurant_printer_config</c> JSON'undan TenantRoutingConfig okur,
/// job uzerindeki alanlara gore route rule esler, PrinterProfile.Id ile profili getirir.
/// Per-tenant 60sn TTL cache.
/// </summary>
public sealed class RoutingResolver
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);
    private static readonly JsonSerializerSettings JsonSettings = new()
    {
        NullValueHandling = NullValueHandling.Ignore,
        MissingMemberHandling = MissingMemberHandling.Ignore,
    };

    private readonly PostgRestClient _pg;
    private readonly PrintServerConfig _cfg;
    private readonly ILogger _log;

    private readonly Dictionary<string, CacheEntry> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _cacheLock = new();

    public RoutingResolver(PostgRestClient pg, PrintServerConfig cfg, ILogger log)
    {
        _pg = pg ?? throw new ArgumentNullException(nameof(pg));
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
    }

    /// <summary>
    /// Job icin uygun PrinterProfile'u resolve eder. Null donerse dispatcher default davranir.
    /// </summary>
    public async Task<PrinterProfile?> ResolveAsync(PrintJob job, TenantContext tenant, CancellationToken ct)
    {
        if (job == null) throw new ArgumentNullException(nameof(job));
        if (tenant == null) throw new ArgumentNullException(nameof(tenant));

        var routing = await GetRoutingConfigAsync(tenant, ct).ConfigureAwait(false);

        // Routes icinden esleme ara (yuksek oncelik once; Priority max olan once)
        if (routing != null && routing.PrinterRoutes != null && routing.PrinterRoutes.Count > 0)
        {
            var payloadCategory = ExtractCategory(job);
            var candidates = routing.PrinterRoutes
                .Where(r => r != null && r.Enabled)
                .Where(r => string.Equals(r.Scope, "*", StringComparison.OrdinalIgnoreCase)
                         || string.Equals(r.Scope, job.JobType, StringComparison.OrdinalIgnoreCase))
                .Where(r => string.IsNullOrEmpty(r.RefType)
                         || string.Equals(r.RefType, job.RefType, StringComparison.OrdinalIgnoreCase))
                .Where(r => string.IsNullOrEmpty(r.Category)
                         || CategoryMatches(r.Category, payloadCategory))
                .OrderByDescending(r => r.Priority)
                .ToList();

            foreach (var rule in candidates)
            {
                if (string.IsNullOrWhiteSpace(rule.PrinterProfileId)) continue;
                var profile = FindProfile(routing, rule.PrinterProfileId);
                if (profile != null) return profile;
                _log.LogWarning("Routing: rule {Scope} icin PrinterProfileId {Pid} bulunamadi (tenant {Firm}/{Period}).",
                    rule.Scope, rule.PrinterProfileId, tenant.FirmNr, tenant.PeriodNr);
            }
        }

        // Default profile
        if (routing != null && !string.IsNullOrWhiteSpace(routing.DefaultProfileId))
        {
            var def = FindProfile(routing, routing.DefaultProfileId);
            if (def != null) return def;
        }

        // Job icindeki printer_profile_id / printer_name fallback
        if (!string.IsNullOrWhiteSpace(job.PrinterProfileId))
        {
            return new PrinterProfile
            {
                Id = job.PrinterProfileId!,
                Name = job.PrinterProfileId!,
                Kind = string.IsNullOrWhiteSpace(job.Connection) ? "system" : MapConnectionToKind(job.Connection),
                Address = job.Address,
                Port = job.Port ?? 9100,
                SystemName = job.PrinterName,
            };
        }
        if (!string.IsNullOrWhiteSpace(job.PrinterName))
        {
            return new PrinterProfile
            {
                Id = "inline_" + job.PrinterName,
                Name = job.PrinterName!,
                Kind = "system",
                SystemName = job.PrinterName,
            };
        }

        return null;
    }

    /// <summary>Cache temizleme (test veya admin islemleri icin).</summary>
    public void InvalidateCache(string? firmNr = null, string? periodNr = null)
    {
        lock (_cacheLock)
        {
            if (string.IsNullOrEmpty(firmNr)) { _cache.Clear(); return; }
            var key = MakeKey(firmNr, periodNr ?? "");
            _cache.Remove(key);
        }
    }

    private async Task<TenantRoutingConfig?> GetRoutingConfigAsync(TenantContext tenant, CancellationToken ct)
    {
        var key = MakeKey(tenant.FirmNr, tenant.PeriodNr);
        var now = DateTime.UtcNow;

        lock (_cacheLock)
        {
            if (_cache.TryGetValue(key, out var cached) && now - cached.LoadedAt < CacheTtl)
            {
                return cached.Config;
            }
        }

        TenantRoutingConfig? loaded = null;
        try
        {
            // app_settings key+firm_nr UNIQUE; value JSONB
            var query = $"key=eq.restaurant_printer_config&firm_nr=eq.{Uri.EscapeDataString(tenant.FirmNr)}&select=key,firm_nr,value";
            var arr = await _pg.SelectAsync("app_settings", query, ct).ConfigureAwait(false);
            if (arr.Count > 0)
            {
                var valueToken = arr[0]["value"];
                if (valueToken != null && valueToken.Type != JTokenType.Null)
                {
                    try
                    {
                        loaded = valueToken.ToObject<TenantRoutingConfig>(JsonSerializer.Create(JsonSettings));
                    }
                    catch (Exception ex)
                    {
                        _log.LogWarning(ex, "Routing: app_settings.value parse edilemedi (firm={Firm}).", tenant.FirmNr);
                        loaded = null;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Routing: app_settings okunamadi (firm={Firm}). Default kullanilacak.", tenant.FirmNr);
        }

        lock (_cacheLock)
        {
            _cache[key] = new CacheEntry(loaded ?? new TenantRoutingConfig(), now);
        }
        return loaded;
    }

    private static PrinterProfile? FindProfile(TenantRoutingConfig routing, string profileId)
    {
        if (string.IsNullOrWhiteSpace(profileId)) return null;
        if (routing?.PrinterProfiles != null)
        {
            foreach (var p in routing.PrinterProfiles)
            {
                if (p == null) continue;
                if (string.Equals(p.Id, profileId, StringComparison.OrdinalIgnoreCase))
                {
                    return p;
                }
            }
        }
        // Profil listesi routing uzerinde yoksa sadece id referansi olarak minimal profil uretir.
        return new PrinterProfile
        {
            Id = profileId,
            Name = profileId,
            Kind = "system",
        };
    }

    private static string ExtractCategory(PrintJob job)
    {
        if (job.Payload == null) return "";
        if (job.Payload.TryGetValue("category", out var c) || job.Payload.TryGetValue("kategori", out c))
        {
            return c?.ToString() ?? "";
        }
        return "";
    }

    private static bool CategoryMatches(string ruleCategory, string payloadCategory)
    {
        if (string.IsNullOrEmpty(ruleCategory)) return true;
        if (string.IsNullOrEmpty(payloadCategory)) return false;
        return string.Equals(ruleCategory, payloadCategory, StringComparison.OrdinalIgnoreCase);
    }

    private static string MapConnectionToKind(string? connection)
    {
        if (string.IsNullOrWhiteSpace(connection)) return "system";
        var c = connection.Trim().ToLowerInvariant();
        return c switch
        {
            "network" or "tcp" or "ip" => "network",
            "bluetooth" or "bt" => "bluetooth",
            "usb" => "usb",
            "fastreport" or "frx" => "fastreport",
            "label" or "zpl" or "tspl" => "label",
            _ => "system",
        };
    }

    private static string MakeKey(string firmNr, string periodNr) => $"{firmNr}_{periodNr}";

    private sealed class CacheEntry
    {
        public TenantRoutingConfig Config { get; }
        public DateTime LoadedAt { get; }
        public CacheEntry(TenantRoutingConfig config, DateTime loadedAt)
        {
            Config = config;
            LoadedAt = loadedAt;
        }
    }
}
