using System;
using System.Collections.Generic;
using System.IO;

namespace TeraziRongta.Core.Services
{
    public static class RlsResourceResolver
    {
        public const string DefaultRlsHome = @"C:\RLS1000";

        public static string ResolveRlsHome(string configuredPath)
        {
            var path = (configuredPath ?? "").Trim();
            if (!string.IsNullOrEmpty(path) && Directory.Exists(path))
            {
                return path;
            }

            if (Directory.Exists(DefaultRlsHome))
            {
                return DefaultRlsHome;
            }

            var bundled = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Rongta");
            if (Directory.Exists(bundled))
            {
                return bundled;
            }

            var projectBundled = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "Resources", "Rongta");
            projectBundled = Path.GetFullPath(projectBundled);
            return Directory.Exists(projectBundled) ? projectBundled : DefaultRlsHome;
        }

        public static string ResolveSystemCfgPath(string rlsHome)
        {
            rlsHome = ResolveRlsHome(rlsHome);
            var candidates = new[]
            {
                Path.Combine(rlsHome, "SYSTEM.CFG"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "SYSTEM.CFG"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Rongta", "SYSTEM.CFG"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "RetailEX", "SYSTEM.CFG"),
            };

            foreach (var path in candidates)
            {
                if (File.Exists(path)) return path;
            }

            return Path.Combine(rlsHome, "SYSTEM.CFG");
        }

        public static string ResolveBundledRongtaDir()
        {
            var bundled = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Rongta");
            return Directory.Exists(bundled) ? bundled : null;
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
            defaults.Add(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "des.scr"));
            defaults.Add(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "rtlabel_en.scr"));

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
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Rongta", "RTRLSLabel.exe"),
            };

            foreach (var path in candidates)
            {
                if (File.Exists(path)) return path;
            }

            return Path.Combine(home, "RTRLSLabel.exe");
        }
    }
}
