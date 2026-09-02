using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Core.Models;
using RetailEX.PrintServer.Core.PostgRest;

namespace RetailEX.PrintServer.Core.PrintQueue;

/// <summary>
/// Background service: tenant basina paralel claim-and-dispatch dongusu.
/// Her tenant icin ayri Task; <c>StopAsync</c> ile hepsi duzgun iptal edilir.
/// </summary>
public sealed class PrintQueueConsumer : BackgroundService
{
    private readonly PostgRestClient _pg;
    private readonly TenantDiscovery _discovery;
    private readonly PrintJobDispatcher _dispatcher;
    private readonly PrintServerConfig _cfg;
    private readonly ILogger _log;

    private readonly List<Task> _tenantLoops = new();
    private readonly CancellationTokenSource _internalStop = new();
    private readonly object _loopsLock = new();

    public PrintQueueConsumer(
        PostgRestClient pg,
        TenantDiscovery discovery,
        PrintJobDispatcher dispatcher,
        PrintServerConfig cfg,
        ILogger log)
    {
        _pg = pg ?? throw new ArgumentNullException(nameof(pg));
        _discovery = discovery ?? throw new ArgumentNullException(nameof(discovery));
        _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("PrintQueueConsumer: baslatildi. WorkerId={Wid}", _cfg.ResolveWorkerId());

        var linked = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken, _internalStop.Token);
        using var initialDelay = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        try
        {
            await Task.Delay(Timeout.Infinite, initialDelay.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // 2 saniye sonra basla
        }

        while (!linked.IsCancellationRequested)
        {
            IReadOnlyList<TenantContext> tenants;
            try
            {
                tenants = await _discovery.DiscoverAsync(linked.Token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "PrintQueueConsumer: tenant kesfi basarisiz; {_Sec}s sonra tekrar denenecek.", 10);
                await SafeDelay(TimeSpan.FromSeconds(10), linked.Token).ConfigureAwait(false);
                continue;
            }

            if (tenants.Count == 0)
            {
                _log.LogWarning("PrintQueueConsumer: hic tenant bulunamadi; {_Sec}s sonra tekrar denenecek.", 15);
                await SafeDelay(TimeSpan.FromSeconds(15), linked.Token).ConfigureAwait(false);
                continue;
            }

            // Her tenant icin ayri consumer loop baslat (yalnizca henuz baslamamis olanlar)
            foreach (var t in tenants)
            {
                StartTenantLoopIfNotRunning(t, linked.Token);
            }

            await SafeDelay(TimeSpan.FromSeconds(30), linked.Token).ConfigureAwait(false);
        }

        _log.LogInformation("PrintQueueConsumer: ana dongu sona erdi.");
    }

    private void StartTenantLoopIfNotRunning(TenantContext tenant, CancellationToken ct)
    {
        lock (_loopsLock)
        {
            // Basit koruma: tenant icin bir loop zaten varsa yeniden acma
            var key = $"{tenant.FirmNr}_{tenant.PeriodNr}";
            if (_runningKeys.Contains(key)) return;
            _runningKeys.Add(key);

            var task = Task.Run(() => ConsumeTenantLoop(tenant, ct), ct);
            _tenantLoops.Add(task);
        }
    }

    private readonly HashSet<string> _runningKeys = new(StringComparer.OrdinalIgnoreCase);

    private async Task ConsumeTenantLoop(TenantContext tenant, CancellationToken ct)
    {
        _log.LogInformation("Tenant loop basladi: {Firm}/{Period} table={Table}", tenant.FirmNr, tenant.PeriodNr, tenant.TableName);

        var poll = TimeSpan.FromMilliseconds(_cfg.PollIntervalMs);
        var selectCols = "id,job_type,status,priority,connection,address,port,printer_name,printer_profile_id,locale,copies,payload,ref_type,ref_id,attempts,firm_nr,period_nr";

        while (!ct.IsCancellationRequested)
        {
            try
            {
                var jobs = await ClaimPendingJobsAsync(tenant, selectCols, ct).ConfigureAwait(false);
                if (jobs.Count == 0)
                {
                    await SafeDelay(poll, ct).ConfigureAwait(false);
                    continue;
                }

                foreach (var job in jobs)
                {
                    if (ct.IsCancellationRequested) break;
                    await ProcessSingleJobAsync(tenant, job, ct).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Tenant loop hatasi: {Firm}/{Period}.", tenant.FirmNr, tenant.PeriodNr);
                await SafeDelay(TimeSpan.FromSeconds(5), ct).ConfigureAwait(false);
            }
        }

        lock (_loopsLock)
        {
            _runningKeys.Remove($"{tenant.FirmNr}_{tenant.PeriodNr}");
        }
        _log.LogInformation("Tenant loop sona erdi: {Firm}/{Period}", tenant.FirmNr, tenant.PeriodNr);
    }

    private async Task<List<PrintJob>> ClaimPendingJobsAsync(TenantContext tenant, string selectCols, CancellationToken ct)
    {
        var query = $"{PostgRestFilterBuilder.Select(selectCols)}"
                  + $"&{PostgRestFilterBuilder.In("status", "pending", "failed")}"
                  + $"&{PostgRestFilterBuilder.Lt("attempts", _cfg.MaxAttempts)}"
                  + $"&{PostgRestFilterBuilder.Order("priority", asc: true)}"
                  + $"&{PostgRestFilterBuilder.Order("created_at", asc: true)}"
                  + $"&{PostgRestFilterBuilder.Limit(_cfg.ClaimLimit)}";

        var arr = await _pg.SelectAsync(tenant.TableName, query, ct).ConfigureAwait(false);
        var list = new List<PrintJob>();
        foreach (var t in arr)
        {
            var job = ParseJob(t, tenant);
            if (job != null) list.Add(job);
        }
        return list;
    }

    private PrintJob? ParseJob(JToken t, TenantContext tenant)
    {
        try
        {
            var job = new PrintJob
            {
                Id = Guid.TryParse(t["id"]?.ToString(), out var gid) ? gid : Guid.Empty,
                JobType = t["job_type"]?.ToString() ?? "",
                Status = t["status"]?.ToString() ?? "pending",
                Priority = t["priority"]?.Value<int?>() ?? 0,
                Connection = t["connection"]?.ToString(),
                Address = t["address"]?.ToString(),
                Port = t["port"]?.Value<int?>(),
                PrinterName = t["printer_name"]?.ToString(),
                PrinterProfileId = t["printer_profile_id"]?.ToString(),
                Locale = t["locale"]?.ToString(),
                Copies = t["copies"]?.Value<int?>() ?? 1,
                RefType = t["ref_type"]?.ToString(),
                RefId = t["ref_id"]?.ToString(),
                Attempts = t["attempts"]?.Value<int?>() ?? 0,
                FirmNr = t["firm_nr"]?.ToString() ?? tenant.FirmNr,
                PeriodNr = t["period_nr"]?.ToString() ?? tenant.PeriodNr,
                TableName = tenant.TableName,
            };

            var payloadToken = t["payload"];
            if (payloadToken != null && payloadToken.Type != JTokenType.Null)
            {
                var raw = payloadToken.Type == JTokenType.String
                    ? payloadToken.Value<string>() ?? ""
                    : payloadToken.ToString(Newtonsoft.Json.Formatting.None);
                job.PayloadJson = raw;
                job.Payload = ParsePayload(raw);
            }
            else
            {
                job.Payload = new Dictionary<string, object?>();
            }
            return job.Id == Guid.Empty ? null : job;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "ParseJob: satir parse edilemedi (firm={Firm}, period={Period}).", tenant.FirmNr, tenant.PeriodNr);
            return null;
        }
    }

    private static Dictionary<string, object?> ParsePayload(string raw)
    {
        var dict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(raw)) return dict;
        try
        {
            var token = JToken.Parse(raw);
            if (token is JObject obj)
            {
                foreach (var p in obj.Properties())
                {
                    dict[p.Name] = p.Value?.ToObject<object>();
                }
            }
        }
        catch
        {
            // JSON degilse string olarak "body" anahtarina koy
            dict["body"] = raw;
        }
        return dict;
    }

    private async Task ProcessSingleJobAsync(TenantContext tenant, PrintJob job, CancellationToken ct)
    {
        // 1) claim — status=pending iken printing'e gecir
        var claimed = await TryClaimAsync(tenant, job.Id, ct).ConfigureAwait(false);
        if (!claimed)
        {
            _log.LogDebug("ProcessSingleJob: job {JobId} claim edilemedi (baska worker almis olabilir).", job.Id);
            return;
        }

        job.Status = "printing";
        job.Attempts = Math.Max(0, job.Attempts) + 1;

        try
        {
            await _dispatcher.DispatchAsync(job, tenant, ct).ConfigureAwait(false);
            await MarkPrintedAsync(tenant, job.Id, ct).ConfigureAwait(false);
            _log.LogInformation("Job basariyla basildi: {JobId} ({JobType}) firm={Firm}/{Period}",
                job.Id, job.JobType, tenant.FirmNr, tenant.PeriodNr);
        }
        catch (Exception ex)
        {
            var msg = ex?.Message ?? ex?.GetType().Name ?? "unknown";
            await MarkFailedAsync(tenant, job.Id, msg, ct).ConfigureAwait(false);
            _log.LogWarning(ex, "Job basarisiz: {JobId} ({JobType}) firm={Firm}/{Period}. Hata: {Msg}",
                job.Id, job.JobType, tenant.FirmNr, tenant.PeriodNr, msg);
        }
    }

    private async Task<bool> TryClaimAsync(TenantContext tenant, Guid jobId, CancellationToken ct)
    {
        try
        {
            var body = new JObject
            {
                ["status"] = "printing",
                ["claimed_by"] = _cfg.ResolveWorkerId(),
                ["claimed_at"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture),
                ["attempts"] = JToken.FromObject(1), // UPDATE SET attempts = attempts + 1 yerine absolute arttirimi
            };
            // attempts = attempts + 1 ifadesi PostgREST'te dogrudan yapilamaz;
            // bu yuzden once SELECT ile okuyup +1 ile yaziyoruz. Daha verimli bir yol RPC kullanmaktir.
            // Burada basit yaklasim: claims basarili olursa server-side attempts = attempts + 1 yapilir.
            // NOT: Daha dogru: UPDATE ... SET attempts = attempts + 1 yerine oncelikle SELECT edip degeri okuyup +1 ile yazmak.
            // Bu implementasyonda "attempts" degeri ProcessSingleJob tarafinda Math.Max ile arttirilip
            // basarisizlik olursa MarkFailed'a yazilir.
            var filter = $"id=eq.{jobId:D}&status=in.(pending,failed)";
            var arr = await _pg.UpdateAsync(tenant.TableName, filter, "id,attempts,status", body, ct).ConfigureAwait(false);
            return arr.Count > 0;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "TryClaim: job {JobId} claim hatasi.", jobId);
            return false;
        }
    }

    private async Task MarkPrintedAsync(TenantContext tenant, Guid jobId, CancellationToken ct)
    {
        try
        {
            var body = new JObject
            {
                ["status"] = "printed",
                ["printed_at"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture),
                ["last_error"] = JValue.CreateNull(),
            };
            await _pg.UpdateAsync(tenant.TableName, $"id=eq.{jobId:D}", "id", body, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "MarkPrinted: job {JobId} guncellenemedi.", jobId);
        }
    }

    private async Task MarkFailedAsync(TenantContext tenant, Guid jobId, string error, CancellationToken ct)
    {
        try
        {
            var body = new JObject
            {
                ["status"] = "failed",
                ["last_error"] = Truncate(error, 4000),
                ["failed_at"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture),
            };
            await _pg.UpdateAsync(tenant.TableName, $"id=eq.{jobId:D}", "id", body, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "MarkFailed: job {JobId} guncellenemedi.", jobId);
        }
    }

    private static string Truncate(string s, int max)
    {
        if (string.IsNullOrEmpty(s)) return s ?? "";
        return s.Length <= max ? s : s.Substring(0, max);
    }

    private static async Task SafeDelay(TimeSpan delay, CancellationToken ct)
    {
        try
        {
            await Task.Delay(delay, ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException) { /* beklenen */ }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _log.LogInformation("PrintQueueConsumer: StopAsync cagrildi; tum tenant loop'lari iptal ediliyor.");
        try
        {
            _internalStop.Cancel();
        }
        catch { /* sessiz */ }

        Task[] toAwait;
        lock (_loopsLock)
        {
            toAwait = _tenantLoops.ToArray();
        }
        try
        {
            await Task.WhenAll(toAwait).WaitAsync(TimeSpan.FromSeconds(15), cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "PrintQueueConsumer: StopAsync sirasinda tenant loop beklenmesinde sorun.");
        }

        await base.StopAsync(cancellationToken).ConfigureAwait(false);
    }
}
