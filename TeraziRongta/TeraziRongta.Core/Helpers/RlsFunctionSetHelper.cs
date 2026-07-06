using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TeraziRongta.Core.Config;
using TeraziRongta.Core.Services;

namespace TeraziRongta.Core.Helpers
{
    /// <summary>
    /// RLS1000 olmadan function-set dosyalarini (SYSTEM.CFG, testRT.RLS) hazirlar.
    /// </summary>
    public static class RlsFunctionSetHelper
    {
        public static readonly string[] RlsFileNames = { "testRT.RLS", "rtscale.RLS" };

        public static string EnsureAssets(AppConfig config)
        {
            var rlsHome = RlsResourceResolver.ResolveRlsHome(config?.RlsHomePath);
            if (!Directory.Exists(rlsHome))
            {
                Directory.CreateDirectory(rlsHome);
            }

            CopyBundledIfMissing("SYSTEM.CFG", rlsHome);
            foreach (var name in RlsFileNames)
            {
                CopyBundledIfMissing(name, rlsHome);
            }

            return rlsHome;
        }

        public static IList<string> ResolveRlsCandidates(AppConfig config)
        {
            var rlsHome = EnsureAssets(config);
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var list = new List<string>();

            void Add(string path)
            {
                if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return;
                var full = Path.GetFullPath(path);
                if (seen.Add(full)) list.Add(full);
            }

            foreach (var name in RlsFileNames)
            {
                Add(Path.Combine(rlsHome, name));
            }

            var bundledDir = RlsResourceResolver.ResolveBundledRongtaDir();
            if (bundledDir != null)
            {
                foreach (var name in RlsFileNames)
                {
                    Add(Path.Combine(bundledDir, name));
                }
            }

            var outputDir = AppDomain.CurrentDomain.BaseDirectory;
            foreach (var name in RlsFileNames)
            {
                Add(Path.Combine(outputDir, name));
                Add(Path.Combine(outputDir, "Rongta", name));
            }

            return list;
        }

        private static void CopyBundledIfMissing(string fileName, string targetDir)
        {
            var target = Path.Combine(targetDir, fileName);
            if (File.Exists(target)) return;

            foreach (var source in EnumerateBundledSources(fileName))
            {
                if (!File.Exists(source)) continue;
                File.Copy(source, target, overwrite: false);
                return;
            }
        }

        private static IEnumerable<string> EnumerateBundledSources(string fileName)
        {
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            yield return Path.Combine(baseDir, fileName);
            yield return Path.Combine(baseDir, "Rongta", fileName);

            var projectBundled = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "Resources", "Rongta", fileName));
            yield return projectBundled;
        }
    }
}
