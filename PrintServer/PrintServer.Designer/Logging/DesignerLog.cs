using System;
using System.IO;
using System.Text;

namespace RetailEX.PrintServer.Designer.Logging;

/// <summary>
/// Basit dosya tabanlı loglayıcı.
/// %LocalAppData%\RetailEX\Designer\designer-{date}.log
/// PrintServer.Core.PrintServerLog ile aynı klasör hiyerarşisini kullanır.
/// </summary>
internal static class DesignerLog
{
    private static readonly object Sync = new();
    private static string? _logDirectory;

    public static void Info(string message) => Write("INFO", message, null);
    public static void Warn(string message, Exception? ex = null) => Write("WARN", message, ex);
    public static void Error(string message, Exception? ex = null) => Write("ERROR", message, ex);
    public static void Fatal(string message, Exception? ex = null) => Write("FATAL", message, ex);

    public static string LogDirectory
    {
        get
        {
            if (_logDirectory is not null) return _logDirectory;
            _logDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "RetailEX", "Designer");
            Directory.CreateDirectory(_logDirectory);
            return _logDirectory;
        }
    }

    private static void Write(string level, string message, Exception? ex)
    {
        try
        {
            var line = new StringBuilder()
                .Append(DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"))
                .Append(" [").Append(level).Append("] ")
                .Append(message);
            if (ex is not null)
            {
                line.Append(" | ").Append(ex.GetType().Name).Append(": ").Append(ex.Message);
            }
            line.AppendLine();

            lock (Sync)
            {
                var path = Path.Combine(LogDirectory, $"designer-{DateTime.Now:yyyyMMdd}.log");
                File.AppendAllText(path, line.ToString(), Encoding.UTF8);
            }
        }
        catch
        {
            // Log yazılamıyorsa sessizce geç; UI'ı boğma
        }
    }
}
