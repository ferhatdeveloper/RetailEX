using QrPrintDesktop.Core.Config;

namespace QrPrintDesktop.Core.Engine;

public static class AgentLog
{
    private static readonly object Gate = new();

    public static event Action<string>? Message;

    public static void Write(string text)
    {
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {text}";
        Message?.Invoke(line);
        try
        {
            lock (Gate)
            {
                Directory.CreateDirectory(SettingsService.DefaultDirectory);
                File.AppendAllText(SettingsService.DefaultLogPath, line + Environment.NewLine);
            }
        }
        catch
        {
            // log yazılamazsa poll durmasın
        }
    }
}
