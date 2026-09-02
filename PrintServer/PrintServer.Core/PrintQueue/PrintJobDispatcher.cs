using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Core.Models;
using RetailEX.PrintServer.Core.Rendering.EscPos;
using RetailEX.PrintServer.Core.Rendering.FastReport;
using RetailEX.PrintServer.Core.Rendering.Html;
using RetailEX.PrintServer.Core.Rendering.Label;
using RetailEX.PrintServer.Core.Rendering.Routing;

namespace RetailEX.PrintServer.Core.PrintQueue;

/// <summary>
/// Tek bir PrintJob icin uygun renderer secip calistirir.
/// Statelesstir; her tenant loop'u kendi instance'iyla veya DI singleton ile cagirabilir.
/// </summary>
public sealed class PrintJobDispatcher
{
    private readonly PrintServerConfig _cfg;
    private readonly ILogger _log;
    private readonly RoutingResolver _router;
    private readonly EscPosNetworkRenderer _escPos;
    private readonly BluetoothEscPosRenderer _bluetooth;
    private readonly HtmlSystemRenderer _html;
    private readonly FastReportRenderer _fastReport;
    private readonly LabelRenderer _label;

    public PrintJobDispatcher(
        PrintServerConfig cfg,
        ILogger log,
        RoutingResolver router,
        EscPosNetworkRenderer escPos,
        BluetoothEscPosRenderer bluetooth,
        HtmlSystemRenderer html,
        FastReportRenderer fastReport,
        LabelRenderer label)
    {
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
        _router = router ?? throw new ArgumentNullException(nameof(router));
        _escPos = escPos ?? throw new ArgumentNullException(nameof(escPos));
        _bluetooth = bluetooth ?? throw new ArgumentNullException(nameof(bluetooth));
        _html = html ?? throw new ArgumentNullException(nameof(html));
        _fastReport = fastReport ?? throw new ArgumentNullException(nameof(fastReport));
        _label = label ?? throw new ArgumentNullException(nameof(label));
    }

    /// <summary>Job + tenant ile uygun renderer'i secip calistirir.</summary>
    public async Task DispatchAsync(PrintJob job, TenantContext tenant, CancellationToken ct)
    {
        if (job == null) throw new ArgumentNullException(nameof(job));
        if (tenant == null) throw new ArgumentNullException(nameof(tenant));

        var profile = await _router.ResolveAsync(job, tenant, ct).ConfigureAwait(false);
        var jobType = (job.JobType ?? "").ToLowerInvariant();
        var connection = (job.Connection ?? "").Trim().ToLowerInvariant();
        var profileKind = (profile?.Kind ?? "system").Trim().ToLowerInvariant();

        try
        {
            // 1) FastReport
            if (connection == "fastreport" || jobType == PrintJobTypes.FastReportFrx || jobType == PrintJobTypes.FastReportTemplate || profileKind == "fastreport")
            {
                await _fastReport.RenderAsync(job, profile, ct).ConfigureAwait(false);
                return;
            }

            // 2) Label / TSPL / ZPL
            if (connection == "label" || profileKind == "label" || jobType == PrintJobTypes.ProductLabel)
            {
                await _label.RenderAsync(job, profile, ct).ConfigureAwait(false);
                return;
            }

            // 3) Bluetooth
            if (connection == "bluetooth" || profileKind == "bluetooth")
            {
                await _bluetooth.RenderAsync(job, profile, ct).ConfigureAwait(false);
                return;
            }

            // 4) Network ESC/POS
            if (connection == "network" || profileKind == "network" || connection == "tcp" || connection == "ip")
            {
                await _escPos.RenderAsync(job, profile, ct).ConfigureAwait(false);
                return;
            }

            // 5) System / HTML (default)
            await _html.RenderAsync(job, profile, ct).ConfigureAwait(false);
        }
        catch (NotSupportedException nse)
        {
            _log.LogError(nse, "Dispatcher: job={JobId} icin renderer NotSupported.", job.Id);
            throw;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Dispatcher: job={JobId} render hatasi (jobType={JobType}, connection={Conn}).",
                job.Id, job.JobType, connection);
            throw;
        }
    }
}
