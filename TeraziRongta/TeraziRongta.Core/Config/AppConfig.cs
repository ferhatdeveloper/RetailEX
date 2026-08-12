using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using TeraziRongta.Core.Models;
using TeraziRongta.Core.Services;

namespace TeraziRongta.Core.Config
{
    public class AppConfig
    {
        public string ScaleIp { get; set; } = "192.168.1.100";
        public string ApiBaseUrl { get; set; } = "https://api.retailex.app";
        public string TenantCode { get; set; } = "";
        public string ApiToken { get; set; } = "";
        /// <summary>auto | none | bearer | apikey</summary>
        public string AuthMode { get; set; } = "none";
        public string ProductsPath { get; set; } = DefaultProductsPath;
        public int SyncIntervalMinutes { get; set; } = 5;
        public int LfCodeBase { get; set; } = 10000;
        public bool ClearBeforeSend { get; set; }
        public bool SendHotkeys { get; set; }
        public bool MergeExistingPlu { get; set; } = true;
        public string StoreCode { get; set; } = "";
        public string StoreName { get; set; } = "";
        public string ScaleId { get; set; } = "terazi-1";
        public bool AutoSyncEnabled { get; set; } = true;
        public bool SyncOnStartup { get; set; } = true;
        public string RlsHomePath { get; set; } = RongtaPaths.WritableRongtaDir;
        public string DefaultLabelScr { get; set; } = "retailex_logoluetiket.scr";
        public string LabelSlot { get; set; } = "D0";
        public bool SendLabelOnSync { get; set; }
        /// <summary>001, 002 ... RetailEX firma numarasi</summary>
        public string FirmNr { get; set; } = "001";
        /// <summary>01, 02 ... islem donemi (rapor/komut icin)</summary>
        public string PeriodNr { get; set; } = "01";
        public string FirmId { get; set; } = "";
        /// <summary>stores.id UUID</summary>
        public string StoreId { get; set; } = "";
        /// <summary>local_auto | central_command | hybrid</summary>
        public string SyncMode { get; set; } = "local_auto";
        public string AgentDeviceId { get; set; } = "";
        public int CommandPollIntervalSeconds { get; set; } = 30;
        public bool IncrementalSyncEnabled { get; set; } = true;
        /// <summary>Rongta PLU barkod tipi (kasap: 99).</summary>
        public int DefaultBarcodeType { get; set; } = 99;
        /// <summary>Barkoddaki departman kodu (kasap: 21).</summary>
        public int DefaultDepartment { get; set; } = 21;
        /// <summary>Custom barcode 99 format (ornek: IIIIIIWWWWW).</summary>
        public string Barcode99Format { get; set; } = "IIIIIIWWWWW";
        /// <summary>Barcode 99 agirlik ondalik basamagi (kasap: 3).</summary>
        public int Barcode99WeightDecimals { get; set; } = 3;
        /// <summary>Senkron oncesi SYSTEM.CFG (Decimal position=0) ve RLS ayarlarini teraziye gonder.</summary>
        public bool SendFunctionSetOnSync { get; set; } = true;
        /// <summary>Cihazda varsayilan fiyat ondalik konumu (2 ise 7500 -&gt; 75.00 gorunur).</summary>
        public int DevicePriceDecimalPosition { get; set; } = 2;
        /// <summary>Function-set basarisizsa PLU UnitPrice carpani uygula (7500 -&gt; 750000).</summary>
        public bool CompensateDevicePriceDecimal { get; set; } = true;
        /// <summary>UI dili: tr | en | ar | ku</summary>
        public string UiLanguage { get; set; } = "tr";
        public List<ScaleDeviceConfig> Scales { get; set; } = new List<ScaleDeviceConfig>();

        public ScalePluDefaults GetPluDefaults()
        {
            return new ScalePluDefaults
            {
                BarcodeType = DefaultBarcodeType > 0 ? DefaultBarcodeType : 99,
                Department = DefaultDepartment >= 0 ? DefaultDepartment : 21,
                Barcode99Format = string.IsNullOrWhiteSpace(Barcode99Format) ? "IIIIIIWWWWW" : Barcode99Format.Trim(),
                Barcode99WeightDecimals = Barcode99WeightDecimals >= 0 ? Barcode99WeightDecimals : 3,
            };
        }

        public string ResolveLabelScrPath(string overridePath = null)
        {
            return RlsResourceResolver.ResolveLabelScrPath(RlsHomePath, overridePath ?? DefaultLabelScr);
        }

        public const string DefaultProductsPath =
            "/rex_001_products?is_scale_product=eq.true&is_active=eq.true&unit=in.(Kilogram,KG,kg)"
            + "&select=id,code,name,barcode,unit,price,is_scale_product,plu_code,is_active,shelf_life_days,updated_at"
            + "&order=plu_code.asc.nullslast";

        public static string BuildProductsPath(string firmNr)
        {
            var firm = NormalizeFirmNr(firmNr);
            return "/rex_" + firm + "_products"
                + "?is_scale_product=eq.true&is_active=eq.true"
                + "&unit=in.(Kilogram,KG,kg)"
                + "&select=id,code,name,barcode,unit,price,is_scale_product,plu_code,is_active,firm_nr,shelf_life_days,updated_at"
                + "&order=plu_code.asc.nullslast";
        }

        public static string NormalizeFirmNr(string firmNr)
        {
            var digits = new string((firmNr ?? "001").Where(char.IsDigit).ToArray());
            if (string.IsNullOrEmpty(digits)) return "001";
            return digits.PadLeft(3, '0');
        }

        public static string NormalizePeriodNr(string periodNr)
        {
            var digits = new string((periodNr ?? "01").Where(char.IsDigit).ToArray());
            if (string.IsNullOrEmpty(digits)) return "01";
            return digits.PadLeft(2, '0');
        }

        public void RefreshProductsPathFromSelection()
        {
            ProductsPath = BuildProductsPath(FirmNr);
        }

        public string ResolveAgentDeviceId()
        {
            if (!string.IsNullOrWhiteSpace(AgentDeviceId)) return AgentDeviceId.Trim();
            AgentDeviceId = Environment.MachineName + "-terazi-agent";
            return AgentDeviceId;
        }

        public bool UsesLocalAutoSync()
        {
            var mode = (SyncMode ?? "local_auto").Trim().ToLowerInvariant();
            return mode == "local_auto" || mode == "hybrid";
        }

        public bool UsesCentralCommands()
        {
            var mode = (SyncMode ?? "local_auto").Trim().ToLowerInvariant();
            return mode == "central_command" || mode == "hybrid";
        }

        public bool ShouldRunAutoTimerSync()
        {
            return AutoSyncEnabled && UsesLocalAutoSync();
        }

        public static string DefaultConfigPath =>
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "RetailEX",
                "terazi-sync.json");

        public string ResolvedApiUrl()
        {
            var baseUrl = (ApiBaseUrl ?? "").Trim().TrimEnd('/');
            var tenant = (TenantCode ?? "").Trim().Trim('/');
            if (string.IsNullOrEmpty(baseUrl)) return "";
            if (string.IsNullOrEmpty(tenant)) return baseUrl;
            if (baseUrl.EndsWith("/" + tenant, StringComparison.OrdinalIgnoreCase)) return baseUrl;
            return baseUrl + "/" + tenant;
        }

        public static bool IsPlaceholderToken(string token)
        {
            var t = (token ?? "").Trim();
            if (string.IsNullOrEmpty(t)) return true;
            if (t.Equals("BURAYA_RETAIL_EX_JWT_TOKEN", StringComparison.OrdinalIgnoreCase)) return true;
            if (t.IndexOf("BURAYA", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            if (t.IndexOf("PLACEHOLDER", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            if (t.IndexOf("YOUR_", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            return false;
        }

        public bool IsReadyForAutoSync()
        {
            if (string.IsNullOrWhiteSpace(TenantCode) || GetActiveScales().Count == 0)
            {
                return false;
            }

            var mode = (AuthMode ?? "auto").Trim().ToLowerInvariant();
            if (mode == "none") return true;
            if (mode == "auto" && IsPlaceholderToken(ApiToken)) return true;
            return !string.IsNullOrWhiteSpace(ApiToken);
        }

        public IList<ScaleDeviceConfig> GetActiveScales()
        {
            var fromList = (Scales ?? new List<ScaleDeviceConfig>())
                .Where(s => s != null && s.Enabled && !string.IsNullOrWhiteSpace(s.IpAddress))
                .ToList();

            if (fromList.Count > 0) return fromList;

            if (!string.IsNullOrWhiteSpace(ScaleIp))
            {
                return new List<ScaleDeviceConfig>
                {
                    new ScaleDeviceConfig
                    {
                        Id = ScaleId ?? "terazi-1",
                        Name = "Varsayılan terazi",
                        IpAddress = ScaleIp.Trim(),
                        Enabled = true,
                    }
                };
            }

            return new List<ScaleDeviceConfig>();
        }

        public bool NormalizeLegacySettings()
        {
            var migrated = false;

            if (IsPlaceholderToken(ApiToken)
                && string.Equals(AuthMode, "auto", StringComparison.OrdinalIgnoreCase))
            {
                AuthMode = "none";
            }

            var path = (ProductsPath ?? "").Trim();
            if (NeedsProductsPathMigration(path))
            {
                RefreshProductsPathFromSelection();
                migrated = true;
            }

            if (string.IsNullOrWhiteSpace(FirmNr))
            {
                FirmNr = "001";
            }

            FirmNr = NormalizeFirmNr(FirmNr);
            PeriodNr = NormalizePeriodNr(PeriodNr);
            ResolveAgentDeviceId();

            if (MigrateRlsHomePath())
            {
                migrated = true;
            }

            var labelScr = (DefaultLabelScr ?? "").Trim();
            var labelFile = string.IsNullOrEmpty(labelScr)
                ? ""
                : Path.GetFileName(labelScr);
            if (string.IsNullOrEmpty(labelFile)
                || labelFile.Equals("rtlabel_en.scr", StringComparison.OrdinalIgnoreCase)
                || labelFile.Equals("des.scr", StringComparison.OrdinalIgnoreCase)
                || labelFile.Equals("logolu_tasarim.scr", StringComparison.OrdinalIgnoreCase)
                || labelFile.Equals("EN1_logo_OUT.scr", StringComparison.OrdinalIgnoreCase))
            {
                DefaultLabelScr = "retailex_logoluetiket.scr";
                migrated = true;
            }

            // 10 kg uzeri etiket barkodu icin: format/ondalik tutarli kalsin
            var fmt = (Barcode99Format ?? "").Trim();
            if (string.IsNullOrEmpty(fmt))
            {
                Barcode99Format = "IIIIIIWWWWW";
                migrated = true;
            }

            if (Barcode99WeightDecimals < 0 || Barcode99WeightDecimals > 5)
            {
                Barcode99WeightDecimals = 0;
                migrated = true;
            }

            return migrated;
        }

        private bool MigrateRlsHomePath()
        {
            var path = (RlsHomePath ?? "").Trim();
            if (!RongtaPaths.ShouldUseWritableHome(path))
            {
                return false;
            }

            RlsHomePath = RongtaPaths.WritableRongtaDir;
            return true;
        }

        private static bool NeedsProductsPathMigration(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return true;

            if (path.IndexOf("/items?", StringComparison.OrdinalIgnoreCase) >= 0
                || path.IndexOf("/products?", StringComparison.OrdinalIgnoreCase) >= 0
                || path.IndexOf("/materials?", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            if (path.IndexOf("_products", StringComparison.OrdinalIgnoreCase) < 0) return false;

            if (path.IndexOf("weighable=", StringComparison.OrdinalIgnoreCase) >= 0) return true;

            if (path.IndexOf("select=", StringComparison.OrdinalIgnoreCase) >= 0
                && (path.IndexOf("price", StringComparison.OrdinalIgnoreCase) < 0
                    || path.IndexOf("plu_code", StringComparison.OrdinalIgnoreCase) < 0
                    || path.IndexOf("shelf_life_days", StringComparison.OrdinalIgnoreCase) < 0))
            {
                return true;
            }

            return path.IndexOf("unit=in.(Kilogram,KG,kg,Gram", StringComparison.OrdinalIgnoreCase) >= 0
                || path.IndexOf("LT,Litre", StringComparison.OrdinalIgnoreCase) >= 0
                || path.IndexOf("Gram,G,gr", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        public void EnsureDefaultScale()
        {
            if (Scales == null) Scales = new List<ScaleDeviceConfig>();
            if (Scales.Count == 0 && !string.IsNullOrWhiteSpace(ScaleIp))
            {
                Scales.Add(new ScaleDeviceConfig
                {
                    Id = ScaleId ?? "terazi-1",
                    Name = "Terazi 1",
                    IpAddress = ScaleIp.Trim(),
                    Enabled = true,
                });
            }
        }

        public static AppConfig Load(string path = null)
        {
            path = path ?? DefaultConfigPath;
            if (!File.Exists(path))
            {
                var cfg = CreateDefault();
                cfg.Save(path);
                return cfg;
            }

            var json = File.ReadAllText(path);
            var cfg2 = JsonConvert.DeserializeObject<AppConfig>(json) ?? CreateDefault();
            cfg2.EnsureDefaultScale();
            if (cfg2.NormalizeLegacySettings())
            {
                cfg2.Save(path);
            }

            return cfg2;
        }

        public static AppConfig CreateDefault()
        {
            return new AppConfig
            {
                ScaleIp = "192.168.1.100",
                Scales = new List<ScaleDeviceConfig>
                {
                    new ScaleDeviceConfig
                    {
                        Id = "terazi-1",
                        Name = "test",
                        IpAddress = "192.168.1.100",
                        Enabled = true,
                    }
                }
            };
        }

        public void Save(string path = null)
        {
            path = path ?? DefaultConfigPath;
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            EnsureDefaultScale();
            if (Scales.Count > 0 && string.IsNullOrWhiteSpace(ScaleIp))
            {
                ScaleIp = Scales[0].IpAddress;
            }

            File.WriteAllText(path, JsonConvert.SerializeObject(this, Formatting.Indented));
        }
    }
}
