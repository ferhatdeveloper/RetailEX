using System;
using System.Collections.Generic;
using System.IO;
using TeraziRongta.Core.Config;

namespace TeraziRongta.Core.Services
{
    public static class RlsResourceResolver
    {
        public const string DefaultRlsHome = @"C:\RLS1000";

        public static string ResolveRlsHome(string configuredPath)
        {
            return RongtaPaths.ResolveEffectiveRlsHome(configuredPath);
        }

        public static string ResolveSystemCfgPath(string rlsHome)
        {
            var home = ResolveRlsHome(rlsHome);
            RongtaPaths.EnsureWritableAssets();
            var writable = Path.Combine(home, "SYSTEM.CFG");
            if (File.Exists(writable))
            {
                return writable;
            }

            foreach (var source in RongtaPaths.EnumerateInstallSources("SYSTEM.CFG"))
            {
                if (File.Exists(source))
                {
                    return writable;
                }
            }

            return writable;
        }

        public static string ResolveBundledRongtaDir()
        {
            var installRongta = RongtaPaths.GetInstallRongtaDir();
            if (Directory.Exists(installRongta))
            {
                return installRongta;
            }

            var projectBundled = Path.Combine(
                RongtaPaths.GetInstallDir(),
                "..", "..", "..", "Resources", "Rongta");
            projectBundled = Path.GetFullPath(projectBundled);
            return Directory.Exists(projectBundled) ? projectBundled : null;
        }

        public static string ResolveLabelScrPath(string rlsHome, string configuredPath)
        {
            var custom = (configuredPath ?? "").Trim();
            var bundledDir = ResolveBundledRongtaDir();
            var rlsDir = ResolveRlsHome(rlsHome);

            if (!string.IsNullOrEmpty(custom))
            {
                if (File.Exists(custom)) return custom;

                var fileName = Path.GetFileName(custom);
                if (!string.IsNullOrEmpty(fileName))
                {
                    if (bundledDir != null)
                    {
                        var fromBundled = Path.Combine(bundledDir, fileName);
                        if (File.Exists(fromBundled)) return fromBundled;
                    }

                    var fromRls = Path.Combine(rlsDir, fileName);
                    if (File.Exists(fromRls)) return fromRls;
                }
            }

            var defaults = new List<string>();
            if (bundledDir != null)
            {
                defaults.Add(Path.Combine(bundledDir, "des.scr"));
            }

            defaults.Add(Path.Combine(rlsDir, "des.scr"));

            if (bundledDir != null)
            {
                defaults.Add(Path.Combine(bundledDir, "rtlabel_en.scr"));
            }

            defaults.Add(Path.Combine(rlsDir, "rtlabel_en.scr"));

            foreach (var path in defaults)
            {
                if (File.Exists(path)) return path;
            }

            if (bundledDir != null)
            {
                return Path.Combine(bundledDir, "des.scr");
            }

            return Path.Combine(rlsDir, "des.scr");
        }

        public static string ResolveLabelEditorExe(string rlsHome)
        {
            var home = ResolveRlsHome(rlsHome);
            var candidates = new[]
            {
                Path.Combine(home, "RTRLSLabel.exe"),
                Path.Combine(RongtaPaths.GetInstallRongtaDir(), "RTRLSLabel.exe"),
            };

            foreach (var path in candidates)
            {
                if (File.Exists(path)) return path;
            }

            return Path.Combine(home, "RTRLSLabel.exe");
        }
    }
}
