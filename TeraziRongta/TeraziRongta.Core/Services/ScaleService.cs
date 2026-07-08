using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using TeraziRongta.Core.Config;
using TeraziRongta.Core.Helpers;
using System.Threading;
using TeraziRongta.Core.Models;
using TeraziRongta.Core.Native;

namespace TeraziRongta.Core.Services
{
    public class ScaleService
    {
        public event Action<string> Log;

        private int _connId;
        private readonly List<string> _saleBuffer = new List<string>();
        private RtscaleJsonCallback _saleCallbackRef;
        public string RlsHomePath { get; set; } = RlsResourceResolver.DefaultRlsHome;
        public AppConfig SyncConfig { get; set; }
        public bool FunctionSetAppliedThisRun { get; set; }

        public string ResolveSystemCfgPath()
        {
            return RlsResourceResolver.ResolveSystemCfgPath(RlsHomePath);
        }

        public bool Connect(string ipAddress, out string error)
        {
            error = null;
            try
            {
                if (SyncConfig != null)
                {
                    ApplyBarcodeSettings(SyncConfig);
                }
                else
                {
                    RongtaPaths.EnsureWritableAssets();
                }
            }
            catch (IOException ex)
            {
                error = ex.Message;
                return false;
            }

            var cfg = ResolveSystemCfgPath();
            if (!File.Exists(cfg))
            {
                error = "SYSTEM.CFG bulunamadi: " + cfg
                    + ". Kurulum dosyalari "
                    + RongtaPaths.WritableRongtaDir
                    + " altina kopyalanamadi.";
                return false;
            }

            var loadRc = LabelScaleNative.rtscaleLoadIniFile(cfg);
            if (loadRc < 0)
            {
                error = "rtscaleLoadIniFile hatasi: " + loadRc;
                return false;
            }

            WriteLog("SYSTEM.CFG yuklendi: " + cfg + " (DecimalDigits=0, Decimal position=0)");

            _connId = 0;
            var rc = LabelScaleNative.rtscaleConnect(ipAddress, 0, ref _connId);
            if (rc < 0)
            {
                error = "Terazi baglantisi basarisiz (kod " + rc + ")";
                return false;
            }

            return true;
        }

        public void Disconnect()
        {
            if (_connId > 0)
            {
                LabelScaleNative.rtscaleDisConnect(_connId);
                _connId = 0;
            }
        }

        public bool TestConnection(string ipAddress, out double? weight, out string message)
        {
            var result = ReadLiveWeight(ipAddress);
            weight = result.WeightKg;
            message = result.Detail;
            return result.Connected;
        }

        public LiveWeightResult ReadLiveWeight(string ipAddress, int pollMs = 4000)
        {
            var result = new LiveWeightResult();
            string connectError;
            if (!Connect(ipAddress, out connectError))
            {
                result.Detail = connectError;
                return result;
            }

            result.Connected = true;

            try
            {
                Thread.Sleep(400);
                var polled = PollPluWeight(pollMs);
                result.SampleCount = polled.Samples;
                result.Stable = polled.Stable;
                result.LastRawSample = polled.LastRaw;

                if (polled.WeightKg > 0)
                {
                    result.WeightKg = polled.WeightKg;
                    result.Source = "poll";
                    result.Detail = BuildWeightMessage(result.WeightKg.Value, polled.Stable, "poll", polled.LastRaw);
                    return result;
                }

                var streamed = ReadWeightStream(pollMs);
                result.SampleCount += streamed.Samples;
                result.LastRawSample = streamed.LastRaw > 0 ? streamed.LastRaw : result.LastRawSample;
                if (streamed.WeightKg > 0)
                {
                    result.WeightKg = streamed.WeightKg;
                    result.Stable = streamed.Stable;
                    result.Source = streamed.Source;
                    result.Detail = BuildWeightMessage(result.WeightKg.Value, streamed.Stable, streamed.Source, streamed.LastRaw);
                    return result;
                }

                result.WeightKg = 0;
                result.Source = polled.Source ?? "poll";
                result.Detail = BuildEmptyWeightMessage(result.LastRawSample);
                return result;
            }
            finally
            {
                Disconnect();
            }
        }

        private sealed class WeightSampleResult
        {
            public double WeightKg;
            public double LastRaw;
            public bool Stable;
            public int Samples;
            public string Source;
        }

        private readonly List<double> _weightSamples = new List<double>();
        private readonly List<string> _weightJsonSamples = new List<string>();
        private RtscaleWeightCallback _weightCallbackRef;
        private RtscaleJsonCallback _weightStreamJsonRef;

        private WeightSampleResult PollPluWeight(int durationMs)
        {
            var best = 0d;
            var lastRaw = 0d;
            var lastNorm = 0d;
            var samples = 0;
            var stable = false;
            var deadline = Environment.TickCount + Math.Max(800, durationMs);

            while (Environment.TickCount < deadline)
            {
                double w = 0;
                var rc = LabelScaleNative.rtscaleGetPluWeight(_connId, ref w);
                samples++;
                lastRaw = w;

                if (rc >= 0)
                {
                    var normalized = NormalizeWeightKg(w);
                    lastNorm = normalized;
                    if (normalized > best) best = normalized;
                    if (normalized > 0 && Math.Abs(normalized - w) < 0.0005)
                    {
                        stable = true;
                    }
                }

                Thread.Sleep(120);
            }

            if (best <= 0)
            {
                for (var i = 0; i < 5; i++)
                {
                    int grams = 0;
                    var gramRc = LabelScaleNative.rtscaleGetPluWeightGram(_connId, ref grams);
                    samples++;
                    if (gramRc >= 0 && grams != 0)
                    {
                        lastRaw = grams;
                        var asKg = grams / 1000d;
                        lastNorm = asKg;
                        if (Math.Abs(asKg) > Math.Abs(best)) best = asKg;
                        stable = true;
                    }

                    Thread.Sleep(120);
                }
            }

            var chosen = best > 0 ? best : lastNorm;
            return new WeightSampleResult
            {
                WeightKg = chosen,
                LastRaw = lastRaw,
                Stable = stable && chosen > 0,
                Samples = samples,
                Source = "poll",
            };
        }

        private WeightSampleResult ReadWeightStream(int durationMs)
        {
            _weightSamples.Clear();
            _weightJsonSamples.Clear();

            var modes = new Action[]
            {
                StartWeightStreamDouble,
                StartWeightStreamJson,
            };

            foreach (var mode in modes)
            {
                _weightSamples.Clear();
                _weightJsonSamples.Clear();
                mode();
                Thread.Sleep(Math.Max(1200, durationMs));
                try
                {
                    LabelScaleNative.rtscaleStopGetWeightbyNet(_connId);
                }
                catch
                {
                    /* ignore */
                }

                var parsed = ParseCollectedWeightSamples();
                if (parsed.WeightKg > 0)
                {
                    return parsed;
                }
            }

            return new WeightSampleResult { Source = "stream" };
        }

        private void StartWeightStreamDouble()
        {
            _weightCallbackRef = OnWeightCallback;
            var ptr = Marshal.GetFunctionPointerForDelegate(_weightCallbackRef);
            LabelScaleNative.rtscaleStartGetWeightbyNet(_connId, ptr);
        }

        private void StartWeightStreamJson()
        {
            _weightStreamJsonRef = OnWeightStreamJsonCallback;
            var ptr = Marshal.GetFunctionPointerForDelegate(_weightStreamJsonRef);
            LabelScaleNative.rtscaleStartGetWeightbyNet(_connId, ptr);
        }

        private void OnWeightCallback(double weight)
        {
            _weightSamples.Add(NormalizeWeightKg(weight));
        }

        private void OnWeightStreamJsonCallback(string json, int index, int total)
        {
            if (string.IsNullOrWhiteSpace(json)) return;
            _weightJsonSamples.Add(json);
            try
            {
                var token = JToken.Parse(json);
                var w = ExtractWeightFromToken(token);
                if (w.HasValue)
                {
                    _weightSamples.Add(w.Value);
                }
            }
            catch
            {
                /* ignore malformed callback payload */
            }
        }

        private WeightSampleResult ParseCollectedWeightSamples()
        {
            var best = _weightSamples.Count > 0 ? _weightSamples.Where(v => v > 0).DefaultIfEmpty(0).Max() : 0d;
            var lastRaw = 0d;
            foreach (var json in _weightJsonSamples)
            {
                try
                {
                    var w = ExtractWeightFromToken(JToken.Parse(json));
                    if (w.HasValue && w.Value > best) best = w.Value;
                }
                catch
                {
                    /* ignore */
                }
            }

            if (_weightSamples.Count > 0)
            {
                lastRaw = _weightSamples[_weightSamples.Count - 1];
            }

            return new WeightSampleResult
            {
                WeightKg = best,
                LastRaw = lastRaw,
                Stable = best > 0,
                Samples = _weightSamples.Count + _weightJsonSamples.Count,
                Source = "stream",
            };
        }

        private static double? ExtractWeightFromToken(JToken token)
        {
            if (token == null) return null;

            if (token.Type == JTokenType.Object)
            {
                var obj = (JObject)token;
                foreach (var key in new[] { "Weight", "weight", "QtyWeight", "qtyWeight", "NetWeight", "netWeight" })
                {
                    if (obj[key] == null) continue;
                    if (double.TryParse(obj[key].ToString(), out var value))
                    {
                        return NormalizeWeightKg(value);
                    }
                }
            }

            return null;
        }

        private static double NormalizeWeightKg(double raw)
        {
            if (double.IsNaN(raw) || double.IsInfinity(raw)) return 0;
            var abs = Math.Abs(raw);
            if (abs < 0.000001) return 0;

            // Zaten kg (ornegin 1.234 veya 0.350).
            if (abs < 100 && Math.Abs(raw - Math.Round(raw, 3)) > 0.000001)
            {
                return raw;
            }

            // Gram olarak gelen tam sayilar (1500 = 1.5 kg).
            if (abs >= 10 && abs <= 99999)
            {
                var asKg = raw / 1000d;
                if (Math.Abs(asKg) <= 100) return asKg;
            }

            return raw;
        }

        private static string BuildWeightMessage(double weightKg, bool stable, string source, double lastRaw)
        {
            var stableText = stable ? "stabil" : "kararsiz olabilir";
            var rawHint = Math.Abs(lastRaw) > 0.000001 ? " (ham=" + lastRaw.ToString("F3") + ")" : string.Empty;
            return "Baglanti basarili. Agirlik: " + weightKg.ToString("F3")
                + " kg (" + stableText + ", " + source + ")" + rawHint + ".";
        }

        private static string BuildEmptyWeightMessage(double lastRaw)
        {
            var rawHint = Math.Abs(lastRaw) > 0.000001
                ? " Son ham deger: " + lastRaw.ToString("F3") + "."
                : string.Empty;
            return "Baglanti basarili ancak agirlik 0 kg okundu." + rawHint
                + " Urunu teraziye koyun, terazide PLU/hotkey secin ve tartim stabil olunca tekrar deneyin.";
        }

        public bool ClearPlu(out string message)
        {
            if (_connId <= 0)
            {
                message = "Terazi bagli degil.";
                return false;
            }

            var rc = LabelScaleNative.rtscaleClearPLUData(_connId);
            message = rc == 0 ? "PLU verisi temizlendi." : "PLU temizleme hatasi: " + rc;
            return rc == 0;
        }

        public IList<ScalePluRecord> FetchPluRecords(string ipAddress, out string message)
        {
            message = null;
            string connectError;
            if (!Connect(ipAddress, out connectError))
            {
                message = connectError;
                return new List<ScalePluRecord>();
            }

            try
            {
                var list = ReadPluList();
                message = list.Count + " PLU kaydi teraziden okundu (terazi sirasi korundu).";
                return list;
            }
            finally
            {
                Disconnect();
            }
        }

        public SyncResult SendPluRecords(string ipAddress, IList<ScalePluRecord> records, bool clearBeforeSend = false)
        {
            var result = new SyncResult { ProductCount = records?.Count ?? 0 };
            if (records == null || records.Count == 0)
            {
                result.Message = "Kaydedilecek PLU yok.";
                return result;
            }

            string connectError;
            if (!Connect(ipAddress, out connectError))
            {
                result.Message = connectError;
                result.Errors.Add(connectError);
                return result;
            }

            try
            {
                if (clearBeforeSend)
                {
                    string clearMsg;
                    if (!ClearPlu(out clearMsg) && !string.IsNullOrEmpty(clearMsg))
                    {
                        result.Errors.Add(clearMsg);
                    }
                }

                var pluList = records
                    .Select(r => PluJsonMapper.ToJObject(r))
                    .Where(j => j["LFCode"] != null && int.TryParse(j["LFCode"].ToString(), out var lf) && lf > 0)
                    .ToList();

                var sent = UploadPluJsonList(pluList, result.Errors, applyDevicePriceCompensation: true);
                result.SentCount = sent;
                result.FailedCount = pluList.Count - sent;
                result.Success = result.Errors.Count == 0;
                result.Message = result.Success
                    ? sent + " PLU kaydi teraziye yazildi."
                    : sent + " PLU yazildi, " + result.Errors.Count + " hata olustu.";
            }
            finally
            {
                Disconnect();
            }

            return result;
        }

        public SyncResult SendProducts(
            string ipAddress,
            IList<ScaleProductDto> products,
            int lfCodeBase,
            bool clearBeforeSend,
            bool sendHotkeys,
            bool mergeExistingPlu = true,
            byte labelId = 64,
            ScalePluDefaults pluDefaults = null)
        {
            var result = new SyncResult { ProductCount = products?.Count ?? 0 };
            pluDefaults = pluDefaults ?? new ScalePluDefaults();

            if (products == null || products.Count == 0)
            {
                result.Message = "Gonderilecek urun yok.";
                return result;
            }

            string connectError;
            if (!Connect(ipAddress, out connectError))
            {
                result.Message = connectError;
                result.Errors.Add(connectError);
                return result;
            }

            try
            {
                if (clearBeforeSend)
                {
                    string clearMsg;
                    if (!ClearPlu(out clearMsg) && !string.IsNullOrEmpty(clearMsg))
                    {
                        result.Errors.Add(clearMsg);
                    }
                }

                var existingPlu = !clearBeforeSend && mergeExistingPlu
                    ? ReadPluMap()
                    : new Dictionary<int, JObject>();

                var existingByBarcode = mergeExistingPlu && !clearBeforeSend
                    ? BuildPluBarcodeMap(existingPlu.Values)
                    : new Dictionary<string, JObject>(StringComparer.OrdinalIgnoreCase);

                var pluList = new List<JObject>();
                var lfCodes = new List<int>();
                var updatedCount = 0;
                var insertedCount = 0;

                for (var i = 0; i < products.Count; i++)
                {
                    var mapped = PluJsonMapper.MapProductToPluJson(products[i], i + 1, lfCodeBase, labelId, pluDefaults);
                    var barcodeKey = PluJsonMapper.GetPluBarcode(mapped);
                    JObject existing = null;
                    var matched = false;

                    if (!string.IsNullOrEmpty(barcodeKey) && existingByBarcode.TryGetValue(barcodeKey, out existing))
                    {
                        mapped["LFCode"] = existing["LFCode"].Value<int>();
                        AddBarcodeNameConflictWarning(result.Warnings, barcodeKey, existing, mapped);
                        mapped = PluJsonMapper.MergePluForUpdate(existing, mapped);
                        updatedCount++;
                        matched = true;
                    }
                    else
                    {
                        var lfCode = mapped["LFCode"].Value<int>();
                        if (existingPlu.TryGetValue(lfCode, out existing))
                        {
                            AddBarcodeNameConflictWarning(result.Warnings, barcodeKey, existing, mapped);
                            mapped = PluJsonMapper.MergePluForUpdate(existing, mapped);
                            updatedCount++;
                            matched = true;
                        }
                    }

                    if (!matched)
                    {
                        insertedCount++;
                    }

                    var apiUnitPrice = ScalePriceHelper.ToUnitPrice(products[i].Price);
                    ScalePriceHelper.SetUnitPrice(mapped, ResolveDeviceUnitPrice(apiUnitPrice));

                    pluList.Add(mapped);
                    lfCodes.Add(mapped["LFCode"].Value<int>());
                }

                if (pluList.Count > 0 && SyncConfig?.CompensateDevicePriceDecimal == true && !FunctionSetAppliedThisRun)
                {
                    var sampleLf = pluList[0]["LFCode"];
                    var samplePrice = ScalePriceHelper.ReadUnitPrice(pluList[0]["UnitPrice"]);
                    WriteLog("  Fiyat carpani: API " + ScalePriceHelper.ToUnitPrice(products[0].Price)
                        + " -> cihaz UnitPrice " + samplePrice + " (LF " + sampleLf + ")");
                }

                var sent = UploadPluJsonList(pluList, result.Errors, applyDevicePriceCompensation: false);
                result.SentCount = sent;
                result.FailedCount = products.Count - sent;

                LogDeviceUnitPriceSample(ipAddress, pluList, result.Warnings);

                var shouldSendHotkeys = sendHotkeys && (clearBeforeSend || existingPlu.Count == 0);
                if (shouldSendHotkeys && sent > 0)
                {
                    if (!SendHotkeys(lfCodes, result.Errors))
                    {
                        result.Errors.Add("Hotkey gonderimi basarisiz.");
                    }
                }

                result.Success = result.Errors.Count == 0;
                var warningSuffix = result.Warnings.Count > 0
                    ? " (" + result.Warnings.Count + " barkod/isim uyumsuzlugu)"
                    : "";
                result.Message = result.Success
                    ? sent + " urun gonderildi (" + updatedCount + " guncellendi, " + insertedCount + " yeni)." + warningSuffix
                    : sent + " urun gonderildi, " + result.Errors.Count + " hata olustu." + warningSuffix;
            }
            finally
            {
                Disconnect();
            }

            return result;
        }

        public SyncResult SendFunctionSet(string ipAddress, AppConfig config)
        {
            var result = new SyncResult();
            if (config == null)
            {
                result.Message = "Yapilandirma eksik.";
                result.Errors.Add(result.Message);
                return result;
            }

            string cfgPath;
            string rlsHome;
            try
            {
                cfgPath = SystemCfgPatcher.ApplyToRlsHome(config);
                rlsHome = RlsFunctionSetHelper.EnsureAssets(config);
            }
            catch (IOException ex)
            {
                result.Message = ex.Message;
                result.Errors.Add(ex.Message);
                return result;
            }

            if (!File.Exists(cfgPath))
            {
                result.Message = "SYSTEM.CFG bulunamadi: " + cfgPath;
                result.Errors.Add(result.Message);
                return result;
            }

            string connectError;
            if (!Connect(ipAddress, out connectError))
            {
                result.Message = connectError;
                result.Errors.Add(connectError);
                return result;
            }

            try
            {
                var applied = new List<string>();
                var decimalRc = TryDownloadDecimalPlaceZero();
                if (decimalRc == 0)
                {
                    applied.Add("DecimalPlaceSet(0)");
                }
                else if (decimalRc != int.MinValue)
                {
                    result.Errors.Add("DecimalPlaceSet(0) kod " + decimalRc);
                }

                string sentFile = null;
                foreach (var rlsPath in RlsFunctionSetHelper.ResolveRlsCandidates(config))
                {
                    var fileName = Path.GetFileName(rlsPath);
                    var rc = TryDownloadRlsFile(rlsPath);
                    if (rc == 0)
                    {
                        sentFile = fileName;
                        applied.Add("RLS:" + fileName);
                        break;
                    }

                    result.Errors.Add("RLS gonderim hatasi (" + fileName + "): " + rc);
                }

                result.SentCount = applied.Count;
                result.Success = applied.Count > 0;
                FunctionSetAppliedThisRun = result.Success;
                if (result.Success)
                {
                    result.Message = "Terazi genel ayarlari gonderildi: "
                        + string.Join(", ", applied)
                        + ". Decimal position=0, DecimalDigits=0.";
                    WriteLog("  " + result.Message);
                }
                else
                {
                    result.Message = BuildFunctionSetFailureMessage(config, rlsHome, cfgPath);
                    WriteLog("  UYARI: " + result.Message);
                    if (config.CompensateDevicePriceDecimal)
                    {
                        WriteLog("  PLU fiyatlari cihaz ondaligi icin carpilacak (x"
                            + (int)Math.Pow(10, Math.Max(0, config.DevicePriceDecimalPosition)) + ").");
                    }
                }
            }
            finally
            {
                Disconnect();
            }

            return result;
        }

        private int TryDownloadDecimalPlaceZero()
        {
            if (_connId <= 0) return int.MinValue;
            try
            {
                return LabelScaleNative.rtscaleDownloadDecimalPlaceSet(_connId, 0);
            }
            catch (Exception ex)
            {
                WriteLog("  DecimalPlaceSet DLL hatasi: " + ex.Message);
                return int.MinValue;
            }
        }

        private int TryDownloadRlsFile(string rlsPath)
        {
            if (_connId <= 0 || string.IsNullOrWhiteSpace(rlsPath) || !File.Exists(rlsPath))
            {
                return -1;
            }

            var bytes = File.ReadAllBytes(rlsPath);
            for (var attempt = 1; attempt <= 2; attempt++)
            {
                var rc = LabelScaleNative.rtscaleDownLoadData(_connId, bytes, bytes.Length);
                if (rc == 0) return 0;
                if (attempt < 2) Thread.Sleep(350);
            }

            return LabelScaleNative.rtscaleDownLoadData(_connId, bytes, bytes.Length);
        }

        private static string BuildFunctionSetFailureMessage(AppConfig config, string rlsHome, string cfgPath)
        {
            var msg = "SYSTEM.CFG guncellendi (" + cfgPath + ") ancak teraziye function-set gonderilemedi.";
            if (config.CompensateDevicePriceDecimal && config.DevicePriceDecimalPosition > 0)
            {
                msg += " PLU gonderiminde fiyat x"
                    + (int)Math.Pow(10, Math.Max(0, config.DevicePriceDecimalPosition))
                    + " carpani uygulanacak (or. 7500 -> "
                    + ScalePriceHelper.ToDeviceUnitPrice(7500, config.DevicePriceDecimalPosition, true)
                    + "). Terazi ekraninda 7500 gorunmeli.";
            }
            else
            {
                msg += " CompensateDevicePriceDecimal=false oldugu icin fiyatlar oldugu gibi gonderilir.";
            }

            msg += " RLS klasoru: " + rlsHome + ".";
            return msg;
        }

        private int ResolveDeviceUnitPrice(int apiUnitPrice)
        {
            if (FunctionSetAppliedThisRun) return apiUnitPrice;

            var cfg = SyncConfig;
            if (cfg == null) return apiUnitPrice;
            return ScalePriceHelper.ToDeviceUnitPrice(
                apiUnitPrice,
                cfg.DevicePriceDecimalPosition,
                cfg.CompensateDevicePriceDecimal);
        }

        public static void ApplyBarcodeSettings(AppConfig config)
        {
            if (config == null) return;
            try
            {
                SystemCfgPatcher.ApplyToRlsHome(config);
            }
            catch (IOException ex)
            {
                throw new IOException(ex.Message, ex);
            }
        }

        public SyncResult SendLabelTemplate(string ipAddress, string scrPath)
        {
            var result = new SyncResult();
            if (string.IsNullOrWhiteSpace(scrPath) || !File.Exists(scrPath))
            {
                result.Message = "Etiket dosyasi bulunamadi: " + scrPath;
                result.Errors.Add(result.Message);
                return result;
            }

            string connectError;
            if (!Connect(ipAddress, out connectError))
            {
                result.Message = connectError;
                result.Errors.Add(connectError);
                return result;
            }

            try
            {
                var bytes = File.ReadAllBytes(scrPath);
                var rc = LabelScaleNative.rtscaleDownLoadData(_connId, bytes, bytes.Length);
                result.Success = rc == 0;
                result.SentCount = result.Success ? 1 : 0;
                var fileName = Path.GetFileName(scrPath);
                var isMegal = fileName.Equals(
                    RlsResourceResolver.DefaultMegalLabelFileName,
                    StringComparison.OrdinalIgnoreCase);
                result.Message = result.Success
                    ? (isMegal
                        ? "Megal logolu etiket gonderildi: " + fileName
                        : "Etiket sablonu gonderildi: " + fileName)
                    : "Etiket gonderim hatasi (kod " + rc + "): " + fileName
                      + (isMegal
                          ? " — retailex_logoluetiket.scr (Megal) gonderilemedi."
                          : "");
                if (!result.Success)
                {
                    result.Errors.Add(result.Message);
                }
            }
            finally
            {
                Disconnect();
            }

            return result;
        }

        public static bool TryLaunchLabelEditor(string rlsHome, out string message)
        {
            var exe = RlsResourceResolver.ResolveLabelEditorExe(rlsHome);
            if (!File.Exists(exe))
            {
                message = "RTRLSLabel.exe bulunamadi: " + exe;
                return false;
            }

            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = exe,
                    WorkingDirectory = Path.GetDirectoryName(exe) ?? rlsHome,
                    UseShellExecute = true,
                });
                message = "Etiket editoru acildi: " + exe;
                return true;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return false;
            }
        }

        private readonly List<PluCallbackChunk> _pluChunks = new List<PluCallbackChunk>();
        private RtscaleJsonCallback _pluCallbackRef;

        private int UploadPluJsonList(IList<JObject> pluList, IList<string> errors, bool applyDevicePriceCompensation = true)
        {
            const int packSize = 4;
            var sent = 0;
            for (var pack = 0; pack * packSize < pluList.Count; pack++)
            {
                var batch = new JArray();
                for (var i = 0; i < packSize; i++)
                {
                    var idx = pack * packSize + i;
                    if (idx >= pluList.Count) break;
                    var item = pluList[idx];
                    PluJsonMapper.ClearPackageWeightLimit(item);
                    ScalePriceHelper.NormalizePluUnitPrice(item);
                    if (applyDevicePriceCompensation)
                    {
                        var apiPrice = ScalePriceHelper.ReadUnitPrice(item["UnitPrice"]);
                        ScalePriceHelper.SetUnitPrice(item, ResolveDeviceUnitPrice(apiPrice));
                    }
                    if (pack == 0 && batch.Count == 0)
                    {
                        var lf = item["LFCode"]?.ToString() ?? "?";
                        var name = item["PluName"]?.ToString() ?? "";
                        var unitPrice = ScalePriceHelper.ReadUnitPrice(item["UnitPrice"]);
                        var code = item["Code"]?.ToString() ?? "";
                        WriteLog("  PLU JSON LF=" + lf + " Code=" + code
                            + " UnitPrice=" + unitPrice
                            + " PackageWeight=0 PackageType=0 (" + name + ")");
                        WriteLog("  PLU paket0 ornek: " + item.ToString(Formatting.None));
                    }
                    batch.Add(item);
                }

                var json = batch.ToString(Formatting.None);
                var dlRc = LabelScaleNative.rtscaleDownLoadPLU(_connId, json, pack);
                if (dlRc != 0)
                {
                    errors.Add("PLU paket " + pack + " hatasi: " + dlRc);
                }
                else
                {
                    sent += batch.Count;
                }
            }

            return sent;
        }

        private void LogDeviceUnitPriceSample(string ipAddress, IList<JObject> sentPlu, IList<string> warnings)
        {
            if (sentPlu == null || sentPlu.Count == 0 || _connId <= 0) return;

            try
            {
                var sample = sentPlu.FirstOrDefault();
                if (sample == null) return;

                var lfCode = sample["LFCode"]?.Value<int>() ?? 0;
                if (lfCode <= 0) return;

                var expected = ScalePriceHelper.ReadUnitPrice(sample["UnitPrice"]);
                var deviceMap = ReadPluMap();
                if (!deviceMap.TryGetValue(lfCode, out var devicePlu))
                {
                    warnings?.Add("Dogrulama: LF " + lfCode + " teraziden okunamadi.");
                    WriteLog("  Dogrulama: LF " + lfCode + " teraziden okunamadi.");
                    return;
                }

                var onDevice = ScalePriceHelper.ReadUnitPrice(devicePlu["UnitPrice"]);
                WriteLog("  Dogrulama LF=" + lfCode + " beklenen UnitPrice=" + expected + " cihaz UnitPrice=" + onDevice);
                if (onDevice != expected)
                {
                    var cfg = SyncConfig;
                    var compensate = cfg != null && cfg.CompensateDevicePriceDecimal;
                    var hint = compensate
                        ? " Cihaz Decimal position=" + (cfg?.DevicePriceDecimalPosition ?? 0) + " ise bu normal olabilir."
                        : " 'Terazi Ayarlarini Gonder' + PLU yeniden gonderin.";
                    var msg = "LF " + lfCode + ": gonderilen UnitPrice=" + expected + " ama cihazda=" + onDevice + "." + hint;
                    warnings?.Add(msg);
                    WriteLog("  UYARI: " + msg);
                }
            }
            catch (Exception ex)
            {
                WriteLog("  Dogrulama uyarisi: " + ex.Message);
            }
        }

        private void WriteLog(string message)
        {
            Log?.Invoke(message);
        }

        private sealed class PluCallbackChunk
        {
            public int Index;
            public string Json;
        }

        private List<ScalePluRecord> ReadPluList()
        {
            var list = new List<ScalePluRecord>();
            if (_connId <= 0) return list;

            _pluChunks.Clear();
            _pluCallbackRef = OnPluCallback;
            var ptr = Marshal.GetFunctionPointerForDelegate(_pluCallbackRef);
            LabelScaleNative.rtscaleUploadPluData(_connId, ptr);

            var order = 0;
            foreach (var chunk in _pluChunks.OrderBy(c => c.Index))
            {
                foreach (var item in ParsePluJsonChunk(chunk.Json))
                {
                    list.Add(PluJsonMapper.FromJObject(item, order));
                    order++;
                }
            }

            return list;
        }

        private Dictionary<int, JObject> ReadPluMap()
        {
            var map = new Dictionary<int, JObject>();
            foreach (var record in ReadPluList())
            {
                AddPluToMap(map, record.Raw);
            }

            return map;
        }

        private static IEnumerable<JObject> ParsePluJsonChunk(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) yield break;

            JToken token;
            try
            {
                token = JToken.Parse(json);
            }
            catch
            {
                yield break;
            }

            if (token is JArray arr)
            {
                foreach (var item in arr.OfType<JObject>())
                {
                    yield return item;
                }
            }
            else if (token is JObject obj)
            {
                yield return obj;
            }
        }

        private static void AddPluToMap(IDictionary<int, JObject> map, JObject item)
        {
            if (item == null) return;
            var lfRaw = item["LFCode"] ?? item["lfCode"];
            if (lfRaw == null || !int.TryParse(lfRaw.ToString(), out var lfCode) || lfCode <= 0) return;
            map[lfCode] = item;
        }

        private static Dictionary<string, JObject> BuildPluBarcodeMap(IEnumerable<JObject> pluItems)
        {
            var map = new Dictionary<string, JObject>(StringComparer.OrdinalIgnoreCase);
            if (pluItems == null) return map;

            foreach (var item in pluItems)
            {
                var barcode = PluJsonMapper.GetPluBarcode(item);
                if (string.IsNullOrEmpty(barcode)) continue;
                map[barcode] = item;
            }

            return map;
        }

        private static void AddBarcodeNameConflictWarning(
            IList<string> warnings,
            string barcode,
            JObject existing,
            JObject incoming)
        {
            if (warnings == null || string.IsNullOrEmpty(barcode)) return;
            if (!PluJsonMapper.HasBarcodeNameConflict(existing, incoming)) return;

            var existingName = (existing["PluName"] ?? "").ToString().Trim();
            var incomingName = (incoming["PluName"] ?? "").ToString().Trim();
            warnings.Add("Barkod " + barcode + ": terazi '" + existingName + "' / gelen '" + incomingName + "'");
        }

        private void OnPluCallback(string json, int index, int total)
        {
            if (string.IsNullOrWhiteSpace(json)) return;
            _pluChunks.Add(new PluCallbackChunk { Index = index, Json = json });
        }

        private bool SendHotkeys(IList<int> lfCodes, IList<string> errors)
        {
            var tables = HotkeyHelper.BuildHotkeyTables(lfCodes);
            for (var tableIndex = 0; tableIndex < tables.Count; tableIndex++)
            {
                var hkRc = LabelScaleNative.rtscaleDownLoadHotkey(_connId, tables[tableIndex], tableIndex);
                if (hkRc != 0)
                {
                    errors.Add("Hotkey paket " + tableIndex + " hatasi: " + hkRc);
                    return false;
                }
            }

            return true;
        }

        public IList<ScaleAccountData> UploadSales(string ipAddress, bool clearData, out string message)
        {
            message = null;
            string connectError;
            if (!Connect(ipAddress, out connectError))
            {
                message = connectError;
                return new List<ScaleAccountData>();
            }

            try
            {
                _saleBuffer.Clear();
                _saleCallbackRef = OnSaleCallback;
                var ptr = Marshal.GetFunctionPointerForDelegate(_saleCallbackRef);
                var rc = LabelScaleNative.rtscaleUploadSaleData(_connId, clearData, ptr);

                var records = new List<ScaleAccountData>();
                foreach (var json in _saleBuffer)
                {
                    try
                    {
                        records.Add(ParseSaleRecordJson(json));
                    }
                    catch
                    {
                        /* skip malformed row */
                    }
                }

                message = rc >= 0
                    ? BuildSaleUploadMessage(records)
                    : "Satis okuma basarisiz (kod " + rc + ").";
                return records;
            }
            finally
            {
                Disconnect();
            }
        }

        private void OnSaleCallback(string json, int index, int total)
        {
            if (!string.IsNullOrWhiteSpace(json)) _saleBuffer.Add(json);
        }

        private static ScaleAccountData ParseSaleRecordJson(string json)
        {
            var jo = JObject.Parse(json);
            var record = jo.ToObject<ScaleAccountData>() ?? new ScaleAccountData();
            record.SaleTime = CoalesceTimeField(jo["SaleTime"], record.SaleTime);
            record.OnlineTime = CoalesceTimeField(jo["OnlineTime"], record.OnlineTime);
            return record;
        }

        private static string CoalesceTimeField(JToken token, string existing)
        {
            if (token == null || token.Type == JTokenType.Null)
                return existing;

            if (token.Type == JTokenType.String)
            {
                var text = token.Value<string>();
                return string.IsNullOrWhiteSpace(text) ? existing : text.Trim();
            }

            if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float)
                return token.ToString();

            return existing;
        }

        private static string BuildSaleUploadMessage(IList<ScaleAccountData> records)
        {
            var count = records?.Count ?? 0;
            if (count == 0)
                return "0 satis kaydi alindi.";

            var parsed = records.Count(r => SaleReportHelper.ResolveSaleDate(r).IsKnown);
            var sample = records
                .Select(r => r.SaleTime)
                .FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));

            var message = count + " satis kaydi alindi.";
            if (!string.IsNullOrWhiteSpace(sample))
                message += " Ornek SaleTime: " + sample.Trim() + ".";
            if (parsed < count)
                message += " " + (count - parsed) + " kayitta tarih cozulemedi.";
            return message;
        }

        public double? GetWeight(string ipAddress, out string message)
        {
            var result = ReadLiveWeight(ipAddress);
            message = result.Detail;
            return result.WeightKg;
        }
    }
}
