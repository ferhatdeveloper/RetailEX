using System;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using RetailEX.PrintServer.Core;
using RetailEX.PrintServer.Core.Config;

namespace RetailEX.PrintServer.Service;

/// <summary>
/// Windows servisini sc.exe uzerinden kurmak / kaldirmak / sorgulamak icin yardimci.
/// Bu sinif tasarim geregi (sc.exe cagirarak) elevated bir process gerektirir;
/// ayricalik yoksa <see cref="RunScAsync"/> hata koduyla geri doner.
/// </summary>
internal static class ServiceInstaller
{
    /// <summary>Servisi kurar ve baslatir. Cikis kodu sc.exe cikisidir.</summary>
    public static async Task<int> InstallAsync()
    {
        var exe = ResolveOwnExePath();
        if (string.IsNullOrEmpty(exe))
        {
            Console.Error.WriteLine("RetailEX_PrintServer.exe yolu cozumlenemedi.");
            PrintServerLog.Error("Install: exe yolu cozumlenemedi.");
            return 2;
        }

        Console.WriteLine("Servis kuruluyor: " + ServiceConstants.ServiceName);
        Console.WriteLine("Exe: " + exe);

        // 1) sc.exe create — binPath= ve start= auto; bosluk olmamali ("sc" kurali).
        var createArgs = string.Format(
            "create \"{0}\" binPath= \"{1}\" start= auto DisplayName= \"{2}\"",
            ServiceConstants.ServiceName,
            exe,
            ServiceConstants.DisplayName.Replace("\"", "\\\""));
        var createResult = await RunScAsync(createArgs, CancellationToken.None).ConfigureAwait(false);
        Console.WriteLine("[sc create] exit=" + createResult.ExitCode);
        Console.WriteLine(createResult.StandardOutput);
        if (createResult.StandardError.Length > 0) Console.Error.WriteLine(createResult.StandardError);
        if (createResult.ExitCode != 0)
        {
            PrintServerLog.Error("sc create basarisiz. Exit=" + createResult.ExitCode);
            return createResult.ExitCode;
        }

        // 2) description
        var descArgs = string.Format("description \"{0}\" \"{1}\"", ServiceConstants.ServiceName, ServiceConstants.Description.Replace("\"", "\\\""));
        var descResult = await RunScAsync(descArgs, CancellationToken.None).ConfigureAwait(false);
        Console.WriteLine("[sc description] exit=" + descResult.ExitCode);
        if (descResult.StandardError.Length > 0) Console.Error.WriteLine(descResult.StandardError);

        // 3) start
        var startArgs = string.Format("start \"{0}\"", ServiceConstants.ServiceName);
        var startResult = await RunScAsync(startArgs, CancellationToken.None).ConfigureAwait(false);
        Console.WriteLine("[sc start] exit=" + startResult.ExitCode);
        Console.WriteLine(startResult.StandardOutput);
        if (startResult.StandardError.Length > 0) Console.Error.WriteLine(startResult.StandardError);
        if (startResult.ExitCode != 0)
        {
            PrintServerLog.Error("sc start basarisiz. Exit=" + startResult.ExitCode);
            return startResult.ExitCode;
        }

        Console.WriteLine("Servis kuruldu ve baslatildi.");
        PrintServerLog.Info("RetailEX_PrintServer kuruldu ve baslatildi.");
        return 0;
    }

    /// <summary>Servisi durdurur ve siler. Cikis kodu sc.exe cikisidir.</summary>
    public static async Task<int> UninstallAsync()
    {
        Console.WriteLine("Servis kaldiriliyor: " + ServiceConstants.ServiceName);

        // 1) stop (yoksa hata kodu 1 doner ama delete yine calismali)
        var stopArgs = string.Format("stop \"{0}\"", ServiceConstants.ServiceName);
        var stopResult = await RunScAsync(stopArgs, CancellationToken.None).ConfigureAwait(false);
        Console.WriteLine("[sc stop] exit=" + stopResult.ExitCode);
        if (stopResult.StandardError.Length > 0) Console.Error.WriteLine(stopResult.StandardError);

        // 2) delete
        var deleteArgs = string.Format("delete \"{0}\"", ServiceConstants.ServiceName);
        var deleteResult = await RunScAsync(deleteArgs, CancellationToken.None).ConfigureAwait(false);
        Console.WriteLine("[sc delete] exit=" + deleteResult.ExitCode);
        Console.WriteLine(deleteResult.StandardOutput);
        if (deleteResult.StandardError.Length > 0) Console.Error.WriteLine(deleteResult.StandardError);
        if (deleteResult.ExitCode != 0)
        {
            PrintServerLog.Error("sc delete basarisiz. Exit=" + deleteResult.ExitCode);
            return deleteResult.ExitCode;
        }

        Console.WriteLine("Servis kaldirildi.");
        PrintServerLog.Info("RetailEX_PrintServer kaldirildi.");
        return 0;
    }

    /// <summary>Servis durumunu sorgular. sc query cikis kodu (0 = basarili).</summary>
    public static async Task<int> QueryStatusAsync()
    {
        Console.WriteLine("Servis durumu sorgulaniyor: " + ServiceConstants.ServiceName);
        var queryArgs = string.Format("query \"{0}\"", ServiceConstants.ServiceName);
        var result = await RunScAsync(queryArgs, CancellationToken.None).ConfigureAwait(false);
        Console.WriteLine(result.StandardOutput);
        if (result.StandardError.Length > 0) Console.Error.WriteLine(result.StandardError);
        Console.WriteLine("[sc query] exit=" + result.ExitCode);
        return result.ExitCode;
    }

    private static string ResolveOwnExePath()
    {
        try
        {
            // Environment.ProcessPath .NET 6+ ile .exe yolunu verir.
            var p = Environment.ProcessPath;
            if (!string.IsNullOrEmpty(p) && System.IO.File.Exists(p)) return p;
        }
        catch
        {
            // yok say
        }
        try
        {
            var assemblyLocation = typeof(ServiceInstaller).Assembly.Location;
            if (!string.IsNullOrEmpty(assemblyLocation)) return assemblyLocation;
        }
        catch
        {
            // yok say
        }
        return "";
    }

    /// <summary>sc.exe'yi Process ile calistirir, stdout/stderr/exit kodunu yakalar.</summary>
    private static async Task<ProcessResult> RunScAsync(string arguments, CancellationToken ct)
    {
        var result = new ProcessResult();
        var psi = new ProcessStartInfo
        {
            FileName = "sc.exe",
            Arguments = arguments,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        Process? proc = null;
        try
        {
            proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
            proc.Start();

            var stdoutTask = proc.StandardOutput.ReadToEndAsync();
            var stderrTask = proc.StandardError.ReadToEndAsync();
            await proc.WaitForExitAsync(ct).ConfigureAwait(false);
            result.StandardOutput = await stdoutTask.ConfigureAwait(false);
            result.StandardError = await stderrTask.ConfigureAwait(false);
            result.ExitCode = proc.ExitCode;
        }
        catch (Exception ex)
        {
            result.StandardError = "sc.exe calistirilamadi: " + ex.Message;
            result.ExitCode = -1;
        }
        finally
        {
            try { proc?.Dispose(); } catch { /* sessiz */ }
        }
        return result;
    }

    private sealed class ProcessResult
    {
        public int ExitCode { get; set; }
        public string StandardOutput { get; set; } = "";
        public string StandardError { get; set; } = "";
    }
}