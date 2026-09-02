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
        ApplicationConfiguration.Initialize();

        using var mutex = AcquireSingleInstanceMutex();
        if (mutex is null)
        {
            MessageBox.Show(
                "RetailEX FastReport Designer zaten çalışıyor.",
                "RetailEX Designer",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
            DesignerLog.Fatal("UnhandledException", args.ExceptionObject as Exception);
        Application.ThreadException += (_, args) =>
            DesignerLog.Error("ThreadException", args.Exception);

        try
        {
            Application.Run(new MainForm());
        }
        catch (Exception ex)
        {
            DesignerLog.Fatal("StartupFailed", ex);
            MessageBox.Show(
                $"Designer başlatılamadı:\n\n{ex.Message}",
                "RetailEX Designer",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
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
