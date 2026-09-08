using System.ServiceProcess;

namespace QrPrintDesktop.Core.Windows;

public static class WindowsServiceHelper
{
    public const string ServiceName = "RetailEX_Printer";
    public const string LegacyServiceName = "RetailEX_QrPrint";
    public const string DisplayName = "RetailEX Printer Servisi";
    public const string ServiceExeFileName = "RetailEX_Printer_Service.exe";

    public static bool IsInstalled()
    {
        try
        {
            return ServiceController.GetServices().Any(s => IsKnownService(s.ServiceName));
        }
        catch
        {
            return false;
        }
    }

    public static bool IsRunning()
    {
        try
        {
            foreach (var name in KnownNames())
            {
                try
                {
                    using var sc = new ServiceController(name);
                    if (sc.Status is ServiceControllerStatus.Running or ServiceControllerStatus.StartPending)
                    {
                        return true;
                    }
                }
                catch
                {
                    // diğer ada bak
                }
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    public static string StatusText()
    {
        if (!IsInstalled())
        {
            return "Kurulu değil";
        }

        try
        {
            using var sc = new ServiceController(ResolveInstalledName());
            return sc.Status switch
            {
                ServiceControllerStatus.Running => "Çalışıyor",
                ServiceControllerStatus.Stopped => "Durduruldu",
                ServiceControllerStatus.StartPending => "Başlatılıyor",
                ServiceControllerStatus.StopPending => "Durduruluyor",
                _ => sc.Status.ToString()
            };
        }
        catch
        {
            return "Bilinmiyor";
        }
    }

    public static string? FindInstallScript()
    {
        foreach (var candidate in ScriptCandidates("install-service.ps1"))
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    public static string? FindServiceExe()
    {
        var exeDir = AppContext.BaseDirectory;
        var names = new[] { ServiceExeFileName, "RetailEX_QrPrint_Service.exe" };
        var folders = new[]
        {
            Path.Combine(exeDir, "Service"),
            exeDir,
            Path.GetFullPath(Path.Combine(exeDir, "..", "..", "..", "..", "QrPrintDesktop.Service", "bin", "Release", "net9.0-windows")),
            Path.GetFullPath(Path.Combine(exeDir, "..", "..", "..", "..", "QrPrintDesktop.Service", "bin", "Debug", "net9.0-windows"))
        };

        foreach (var folder in folders)
        {
            foreach (var name in names)
            {
                var exe = Path.Combine(folder, name);
                var dll = Path.ChangeExtension(exe, ".dll");
                if (File.Exists(exe) && File.Exists(dll))
                {
                    return exe;
                }
            }
        }

        return null;
    }

    private static IEnumerable<string> ScriptCandidates(string fileName)
    {
        var exeDir = AppContext.BaseDirectory;
        yield return Path.GetFullPath(Path.Combine(exeDir, "..", "..", "..", "..", "..", fileName));
        yield return Path.Combine(exeDir, fileName);
        yield return Path.Combine(exeDir, "Service", fileName);
        yield return Path.GetFullPath(Path.Combine(exeDir, "..", "..", "..", "..", fileName));
        yield return Path.Combine(@"C:\ProgramData\RetailEX\QrPrint", fileName);
    }

    private static IEnumerable<string> KnownNames()
    {
        yield return ServiceName;
        yield return LegacyServiceName;
    }

    private static bool IsKnownService(string name) =>
        KnownNames().Any(n => string.Equals(n, name, StringComparison.OrdinalIgnoreCase));

    private static string ResolveInstalledName()
    {
        foreach (var name in KnownNames())
        {
            try
            {
                using var sc = new ServiceController(name);
                _ = sc.Status;
                return name;
            }
            catch
            {
                // diğer ada bak
            }
        }

        return ServiceName;
    }
}
