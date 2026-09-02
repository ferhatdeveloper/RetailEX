using System;
using System.IO;

namespace RetailEX.PrintServer.Core.Config;

/// <summary>
/// Print server dosya yollari — kurulum klasoru (salt okunur) ile kullanici yazilabilir
/// CommonApplicationData altindaki RetailEX\PrintServer klasorunu ayirir.
/// Desen: TeraziRongta / RongtaPaths.cs
/// </summary>
public static class PrintServerPaths
{
    /// <summary>ProgramData altindaki RetailEX kok klasoru.</summary>
    public static string ProgramDataRoot =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "RetailEX");

    /// <summary>Yazilabilir print-server yapilandirma klasoru.</summary>
    public static string PrintServerDir =>
        Path.Combine(ProgramDataRoot, "PrintServer");

    /// <summary>Varsayilan print-server.json yapilandirma dosyasi.</summary>
    public static string DefaultConfigPath =>
        Path.Combine(PrintServerDir, "print-server.json");

    /// <summary>Varsayilan print-server.log dosyasi (BOM'suz UTF-8).</summary>
    public static string DefaultLogPath =>
        Path.Combine(PrintServerDir, "print-server.log");

    /// <summary>Yazici tarama cache dosyasi (printer_scan_cache.json).</summary>
    public static string DefaultScanCachePath =>
        Path.Combine(PrintServerDir, "printer_scan_cache.json");

    /// <summary>Print-server dizinini olusturur (idempotent).</summary>
    public static void EnsureDirectories()
    {
        EnsureDirectory(PrintServerDir);
        EnsureDirectory(PrintServerDir);
    }

    /// <summary>Verilen dizini yoksa olusturur.</summary>
    public static void EnsureDirectory(string dir)
    {
        if (string.IsNullOrWhiteSpace(dir)) return;
        if (!Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }
    }

    /// <summary>Print-server yazilabilir kok klasorunu olusturup doner.</summary>
    public static string GetWritableRoot()
    {
        EnsureDirectories();
        return PrintServerDir;
    }
}