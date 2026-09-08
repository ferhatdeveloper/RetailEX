using QrPrintDesktop.Core.Assets;
using QrPrintDesktop.Core.Config;
using QrPrintDesktop.Core.Engine;
using QrPrintDesktop.Core.Printing;
using QrPrintDesktop.Core.Windows;

namespace QrPrintDesktop.App;

static class Program
{
    [STAThread]
    static void Main()
    {
        FastReportThemeFix.Install();
        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => ShowFatal(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            ShowFatal(e.ExceptionObject as Exception ?? new Exception(Convert.ToString(e.ExceptionObject)));
        };

        using var mutex = PrintAgentMutex.TryAcquire();
        if (mutex is null)
        {
            MessageBox.Show(
                "RetailEX Printer zaten çalışıyor (pencere veya tepsi).",
                "RetailEX Printer",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        try
        {
            var settingsService = new SettingsService();
            var assets = new AssetBootstrapper();
            var engine = new PrintAgentEngine(settingsService);
            try
            {
                assets.EnsureCustomSounds(engine.Settings);
            }
            catch
            {
                // Program Files yazılamaz; sesler ProgramData altına veya beep'e düşer
            }

            try
            {
                assets.EnsureAppIcon();
            }
            catch
            {
                // ikon yoksa sistem ikonu kullanılır
            }
            var startup = new StartupManager();
            Application.Run(new MainForm(engine, settingsService, startup, assets));
        }
        catch (Exception ex)
        {
            ShowFatal(ex);
        }
    }

    static void ShowFatal(Exception? ex)
    {
        try
        {
            var msg = ex is null ? "Bilinmeyen hata" : (ex.InnerException ?? ex).ToString();
            MessageBox.Show(
                "RetailEX Printer başlatılamadı:\n\n" + msg,
                "RetailEX Printer",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
        catch
        {
            // UI yoksa sessizce çık
        }
    }
}
