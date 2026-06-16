using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace RetailEX.RongtaDllBridge
{
    internal static class Program
    {
        private static readonly string BaseDir = AppDomain.CurrentDomain.BaseDirectory;

        // GC delegate pin — callback'ler toplanmasın
        private static RtscaleJsonCallback _saleCallbackRef;
        private static RtscaleJsonCallback _pluUploadCallbackRef;
        private static readonly List<string> _callbackBuffer = new List<string>();

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
                    case "clear-plu":
                        return RunClearPlu(ip);
                    case "send-plu":
                        return RunSendPlu(ip, req);
                    case "upload-sales":
                        return RunUploadSales(ip, req);
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
            return LabelScaleNative.rtscaleConnect(ip, 0, ref connid);
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

        private static int RunClearPlu(string ip)
        {
            int connid;
            var rc = Connect(ip, out connid);
            if (rc < 0)
            {
                WriteResponse(new { success = false, message = "rtscaleConnect basarisiz (kod " + rc + ")" });
                return 1;
            }

            var clearRc = LabelScaleNative.rtscaleClearPLUData(connid);
            LabelScaleNative.rtscaleDisConnect(connid);

            var ok = clearRc == 0;
            WriteResponse(new
            {
                success = ok,
                message = ok ? "PLU verisi temizlendi" : "PLU temizleme basarisiz (kod " + clearRc + ")",
                backend = "rtslabelscale.dll",
            });
            return ok ? 0 : 1;
        }

        private static int RunSendPlu(string ip, JObject req)
        {
            var records = req["records"] as JArray;
            if (records == null || records.Count == 0)
            {
                WriteResponse(new { success = false, message = "records bos" });
                return 2;
            }

            var clearBefore = req["clearBeforeSend"] != null && req["clearBeforeSend"].Value<bool>();
            var sendHotkeys = req["sendHotkeys"] == null || req["sendHotkeys"].Value<bool>();
            var hotkeyMode = (req["hotkeyMode"] ?? "auto").ToString().Trim().ToLowerInvariant();

            int connid;
            var rc = Connect(ip, out connid);
            if (rc < 0)
            {
                WriteResponse(new { success = false, message = "rtscaleConnect basarisiz (kod " + rc + ")" });
                return 1;
            }

            var errors = new List<string>();
            var lfCodes = new List<int>();

            if (clearBefore)
            {
                var clearRc = LabelScaleNative.rtscaleClearPLUData(connid);
                if (clearRc != 0)
                {
                    errors.Add("PLU temizleme hatasi kod " + clearRc);
                }
            }

            var pluList = new List<JObject>();
            foreach (var item in records)
            {
                var mapped = PluJsonMapper.MapRecordToPluJson(item as JObject);
                pluList.Add(mapped);
                lfCodes.Add(mapped["LFCode"].Value<int>());
            }

            int sent = 0;
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
                    errors.Add("PLU paket " + pack + " hata kodu " + dlRc);
                }
                else
                {
                    sent += batch.Count;
                }
            }

            var hotkeyOk = true;
            if (sendHotkeys && sent > 0)
            {
                hotkeyOk = DownloadHotkeys(connid, lfCodes, hotkeyMode, errors);
            }

            LabelScaleNative.rtscaleDisConnect(connid);

            var ok = errors.Count == 0;
            WriteResponse(new
            {
                success = ok,
                message = ok
                    ? sent + " urun gonderildi" + (sendHotkeys ? " + hotkey" : "") + " (rtslabelscale.dll)"
                    : sent + " gonderildi, " + errors.Count + " hata",
                sentCount = sent,
                failedCount = pluList.Count - sent,
                hotkeysSent = sendHotkeys && hotkeyOk,
                errors = errors.Count > 0 ? errors : null,
                backend = "rtslabelscale.dll",
            });
            return ok ? 0 : 1;
        }

        private static bool DownloadHotkeys(int connid, IList<int> lfCodes, string mode, IList<string> errors)
        {
            IList<int[]> tables;
            if (mode == "demo")
            {
                tables = HotkeyHelper.BuildDemoHotkeyTables();
            }
            else
            {
                tables = HotkeyHelper.BuildHotkeyTables(lfCodes);
            }

            for (var tableIndex = 0; tableIndex < tables.Count; tableIndex++)
            {
                var hkRc = LabelScaleNative.rtscaleDownLoadHotkey(connid, tables[tableIndex], tableIndex);
                if (hkRc != 0)
                {
                    errors.Add("hotkey paket " + tableIndex + " hata kodu " + hkRc);
                    return false;
                }
            }
            return true;
        }

        private static int RunUploadSales(string ip, JObject req)
        {
            var clearData = req["clearData"] != null && req["clearData"].Value<bool>();

            int connid;
            var rc = Connect(ip, out connid);
            if (rc < 0)
            {
                WriteResponse(new { success = false, message = "rtscaleConnect basarisiz (kod " + rc + ")" });
                return 1;
            }

            _callbackBuffer.Clear();
            _saleCallbackRef = OnSaleCallback;
            var ptr = Marshal.GetFunctionPointerForDelegate(_saleCallbackRef);

            var uploadRc = LabelScaleNative.rtscaleUploadSaleData(connid, clearData, ptr);
            LabelScaleNative.rtscaleDisConnect(connid);

            var records = new JArray();
            foreach (var json in _callbackBuffer)
            {
                try
                {
                    records.Add(JObject.Parse(json));
                }
                catch
                {
                    records.Add(new JObject { ["raw"] = json });
                }
            }

            var ok = uploadRc >= 0;
            WriteResponse(new
            {
                success = ok,
                message = ok
                    ? records.Count + " satis kaydi alindi (rtslabelscale.dll)"
                    : "Satis okuma basarisiz (kod " + uploadRc + ")",
                count = records.Count,
                records = records,
                backend = "rtslabelscale.dll",
            });
            return ok ? 0 : 1;
        }

        private static void OnSaleCallback(string json, int index, int total)
        {
            if (!string.IsNullOrWhiteSpace(json))
            {
                _callbackBuffer.Add(json);
            }
        }

        private static void WriteResponse(object payload)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.Write(JsonConvert.SerializeObject(payload));
        }
    }
}
