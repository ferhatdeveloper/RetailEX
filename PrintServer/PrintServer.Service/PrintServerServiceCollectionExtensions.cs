using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RetailEX.PrintServer.Core;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Core.Discovery;
using RetailEX.PrintServer.Core.PostgRest;
using RetailEX.PrintServer.Core.PrintQueue;
using RetailEX.PrintServer.Core.Rendering.EscPos;
using RetailEX.PrintServer.Core.Rendering.FastReport;
using RetailEX.PrintServer.Core.Rendering.Html;
using RetailEX.PrintServer.Core.Rendering.Label;
using RetailEX.PrintServer.Core.Rendering.Routing;

namespace RetailEX.PrintServer.Service;

/// <summary>
/// RetailEX PrintServer servis konteyner kayitlari.
/// Tek merkezden DI saglanir; Console / Service / Installer ayni kayitlari kullanir.
/// </summary>
public static class PrintServerServiceCollectionExtensions
{
    /// <summary>RetailEX PrintServer icin gerekli tum servisleri kaydeder.</summary>
    public static IServiceCollection AddRetailExPrintServer(this IServiceCollection services)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));

        // 1) Yazilabilir klasorleri garanti et.
        PrintServerPaths.EnsureDirectories();

        // 2) Yapilandirma — singleton; ilk acilista dosyadan okunur veya olusturulur.
        var cfg = PrintServerConfig.LoadOrCreateDefault(PrintServerPaths.DefaultConfigPath);
        services.AddSingleton(cfg);

        // 3) Config dosyasi degisiklik izleyicisi — file watcher ile 500ms debounce.
        services.AddSingleton<ReloadOnChangeConfigMonitor>();
        services.AddHostedService(sp => sp.GetRequiredService<ReloadOnChangeConfigMonitor>());

        // 4) Core servisleri (renderer'lar, discovery, dispatcher, tenant discovery).
        services.AddSingleton<PrinterDiscoveryService>();
        services.AddSingleton<RoutingResolver>();
        services.AddSingleton<EscPosNetworkRenderer>();
        services.AddSingleton<BluetoothEscPosRenderer>();
        services.AddSingleton<HtmlSystemRenderer>();
        services.AddSingleton<FastReportRenderer>();
        services.AddSingleton<LabelRenderer>();
        services.AddSingleton<PrintJobDispatcher>();
        services.AddSingleton<TenantDiscovery>();

        // 5) HttpClient + PostgRestClient — AddHttpClient ile DI yasar; lifetime singleton.
        services.AddHttpClient<PostgRestClient>();

        // 6) Background worker'lar.
        services.AddHostedService<PrintQueueConsumer>();
        services.AddHostedService<PrinterDiscoveryHostedService>();

        // 7) Loglama — Console + EventLog.
        services.AddLogging(b =>
        {
            b.AddConsole();
            b.AddEventLog(o =>
            {
                o.SourceName = ServiceConstants.EventLogSource;
                o.LogName = ServiceConstants.EventLogName;
            });
        });

        // 8) WorkerId'yi runtime'da garanti et.
        cfg.WorkerId = cfg.ResolveWorkerId();

        PrintServerLog.Info("RetailEX PrintServer DI kayitlari tamamlandi. WorkerId=" + cfg.WorkerId);
        return services;
    }
}