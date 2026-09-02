using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Core.Models;

namespace RetailEX.PrintServer.Core.Rendering.Label;

/// <summary>
/// Etiket yazicilari (TSC, Zebra, Citizen vb.) icin renderer.
/// TSPL/ZPL komutlari uretir ve EscPosNetworkRenderer'in kullandigi sekilde TCP soketinden gonderir.
/// </summary>
public sealed class LabelRenderer
{
    private readonly PrintServerConfig _cfg;
    private readonly ILogger _log;

    public LabelRenderer(PrintServerConfig cfg, ILogger log)
    {
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
    }

    /// <summary>Job + Profile uzerinden etiket yaz.</summary>
    public async Task RenderAsync(PrintJob job, PrinterProfile profile, CancellationToken ct)
    {
        if (job == null) throw new ArgumentNullException(nameof(job));
        if (profile == null) throw new ArgumentNullException(nameof(profile));

        var bytes = ResolveBytes(job);
        if (bytes == null || bytes.Length == 0)
        {
            _log.LogWarning("Label: job {JobId} icin komut uretilemedi.", job.Id);
            return;
        }

        var address = string.IsNullOrWhiteSpace(profile.Address) ? job.Address : profile.Address;
        var port = profile.Port > 0 ? profile.Port : (job.Port ?? 9100);
        if (string.IsNullOrWhiteSpace(address))
        {
            throw new InvalidOperationException($"Label: address yok (profile={profile.Id}, job={job.Id}).");
        }

        var timeoutMs = _cfg.TcpTimeoutMs > 0 ? _cfg.TcpTimeoutMs : 8000;
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeoutMs);

        using var client = new TcpClient();
        try
        {
            await client.ConnectAsync(address!, port, cts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TimeoutException($"Label: {address}:{port} TCP baglantisi zaman asimi ({timeoutMs}ms).");
        }

        using var stream = client.GetStream();
        stream.WriteTimeout = timeoutMs;
        stream.ReadTimeout = timeoutMs;
        await stream.WriteAsync(bytes, ct).ConfigureAwait(false);
        await stream.FlushAsync(ct).ConfigureAwait(false);
    }

    /// <summary>Payload icindeki tspl/zpl veya alanlardan komut byte dizisi uretir.</summary>
    public static byte[] ResolveBytes(PrintJob job)
    {
        if (job.Payload == null) return Array.Empty<byte>();

        // 1) Hazir TSPL
        if (job.Payload.TryGetValue("tspl", out var tsplRaw) && tsplRaw != null)
        {
            var tspl = tsplRaw.ToString();
            if (!string.IsNullOrWhiteSpace(tspl)) return Encoding.UTF8.GetBytes(tspl);
        }

        // 2) Hazir ZPL
        if (job.Payload.TryGetValue("zpl", out var zplRaw) && zplRaw != null)
        {
            var zpl = zplRaw.ToString();
            if (!string.IsNullOrWhiteSpace(zpl)) return Encoding.UTF8.GetBytes(zpl);
        }

        // 3) Base64 fallback
        if (job.Payload.TryGetValue("dataB64", out var db64) && db64 != null)
        {
            try
            {
                var s = db64.ToString();
                if (!string.IsNullOrWhiteSpace(s)) return Convert.FromBase64String(s);
            }
            catch { /* fallback */ }
        }

        // 4) Alanlardan TSPL uretimi (varsayilan)
        var sb = new StringBuilder();
        var widthMm = GetInt(job.Payload, "widthMm", 50);
        var heightMm = GetInt(job.Payload, "heightMm", 30);
        sb.AppendLine($"SIZE {widthMm} mm,{heightMm} mm");
        sb.AppendLine("CLS");
        sb.AppendLine("DIRECTION 1");
        sb.AppendLine("REFERENCE 0,0");
        sb.AppendLine("SET UTF-8");

        var dpi = GetInt(job.Payload, "dpi", 203);
        var font = GetString(job.Payload, "font", "TSS24.BF2");
        var scale = GetInt(job.Payload, "scale", 2);
        var x = GetInt(job.Payload, "x", 10);
        var y = GetInt(job.Payload, "y", 10);
        var name = GetString(job.Payload, "name", "");
        var price = GetString(job.Payload, "price", "");
        var barcode = GetString(job.Payload, "barcode", "");
        var qr = GetString(job.Payload, "qr", "");
        var code128 = GetString(job.Payload, "code128", barcode);

        if (!string.IsNullOrWhiteSpace(name))
        {
            sb.AppendLine($"TEXT {x},{y},\"{font}\",{scale * 30},{scale * 30},\"{Sanitize(name)}\"");
        }
        if (!string.IsNullOrWhiteSpace(price))
        {
            sb.AppendLine($"TEXT {x},{y + 60},\"{font}\",{scale * 30},{scale * 30},\"{Sanitize(price)}\"");
        }
        if (!string.IsNullOrWhiteSpace(code128))
        {
            // BARCODE x,y,"CODE128",height,readable,rotation,ratio,content
            sb.AppendLine($"BARCODE {x},{y + 120},\"128\",80,1,0,2,\"{Sanitize(code128)}\"");
        }
        if (!string.IsNullOrWhiteSpace(qr))
        {
            sb.AppendLine($"QRCODE {x + 200},{y + 120},L,5,A,0,\"{Sanitize(qr)}\"");
        }
        sb.AppendLine($"PRINT {GetInt(job.Payload, "copies", 1)}");
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    private static string Sanitize(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\"", "\\\"").Replace("\n", " ").Replace("\r", " ");
    }

    private static string GetString(Dictionary<string, object?> p, string key, string fallback)
        => p.TryGetValue(key, out var v) && v != null ? v.ToString() ?? fallback : fallback;

    private static int GetInt(Dictionary<string, object?> p, string key, int fallback)
    {
        if (p.TryGetValue(key, out var v) && v != null)
        {
            if (int.TryParse(v.ToString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var i))
                return i;
        }
        return fallback;
    }
}
