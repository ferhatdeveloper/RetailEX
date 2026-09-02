using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RetailEX.PrintServer.Designer.Config;
using RetailEX.PrintServer.Designer.PostgRest;

namespace RetailEX.PrintServer.Designer.Templates;

/// <summary>
/// PostgREST üzerinden public.firms, public.periods, public.report_templates
/// tablolarına kiracı-aware erişim.
/// </summary>
internal sealed class TemplateRepository
{
    private readonly PostgRestRepository _pg;

    public TemplateRepository(PostgRestRepository pg) => _pg = pg;

    /// <summary>
    /// Aktif firmaları listeler (PostgREST üzerinden public.firms?select=...).
    /// </summary>
    public async Task<List<TenantRef>> ListFirmsAsync(CancellationToken ct = default)
    {
        var arr = await _pg.SelectAsync("firms?select=code,name&is_active=eq.true&order=code", ct);
        var list = new List<TenantRef>();
        foreach (var row in arr)
        {
            list.Add(new TenantRef
            {
                FirmNr = (row["code"] ?? "").ToString().PadLeft(3, '0'),
                Name = (row["name"] ?? "").ToString()
            });
        }
        return list;
    }

    /// <summary>
    /// Bir firma için dönemleri listeler.
    /// </summary>
    public async Task<List<TenantRef>> ListPeriodsAsync(string firmNr, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(firmNr);
        var arr = await _pg.SelectAsync($"periods?select=nr,is_open&firm_nr=eq.{encoded}&order=nr", ct);
        var list = new List<TenantRef>();
        foreach (var row in arr)
        {
            var nr = (row["nr"] ?? "").ToString().PadLeft(2, '0');
            var isOpen = row.Value<bool?>("is_open") ?? false;
            list.Add(new TenantRef
            {
                FirmNr = firmNr,
                PeriodNr = nr,
                Name = $"Dönem {nr}{(isOpen ? " (açık)" : "")}"
            });
        }
        return list;
    }

    /// <summary>
    /// Verilen kiracı için kayıtlı tüm FRX tasarımlarını listeler.
    /// </summary>
    public async Task<List<DesignerTemplateRecord>> ListTemplatesAsync(string firmNr, string periodNr, CancellationToken ct = default)
    {
        var f = Uri.EscapeDataString(firmNr);
        var p = Uri.EscapeDataString(periodNr);
        var arr = await _pg.SelectAsync(
            $"report_templates?select=id,name,description,firm_nr,period_nr,updated_at,template_type,category,content" +
            $"&category=eq.fastreport_frx&template_type=eq.fastreport_frx" +
            $"&or=(firm_nr.eq.{f},firm_nr.is.null)&or=(period_nr.eq.{p},period_nr.is.null)" +
            $"&order=updated_at.desc,name", ct);
        var list = new List<DesignerTemplateRecord>();
        foreach (var row in arr)
        {
            list.Add(new DesignerTemplateRecord
            {
                Id = Guid.Parse(row["id"]!.ToString()),
                Name = (row["name"] ?? "").ToString(),
                Description = row["description"]?.ToString() ?? string.Empty,
                FirmNr = row["firm_nr"]?.ToString(),
                PeriodNr = row["period_nr"]?.ToString(),
                TemplateType = row["template_type"]?.ToString() ?? "fastreport_frx",
                Category = row["category"]?.ToString() ?? "fastreport_frx",
                UpdatedAt = row["updated_at"]?.ToObject<DateTimeOffset>() ?? DateTimeOffset.MinValue,
                ContentJson = row["content"] is JObject contentObj ? contentObj : null
            });
        }
        return list;
    }

    /// <summary>
    /// Yeni FRX kaydı oluşturur veya mevcut kaydı günceller.
    /// frxBytes -> base64 -> JSONB content.
    /// </summary>
    public async Task<Guid> SaveTemplateAsync(
        Guid? id,
        TenantRef tenant,
        string name,
        byte[] frxBytes,
        IEnumerable<string> dataSources,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Şablon adı boş olamaz.", nameof(name));
        if (frxBytes is null || frxBytes.Length == 0)
            throw new ArgumentException(".frx içeriği boş olamaz.", nameof(frxBytes));

        var payload = new JObject
        {
            ["version"] = 1,
            ["format"] = "frx",
            ["engine"] = "fastreport",
            ["frxBase64"] = Convert.ToBase64String(frxBytes),
            ["dataSources"] = new JArray(dataSources.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x)),
            ["updatedAt"] = DateTimeOffset.UtcNow.ToString("O")
        };

        JObject row = new()
        {
            ["name"] = name.Trim(),
            ["description"] = "FastReport .frx tasarımı",
            ["category"] = "fastreport_frx",
            ["template_type"] = "fastreport_frx",
            ["content"] = payload,
            ["is_default"] = false,
            ["firm_nr"] = tenant.FirmNr,
            ["period_nr"] = tenant.PeriodNr
        };

        if (id.HasValue)
        {
            var filter = $"id=eq.{id.Value:D}";
            var resp = await _pg.UpdateAsync("report_templates", filter, row, "*", ct);
            return resp.Count > 0 ? Guid.Parse(resp[0]["id"]!.ToString()) : id.Value;
        }
        else
        {
            var resp = await _pg.InsertAsync("report_templates", row, "*", ct);
            if (resp.Count == 0)
                throw new InvalidOperationException("Şablon eklenemedi (PostgREST boş döndü).");
            return Guid.Parse(resp[0]["id"]!.ToString());
        }
    }

    /// <summary>
    /// Şablonun content.frxBase64 içeriğini byte[] olarak döner.
    /// </summary>
    public byte[] DecodeFrx(DesignerTemplateRecord template)
    {
        if (template.ContentJson is null)
            throw new InvalidOperationException("Şablon içeriği boş.");
        var frxBase64 = template.ContentJson.Value<string>("frxBase64");
        if (string.IsNullOrWhiteSpace(frxBase64))
            throw new InvalidOperationException("Şablon JSON içinde frxBase64 alanı yok.");
        return Convert.FromBase64String(frxBase64);
    }
}

internal sealed class DesignerTemplateRecord
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? FirmNr { get; set; }
    public string? PeriodNr { get; set; }
    public string TemplateType { get; set; } = "fastreport_frx";
    public string Category { get; set; } = "fastreport_frx";
    public DateTimeOffset UpdatedAt { get; set; }
    public JObject? ContentJson { get; set; }

    public override string ToString() => $"{Name}{(FirmNr is null ? " (sistem)" : $" [{FirmNr}/{PeriodNr}]")}";
}
