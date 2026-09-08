using QrPrintDesktop.Core.Assets;
using QrPrintDesktop.Core.Engine;
using QrPrintDesktop.Core.Windows;

namespace QrPrintDesktop.Service;

public sealed class PrintAgentWorker : BackgroundService
{
    private bool _skippedUiLogged;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var assets = new AssetBootstrapper();
        var engine = new PrintAgentEngine();
        assets.EnsureCustomSounds(engine.Settings);
        AgentLog.Write("Windows servisi başlatıldı — RetailEX Printer Servisi dinleniyor.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (PrintAgentMutex.IsHeldByUi())
                {
                    if (!_skippedUiLogged)
                    {
                        AgentLog.Write("Arayüz/tepsi yazdırıyor — servis tarama yapmıyor (çakışma yok).");
                        _skippedUiLogged = true;
                    }

                    await Task.Delay(TimeSpan.FromSeconds(Math.Max(2, engine.Settings.PollIntervalSeconds)), stoppingToken)
                        .ConfigureAwait(false);
                    continue;
                }

                _skippedUiLogged = false;
                engine.ReloadSettings();
                if (engine.Settings.OrdersEnabled)
                {
                    await engine.PollAsync(cancellationToken: stoppingToken).ConfigureAwait(false);
                }
                else
                {
                    AgentLog.Write("Sipariş alma kapalı — tarama atlandı.");
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                AgentLog.Write("Servis tarama hatası: " + ex.Message);
            }

            var delay = Math.Max(2, engine.Settings.PollIntervalSeconds);
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(delay), stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        AgentLog.Write("Windows servisi durduruldu.");
    }
}
