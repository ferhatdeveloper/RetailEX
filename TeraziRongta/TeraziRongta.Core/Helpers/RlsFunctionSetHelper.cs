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
            return RongtaPaths.EnsureWritableAssets(config);
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

            return list;
        }
    }
}
