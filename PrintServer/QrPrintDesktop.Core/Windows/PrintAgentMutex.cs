namespace QrPrintDesktop.Core.Windows;

/// <summary>
/// Arayüz/tray kullanıcı oturumunda yazdırır. Servis aynı anda basmasın diye global kilit.
/// LocalSystem (Session 0) Local\ mutex'i göremez; bu yüzden Global\ kullanılır.
/// </summary>
public static class PrintAgentMutex
{
    public const string Name = @"Global\RetailEX.QrPrint.Agent";

    public static Mutex? TryAcquire()
    {
        var mutex = new Mutex(true, Name, out var created);
        if (created)
        {
            return mutex;
        }

        mutex.Dispose();
        return null;
    }

    public static bool IsHeldByUi()
    {
        try
        {
            if (Mutex.TryOpenExisting(Name, out var existing))
            {
                existing.Dispose();
                return true;
            }
        }
        catch (UnauthorizedAccessException)
        {
            return true;
        }
        catch
        {
            // kilit yok sayılır, servis taramaya devam eder
        }

        return false;
    }
}
