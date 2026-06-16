using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace RetailEX.RongtaDllBridge
{
    internal static class Program
    {
        private static readonly string BaseDir = AppDomain.CurrentDomain.BaseDirectory;

        private static int Main()
        {
            try
            {
                var raw = Console.In.ReadToEnd();
                if (string.IsNullOrWhiteSpace(raw))
                {
                    WriteResponse(new { success = false, message = "stdin JSON gerekli" });
                    return 2;
                }

                var req = JObject.Parse(raw);
                var command = (req["command"] ?? "").ToString().Trim().ToLowerInvariant();
                var ip = (req["ipAddress"] ?? "").ToString().Trim();
                if (string.IsNullOrEmpty(ip) && command != "ping")
                {
                    WriteResponse(new { success = false, message = "ipAddress gerekli" });
                    return 2;
                }

                LoadIni();

                switch (command)
                {
                    case "ping":
                        WriteResponse(new { success = true, message = "RongtaDllBridge hazir", platform = "win32" });
                        return 0;
                    case "test":
                        return RunTest(ip);
                    case "send-plu":
                        return RunSendPlu(ip, req);
                    case "probe":
                        return RunTest(ip);
                    default:
                        WriteResponse(new { success = false, message = "Bilinmeyen command: " + command });
                        return 2;
                }
            }
            catch (Exception ex)
            {
                WriteResponse(new { success = false, message = ex.Message });
                return 1;
            }
        }

        private static void LoadIni()
        {
            var cfg = Path.Combine(BaseDir, "SYSTEM.CFG");
            if (!File.Exists(cfg))
            {
                throw new FileNotFoundException("SYSTEM.CFG bulunamadi: " + cfg);
            }
            var rc = LabelScaleNative.rtscaleLoadIniFile(cfg);
            if (rc < 0)
            {
                throw new InvalidOperationException("rtscaleLoadIniFile hata: " + rc);
            }
        }

        private static int Connect(string ip, out int connid)
        {
            connid = 0;
            var rc = LabelScaleNative.rtscaleConnect(ip, 0, ref connid);
            return rc;
        }

        private static int RunTest(string ip)
        {
            int connid;
            var rc = Connect(ip, out connid);
            if (rc < 0)
            {
                WriteResponse(new
                {
                    ok = false,
                    success = false,
                    message = "rtscaleConnect basarisiz (kod " + rc + "). IP, SYSTEM.CFG ve terazi ag ayarini kontrol edin.",
                    ipAddress = ip,
                });
                return 1;
            }

            double weight = 0;
            var wRc = LabelScaleNative.rtscaleGetPluWeight(connid, ref weight);
            LabelScaleNative.rtscaleDisConnect(connid);

            WriteResponse(new
            {
                ok = true,
                success = true,
                message = wRc >= 0
                    ? "Baglanti basarili (rtslabelscale.dll). Agirlik: " + weight.ToString("F3")
                    : "Baglanti basarili; agirlik okunamadi (kod " + wRc + ")",
                ipAddress = ip,
                weight = wRc >= 0 ? (double?)weight : null,
                backend = "rtslabelscale.dll",
            });
            return 0;
        }

        private static int RunSendPlu(string ip, JObject req)
        {
            var records = req["records"] as JArray;
            if (records == null || records.Count == 0)
            {
                WriteResponse(new { success = false, message = "records bos" });
                return 2;
            }

            int connid;
            var rc = Connect(ip, out connid);
            if (rc < 0)
            {
                WriteResponse(new { success = false, message = "rtscaleConnect basarisiz (kod " + rc + ")" });
                return 1;
            }

            var pluList = new List<JObject>();
            foreach (var item in records)
            {
                pluList.Add(MapRecordToPluJson(item as JObject));
            }

            int sent = 0;
            var errors = new List<string>();
            const int packSize = 4;

            for (int pack = 0; pack * packSize < pluList.Count; pack++)
            {
                var batch = new JArray();
                for (int i = 0; i < packSize; i++)
                {
                    int idx = pack * packSize + i;
                    if (idx >= pluList.Count) break;
                    batch.Add(pluList[idx]);
                }

                var json = batch.ToString(Formatting.None);
                var dlRc = LabelScaleNative.rtscaleDownLoadPLU(connid, json, pack);
                if (dlRc != 0)
                {
                    errors.Add("paket " + pack + " hata kodu " + dlRc);
                }
                else
                {
                    sent += batch.Count;
                }
            }

            LabelScaleNative.rtscaleDisConnect(connid);

            var ok = errors.Count == 0;
            WriteResponse(new
            {
                success = ok,
                message = ok
                    ? sent + " urun gonderildi (rtslabelscale.dll)"
                    : sent + " gonderildi, " + errors.Count + " paket hatasi",
                sentCount = sent,
                failedCount = pluList.Count - sent,
                errors = errors.Count > 0 ? errors : null,
                backend = "rtslabelscale.dll",
            });
            return ok ? 0 : 1;
        }

        private static JObject MapRecordToPluJson(JObject rec)
        {
            if (rec == null) return new JObject();

            var name = (rec["name"] ?? rec["PluName"] ?? "").ToString();
            if (name.Length > 36) name = name.Substring(0, 36);

            var lfRaw = rec["lfCode"] ?? rec["LFCode"] ?? rec["pluCode"];
            int lfCode = 0;
            if (lfRaw != null)
            {
                int.TryParse(lfRaw.ToString().Replace(" ", ""), out lfCode);
            }
            if (lfCode <= 0) lfCode = 1;

            var code = (rec["barcode"] ?? rec["Code"] ?? lfCode.ToString()).ToString();
            if (code.Length > 10) code = code.Substring(code.Length - 10);

            double price = 0;
            if (rec["price"] != null) double.TryParse(rec["price"].ToString(), out price);
            else if (rec["UnitPrice"] != null) double.TryParse(rec["UnitPrice"].ToString(), out price);

            int unitPrice = (int)Math.Round(price * 100);
            if (rec["UnitPrice"] != null && rec["price"] == null)
            {
                int.TryParse(rec["UnitPrice"].ToString(), out unitPrice);
            }

            return new JObject
            {
                ["PluName"] = name,
                ["LFCode"] = lfCode,
                ["Code"] = code,
                ["BarCode"] = rec["barcodeType"] ?? rec["BarCode"] ?? 27,
                ["UnitPrice"] = unitPrice,
                ["WeightUnit"] = MapWeightUnit((rec["unit"] ?? rec["WeightUnit"])?.ToString()),
                ["Deptment"] = rec["department"] ?? rec["Deptment"] ?? 0,
                ["Tare"] = rec["tareGrams"] ?? rec["Tare"] ?? 0,
                ["ShlefTime"] = rec["shelfDays"] ?? rec["ShlefTime"] ?? 15,
                ["PackageType"] = rec["packageType"] ?? rec["PackageType"] ?? 0,
                ["PackageWeight"] = rec["packageWeight"] ?? rec["PackageWeight"] ?? 0,
                ["Tolerance"] = rec["tolerance"] ?? rec["Tolerance"] ?? 0,
                ["Message1"] = rec["message1"] ?? rec["Message1"] ?? 0,
                ["Message2"] = rec["message2"] ?? rec["Message2"] ?? 0,
                ["MultiLabel"] = rec["multiLabel"] ?? rec["MultiLabel"] ?? 0,
                ["Rebate"] = rec["rebate"] ?? rec["Rebate"] ?? 0,
                ["Account"] = rec["account"] ?? rec["Account"] ?? 0,
                ["QtyUnit"] = rec["qtyUnit"] ?? rec["QtyUnit"] ?? 0,
            };
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

        private static void WriteResponse(object payload)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.Write(JsonConvert.SerializeObject(payload));
        }
    }
}
