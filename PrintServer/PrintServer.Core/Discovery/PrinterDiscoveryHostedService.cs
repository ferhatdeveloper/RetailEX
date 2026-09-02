using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace RetailEX.PrintServer.Core.Discovery;

/// <summary>
/// Uygulama baslarken 1 kez yazici tarar, sonra 5 dakikada bir yeniden tarar.
/// Background olarak calisir; dispose ile iptal edilir.
/// </summary>
public sealed class PrinterDiscoveryHostedService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

    private readonly PrinterDiscoveryService _discovery;
    private readonly ILogger _log;

    public PrinterDiscoveryHostedService(PrinterDiscoveryService discovery, ILogger log)
    {
        _discovery = discovery ?? throw new ArgumentNullException(nameof(discovery));
        _log = log ?? throw new ArgumentNullException(nameof(log));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Baslangicta 1 sn bekle ki diger servislerin DI'si tamamlansin
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) { return; }

        // Ilk tarama
        try
        {
            var initial = await _discovery.RefreshAsync(stoppingToken).ConfigureAwait(false);
            _log.LogInformation("PrinterDiscoveryHostedService: ilk tarama tamamlandi ({Count} yazici).", initial.Count);
        }
        catch (OperationCanceledException) { return; }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "PrinterDiscoveryHostedService: ilk tarama basarisiz.");
        }

        // Periyodik tarama
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(Interval, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { break; }

            try
            {
                var fresh = await _discovery.RefreshAsync(stoppingToken).ConfigureAwait(false);
                _log.LogDebug("PrinterDiscoveryHostedService: periyodik tarama ({Count} yazici).", fresh.Count);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "PrinterDiscoveryHostedService: periyodik tarama basarisiz.");
            }
        }

        _log.LogInformation("PrinterDiscoveryHostedService: durduruldu.");
    }
}
