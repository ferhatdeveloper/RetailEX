using System;
using System.Collections.Generic;
using System.IO;

namespace TeraziRongta.Core.Config
{
    /// <summary>
    /// Kurulum klasoru (salt okunur) ile kullanici yazilabilir Rongta yapilandirma klasorunu ayirir.
    /// </summary>
    public static class RongtaPaths
    {
        public static readonly string[] ManagedFileNames =
        {
            "SYSTEM.CFG",
            "testRT.RLS",
            "rtscale.RLS",
            "retailex_logoluetiket.scr",
            "retailex_logoluetiket_onizleme.png",
            "EN1_logo_OUT.scr",
        };

        public static string ProgramDataRoot =>
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "RetailEX");

        public static string WritableRongtaDir =>
            Path.Combine(ProgramDataRoot, "Rongta");

        public static string GetInstallDir() =>
            AppDomain.CurrentDomain.BaseDirectory;

        public static string GetInstallRongtaDir()
        {
            var sub = Path.Combine(GetInstallDir(), "Rongta");
            return Directory.Exists(sub) ? sub : GetInstallDir();
        }

        public static string GetWritableRongtaDir()
        {
            EnsureDirectory(WritableRongtaDir);
            return WritableRongtaDir;
        }

        public static void EnsureDirectory(string dir)
        {
            if (string.IsNullOrWhiteSpace(dir)) return;
            if (!Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
        }

        public static bool IsRestrictedPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return false;

            var full = NormalizePath(path);
            if (string.Equals(full, NormalizePath(GetInstallDir()), StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var installRongta = NormalizePath(GetInstallRongtaDir());
            if (string.Equals(full, installRongta, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            foreach (var root in GetProgramFilesRoots())
            {
                if (full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        public static bool ShouldUseWritableHome(string configuredPath)
        {
            var trimmed = (configuredPath ?? "").Trim();
            if (string.IsNullOrEmpty(trimmed)) return true;
            if (IsRestrictedPath(trimmed)) return true;

            if (trimmed.Equals(@"C:\RLS1000", StringComparison.OrdinalIgnoreCase)
                && !Directory.Exists(trimmed))
            {
                return true;
            }

            return false;
        }

        public static string ResolveEffectiveRlsHome(string configuredPath)
        {
            var trimmed = (configuredPath ?? "").Trim();
            if (!string.IsNullOrEmpty(trimmed)
                && Directory.Exists(trimmed)
                && !IsRestrictedPath(trimmed))
            {
                return trimmed;
            }

            return GetWritableRongtaDir();
        }

        public static string EnsureWritableAssets(AppConfig config = null)
        {
            var writable = GetWritableRongtaDir();
            foreach (var fileName in ManagedFileNames)
            {
                SyncFromInstall(fileName, writable);
            }

            return writable;
        }

        public static string GetWritableSystemCfgPath(AppConfig config = null)
        {
            var home = EnsureWritableAssets(config);
            return Path.Combine(home, "SYSTEM.CFG");
        }

        public static IEnumerable<string> EnumerateInstallSources(string fileName)
        {
            var baseDir = GetInstallDir();
            yield return Path.Combine(baseDir, fileName);
            yield return Path.Combine(baseDir, "Rongta", fileName);

            var projectBundled = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "Resources", "Rongta", fileName));
            yield return projectBundled;
        }

        public static void SyncFromInstall(string fileName, string targetDir)
        {
            if (string.IsNullOrWhiteSpace(fileName) || string.IsNullOrWhiteSpace(targetDir))
            {
                return;
            }

            EnsureDirectory(targetDir);
            var target = Path.Combine(targetDir, fileName);

            foreach (var source in EnumerateInstallSources(fileName))
            {
                if (!File.Exists(source)) continue;

                if (!File.Exists(target))
                {
                    File.Copy(source, target, overwrite: false);
                    return;
                }

                if (File.GetLastWriteTimeUtc(source) > File.GetLastWriteTimeUtc(target))
                {
                    File.Copy(source, target, overwrite: true);
                }

                return;
            }
        }

        public static string FormatAccessDeniedMessage(string path, Exception ex = null)
        {
            var msg = "Rongta yapilandirma dosyasina yazilamadi: "
                + path
                + ". Uygulama kurulum klasorune (Program Files) yazamaz; dosyalar "
                + WritableRongtaDir
                + " altinda tutulur. Yonetici hakki gerekmez.";

            if (ex != null && !string.IsNullOrWhiteSpace(ex.Message))
            {
                msg += " (" + ex.Message + ")";
            }

            return msg;
        }

        private static string NormalizePath(string path)
        {
            try
            {
                return Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            }
            catch
            {
                return (path ?? "").Trim().TrimEnd('\\', '/');
            }
        }

        private static IEnumerable<string> GetProgramFilesRoots()
        {
            yield return NormalizePath(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles));
            yield return NormalizePath(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86));
        }
    }
}
