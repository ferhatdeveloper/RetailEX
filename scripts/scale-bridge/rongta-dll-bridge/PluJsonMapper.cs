using System;
using Newtonsoft.Json.Linq;

namespace RetailEX.RongtaDllBridge
{
    /// <summary>
    /// TeraziRongta Form1.DownloadpluByJson1 — Pludata Newtonsoft serileştirmesi ile uyumlu.
    /// </summary>
    internal static class PluJsonMapper
    {
        public static JObject MapRecordToPluJson(JObject rec)
        {
            if (rec == null) return new JObject();

            var name = (rec["name"] ?? rec["PluName"] ?? "").ToString();
            if (name.Length > 36) name = name.Substring(0, 36);

            var lfRaw = rec["lfCode"] ?? rec["LFCode"] ?? rec["pluCode"] ?? rec["rank"];
            int lfCode = 0;
            if (lfRaw != null)
            {
                int.TryParse(lfRaw.ToString().Replace(" ", ""), out lfCode);
            }
            if (lfCode <= 0) lfCode = 1;

            var code = (rec["Code"] ?? rec["goodsNo"] ?? lfCode.ToString()).ToString();
            if (code.Length > 10) code = code.Substring(code.Length - 10);

            int unitPrice = ResolveUnitPrice(rec);

            return new JObject
            {
                ["PluName"] = name,
                ["LFCode"] = lfCode,
                ["Code"] = code,
                ["BarCode"] = ResolveInt(rec, "barcodeType", "BarCode", 40),
                ["UnitPrice"] = unitPrice,
                ["WeightUnit"] = ResolveWeightUnit(rec),
                ["Deptment"] = ResolveInt(rec, "department", "Deptment", 4),
                ["Tare"] = ResolveDouble(rec, "tareGrams", "Tare", 0),
                ["ShlefTime"] = ResolveInt(rec, "shelfDays", "ShlefTime", 15),
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

        private static int ResolveUnitPrice(JObject rec)
        {
            if (rec["UnitPrice"] != null && rec["price"] == null)
            {
                int direct;
                if (int.TryParse(rec["UnitPrice"].ToString(), out direct)) return direct;
            }
            double price = 0;
            if (rec["price"] != null) double.TryParse(rec["price"].ToString(), out price);
            return (int)Math.Round(price * 100);
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

        private static int MapWeightUnit(string unit)
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
}
