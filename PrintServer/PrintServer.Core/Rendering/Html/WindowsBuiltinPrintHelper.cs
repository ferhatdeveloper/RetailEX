using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace RetailEX.PrintServer.Core.Rendering.Html;

/// <summary>
/// HTML dosyasini Windows'un yerlesik ShellExecute "print" verb'i ile veya
/// Chrome/Sumatra headless ile yaziciya gonderen yardimci metodlar.
/// </summary>
public static class WindowsBuiltinPrintHelper
{
    /// <summary>
    /// Windows Shell "print" verb ile HTML dosyasini yaziciya gonderir.
    /// Varsayilan yazici kullanilir.
    /// </summary>
    public static void PrintHtmlViaStartVerb(string htmlPath)
    {
        if (string.IsNullOrWhiteSpace(htmlPath)) throw new ArgumentException("htmlPath bos", nameof(htmlPath));
        if (!File.Exists(htmlPath)) throw new FileNotFoundException("HTML dosyasi bulunamadi.", htmlPath);

        var psi = new ProcessStartInfo
        {
            FileName = htmlPath,
            Verb = "print",
            UseShellExecute = true,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        using var p = Process.Start(psi);
        // Islem baslar baslamaz geri doner; bekleme yapma
        p?.Dispose();
    }

    /// <summary>
    /// Headless Chrome ile HTML'yi once PDF'e, sonra PDF'i belirtilen yaziciya gonderir.
    /// </summary>
    public static async Task PrintHtmlViaChromeAsync(
        string htmlPath,
        string chromePath,
        string printerName,
        ILogger? log,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(htmlPath)) throw new ArgumentException("htmlPath bos", nameof(htmlPath));
        if (string.IsNullOrWhiteSpace(chromePath)) throw new ArgumentException("chromePath bos", nameof(chromePath));
        if (!File.Exists(htmlPath)) throw new FileNotFoundException("HTML dosyasi bulunamadi.", htmlPath);
        if (!File.Exists(chromePath)) throw new FileNotFoundException("chrome.exe bulunamadi.", chromePath);

        var pdfPath = Path.Combine(
            Path.GetTempPath(),
            $"print_{Guid.NewGuid():N}.pdf");

        var pdfArgs = $"--headless --no-sandbox --disable-gpu --print-to-pdf=\"{pdfPath}\" \"{htmlPath}\"";
        await RunChromeAsync(chromePath, pdfArgs, log, ct).ConfigureAwait(false);

        if (!File.Exists(pdfPath))
        {
            throw new InvalidOperationException("Chrome --print-to-pdf cikti uretmedi.");
        }

        var printArgs = $"--headless --no-sandbox --disable-gpu --print-to-printer=\"{printerName}\" \"{pdfPath}\"";
        await RunChromeAsync(chromePath, printArgs, log, ct).ConfigureAwait(false);

        try { File.Delete(pdfPath); } catch { /* sessiz */ }
    }

    /// <summary>
    /// Tarayici (chrome veya edge) ile dogrudan yaziciya gonderir.
    /// </summary>
    public static async Task PrintHtmlViaBrowserAsync(
        string htmlPath,
        string browserPath,
        string printerName,
        ILogger? log,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(htmlPath)) throw new ArgumentException("htmlPath bos", nameof(htmlPath));
        if (string.IsNullOrWhiteSpace(browserPath)) throw new ArgumentException("browserPath bos", nameof(browserPath));
        if (!File.Exists(htmlPath)) throw new FileNotFoundException("HTML dosyasi bulunamadi.", htmlPath);
        if (!File.Exists(browserPath)) throw new FileNotFoundException("browser exe bulunamadi.", browserPath);

        var args = $"--headless --no-sandbox --disable-gpu --print-to-printer=\"{printerName}\" \"{htmlPath}\"";
        await RunChromeAsync(browserPath, args, log, ct).ConfigureAwait(false);
    }

    private static async Task RunChromeAsync(string exe, string args, ILogger? log, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = args,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        using var p = Process.Start(psi);
        if (p == null)
        {
            throw new InvalidOperationException($"Browser baslatilamadi: {exe}");
        }
        try
        {
            await p.WaitForExitAsync(ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            try { if (!p.HasExited) p.Kill(); } catch { /* sessiz */ }
            throw;
        }
        if (p.ExitCode != 0 && log != null)
        {
            log.LogWarning("Browser exit code {Code} ({Exe} {Args})", p.ExitCode, exe, args);
        }
    }
}
