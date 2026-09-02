using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Core.PostgRest;

namespace RetailEX.PrintServer.Core.PrintQueue;

/// <summary>
/// PostgREST uzerinden tum aktif (firm, period) tenant'larini kesfeder.
/// Algoritma:
///   1) firms tablosunu oku
///   2) periods tablosunu oku
///   3) pg_tables uzerinden rest.rex_*_print_jobs tablolarini cek
///   4) regex ile firmNr/periodNr cikar
///   5) PinnedTenants / Tenants override'larini uygula
/// Tek tenant modu: <c>cfg.EnableMultiTenant=false</c> ise sadece PostgRest.TenantCode + periodNr=01.
/// </summary>
public sealed class TenantDiscovery
{
    private static readonly Regex TablePattern = new(@"^rex_(\d{3})_(\d{2})_print_jobs$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex PinnedPattern = new(@"^(\d{3})_(\d{2})$", RegexOptions.Compiled);

    private readonly PostgRestClient _pg;
    private readonly PrintServerConfig _cfg;
    private readonly ILogger _log;

    public TenantDiscovery(PostgRestClient pg, PrintServerConfig cfg, ILogger log)
    {
        _pg = pg ?? throw new ArgumentNullException(nameof(pg));
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
    }

    /// <summary>
    /// Tum aktif tenant context listesini doner. EnableMultiTenant=false ise tek eleman.
    /// </summary>
    public async Task<IReadOnlyList<TenantContext>> DiscoverAsync(CancellationToken ct)
    {
        if (!_cfg.EnableMultiTenant)
        {
            return new List<TenantContext>(1) { BuildSingleTenant() };
        }

        // 1) firms
        var firms = await SafeGetFirmsAsync(ct).ConfigureAwait(false);

        // 2) periods
        var periods = await SafeGetPeriodsAsync(ct).ConfigureAwait(false);
        if (periods.Count == 0)
        {
            _log.LogWarning("TenantDiscovery: periods tablosu bos. Tenant listesi bos doner.");
            return ApplyOverrides(Array.Empty<TenantContext>());
        }

        var validFirms = firms.Select(f => f.firmNr).Where(s => !string.IsNullOrWhiteSpace(s)).ToHashSet(StringComparer.OrdinalIgnoreCase);

        // 3) pg_tables uzerinden tablolari cek
        var tableEntries = await SafeGetTableNamesAsync(ct).ConfigureAwait(false);

        // 4) regex ile (firm, period) cikar
        var discovered = new List<TenantContext>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in tableEntries)
        {
            if (string.IsNullOrWhiteSpace(entry.table)) continue;
            var m = TablePattern.Match(entry.table.Trim());
            if (!m.Success) continue;
            var firmNr = m.Groups[1].Value;
            var periodNr = m.Groups[2].Value;

            if (validFirms.Count > 0 && !validFirms.Contains(firmNr))
            {
                // firms tablosunda olmayan kodu yine de dahil ediyoruz; sadece bilgi logu.
                _log.LogDebug("TenantDiscovery: {Firm} firms tablosunda yok ama print_jobs tablosu var — dahil ediliyor.", firmNr);
            }

            var key = $"{firmNr}_{periodNr}";
            if (!seen.Add(key)) continue;

            // period acik mi? (is_open=true olanlari al)
            var period = periods.FirstOrDefault(p => string.Equals(p.firmNr, firmNr, StringComparison.OrdinalIgnoreCase)
                                                   && string.Equals(p.code, periodNr, StringComparison.OrdinalIgnoreCase));
            if (period.isOpen == false)
            {
                _log.LogDebug("TenantDiscovery: {Firm}/{Period} kapali donem — atlandi.", firmNr, periodNr);
                continue;
            }

            discovered.Add(new TenantContext(firmNr, periodNr, $"rest.rex_{firmNr}_{periodNr}_print_jobs"));
        }

        // hic tablo yoksa fallback: firms x periods kombinasyonundan uret
        if (discovered.Count == 0)
        {
            _log.LogWarning("TenantDiscovery: rest.rex_*_print_jobs tablosu bulunamadi. firms/periods kombinasyonu deneniyor.");
            foreach (var period in periods)
            {
                if (!period.isOpen) continue;
                if (!string.IsNullOrWhiteSpace(period.firmNr) && !string.IsNullOrWhiteSpace(period.code))
                {
                    discovered.Add(new TenantContext(period.firmNr, period.code, $"rest.rex_{period.firmNr}_{period.code}_print_jobs"));
                }
            }
        }

        var result = ApplyOverrides(discovered);
        if (result.Count == 0)
        {
            _log.LogWarning("TenantDiscovery: Hic tenant bulunamadi (multi-tenant). Tek tenant fallback uygulaniyor.");
            return new List<TenantContext>(1) { BuildSingleTenant() };
        }
        return result;
    }

    private TenantContext BuildSingleTenant()
    {
        var code = (_cfg.PostgRest?.TenantCode ?? "").Trim();
        var firm = "001";
        var period = "01";
        if (!string.IsNullOrWhiteSpace(code))
        {
            // beklenen format: "NNN" veya "NNN_NN"; aksi halde ilk 3 hane
            var parts = code.Split('_', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 1 && parts[0].Length >= 3 && int.TryParse(parts[0].Substring(0, 3), out _))
            {
                firm = parts[0].Substring(0, 3);
            }
            if (parts.Length >= 2 && parts[1].Length >= 2 && int.TryParse(parts[1].Substring(0, 2), out _))
            {
                period = parts[1].Substring(0, 2);
            }
        }
        return new TenantContext(firm, period, $"rest.rex_{firm}_{period}_print_jobs");
    }

    private IReadOnlyList<TenantContext> ApplyOverrides(IReadOnlyList<TenantContext> baseList)
    {
        var pinned = _cfg.PinnedTenants ?? new List<string>();
        var tenants = _cfg.Tenants ?? new List<TenantConfig>();

        // 1) PinnedTenants filtresi
        IReadOnlyList<TenantContext> filtered = baseList;
        if (pinned.Count > 0)
        {
            var pinnedSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var pinnedManual = new List<TenantContext>();
            foreach (var p in pinned)
            {
                if (string.IsNullOrWhiteSpace(p)) continue;
                var m = PinnedPattern.Match(p.Trim());
                if (m.Success)
                {
                    pinnedSet.Add(p.Trim());
                }
            }
            filtered = baseList.Where(t => pinnedSet.Contains($"{t.FirmNr}_{t.PeriodNr}")).ToList();

            // pinned'de olup tabloda olmayanlari da ekle (override ile uretiyoruz)
            foreach (var p in pinned)
            {
                if (string.IsNullOrWhiteSpace(p)) continue;
                var m = PinnedPattern.Match(p.Trim());
                if (!m.Success)
                {
                    _log.LogWarning("TenantDiscovery: PinnedTenants gecersiz format: {Val} (NNN_NN bekleniyor)", p);
                    continue;
                }
                var firm = m.Groups[1].Value;
                var period = m.Groups[2].Value;
                if (!filtered.Any(t => t.FirmNr == firm && t.PeriodNr == period))
                {
                    pinnedManual.Add(new TenantContext(firm, period, $"rest.rex_{firm}_{period}_print_jobs"));
                }
            }
            filtered = filtered.Concat(pinnedManual).ToList();
        }

        // 2) Tenants array override (Enabled=false olanlari cikar, Enabled olanlari zorla dahil et)
        var result = filtered.ToList();
        var disabledKeys = tenants
            .Where(t => t != null && !t.Enabled && !string.IsNullOrWhiteSpace(t.FirmNr) && !string.IsNullOrWhiteSpace(t.PeriodNr))
            .Select(t => $"{t.FirmNr}_{t.PeriodNr}")
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (disabledKeys.Count > 0)
        {
            result = result.Where(t => !disabledKeys.Contains($"{t.FirmNr}_{t.PeriodNr}")).ToList();
        }
        foreach (var t in tenants ?? Enumerable.Empty<TenantConfig>())
        {
            if (t == null || !t.Enabled) continue;
            if (string.IsNullOrWhiteSpace(t.FirmNr) || string.IsNullOrWhiteSpace(t.PeriodNr)) continue;
            var key = $"{t.FirmNr}_{t.PeriodNr}";
            if (!result.Any(x => $"{x.FirmNr}_{x.PeriodNr}" == key))
            {
                result.Add(new TenantContext(t.FirmNr, t.PeriodNr, $"rest.rex_{t.FirmNr}_{t.PeriodNr}_print_jobs"));
            }
        }

        return result;
    }

    private async Task<List<(string firmNr, string code, string? name)>> SafeGetFirmsAsync(CancellationToken ct)
    {
        try
        {
            var arr = await _pg.SelectAsync("firms", "select=id,code,name", ct).ConfigureAwait(false);
            var list = new List<(string, string, string?)>();
            foreach (var t in arr)
            {
                var code = t["code"]?.ToString() ?? t["id"]?.ToString() ?? "";
                var name = t["name"]?.ToString();
                if (!string.IsNullOrWhiteSpace(code)) list.Add((code, code, name));
            }
            return list;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "TenantDiscovery: firms tablosu okunamadi. Devam ediliyor.");
            return new List<(string, string, string?)>();
        }
    }

    private async Task<List<(string firmNr, string code, bool isOpen)>> SafeGetPeriodsAsync(CancellationToken ct)
    {
        try
        {
            var arr = await _pg.SelectAsync("periods", "select=id,firm_nr,code,is_open", ct).ConfigureAwait(false);
            var list = new List<(string, string, bool)>();
            foreach (var t in arr)
            {
                var firmNr = t["firm_nr"]?.ToString() ?? "";
                var code = t["code"]?.ToString() ?? "";
                var isOpen = t["is_open"]?.Value<bool>() ?? false;
                if (!string.IsNullOrWhiteSpace(firmNr) && !string.IsNullOrWhiteSpace(code))
                {
                    list.Add((firmNr, code, isOpen));
                }
            }
            return list;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "TenantDiscovery: periods tablosu okunamadi.");
            return new List<(string, string, bool)>();
        }
    }

    private async Task<List<(string schemaname, string table)>> SafeGetTableNamesAsync(CancellationToken ct)
    {
        try
        {
            // pg_catalog.pg_tables PostgREST'te view olarak acilmis olabilir; yoksa fallback
            // SELECT schemaname, tablename FROM pg_tables WHERE schemaname='rest' AND tablename LIKE 'rex_%_print_jobs'
            var query = "schemaname=eq.rest&tablename=like.rex_*_print_jobs&select=schemaname,tablename";
            var arr = await _pg.SelectAsync("pg_tables", query, ct).ConfigureAwait(false);
            var list = new List<(string, string)>();
            foreach (var t in arr)
            {
                var sn = t["schemaname"]?.ToString() ?? "";
                var tn = t["tablename"]?.ToString() ?? "";
                if (!string.IsNullOrWhiteSpace(sn) && !string.IsNullOrWhiteSpace(tn))
                {
                    list.Add((sn, tn));
                }
            }
            return list;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "TenantDiscovery: pg_tables okunamadi. Bos liste ile devam ediliyor.");
            return new List<(string, string)>();
        }
    }
}
