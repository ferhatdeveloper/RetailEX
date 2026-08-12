using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using TeraziRongta.Core.Config;

namespace TeraziRongta.Core.Helpers
{
    public static class SystemCfgPatcher
    {
        private static readonly Dictionary<string, Func<AppConfig, string>> Patches =
            new Dictionary<string, Func<AppConfig, string>>(StringComparer.OrdinalIgnoreCase)
            {
                { "Barcode99", c => (c.Barcode99Format ?? "IIIIIIWWWWW").Trim() },
                { "weightDecimals99", c => Math.Max(0, Math.Min(5, c.Barcode99WeightDecimals)).ToString() },
                { "All%20PLU%20Barcode%20Type", c => Math.Max(0, Math.Min(99, c.DefaultBarcodeType)).ToString() },
                { "Barcode%20type", c => Math.Max(0, Math.Min(99, c.DefaultBarcodeType)).ToString() },
                { "Allow%20print%20zero%20weight", _ => "1" },
                // Sabit paket toleransi/limit etikette barkodu kesebilir; 0 = serbest tartim
                { "Package%20torlance", _ => "0" },
                { "Decimal%20position", _ => "0" },
                { "Total%20price%20precision", _ => "0" },
                { "Download%20Function%20Set", _ => "true" },
            };

        private static readonly Dictionary<string, string> SettingSectionPatches =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "DecimalDigits", "0" },
            };

        public static string ApplyToRlsHome(AppConfig config)
        {
            var cfgPath = RongtaPaths.GetWritableSystemCfgPath(config);
            ApplyFile(cfgPath, config);
            return cfgPath;
        }

        public static void ApplyFile(string cfgPath, AppConfig config)
        {
            if (config == null || string.IsNullOrWhiteSpace(cfgPath))
            {
                return;
            }

            if (RongtaPaths.IsRestrictedPath(cfgPath))
            {
                throw new IOException(RongtaPaths.FormatAccessDeniedMessage(cfgPath));
            }

            if (!File.Exists(cfgPath))
            {
                RongtaPaths.EnsureWritableAssets(config);
                if (!File.Exists(cfgPath))
                {
                    return;
                }
            }

            var lines = new List<string>(File.ReadAllLines(cfgPath, Encoding.UTF8));
            var touched = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            for (var i = 0; i < lines.Count; i++)
            {
                var line = lines[i];
                var eq = line.IndexOf('=');
                if (eq <= 0) continue;

                var key = line.Substring(0, eq).Trim();
                if (!Patches.TryGetValue(key, out var resolver)) continue;

                lines[i] = key + "=" + resolver(config);
                touched.Add(key);
            }

            EnsureSettingSection(lines);

            try
            {
                File.WriteAllLines(cfgPath, lines, Encoding.UTF8);
            }
            catch (UnauthorizedAccessException ex)
            {
                throw new IOException(RongtaPaths.FormatAccessDeniedMessage(cfgPath, ex), ex);
            }
            catch (DirectoryNotFoundException ex)
            {
                throw new IOException(RongtaPaths.FormatAccessDeniedMessage(cfgPath, ex), ex);
            }
        }

        private static void EnsureSettingSection(IList<string> lines)
        {
            var settingStart = -1;
            var nextSection = lines.Count;

            for (var i = 0; i < lines.Count; i++)
            {
                var trimmed = lines[i].Trim();
                if (!trimmed.StartsWith("[", StringComparison.Ordinal)) continue;

                if (settingStart < 0
                    && trimmed.Equals("[Setting]", StringComparison.OrdinalIgnoreCase))
                {
                    settingStart = i;
                    continue;
                }

                if (settingStart >= 0 && i > settingStart)
                {
                    nextSection = i;
                    break;
                }
            }

            if (settingStart < 0)
            {
                if (lines.Count > 0 && !string.IsNullOrWhiteSpace(lines[lines.Count - 1]))
                {
                    lines.Add("");
                }

                settingStart = lines.Count;
                lines.Add("[Setting]");
                nextSection = lines.Count;
            }

            var existingKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (var i = settingStart + 1; i < nextSection; i++)
            {
                var line = lines[i];
                var eq = line.IndexOf('=');
                if (eq <= 0) continue;

                var key = line.Substring(0, eq).Trim();
                if (!SettingSectionPatches.TryGetValue(key, out var value)) continue;

                lines[i] = key + "=" + value;
                existingKeys.Add(key);
            }

            var insertAt = nextSection;
            foreach (var patch in SettingSectionPatches)
            {
                if (existingKeys.Contains(patch.Key)) continue;
                lines.Insert(insertAt++, patch.Key + "=" + patch.Value);
            }
        }
    }
}
