using System;
using System.Threading;
using System.Windows.Forms;
using RetailEX.PrintServer.Designer.Forms;
using RetailEX.PrintServer.Designer.Logging;

namespace RetailEX.PrintServer.Designer;

internal static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        // Erken log: hata olmadan once baslangic noktasini kaydet
        DesignerLog.Info("Program.Main basladi, args=" + string.Join(" ", args));

        try
        {
            ApplicationConfiguration.Initialize();
        }
        catch (Exception ex)
        {
            ShowFatal("ApplicationConfiguration.Initialize", ex);
            return;
        }

        using var mutex = AcquireSingleInstanceMutex();
        if (mutex is null)
        {
            DesignerLog.Info("Baska bir Designer ornegi calisiyor, cikiliyor.");
            MessageBox.Show(
                "RetailEX FastReport Designer zaten çalışıyor.",
                "RetailEX Designer",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }
        DesignerLog.Info("SingleInstance mutex alindi, MainForm olusturuluyor.");

        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
            ShowFatal("UnhandledException", args.ExceptionObject as Exception);
        Application.ThreadException += (_, args) =>
            ShowFatal("ThreadException", args.Exception);

        try
        {
            Application.Run(new MainForm());
        }
        catch (Exception ex)
        {
            ShowFatal("StartupFailed", ex);
        }
    }

    private static void ShowFatal(string source, Exception? ex)
    {
        DesignerLog.Fatal(source, ex);
        var logDir = DesignerLog.LogDirectory;
        var msg = $"Designer başlatılamadı ({source}).\n\n" +
                  $"{(ex is null ? "Bilinmeyen hata" : ex.GetType().Name + ": " + ex.Message)}\n\n" +
                  $"Detaylar log dosyasinda:\n{logDir}";
        MessageBox.Show(
            msg,
            "RetailEX Designer",
            MessageBoxButtons.OK,
            MessageBoxIcon.Error);
    }

    /// <summary>
    /// Aynı anda yalnız bir designer instance çalışsın; ikinci açılış sessizce iptal olur.
    /// </summary>
    private static Mutex? AcquireSingleInstanceMutex()
    {
        const string mutexName = "Global\\RetailEX.PrintServer.Designer.SingleInstance";
        var mutex = new Mutex(initiallyOwned: true, mutexName, out var createdNew);
        return createdNew ? mutex : null;
    }
}
