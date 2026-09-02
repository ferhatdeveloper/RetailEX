using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using RetailEX.PrintServer.Core;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Service;

namespace RetailEX.PrintServer.Service;

public static class Program
{
    /// <summary>
    /// Servis giris noktasi.
    /// Desteklenen argumanlar: --install, --uninstall, --console, --status, --help.
    /// </summary>
    public static async Task<int> Main(string[] args)
    {
        // Erken loglama icin dosya tabanli loglayiciyi hazirla.
        try
        {
            PrintServerPaths.EnsureDirectories();
        }
        catch
        {
            // Sessiz — servis ileride yeniden deneyecek.
        }

        var first = args.Length > 0 ? args[0].Trim().ToLowerInvariant() : "";

        switch (first)
        {
            case "--install":
            case "-i":
                PrintServerLog.Info("RetailEX PrintServer kurulum komutu calistiriliyor.");
                return await ServiceInstaller.InstallAsync().ConfigureAwait(false);

            case "--uninstall":
            case "-u":
                PrintServerLog.Info("RetailEX PrintServer kaldirma komutu calistiriliyor.");
                return await ServiceInstaller.UninstallAsync().ConfigureAwait(false);

            case "--status":
            case "-s":
                return await ServiceInstaller.QueryStatusAsync().ConfigureAwait(false);

            case "--help":
            case "-h":
            case "/?":
                PrintUsage();
                return 0;

            case "--console":
            case "-c":
                return await RunHostAsync(args, consoleMode: true).ConfigureAwait(false);

            default:
                return await RunHostAsync(args, consoleMode: false).ConfigureAwait(false);
        }
    }

    private static void PrintUsage()
    {
        Console.WriteLine("RetailEX PrintServer — Windows Servisi");
        Console.WriteLine();
        Console.WriteLine("Kullanim:");
        Console.WriteLine("  RetailEX_PrintServer.exe              Windows servisi olarak calistir (SCM tarafindan baslatildiginda)");
        Console.WriteLine("  RetailEX_PrintServer.exe --console    Konsol modunda calistir (gelistirme / test)");
        Console.WriteLine("  RetailEX_PrintServer.exe --install    Servisi kur ve baslat (yonetici gerekli)");
        Console.WriteLine("  RetailEX_PrintServer.exe --uninstall  Servisi durdur ve kaldir (yonetici gerekli)");
        Console.WriteLine("  RetailEX_PrintServer.exe --status     Servis durumunu goster");
        Console.WriteLine("  RetailEX_PrintServer.exe --help       Bu yardimi goster");
        Console.WriteLine();
        Console.WriteLine("Yapilandirma dosyasi: " + PrintServerPaths.DefaultConfigPath);
        Console.WriteLine("Log dosyasi:         " + PrintServerPaths.DefaultLogPath);
    }

    private static async Task<int> RunHostAsync(string[] args, bool consoleMode)
    {
        var builder = Host.CreateDefaultBuilder(args);

        if (consoleMode || !Environment.UserInteractive)
        {
            builder.UseWindowsService(options =>
            {
                options.ServiceName = ServiceConstants.ServiceName;
            });
        }
        else
        {
            // Kullanici etkilesimli bir konsol aciyorsa pencere basligini anlamli yap.
            try { Console.Title = "RetailEX Yazici Servisi (Konsol)"; } catch { /* sessiz */ }
        }

        builder.ConfigureServices((context, services) =>
        {
            services.AddRetailExPrintServer();
        });

        PrintServerLog.Info(consoleMode
            ? "RetailEX PrintServer konsol modunda baslatildi."
            : "RetailEX PrintServer servis olarak baslatildi.");

        await builder.RunConsoleAsync().ConfigureAwait(false);
        PrintServerLog.Info("RetailEX PrintServer durdu.");
        return 0;
    }
}