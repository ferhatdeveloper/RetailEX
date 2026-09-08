using Microsoft.Win32;

namespace QrPrintDesktop.Core.Windows;

public sealed class StartupManager
{
    private const string RegistryPath = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    private const string AppName = "RetailEX_QrPrint_UI";

    public bool IsEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RegistryPath, writable: false);
        var value = key?.GetValue(AppName)?.ToString();
        return !string.IsNullOrWhiteSpace(value);
    }

    public void SetEnabled(bool enabled, string executablePath)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RegistryPath, writable: true)
            ?? Registry.CurrentUser.CreateSubKey(RegistryPath, writable: true);

        if (key is null)
        {
            return;
        }

        if (!enabled)
        {
            key.DeleteValue(AppName, throwOnMissingValue: false);
            return;
        }

        key.SetValue(AppName, $"\"{executablePath}\"");
    }
}
