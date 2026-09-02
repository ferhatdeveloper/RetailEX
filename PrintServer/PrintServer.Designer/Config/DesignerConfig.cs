using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Newtonsoft.Json;

namespace RetailEX.PrintServer.Designer.Config;

/// <summary>
/// Designer tarafı JSON konfigürasyon modeli.
/// PrintServer ile aynı %CommonAppData%\RetailEX altında tutulur; böylece
/// bir kiracı için hem servis hem designer aynı PostgREST ayarını kullanır.
/// </summary>
internal sealed class DesignerConfig
{
    [JsonProperty("postgrest")]
    public PostgRestConfig PostgRest { get; set; } = new();

    [JsonProperty("tenants")]
    public TenantsConfig Tenants { get; set; } = new();

    [JsonProperty("ui")]
    public UiConfig Ui { get; set; } = new();

    [JsonProperty("fastReport")]
    public FastReportConfig FastReport { get; set; } = new();

    /// <summary>
    /// Klasör sırası:
    /// 1. DesignerAppData (kullanıcı başına, yazılabilir)
    /// 2. CommonApplicationData\RetailEX (PrintServer ile paylaşımlı)
    /// 3. designer.config.example.json (exe yanı)
    /// </summary>
    public static string? ResolveConfigPath()
    {
        var candidates = new[]
        {
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "RetailEX", "designer.config.json"),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "RetailEX", "designer.config.json"),
            Path.Combine(AppContext.BaseDirectory, "designer.config.json"),
            Path.Combine(Environment.CurrentDirectory, "designer.config.json")
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    public static DesignerConfig Load()
    {
        var config = new DesignerConfig();
        ApplyEnvironment(config);

        var path = ResolveConfigPath();
        if (path is null)
        {
            // Örnek konfigürasyonu BaseDirectory'den oku ve kullanıcıya kopyala
            var examplePath = Path.Combine(AppContext.BaseDirectory, "designer.config.example.json");
            if (File.Exists(examplePath))
            {
                try
                {
                    var text = File.ReadAllText(examplePath);
                    config = Newtonsoft.Json.Linq.JObject.Parse(text).ToObject<DesignerConfig>() ?? config;
                    config.PostgRest ??= new PostgRestConfig();
                    config.Tenants ??= new TenantsConfig();
                    config.Ui ??= new UiConfig();
                    config.FastReport ??= new FastReportConfig();
                }
                catch
                {
                    // Bozuk örnek -> default kalır
                }
            }
        }
        else
        {
            try
            {
                var text = File.ReadAllText(path);
                var loaded = Newtonsoft.Json.Linq.JObject.Parse(text).ToObject<DesignerConfig>();
                if (loaded is not null) config = loaded;
            }
            catch
            {
                // Bozuk konfig mevcut UI'da gösterilebilir; uygulama çökmesin
            }
        }

        ApplyEnvironment(config, missingOnly: true);
        config.Normalize();
        return config;
    }

    public void Save()
    {
        var target = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "RetailEX", "designer.config.json");
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        var json = Newtonsoft.Json.JsonConvert.SerializeObject(this, Formatting.Indented);
        File.WriteAllText(target, json);
    }

    public void Normalize()
    {
        PostgRest.Normalize();
        Tenants.Normalize();
        Ui.Normalize();
        FastReport.Normalize();
    }

    private static void ApplyEnvironment(DesignerConfig config, bool missingOnly = false)
    {
        ApplyString("RETAILEX_DESIGNER_POSTGREST_URL",
            v => config.PostgRest.BaseUrl = v,
            config.PostgRest.BaseUrl,
            missingOnly);
        ApplyString("RETAILEX_DESIGNER_BEARER",
            v => config.PostgRest.BearerToken = v,
            config.PostgRest.BearerToken,
            missingOnly);
        ApplyString("RETAILEX_FIRM_NR",
            v => config.Tenants.Active.FirmNr = v,
            config.Tenants.Active.FirmNr,
            missingOnly);
        ApplyString("RETAILEX_PERIOD_NR",
            v => config.Tenants.Active.PeriodNr = v,
            config.Tenants.Active.PeriodNr,
            missingOnly);

        static void ApplyString(string key, Action<string> set, string currentValue, bool missingOnly)
        {
            var v = Environment.GetEnvironmentVariable(key);
            if (!string.IsNullOrWhiteSpace(v) && (!missingOnly || string.IsNullOrWhiteSpace(currentValue)))
            {
                set(v.Trim());
            }
        }
    }
}

internal sealed class PostgRestConfig
{
    [JsonProperty("baseUrl")] public string BaseUrl { get; set; } = "http://127.0.0.1:3001";
    [JsonProperty("schema")] public string Schema { get; set; } = "public";
    [JsonProperty("authMode")] public string AuthMode { get; set; } = "none";
    [JsonProperty("bearerToken")] public string BearerToken { get; set; } = string.Empty;
    [JsonProperty("apiKey")] public string ApiKey { get; set; } = string.Empty;
    [JsonProperty("timeoutSeconds")] public int TimeoutSeconds { get; set; } = 30;
    [JsonProperty("retries")] public int Retries { get; set; } = 2;

    public void Normalize()
    {
        BaseUrl = (BaseUrl ?? string.Empty).Trim().TrimEnd('/');
        Schema = string.IsNullOrWhiteSpace(Schema) ? "public" : Schema.Trim();
        AuthMode = string.IsNullOrWhiteSpace(AuthMode) ? "none" : AuthMode.Trim().ToLowerInvariant();
        BearerToken ??= string.Empty;
        ApiKey ??= string.Empty;
        if (TimeoutSeconds <= 0) TimeoutSeconds = 30;
        if (Retries < 0) Retries = 0;
    }
}

internal sealed class TenantsConfig
{
    [JsonProperty("active")] public TenantRef Active { get; set; } = new();
    [JsonProperty("known")] public List<TenantRef> Known { get; set; } = new();

    public void Normalize()
    {
        Active ??= new TenantRef();
        Active.Normalize();
        Known ??= new List<TenantRef>();
        foreach (var t in Known) t.Normalize();
    }
}

internal sealed class TenantRef
{
    [JsonProperty("firmNr")] public string FirmNr { get; set; } = "001";
    [JsonProperty("periodNr")] public string PeriodNr { get; set; } = "01";
    [JsonProperty("name")] public string? Name { get; set; }

    public void Normalize()
    {
        FirmNr = string.IsNullOrWhiteSpace(FirmNr) ? "001" : FirmNr.Trim().PadLeft(3, '0');
        PeriodNr = string.IsNullOrWhiteSpace(PeriodNr) ? "01" : PeriodNr.Trim().PadLeft(2, '0');
        Name = string.IsNullOrWhiteSpace(Name) ? null : Name.Trim();
    }

    public override string ToString() => string.IsNullOrWhiteSpace(Name)
        ? $"{FirmNr}/{PeriodNr}"
        : $"{FirmNr}/{PeriodNr} - {Name}";

    public string Key => $"{FirmNr}/{PeriodNr}";
}

internal sealed class UiConfig
{
    [JsonProperty("locale")] public string Locale { get; set; } = "tr";
    [JsonProperty("recentTemplates")] public List<string> RecentTemplates { get; set; } = new();

    public void Normalize()
    {
        Locale = string.IsNullOrWhiteSpace(Locale) ? "tr" : Locale.Trim().ToLowerInvariant();
        RecentTemplates ??= new List<string>();
    }
}

internal sealed class FastReportConfig
{
    [JsonProperty("libDirectory")] public string LibDirectory { get; set; } = "lib";
    [JsonProperty("defaultTemplateName")] public string DefaultTemplateName { get; set; } = "Yeni FastReport Tasarımı";

    public void Normalize()
    {
        LibDirectory = string.IsNullOrWhiteSpace(LibDirectory) ? "lib" : LibDirectory.Trim();
        DefaultTemplateName = string.IsNullOrWhiteSpace(DefaultTemplateName) ? "Yeni FastReport Tasarımı" : DefaultTemplateName.Trim();
    }
}
