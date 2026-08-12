using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using TeraziRongta.Core.Models;
using TeraziRongta.Core.Services;

namespace TeraziRongta.Core.Helpers
{
    public static class PluJsonMapper
    {
        public static JObject MapProductToPluJson(
            ScaleProductDto product,
            int rank,
            int lfCodeBase,
            byte labelId = 64,
            ScalePluDefaults defaults = null)
        {
            defaults = defaults ?? new ScalePluDefaults();
            var name = (product.Name ?? "").Trim();
            if (name.Length > 36) name = name.Substring(0, 36);

            var lfCode = product.LfCode > 0 ? product.LfCode : ResolveLfCode(product, rank, lfCodeBase);
            var code = (product.Barcode ?? product.PluCode ?? lfCode.ToString()).Trim();
            if (code.Length > 10) code = code.Substring(code.Length - 10);

            var barcodeType = product.BarcodeType > 0 ? product.BarcodeType : defaults.BarcodeType;
            var department = product.Department > 0 ? product.Department : defaults.Department;

            return new JObject
            {
                ["PluName"] = name,
                ["LFCode"] = lfCode,
                ["Code"] = code,
                ["BarCode"] = barcodeType,
                ["UnitPrice"] = ScalePriceHelper.ToUnitPrice(product.Price),
                ["WeightUnit"] = MapWeightUnit(product.Unit),
                ["Deptment"] = department,
                ["Tare"] = 0,
                ["ShlefTime"] = ClampShelfDays(product.ShelfLifeDays),
                ["PackageType"] = 0,
                ["PackageWeight"] = 0,
                ["Tolerance"] = 0,
                ["Message1"] = 0,
                ["Message2"] = 0,
                ["LabelId"] = labelId > 0 ? labelId : 64,
                ["Reserved2"] = 0,
                ["Rebate"] = 0,
                ["Account"] = 0,
                ["QtyUnit"] = 0,
            };
        }

        /// <summary>
        /// Terazide sabit paket agırlıgı (orn. 10 kg) varsa etiket barkodu o sinirin ustunde basılmaz.
        /// Kasap/tartımlı PLU icin her zaman serbest tartım (limit yok) zorlanır.
        /// </summary>
        public static void ClearPackageWeightLimit(JObject plu)
        {
            if (plu == null) return;
            plu["PackageType"] = 0;
            plu["PackageWeight"] = 0;
            plu["Tolerance"] = 0;
        }

        public static JObject MergePluForUpdate(JObject existing, JObject incoming)
        {
            if (existing == null) return incoming;
            if (incoming == null) return existing;

            var merged = (JObject)incoming.DeepClone();
            // UnitPrice, PluName, Code, BarCode, WeightUnit, Deptment: API/RetailEX gelen deger gecerli.
            // PackageType/PackageWeight/Tolerance cihazdan KORUNMAZ: terazide eski paket limiti
            // (ornegin 10 kg) kalirsa etiket barkodu 10 kg uzerinde basılmaz.
            // ShlefTime cihazdan korunmaz: RetailEX shelf_life_days / gelen API degeri gecerli.
            foreach (var field in new[]
            {
                "Tare",
                "Message1", "Message2", "LabelId", "Reserved2", "Rebate", "Account", "QtyUnit"
            })
            {
                if (existing[field] != null && existing[field].Type != JTokenType.Null)
                {
                    merged[field] = existing[field].DeepClone();
                }
            }

            if (existing["Code"] != null && incoming["Code"] == null)
            {
                merged["Code"] = existing["Code"].DeepClone();
            }

            ScalePriceHelper.SetUnitPrice(merged, ScalePriceHelper.ReadUnitPrice(incoming["UnitPrice"]));
            ClearPackageWeightLimit(merged);

            return merged;
        }

        public static JObject MapRecordToPluJson(JObject rec, int lfCodeBase)
        {
            if (rec == null) return new JObject();

            var name = (rec["name"] ?? rec["PluName"] ?? "").ToString();
            if (name.Length > 36) name = name.Substring(0, 36);

            var lfRaw = rec["lfCode"] ?? rec["LFCode"] ?? rec["pluCode"] ?? rec["plu_code"] ?? rec["rank"];
            var lfCode = 0;
            if (lfRaw != null) int.TryParse(lfRaw.ToString().Replace(" ", ""), out lfCode);
            if (lfCode <= 0) lfCode = 1;

            var code = (rec["Code"] ?? rec["goodsNo"] ?? lfCode.ToString()).ToString();
            if (code.Length > 10) code = code.Substring(code.Length - 10);

            double price = RetailExApiClient.ParsePrice(rec);

            int unitPriceValue;
            if (price <= 0 && rec["UnitPrice"] != null)
            {
                unitPriceValue = ScalePriceHelper.ReadUnitPrice(rec["UnitPrice"]);
            }
            else
            {
                unitPriceValue = ScalePriceHelper.ToUnitPrice(price);
            }

            return new JObject
            {
                ["PluName"] = name,
                ["LFCode"] = lfCode,
                ["Code"] = code,
                ["BarCode"] = ResolveInt(rec, "barcodeType", "BarCode", 99),
                ["UnitPrice"] = unitPriceValue,
                ["WeightUnit"] = ResolveWeightUnit(rec),
                ["Deptment"] = ResolveInt(rec, "department", "Deptment", ResolveInt(rec, "department_id", "departmentId", 21)),
                ["Tare"] = ResolveDouble(rec, "tareGrams", "Tare", 0),
                ["ShlefTime"] = ClampShelfDays(ResolveShelfDays(rec)),
                ["PackageType"] = ResolveInt(rec, "packageType", "PackageType", 0),
                ["PackageWeight"] = ResolveDouble(rec, "packageWeight", "PackageWeight", 0),
                ["Tolerance"] = ResolveInt(rec, "tolerance", "Tolerance", 0),
                ["Message1"] = ResolveInt(rec, "message1", "Message1", 0),
                ["Message2"] = ResolveByte(rec, "message2", "Message2", 0),
                ["LabelId"] = ResolveByte(rec, "labelId", "LabelId", 0),
                ["Reserved2"] = ResolveByte(rec, "reserved2", "Reserved2", 0),
                ["Rebate"] = ResolveByte(rec, "rebate", "Rebate", 0),
                ["Account"] = ResolveInt(rec, "account", "Account", 0),
                ["QtyUnit"] = ResolveInt(rec, "qtyUnit", "QtyUnit", 0),
            };
        }

        private static int ResolveLfCode(ScaleProductDto product, int rank, int lfCodeBase)
        {
            if (!string.IsNullOrWhiteSpace(product.PluCode))
            {
                var digits = new string(product.PluCode.Where(char.IsDigit).ToArray());
                if (digits.Length > 0 && digits.Length <= 6
                    && int.TryParse(digits, out var parsed) && parsed > 0)
                {
                    return parsed;
                }
            }

            return rank;
        }

        public static string NormalizeBarcode(string code)
        {
            return string.IsNullOrWhiteSpace(code) ? "" : code.Trim();
        }

        public static string GetPluBarcode(JObject plu)
        {
            if (plu == null) return "";
            return NormalizeBarcode((plu["Code"] ?? "").ToString());
        }

        public static IList<string> FindBarcodeNameConflicts(IEnumerable<ScalePluRecord> records)
        {
            if (records == null) return new List<string>();

            return records
                .Select(r => new { Barcode = NormalizeBarcode(r.Code), Name = (r.PluName ?? "").Trim() })
                .Where(x => x.Barcode.Length > 0)
                .GroupBy(x => x.Barcode, StringComparer.OrdinalIgnoreCase)
                .Where(g => g.Select(x => x.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() > 1)
                .Select(g =>
                {
                    var names = string.Join(" / ", g.Select(x => x.Name).Distinct(StringComparer.OrdinalIgnoreCase));
                    return "Barkod " + g.Key + ": " + names;
                })
                .ToList();
        }

        public static bool HasBarcodeNameConflict(JObject existing, JObject incoming)
        {
            if (existing == null || incoming == null) return false;

            var existingName = (existing["PluName"] ?? "").ToString().Trim();
            var incomingName = (incoming["PluName"] ?? "").ToString().Trim();
            if (existingName.Length == 0 || incomingName.Length == 0) return false;

            return !string.Equals(existingName, incomingName, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>Rongta ShlefTime 0-365; 0/eksik ise varsayilan 15 gun.</summary>
        public static int ClampShelfDays(int days)
        {
            if (days <= 0) return 15;
            if (days > 365) return 365;
            return days;
        }

        private static int ResolveShelfDays(JObject rec)
        {
            foreach (var key in new[] { "shelf_life_days", "shelfLifeDays", "shelfDays", "shelfLife", "ShlefTime" })
            {
                if (rec[key] != null && int.TryParse(rec[key].ToString(), out var v) && v > 0)
                {
                    return v;
                }
            }

            return 15;
        }

        private static int ResolveInt(JObject rec, string a, string b, int fallback)
        {
            if (rec[a] != null && int.TryParse(rec[a].ToString(), out var v)) return v;
            if (rec[b] != null && int.TryParse(rec[b].ToString(), out v)) return v;
            return fallback;
        }

        private static byte ResolveByte(JObject rec, string a, string b, byte fallback)
        {
            if (rec[a] != null && byte.TryParse(rec[a].ToString(), out var v)) return v;
            if (rec[b] != null && byte.TryParse(rec[b].ToString(), out v)) return v;
            return fallback;
        }

        private static double ResolveDouble(JObject rec, string a, string b, double fallback)
        {
            if (rec[a] != null && double.TryParse(rec[a].ToString(), out var v)) return v;
            if (rec[b] != null && double.TryParse(rec[b].ToString(), out v)) return v;
            return fallback;
        }

        private static int ResolveWeightUnit(JObject rec)
        {
            if (rec["WeightUnit"] != null && int.TryParse(rec["WeightUnit"].ToString(), out var n)) return n;
            return MapWeightUnit((rec["unit"] ?? "").ToString());
        }

        public static ScalePluRecord FromJObject(JObject obj, int pluOrder = 0)
        {
            if (obj == null) return new ScalePluRecord();
            var raw = (JObject)obj.DeepClone();
            ScalePriceHelper.NormalizePluUnitPrice(raw);
            return new ScalePluRecord
            {
                PluOrder = pluOrder,
                Raw = raw,
            };
        }

        public static JObject ToJObject(ScalePluRecord record)
        {
            if (record?.Raw == null) return new JObject();
            var clone = (JObject)record.Raw.DeepClone();
            ScalePriceHelper.NormalizePluUnitPrice(clone);
            return clone;
        }

        public static JObject CreateEmptyPluRecord(int lfCode, ScalePluDefaults defaults = null)
        {
            defaults = defaults ?? new ScalePluDefaults();
            return new JObject
            {
                ["PluName"] = "Yeni Urun",
                ["LFCode"] = lfCode,
                ["HotKey"] = lfCode,
                ["Code"] = lfCode.ToString(),
                ["BarCode"] = defaults.BarcodeType,
                ["UnitPrice"] = 0,
                ["WeightUnit"] = 4,
                ["Deptment"] = defaults.Department,
                ["Tare"] = 0,
                ["ShlefTime"] = 15,
                ["PackageType"] = 0,
                ["PackageWeight"] = 0,
                ["Tolerance"] = 0,
                ["Message1"] = 0,
                ["Message2"] = 0,
                ["LabelId"] = 64,
                ["Reserved2"] = 0,
                ["Rebate"] = 0,
                ["Account"] = 0,
                ["QtyUnit"] = 0,
            };
        }

        public static int MapWeightUnit(string unit)
        {
            if (string.IsNullOrEmpty(unit)) return 4;
            var u = unit.Trim().ToUpperInvariant();
            if (u == "KG" || u == "LT" || u == "L") return 4;
            if (u == "G" || u == "GR") return 1;
            if (u == "10G") return 2;
            if (u == "100G") return 3;
            if (u == "50G") return 0;
            if (u == "OZ") return 5;
            if (u == "LB") return 6;
            if (u == "500G") return 7;
            if (u == "600G") return 8;
            return 4;
        }
    }

    public static class HotkeyHelper
    {
        public const int TotalHotkeys = 224;
        public const int PackSize = 84;

        public static IList<int[]> BuildHotkeyTables(IList<int> lfCodes)
        {
            var table = new int[TotalHotkeys];
            for (var i = 0; i < TotalHotkeys; i++)
            {
                table[i] = i < lfCodes.Count ? lfCodes[i] : 0;
            }

            return new[]
            {
                Slice(table, 0, PackSize),
                Slice(table, PackSize, PackSize),
                Slice(table, PackSize * 2, TotalHotkeys - PackSize * 2),
            };
        }

        public static IList<int[]> BuildDemoHotkeyTables(int baseLfCode = 10001)
        {
            var lfCodes = new List<int>(TotalHotkeys);
            for (var i = 0; i < TotalHotkeys; i++) lfCodes.Add(baseLfCode + i);
            return BuildHotkeyTables(lfCodes);
        }

        private static int[] Slice(int[] source, int offset, int length)
        {
            var dest = new int[length];
            Array.Copy(source, offset, dest, 0, length);
            return dest;
        }
    }
}
