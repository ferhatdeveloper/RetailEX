using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using RetailEX.PrintServer.Core.Models;

namespace RetailEX.PrintServer.Core.Config;

/// <summary>
/// Print-server ana yapilandirma modeli.
/// Desen: TeraziRongta / AppConfig.cs (Newtonsoft Json serilestirme).
/// </summary>
public class PrintServerConfig
{
    /// <summary>PostgREST ayarlari.</summary>
    public PostgRestSection PostgRest { get; set; } = new();

    /// <summary>Benzersiz worker kimligi — null ise runtime'da hostname + pid ile uretilir.</summary>
    public string? WorkerId { get; set; }

    /// <summary>Job polling araligi (ms). Min 500, max 60000.</summary>
    public int PollIntervalMs { get; set; } = 2500;

    /// <summary>Tek polling'de alinacak max is sayisi. Min 1, max 50.</summary>
    public int ClaimLimit { get; set; } = 10;

    /// <summary>Network yazici TCP timeout (ms).</summary>
    public int TcpTimeoutMs { get; set; } = 8000;

    /// <summary>Basarisiz job icin max deneme sayisi.</summary>
    public int MaxAttempts { get; set; } = 5;

    /// <summary>UI / log varsayilan dili (tr | en | ar | ku).</summary>
    public string DefaultLocale { get; set; } = "tr";

    /// <summary>SumatraPDF.exe tam yolu (opsiyonel — bos ise otomatik bulunur).</summary>
    public string SumatraPdfPath { get; set; } = "";

    /// <summary>HTML dokum icin kullanilacak browser yolu (opsiyonel).</summary>
    public string PrintBrowserPath { get; set; } = "";

    /// <summary>FastReport.Cli.exe tam yolu (opsiyonel).</summary>
    public string FastReportCliPath { get; set; } = "";

    /// <summary>Log seviyesi (debug | info | warn | error).</summary>
    public string LogLevel { get; set; } = "info";

    /// <summary>True: pg_tables uzerinden tum rex_NNN_NN_print_jobs tablolarini kesfet.</summary>
    public bool EnableMultiTenant { get; set; } = true;

    /// <summary>Bos degilse yalnızca bu firm/period ciftleri taranir (firmnr_periodnr formati).</summary>
    public List<string> PinnedTenants { get; set; } = new();

    /// <summary>Kiraci bazinda override (firm/period bazli).</summary>
    public List<TenantConfig> Tenants { get; set; } = new();

    /// <summary>Yapilandirma degistiginde tetiklenir (Reload veya Save sonrasi).</summary>
    public event Action<PrintServerConfig>? ConfigChanged;

    /// <summary>Dosya yoksa default olusturup kaydeder; varsa okur.</summary>
    public static PrintServerConfig LoadOrCreateDefault(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            path = PrintServerPaths.DefaultConfigPath;
        }

        if (!File.Exists(path))
        {
            var fresh = CreateDefault();
            fresh.Save(path);
            return fresh;
        }

        try
        {
            var json = File.ReadAllText(path);
            var cfg = JsonConvert.DeserializeObject<PrintServerConfig>(json) ?? CreateDefault();
            cfg.NormalizeAndClamp();
            return cfg;
        }
        catch (Exception)
        {
            // Bozuk JSON — default yaz ve dondur
            var fresh = CreateDefault();
            try { fresh.Save(path); } catch { /* sessiz */ }
            return fresh;
        }
    }

    /// <summary>Sadece default degerlerle yeni instance.</summary>
    public static PrintServerConfig CreateDefault()
    {
        var cfg = new PrintServerConfig();
        cfg.NormalizeAndClamp();
        return cfg;
    }

    /// <summary>Verilen yola Newtonsoft ile yazar.</summary>
    public void Save(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            path = PrintServerPaths.DefaultConfigPath;
        }

        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            PrintServerPaths.EnsureDirectory(dir);
        }

        NormalizeAndClamp();
        File.WriteAllText(path, JsonConvert.SerializeObject(this, Formatting.Indented));
        ConfigChanged?.Invoke(this);
    }

    /// <summary>Default yoldan tekrar okur.</summary>
    public PrintServerConfig Reload()
    {
        var cfg = LoadOrCreateDefault(PrintServerPaths.DefaultConfigPath);
        ConfigChanged?.Invoke(cfg);
        return cfg;
    }

    /// <summary>WorkerId null ise hostname/pid ile uretir (runtime).</summary>
    public string ResolveWorkerId()
    {
        if (!string.IsNullOrWhiteSpace(WorkerId)) return WorkerId.Trim();
        var host = Environment.MachineName;
        var pid = Environment.ProcessId;
        WorkerId = $"RetailEX_PrintServer/{host}/{pid}";
        return WorkerId;
    }

    /// <summary>PostgREST base + tenant birlesiminden tam URL uretir.</summary>
    public string ResolvedApiUrl()
    {
        var baseUrl = (PostgRest?.BaseUrl ?? "").Trim().TrimEnd('/');
        var tenant = (PostgRest?.TenantCode ?? "").Trim().Trim('/');
        if (string.IsNullOrEmpty(baseUrl)) return "";
        if (string.IsNullOrEmpty(tenant)) return baseUrl;
        if (baseUrl.EndsWith("/" + tenant, StringComparison.OrdinalIgnoreCase)) return baseUrl;
        return baseUrl + "/" + tenant;
    }

    private void NormalizeAndClamp()
    {
        if (PollIntervalMs < 500) PollIntervalMs = 500;
        if (PollIntervalMs > 60000) PollIntervalMs = 60000;

        if (ClaimLimit < 1) ClaimLimit = 1;
        if (ClaimLimit > 50) ClaimLimit = 50;

        if (TcpTimeoutMs < 1000) TcpTimeoutMs = 1000;
        if (MaxAttempts < 1) MaxAttempts = 1;
        if (MaxAttempts > 20) MaxAttempts = 20;

        if (string.IsNullOrWhiteSpace(DefaultLocale)) DefaultLocale = "tr";
        if (string.IsNullOrWhiteSpace(LogLevel)) LogLevel = "info";

        PostgRest ??= new PostgRestSection();
        if (string.IsNullOrWhiteSpace(PostgRest.BaseUrl)) PostgRest.BaseUrl = "https://api.retailex.app";
        if (string.IsNullOrWhiteSpace(PostgRest.AuthMode)) PostgRest.AuthMode = "apikey";
        PostgRest.TenantCode ??= "";
        PostgRest.ApiToken ??= "";

        PinnedTenants ??= new List<string>();
        Tenants ??= new List<TenantConfig>();
    }
}

/// <summary>PostgREST baglanti ayarlari.</summary>
public class PostgRestSection
{
    public string BaseUrl { get; set; } = "https://api.retailex.app";
    public string TenantCode { get; set; } = "";
    public string ApiToken { get; set; } = "";
    /// <summary>none | bearer | apikey</summary>
    public string AuthMode { get; set; } = "apikey";
}

/// <summary>Kiraci bazinda (firm/period) override bilgisi.</summary>
public class TenantConfig
{
    /// <summary>3 haneli firma numarasi (001, 002 ...).</summary>
    public string FirmNr { get; set; } = "001";
    /// <summary>2 haneli donem numarasi (01, 02 ...).</summary>
    public string PeriodNr { get; set; } = "01";
    /// <summary>Bu kiracinin polling/polling override'i aktif mi.</summary>
    public bool Enabled { get; set; } = true;
    /// <summary>Istege bagli: kiraci icin ek tenant kodu override.</summary>
    public string? TenantCodeOverride { get; set; }
    /// <summary>Istege bagli: kiraci icin ek API token override.</summary>
    public string? ApiTokenOverride { get; set; }
}