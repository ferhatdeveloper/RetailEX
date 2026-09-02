using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Core.I18n;
using RetailEX.PrintServer.Core.Models;

namespace RetailEX.PrintServer.Core.Rendering.Html;

/// <summary>
/// HTML tabanli sistem yazicisi (Windows printer queue) renderer.
/// Tercihen SumatraPDF, yoksa Windows Shell "print" verb'i, son care headless browser kullanir.
/// </summary>
public sealed class HtmlSystemRenderer
{
    private readonly PrintServerConfig _cfg;
    private readonly ILogger _log;

    public HtmlSystemRenderer(PrintServerConfig cfg, ILogger log)
    {
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
    }

    /// <summary>HTML'yi gecici dosyaya yaz, SumatraPDF/Shell ile yazdir, 5sn sonra sil.</summary>
    public async Task RenderAsync(PrintJob job, PrinterProfile profile, CancellationToken ct)
    {
        if (job == null) throw new ArgumentNullException(nameof(job));

        var html = ResolveHtml(job);
        if (string.IsNullOrWhiteSpace(html))
        {
            _log.LogWarning("HtmlSystem: job {JobId} icin HTML uretilemedi.", job.Id);
            return;
        }

        var printerName = profile?.SystemName ?? job.PrinterName ?? "default";
        var tempHtml = Path.Combine(Path.GetTempPath(), $"print_{Guid.NewGuid():N}.html");
        await File.WriteAllTextAsync(tempHtml, html, new UTF8Encoding(false), ct).ConfigureAwait(false);

        try
        {
            // SumatraPDF tercih et
            var sumatra = ResolveSumatraPath();
            if (!string.IsNullOrEmpty(sumatra) && File.Exists(sumatra))
            {
                var args = $"\"{tempHtml}\" -print-to \"{printerName}\" -silent";
                await RunProcessAsync(sumatra, args, _log, ct).ConfigureAwait(false);
            }
            else if (!string.IsNullOrWhiteSpace(_cfg.PrintBrowserPath) && File.Exists(_cfg.PrintBrowserPath))
            {
                await WindowsBuiltinPrintHelper.PrintHtmlViaChromeAsync(tempHtml, _cfg.PrintBrowserPath, printerName, _log, ct).ConfigureAwait(false);
            }
            else
            {
                // Son care — Windows Shell "print" verb
                WindowsBuiltinPrintHelper.PrintHtmlViaStartVerb(tempHtml);
                // Shell async; en az 1 saniye bekle ki spooler'a dusmesini saglayalim
                await Task.Delay(1000, ct).ConfigureAwait(false);
            }
        }
        finally
        {
            // 5 saniye sonra temp HTML'i sil
            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(5)).ConfigureAwait(false);
                    if (File.Exists(tempHtml)) File.Delete(tempHtml);
                }
                catch { /* sessiz */ }
            });
        }
    }

    /// <summary>Payload / JobType'a gore HTML uretir.</summary>
    public static string ResolveHtml(PrintJob job)
    {
        if (job.Payload != null)
        {
            if (job.Payload.TryGetValue("html", out var h) && h != null)
            {
                return h.ToString() ?? "";
            }
            if (job.Payload.TryGetValue("previewHtml", out var ph) && ph != null)
            {
                return ph.ToString() ?? "";
            }
        }

        return (job.JobType ?? "").ToLowerInvariant() switch
        {
            "pos_receipt_80" => BuildPosReceipt(job, 80),
            "pos_receipt_58" => BuildPosReceipt(job, 58),
            "invoice_a4" => BuildA4Invoice(job),
            "invoice_a5" => BuildA5Invoice(job),
            "account_receipt" => BuildA5Invoice(job),
            _ => BuildGeneric(job),
        };
    }

    private static string BuildPosReceipt(PrintJob job, int mm)
    {
        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\">");
        sb.Append($"<style>@page {{ size: {mm}mm auto; margin: 4mm; }} body {{ font-family: 'Courier New', monospace; font-size: 11px; }}</style>");
        sb.Append("</head><body>");

        var posHeaderDefault = PrintStrings.Resolve(job, PrintStringKey.PosHeader);
        var header = GetPayloadString(job.Payload, "header", posHeaderDefault);
        sb.Append($"<h2 style=\"text-align:center;margin:0\">{Esc(header)}</h2>");
        sb.Append($"<p style=\"text-align:center;margin:2px 0\">{Esc(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"))}</p>");
        sb.Append("<hr>");

        if (job.Payload != null && job.Payload.TryGetValue("items", out var rawItems) && rawItems is IEnumerable<object> items)
        {
            foreach (var raw in items)
            {
                if (raw is Dictionary<string, object?> dict)
                {
                    var name = Esc(GetDictString(dict, "name", ""));
                    var qty = GetDictInt(dict, "qty", 1);
                    var price = GetDictDecimal(dict, "price", 0m);
                    sb.Append($"<div>{qty}x {name} <span style=\"float:right\">{price * qty:N2}</span></div>");
                }
            }
        }
        sb.Append("<hr>");
        var total = GetPayloadDecimal(job.Payload, "total", 0m);
        var totalLabel = PrintStrings.Resolve(job, PrintStringKey.Total);
        sb.Append($"<div style=\"font-weight:bold\">{Esc(totalLabel)} <span style=\"float:right\">{total:N2}</span></div>");
        sb.Append("</body></html>");
        return sb.ToString();
    }

    private static string BuildA4Invoice(PrintJob job)
    {
        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\">");
        sb.Append("<style>@page { size: A4; margin: 12mm; } body { font-family: Arial, sans-serif; font-size: 12px; } h1 { font-size: 16px; }</style>");
        sb.Append("</head><body>");
        var invoiceHeaderDefault = PrintStrings.Resolve(job, PrintStringKey.InvoiceHeader);
        sb.Append($"<h1>{Esc(GetPayloadString(job.Payload, "title", invoiceHeaderDefault))}</h1>");
        var dateLabel = PrintStrings.Resolve(job, PrintStringKey.Date);
        sb.Append($"<p><strong>{Esc(dateLabel)}:</strong> {Esc(DateTime.Now.ToString("yyyy-MM-dd HH:mm"))}</p>");
        if (!string.IsNullOrWhiteSpace(job.RefType)) sb.Append($"<p><strong>Ref:</strong> {Esc(job.RefType)} / {Esc(job.RefId ?? "")}</p>");
        var colName = PrintStrings.Resolve(job, PrintStringKey.ItemName);
        var colQty = PrintStrings.Resolve(job, PrintStringKey.Quantity);
        var colPrice = PrintStrings.Resolve(job, PrintStringKey.UnitPrice);
        var colLine = PrintStrings.Resolve(job, PrintStringKey.LineTotal);
        sb.Append($"<table border=\"1\" cellspacing=\"0\" cellpadding=\"4\" style=\"width:100%;border-collapse:collapse\">");
        sb.Append($"<tr><th>{Esc(colName)}</th><th>{Esc(colQty)}</th><th>{Esc(colPrice)}</th><th>{Esc(colLine)}</th></tr>");
        if (job.Payload != null && job.Payload.TryGetValue("items", out var rawItems) && rawItems is IEnumerable<object> items)
        {
            foreach (var raw in items)
            {
                if (raw is Dictionary<string, object?> dict)
                {
                    var name = Esc(GetDictString(dict, "name", ""));
                    var qty = GetDictInt(dict, "qty", 1);
                    var price = GetDictDecimal(dict, "price", 0m);
                    sb.Append($"<tr><td>{name}</td><td>{qty}</td><td>{price:N2}</td><td>{(price * qty):N2}</td></tr>");
                }
            }
        }
        sb.Append("</table>");
        var totalLabel = PrintStrings.Resolve(job, PrintStringKey.Total);
        sb.Append($"<h3 style=\"text-align:right\">{Esc(totalLabel)}: {GetPayloadDecimal(job.Payload, "total", 0m):N2}</h3>");
        sb.Append("</body></html>");
        return sb.ToString();
    }

    private static string BuildA5Invoice(PrintJob job)
    {
        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\">");
        sb.Append("<style>@page { size: A5; margin: 8mm; } body { font-family: Arial, sans-serif; font-size: 11px; } h1 { font-size: 14px; }</style>");
        sb.Append("</head><body>");
        var accountHeaderDefault = PrintStrings.Resolve(job, PrintStringKey.AccountHeader);
        sb.Append($"<h1>{Esc(GetPayloadString(job.Payload, "title", accountHeaderDefault))}</h1>");
        var dateLabel = PrintStrings.Resolve(job, PrintStringKey.Date);
        sb.Append($"<p><strong>{Esc(dateLabel)}:</strong> {Esc(DateTime.Now.ToString("yyyy-MM-dd HH:mm"))}</p>");
        if (!string.IsNullOrWhiteSpace(job.RefType)) sb.Append($"<p><strong>Ref:</strong> {Esc(job.RefType)} / {Esc(job.RefId ?? "")}</p>");
        sb.Append("<hr>");
        sb.Append($"<p>{Esc(GetPayloadString(job.Payload, "body", "Detay icin sayfa genisletilebilir."))}</p>");
        sb.Append("</body></html>");
        return sb.ToString();
    }

    private static string BuildGeneric(PrintJob job)
    {
        var sb = new StringBuilder();
        sb.Append("<!doctype html><html><head><meta charset=\"utf-8\"><style>body { font-family: Arial; font-size: 12px; }</style></head><body>");
        sb.Append($"<h1>{Esc(job.JobType ?? "Print")}</h1>");
        sb.Append($"<pre>{Esc(GetPayloadString(job.Payload, "body", "Bos icerik."))}</pre>");
        sb.Append("</body></html>");
        return sb.ToString();
    }

    private string ResolveSumatraPath()
    {
        if (!string.IsNullOrWhiteSpace(_cfg.SumatraPdfPath) && File.Exists(_cfg.SumatraPdfPath))
        {
            return _cfg.SumatraPdfPath;
        }
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var candidate = Path.Combine(dir, "SumatraPDF.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch { /* invalid path entries */ }
        }
        return "";
    }

    private static async Task RunProcessAsync(string exe, string args, ILogger log, CancellationToken ct)
    {
        var psi = new System.Diagnostics.ProcessStartInfo
        {
            FileName = exe,
            Arguments = args,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        using var p = System.Diagnostics.Process.Start(psi);
        if (p == null) throw new InvalidOperationException($"SumatraPDF baslatilamadi: {exe}");
        try
        {
            await p.WaitForExitAsync(ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            try { if (!p.HasExited) p.Kill(); } catch { /* sessiz */ }
            throw;
        }
        if (p.ExitCode != 0)
        {
            log.LogWarning("SumatraPDF exit code {Code} (args: {Args})", p.ExitCode, args);
        }
    }

    private static string Esc(string s) => System.Net.WebUtility.HtmlEncode(s ?? "");

    private static string GetPayloadString(Dictionary<string, object?>? payload, string key, string fallback)
    {
        if (payload != null && payload.TryGetValue(key, out var v) && v != null) return v.ToString() ?? fallback;
        return fallback;
    }

    private static decimal GetPayloadDecimal(Dictionary<string, object?>? payload, string key, decimal fallback)
    {
        if (payload != null && payload.TryGetValue(key, out var v) && v != null)
        {
            if (decimal.TryParse(v.ToString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var d))
                return d;
        }
        return fallback;
    }

    private static string GetDictString(Dictionary<string, object?> dict, string key, string fallback)
        => dict.TryGetValue(key, out var v) && v != null ? v.ToString() ?? fallback : fallback;

    private static int GetDictInt(Dictionary<string, object?> dict, string key, int fallback)
    {
        if (dict.TryGetValue(key, out var v) && v != null)
        {
            if (int.TryParse(v.ToString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var i))
                return i;
        }
        return fallback;
    }

    private static decimal GetDictDecimal(Dictionary<string, object?> dict, string key, decimal fallback)
    {
        if (dict.TryGetValue(key, out var v) && v != null)
        {
            if (decimal.TryParse(v.ToString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var d))
                return d;
        }
        return fallback;
    }
}
