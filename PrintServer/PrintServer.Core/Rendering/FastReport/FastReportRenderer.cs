using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Core.Models;
using RetailEX.PrintServer.Core.PostgRest;
using RetailEX.PrintServer.Core.Rendering.Html;

namespace RetailEX.PrintServer.Core.Rendering.FastReport;

/// <summary>
/// FastReport tabanli job'lar icin renderer.
/// Iki alt akis destekler:
///   1) <c>fastreport_template</c>: report_templates icindeki "template_catalog" kategorisinden
///      Designer v2 sablon bulur, <c>{{token}}</c> replace + tablo render eder, HtmlSystemRenderer'a delege eder.
///   2) <c>fastreport_frx</c>: report_templates icindeki frxXml/xml/text'i okur; CLI varsa onu, yoksa
///      content.previewHtml ya da minimal HTML fallback kullanir.
/// Not: Gercek FastReport render Designer (WinForms) tarafinda yapilir; bu runtime servisi
/// previewHtml veya FastReport CLI varsayar.
/// </summary>
public sealed class FastReportRenderer
{
    private readonly PostgRestClient _pg;
    private readonly PrintServerConfig _cfg;
    private readonly ILogger _log;

    public FastReportRenderer(PostgRestClient pg, PrintServerConfig cfg, ILogger log)
    {
        _pg = pg ?? throw new ArgumentNullException(nameof(pg));
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
    }

    public async Task RenderAsync(PrintJob job, PrinterProfile profile, CancellationToken ct)
    {
        if (job == null) throw new ArgumentNullException(nameof(job));

        var jobType = (job.JobType ?? "").ToLowerInvariant();
        if (jobType == "fastreport_template")
        {
            await RenderTemplateAsync(job, profile, ct).ConfigureAwait(false);
            return;
        }
        if (jobType == "fastreport_frx")
        {
            await RenderFrxAsync(job, profile, ct).ConfigureAwait(false);
            return;
        }

        throw new NotSupportedException($"FastReport: bilinmeyen job_type '{job.JobType}'.");
    }

    private async Task RenderTemplateAsync(PrintJob job, PrinterProfile profile, CancellationToken ct)
    {
        // 1) template_catalog + template_designer_v2 kategorisinden ilk kayit
        var query = "category=eq.template_catalog&template_type=eq.template_designer_v2&select=id,name,content&limit=1";
        JArray arr;
        try
        {
            arr = await _pg.SelectAsync("report_templates", query, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "FastReport(template): report_templates okunamadi.");
            arr = new JArray();
        }

        if (arr.Count == 0)
        {
            // Katalog bulunamadi — minimal HTML fallback
            await RenderHtmlFallbackAsync(job, profile, ct).ConfigureAwait(false);
            return;
        }

        var content = arr[0]["content"] as JObject;
        if (content == null)
        {
            await RenderHtmlFallbackAsync(job, profile, ct).ConfigureAwait(false);
            return;
        }

        var templateId = job.Payload != null && job.Payload.TryGetValue("templateId", out var tid) ? tid?.ToString() : null;
        var template = FindTemplate(content, templateId);
        if (template == null)
        {
            await RenderHtmlFallbackAsync(job, profile, ct).ConfigureAwait(false);
            return;
        }

        var html = RenderTemplateDesignerV2(template, job.Payload, job.Locale ?? "tr");
        await WriteHtmlAsync(html, job, profile, ct).ConfigureAwait(false);
    }

    private async Task RenderFrxAsync(PrintJob job, PrinterProfile profile, CancellationToken ct)
    {
        var designId = job.Payload != null && job.Payload.TryGetValue("designId", out var v) ? v?.ToString() : job.RefId;
        if (string.IsNullOrWhiteSpace(designId))
        {
            _log.LogWarning("FastReport(frx): designId bos.");
            await RenderHtmlFallbackAsync(job, profile, ct).ConfigureAwait(false);
            return;
        }

        JArray arr;
        try
        {
            arr = await _pg.SelectAsync("report_templates", $"id=eq.{Uri.EscapeDataString(designId)}&select=id,name,content", ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "FastReport(frx): report_templates okunamadi.");
            arr = new JArray();
        }

        if (arr.Count == 0)
        {
            await RenderHtmlFallbackAsync(job, profile, ct).ConfigureAwait(false);
            return;
        }

        var content = arr[0]["content"] as JObject;
        string? frxXml = null;
        if (content != null)
        {
            frxXml = (content["frxXml"] ?? content["xml"] ?? content["text"])?.ToString();
        }

        var cli = ResolveCliPath();
        var printerName = profile?.SystemName ?? job.PrinterName ?? "default";

        if (!string.IsNullOrEmpty(cli) && File.Exists(cli) && !string.IsNullOrWhiteSpace(frxXml))
        {
            var tmpFrx = Path.Combine(Path.GetTempPath(), $"frx_{Guid.NewGuid():N}.frx");
            await File.WriteAllTextAsync(tmpFrx, frxXml!, ct).ConfigureAwait(false);
            try
            {
                var dataJson = job.Payload != null && job.Payload.TryGetValue("data", out var d) ? (d?.ToString() ?? "{}") : "{}";
                var args = $"print --template=\"{tmpFrx}\" --printer=\"{printerName}\" --data=\"{dataJson.Replace("\"", "\\\"")}\"";
                using var p = Process.Start(new ProcessStartInfo(cli, args) { UseShellExecute = false, CreateNoWindow = true });
                if (p == null) throw new InvalidOperationException("FastReport.Cli.exe baslatilamadi.");
                await p.WaitForExitAsync(ct).ConfigureAwait(false);
                if (p.ExitCode != 0)
                {
                    throw new InvalidOperationException($"FastReport.Cli exit code {p.ExitCode}.");
                }
                return;
            }
            finally
            {
                try { File.Delete(tmpFrx); } catch { /* sessiz */ }
            }
        }

        // Designer fallback: previewHtml
        if (content != null && content.TryGetValue("previewHtml", out var ph) && ph != null && !string.IsNullOrWhiteSpace(ph.ToString()))
        {
            await WriteHtmlAsync(ph.ToString()!, job, profile, ct).ConfigureAwait(false);
            return;
        }

        // Son care minimal HTML
        await RenderHtmlFallbackAsync(job, profile, ct).ConfigureAwait(false);
    }

    private async Task RenderHtmlFallbackAsync(PrintJob job, PrinterProfile profile, CancellationToken ct)
    {
        var sb = new System.Text.StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\"></head><body>");
        sb.Append($"<h1>{System.Net.WebUtility.HtmlEncode(job.JobType ?? "FastReport")}</h1>");
        sb.Append("<pre>");
        if (job.Payload != null)
        {
            foreach (var kv in job.Payload)
            {
                sb.Append(System.Net.WebUtility.HtmlEncode($"{kv.Key}: {(kv.Value?.ToString() ?? "")}"));
                sb.Append('\n');
            }
        }
        sb.Append("</pre></body></html>");
        await WriteHtmlAsync(sb.ToString(), job, profile, ct).ConfigureAwait(false);
    }

    private async Task WriteHtmlAsync(string html, PrintJob job, PrinterProfile profile, CancellationToken ct)
    {
        // HtmlSystemRenderer ile delegasyon
        var htmlRenderer = new HtmlSystemRenderer(_cfg, _log);
        // payload uzerinde "html" anahtarini gecici olarak koymak yerine,
        // yeni bir PrintJob kopyasi olusturup payload'a html ekliyoruz.
        var clone = new PrintJob
        {
            Id = job.Id,
            JobType = job.JobType,
            Status = job.Status,
            Priority = job.Priority,
            Connection = job.Connection,
            Address = job.Address,
            Port = job.Port,
            PrinterName = job.PrinterName,
            PrinterProfileId = job.PrinterProfileId,
            Locale = job.Locale,
            Copies = job.Copies,
            PayloadJson = job.PayloadJson,
            Payload = new System.Collections.Generic.Dictionary<string, object?>(job.Payload ?? new System.Collections.Generic.Dictionary<string, object?>())
            {
                ["html"] = html,
            },
            RefType = job.RefType,
            RefId = job.RefId,
            Attempts = job.Attempts,
            LastError = job.LastError,
            FirmNr = job.FirmNr,
            PeriodNr = job.PeriodNr,
            TableName = job.TableName,
        };
        await htmlRenderer.RenderAsync(clone, profile, ct).ConfigureAwait(false);
    }

    private string? ResolveCliPath()
    {
        if (!string.IsNullOrWhiteSpace(_cfg.FastReportCliPath) && File.Exists(_cfg.FastReportCliPath))
        {
            return _cfg.FastReportCliPath;
        }
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var candidate = Path.Combine(dir, "FastReport.Cli.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch { /* invalid path */ }
        }
        return "";
    }

    /// <summary>
    /// content.templates[] icinden id eslesen template'i bulur.
    /// Esleme bulamazsa ilk template'i doner.
    /// </summary>
    private static JObject? FindTemplate(JObject content, string? templateId)
    {
        var templates = content["templates"] as JArray;
        if (templates == null || templates.Count == 0) return null;
        if (!string.IsNullOrWhiteSpace(templateId))
        {
            foreach (var t in templates)
            {
                if (t is JObject o)
                {
                    var id = o["id"]?.ToString();
                    if (string.Equals(id, templateId, StringComparison.OrdinalIgnoreCase)) return o;
                }
            }
        }
        return templates[0] as JObject;
    }

    /// <summary>
    /// Designer v2 template'i minimal sekilde render eder:
    /// <list type="bullet">
    /// <item>title / header / footer text alanlari</item>
    /// <item>{{a.b.c}} token replace (payload data ile)</item>
    /// <item>tables[] &rarr; HTML tablosu</item>
    /// </list>
    /// </summary>
    public static string RenderTemplateDesignerV2(JObject template, System.Collections.Generic.Dictionary<string, object?>? payload, string locale = "tr")
    {
        if (template == null) return "";

        var dataToken = payload != null && payload.TryGetValue("data", out var d) ? d : null;
        var dataObj = dataToken as JObject ?? new JObject();

        // payload.translations[locale] -> IDictionary<string,string>
        var labels = ExtractPayloadLabels(payload, locale);

        var sb = new System.Text.StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\"><style>body{font-family:Arial;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:4px}</style></head><body>");

        var title = template["title"]?.ToString() ?? template["name"]?.ToString() ?? "Report";
        sb.Append($"<h1>{System.Net.WebUtility.HtmlEncode(title)}</h1>");

        // headers / sections
        if (template["sections"] is JArray sections)
        {
            foreach (var sec in sections)
            {
                if (sec is not JObject sObj) continue;
                var kind = sObj["kind"]?.ToString() ?? "body";
                var text = sObj["text"]?.ToString() ?? "";
                var replaced = ReplaceTokens(text, dataObj, labels, locale);
                sb.Append($"<div data-section=\"{kind}\">{System.Net.WebUtility.HtmlEncode(replaced)}</div>");
            }
        }

        // tables
        if (template["tables"] is JArray tables)
        {
            foreach (var tbl in tables)
            {
                if (tbl is not JObject tObj) continue;
                var name = tObj["name"]?.ToString() ?? "Table";
                var rows = tObj["rows"] as JArray;
                sb.Append($"<h3>{System.Net.WebUtility.HtmlEncode(name)}</h3>");
                sb.Append("<table><thead><tr>");
                if (tObj["columns"] is JArray cols)
                {
                    foreach (var c in cols)
                    {
                        sb.Append($"<th>{System.Net.WebUtility.HtmlEncode(c.ToString())}</th>");
                    }
                }
                sb.Append("</tr></thead><tbody>");
                if (rows != null)
                {
                    foreach (var row in rows)
                    {
                        if (row is JObject rObj)
                        {
                            sb.Append("<tr>");
                            foreach (var c in (tObj["columns"] as JArray ?? new JArray()))
                            {
                                var key = c.ToString();
                                var val = rObj[key]?.ToString() ?? "";
                                sb.Append($"<td>{System.Net.WebUtility.HtmlEncode(val)}</td>");
                            }
                            sb.Append("</tr>");
                        }
                    }
                }
                sb.Append("</tbody></table>");
            }
        }

        sb.Append("</body></html>");
        return sb.ToString();
    }

    private static string ReplaceTokens(string input, JObject data, System.Collections.Generic.IDictionary<string, string>? labels, string locale)
    {
        if (string.IsNullOrEmpty(input)) return "";
        var result = input;

        // 1) data tokens ({{a}}, {{a.b}}, {{a.b.c}})
        if (data != null)
        {
            foreach (var prop in data.Properties())
            {
                var key = prop.Name;
                result = result.Replace("{{" + key + "}}", prop.Value?.ToString() ?? "");
                // a.b.c destegi
                if (prop.Value is JObject nested)
                {
                    foreach (var n in nested.Properties())
                    {
                        result = result.Replace("{{" + key + "." + n.Name + "}}", n.Value?.ToString() ?? "");
                    }
                }
            }
        }

        // 2) label tokens ({{locale.key}}, {{tr.key}}, {{en.key}})
        if (labels != null && labels.Count > 0)
        {
            var normLocale = string.IsNullOrWhiteSpace(locale) ? "tr" : locale.ToLowerInvariant();
            foreach (var kv in labels)
            {
                var v = kv.Value ?? "";
                if (string.IsNullOrEmpty(v)) continue;
                result = result.Replace("{{" + normLocale + "." + kv.Key + "}}", v);
                result = result.Replace("{{tr." + kv.Key + "}}", v);
                result = result.Replace("{{en." + kv.Key + "}}", v);
                result = result.Replace("{{ar." + kv.Key + "}}", v);
                result = result.Replace("{{ku." + kv.Key + "}}", v);
            }
        }
        return result;
    }

    /// <summary>
    /// payload.translations[locale] icindeki string dictionary'yi duz (string,string) sozluk olarak cikarir.
    /// Bulunamazsa bos doner.
    /// </summary>
    private static System.Collections.Generic.IDictionary<string, string> ExtractPayloadLabels(
        System.Collections.Generic.Dictionary<string, object?>? payload,
        string locale)
    {
        var result = new System.Collections.Generic.Dictionary<string, string>();
        if (payload == null || string.IsNullOrWhiteSpace(locale)) return result;

        try
        {
            object? translationsObj = null;
            if (payload.TryGetValue("translations", out var t) && t != null)
            {
                translationsObj = t;
            }

            JObject? translations = null;
            if (translationsObj is JObject jo) translations = jo;
            else if (translationsObj is System.Collections.Generic.Dictionary<string, object?> dict)
            {
                translations = JObject.FromObject(dict);
            }

            if (translations == null) return result;

            var normLocale = locale.ToLowerInvariant();
            JToken? localeDict = translations[normLocale] ?? translations[locale];
            if (localeDict == null || localeDict.Type != JTokenType.Object) return result;

            foreach (var kv in (JObject)localeDict)
            {
                if (kv.Value?.Type == JTokenType.String)
                {
                    var v = kv.Value.Value<string>();
                    if (!string.IsNullOrEmpty(v)) result[kv.Key] = v;
                }
            }
        }
        catch
        {
            // sessiz — bos labels ile devam et
        }
        return result;
    }
}
