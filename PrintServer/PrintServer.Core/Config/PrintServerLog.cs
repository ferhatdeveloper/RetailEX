using System;
using System.Globalization;
using System.IO;
using System.Text;
using RetailEX.PrintServer.Core.Config;

namespace RetailEX.PrintServer.Core;

/// <summary>
/// Print-server icin dosya tabanli basit loglayici.
/// Format: [2026-09-02 18:34:12] [INFO] mesaj — UTF-8 BOM'suz, lock ile thread-safe.
/// EventLog sadece Windows'ta denenir; olusturulamazsa sessizce dosyaya yazmaya devam eder.
/// </summary>
public static class PrintServerLog
{
    private static readonly object Sync = new();
    private static bool _eventLogProbed;
    private static bool _eventLogAvailable;

    /// <summary>Log dosyasinin tam yolu (PrintServerPaths.DefaultLogPath).</summary>
    public static string LogPath => PrintServerPaths.DefaultLogPath;

    public static void Info(string msg) => Write("INFO", msg, null);
    public static void Warn(string msg) => Write("WARN", msg, null);
    public static void Error(string msg, Exception? ex = null) => Write("ERROR", msg, ex);

    private static void Write(string level, string msg, Exception? ex)
    {
        var line = FormatLine(level, msg, ex);

        lock (Sync)
        {
            try
            {
                PrintServerPaths.EnsureDirectory(Path.GetDirectoryName(LogPath) ?? ".");
                // UTF-8 BOM'suz
                using var fs = new FileStream(LogPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                var bytes = Encoding.UTF8.GetBytes(line);
                fs.Write(bytes, 0, bytes.Length);
            }
            catch
            {
                // log yazimi basarisiz — sessizce yut (servis calismaya devam etsin)
            }

            TryWriteEventLog(level, msg, ex);
        }
    }

    private static string FormatLine(string level, string msg, Exception? ex)
    {
        var ts = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
        var builder = new StringBuilder(128);
        builder.Append('[').Append(ts).Append("] [").Append(level).Append("] ").Append(msg ?? "");
        if (ex != null)
        {
            builder.Append(" | ").Append(ex.GetType().Name).Append(": ").Append(ex.Message);
            if (ex.StackTrace != null)
            {
                builder.Append(" -> ").Append(ex.StackTrace);
            }
        }
        builder.Append(Environment.NewLine);
        return builder.ToString();
    }

    private static void TryWriteEventLog(string level, string msg, Exception? ex)
    {
        if (!_eventLogProbed)
        {
            _eventLogProbed = true;
            _eventLogAvailable = DetectEventLogSupport();
        }

        if (!_eventLogAvailable) return;

        // EventLog yazimi Service katmaninda Microsoft.Extensions.Logging.EventLog ile yapilir.
        // Core katmaninda sadece dosyaya yaziyoruz (cross-platform).
    }

    private static bool DetectEventLogSupport() => false;
}