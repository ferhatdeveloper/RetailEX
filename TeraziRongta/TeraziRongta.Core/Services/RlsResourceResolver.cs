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

        public const string DefaultMegalLabelFileName = "retailex_logoluetiket.scr";

        public static string ResolveLabelScrPath(string rlsHome, string configuredPath)
        {
            RongtaPaths.EnsureWritableAssets();

            var custom = (configuredPath ?? "").Trim();
            var bundledDir = ResolveBundledRongtaDir();
            var rlsDir = ResolveRlsHome(rlsHome);
            var writableDir = RongtaPaths.GetWritableRongtaDir();

            if (!string.IsNullOrEmpty(custom))
            {
                if (File.Exists(custom)) return custom;

                var fileName = Path.GetFileName(custom);
                if (!string.IsNullOrEmpty(fileName))
                {
                    var fromWritable = Path.Combine(writableDir, fileName);
                    if (File.Exists(fromWritable)) return fromWritable;

                    if (bundledDir != null)
                    {
                        var fromBundled = Path.Combine(bundledDir, fileName);
                        if (File.Exists(fromBundled)) return fromBundled;
                    }

                    var fromRls = Path.Combine(rlsDir, fileName);
                    if (File.Exists(fromRls)) return fromRls;
                }
            }

            // Varsayilan: Megal logolu etiket (ProgramData -> kurulum -> RLS)
            var defaults = new List<string>
            {
                Path.Combine(writableDir, DefaultMegalLabelFileName),
            };
            if (bundledDir != null)
            {
                defaults.Add(Path.Combine(bundledDir, DefaultMegalLabelFileName));
                defaults.Add(Path.Combine(bundledDir, "EN1_logo_OUT.scr"));
                defaults.Add(Path.Combine(bundledDir, "des.scr"));
            }

            defaults.Add(Path.Combine(rlsDir, DefaultMegalLabelFileName));
            defaults.Add(Path.Combine(rlsDir, "EN1_logo_OUT.scr"));
            defaults.Add(Path.Combine(rlsDir, "des.scr"));

            foreach (var path in defaults)
            {
                if (File.Exists(path)) return path;
            }

            return Path.Combine(writableDir, DefaultMegalLabelFileName);
        }

        public static string ResolveLabelPreviewPngPath()
        {
            var candidates = new[]
            {
                Path.Combine(RongtaPaths.GetWritableRongtaDir(), "retailex_logoluetiket_onizleme.png"),
                Path.Combine(RongtaPaths.GetInstallRongtaDir(), "retailex_logoluetiket_onizleme.png"),
                Path.Combine(RongtaPaths.GetInstallDir(), "Rongta", "retailex_logoluetiket_onizleme.png"),
                Path.Combine(RongtaPaths.GetInstallDir(), "retailex_logoluetiket_onizleme.png"),
            };

            foreach (var path in candidates)
            {
                if (File.Exists(path)) return path;
            }

            var bundled = ResolveBundledRongtaDir();
            if (!string.IsNullOrEmpty(bundled))
            {
                var fromLabels = Path.Combine(bundled, "Labels", "retailex_logoluetiket_onizleme.png");
                if (File.Exists(fromLabels)) return fromLabels;
                var fromRoot = Path.Combine(bundled, "retailex_logoluetiket_onizleme.png");
                if (File.Exists(fromRoot)) return fromRoot;
            }

            return null;
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
