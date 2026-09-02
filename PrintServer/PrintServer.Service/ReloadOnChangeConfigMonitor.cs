using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RetailEX.PrintServer.Core;
using RetailEX.PrintServer.Core.Config;

namespace RetailEX.PrintServer.Service;

/// <summary>
/// print-server.json dosyasi degistiginde <see cref="PrintServerConfig.Reload"/> tetikler.
/// 500 ms'lik debounce ile coklu Changed event'larini tek seferde birlestirir.
/// </summary>
public sealed class ReloadOnChangeConfigMonitor : BackgroundService
{
    private static readonly TimeSpan Debounce = TimeSpan.FromMilliseconds(500);

    private readonly PrintServerConfig _cfg;
    private readonly ILogger<ReloadOnChangeConfigMonitor> _log;
    private FileSystemWatcher? _watcher;

    public ReloadOnChangeConfigMonitor(PrintServerConfig cfg, ILogger<ReloadOnChangeConfigMonitor> log)
    {
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var path = PrintServerPaths.DefaultConfigPath;
        var dir = Path.GetDirectoryName(path);
        var file = Path.GetFileName(path);
        if (string.IsNullOrEmpty(dir) || string.IsNullOrEmpty(file))
        {
            _log.LogWarning("ConfigMonitor: gecersiz yol. izleyici kurulmadi. Path={Path}", path);
            return Task.CompletedTask;
        }

        try
        {
            PrintServerPaths.EnsureDirectory(dir);

            _watcher = new FileSystemWatcher(dir, file)
            {
                NotifyFilter = NotifyFilters.LastWrite
                              | NotifyFilters.FileName
                              | NotifyFilters.Size
                              | NotifyFilters.CreationTime,
                EnableRaisingEvents = true,
                IncludeSubdirectories = false,
            };

            _watcher.Changed += OnChanged;
            _watcher.Created += OnChanged;
            _watcher.Renamed += OnChanged;
            _watcher.Error += OnWatcherError;

            _log.LogInformation("ConfigMonitor izlemeye basladi: {Path}", path);
            PrintServerLog.Info("ConfigMonitor izlemeye basladi: " + path);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "ConfigMonitor kurulumu basarisiz.");
            PrintServerLog.Error("ConfigMonitor kurulumu basarisiz.", ex);
        }

        // BackgroundService canli kalsin; FileSystemWatcher tetiklendikce Reload cagiriyoruz.
        return Task.Delay(Timeout.Infinite, stoppingToken)
            .ContinueWith(_ => { }, TaskScheduler.Default);
    }

    private DateTime _lastChange = DateTime.MinValue;
    private readonly object _debounceLock = new();

    private void OnChanged(object sender, FileSystemEventArgs e)
    {
        lock (_debounceLock)
        {
            // 500ms debounce — son tetiklemeyi tut, eskileri yut.
            _lastChange = DateTime.UtcNow;
        }
        Task.Delay(Debounce).ContinueWith(_ =>
        {
            lock (_debounceLock)
            {
                if (DateTime.UtcNow - _lastChange < Debounce) return; // daha yeni bir olay var
            }
            try
            {
                _cfg.Reload();
                _log.LogInformation("Yapilandirma yeniden yuklendi");
                PrintServerLog.Info("Yapilandirma yeniden yuklendi: " + PrintServerPaths.DefaultConfigPath);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Yapilandirma yeniden yuklenemedi");
                PrintServerLog.Error("Yapilandirma yeniden yuklenemedi.", ex);
            }
        }, TaskScheduler.Default);
    }

    private void OnWatcherError(object sender, ErrorEventArgs e)
    {
        _log.LogWarning(e.GetException(), "ConfigMonitor: FileSystemWatcher hatasi");
        PrintServerLog.Error("ConfigMonitor: FileSystemWatcher hatasi.", e.GetException());
    }

    public override void Dispose()
    {
        try
        {
            if (_watcher != null)
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Dispose();
                _watcher = null;
            }
        }
        catch { /* sessiz */ }
        base.Dispose();
    }
}