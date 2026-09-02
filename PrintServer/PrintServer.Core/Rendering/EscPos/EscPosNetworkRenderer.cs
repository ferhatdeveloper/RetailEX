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

namespace RetailEX.PrintServer.Core.Rendering.EscPos;

/// <summary>
/// Network ESC/POS yazicilar (genelde 80mm termal) icin TCP renderer.
/// Profile.Address / Port uzerinden baglanir, payload icindeki hazir byte dizisini yazar.
/// payload yoksa ve job kitchen_ticket ise minimal mutfak fisi ESC/POS uretip yazar.
/// </summary>
public sealed class EscPosNetworkRenderer
{
    private readonly PrintServerConfig _cfg;
    private readonly ILogger _log;

    public EscPosNetworkRenderer(PrintServerConfig cfg, ILogger log)
    {
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
    }

    /// <summary>Job + Profile gore yaziciya ESC/POS byte dizisi gonderir.</summary>
    public async Task RenderAsync(PrintJob job, PrinterProfile profile, CancellationToken ct)
    {
        if (job == null) throw new ArgumentNullException(nameof(job));
        if (profile == null) throw new ArgumentNullException(nameof(profile));

        var address = string.IsNullOrWhiteSpace(profile.Address) ? job.Address : profile.Address;
        var port = profile.Port > 0 ? profile.Port : (job.Port ?? 9100);
        if (string.IsNullOrWhiteSpace(address))
        {
            throw new InvalidOperationException($"EscPosNetwork: address yok (profile={profile.Id}, job={job.Id}).");
        }

        var bytes = ResolveBytes(job);
        if (bytes == null || bytes.Length == 0)
        {
            _log.LogWarning("EscPosNetwork: job {JobId} icin bos payload; yaziciya veri gonderilmedi.", job.Id);
            return;
        }

        var copies = job.Copies <= 0 ? 1 : job.Copies;
        var timeoutMs = _cfg.TcpTimeoutMs > 0 ? _cfg.TcpTimeoutMs : 8000;

        using var client = new TcpClient();
        using var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        connectCts.CancelAfter(timeoutMs);

        try
        {
            await client.ConnectAsync(address!, port, connectCts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TimeoutException($"EscPosNetwork: {address}:{port} TCP baglantisi zaman asimi ({timeoutMs}ms).");
        }

        using var stream = client.GetStream();
        stream.WriteTimeout = timeoutMs;
        stream.ReadTimeout = timeoutMs;

        for (var i = 0; i < copies; i++)
        {
            ct.ThrowIfCancellationRequested();
            await stream.WriteAsync(bytes, ct).ConfigureAwait(false);
            await stream.FlushAsync(ct).ConfigureAwait(false);
            // basit bekleme — yazicinin islemesi icin
            if (copies > 1) await Task.Delay(150, ct).ConfigureAwait(false);
        }
    }

    /// <summary>Payload icindeki alanlardan ESC/POS byte dizisini resolve eder.</summary>
    public static byte[] ResolveBytes(PrintJob job)
    {
        if (job.Payload == null) return null!;

        // 1) escposBase64 (base64)
        if (job.Payload.TryGetValue("escposBase64", out var b64) && b64 != null)
        {
            var s = b64.ToString();
            if (!string.IsNullOrWhiteSpace(s))
            {
                try { return Convert.FromBase64String(s); }
                catch { /* fallback */ }
            }
        }

        // 2) escposBytes (UTF-8 string)
        if (job.Payload.TryGetValue("escposBytes", out var bs) && bs != null)
        {
            var s = bs.ToString();
            if (!string.IsNullOrEmpty(s)) return Encoding.UTF8.GetBytes(s);
        }

        // 3) dataB64 (fallback)
        if (job.Payload.TryGetValue("dataB64", out var db) && db != null)
        {
            var s = db.ToString();
            if (!string.IsNullOrWhiteSpace(s))
            {
                try { return Convert.FromBase64String(s); }
                catch { /* fallback */ }
            }
        }

        // 4) kitchen_ticket fallback — minimal mutfak fisi
        if (string.Equals(job.JobType, PrintJobTypes.KitchenTicket, StringComparison.OrdinalIgnoreCase))
        {
            var items = new List<KitchenItem>();
            if (job.Payload.TryGetValue("items", out var rawItems) && rawItems != null)
            {
                // rawItems string olabilir (JSON); JArray uzerinden parse etmeyi denemeyiz — caller taraf zaten parse eder
            }
            var header = job.Payload.TryGetValue("header", out var hv) ? hv?.ToString() : null;
            var note = job.Payload.TryGetValue("orderNote", out var nv) || job.Payload.TryGetValue("note", out nv)
                ? nv?.ToString()
                : null;
            return EscPosBuilder.BuildKitchenTicket(items, header, note);
        }

        return Array.Empty<byte>();
    }
}
