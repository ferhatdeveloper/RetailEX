using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using TeraziRongta.Core.Config;
using TeraziRongta.Core.Helpers;
using TeraziRongta.Core.Models;

namespace TeraziRongta.Core.Services
{
    public class SyncEngine
    {
        private readonly RetailExApiClient _api = new RetailExApiClient();
        private readonly RetailExCentralService _central = new RetailExCentralService();
        private readonly ScaleIncrementalSyncService _incremental = new ScaleIncrementalSyncService();
        private readonly ScaleService _scale = new ScaleService();
        private static readonly object SyncLock = new object();

        public event Action<string> Log;

        public AppConfig Config { get; private set; }

        public SyncEngine(AppConfig config = null)
        {
            Config = config ?? AppConfig.Load();
        }

        public void ReloadConfig(string path = null)
        {
            Config = AppConfig.Load(path);
        }

        public Task<SyncResult> RunSyncAsync(string trigger = "manual", string syncCommand = null)
        {
            lock (SyncLock)
            {
                return Task.FromResult(RunSyncAsyncCore(trigger, syncCommand).GetAwaiter().GetResult());
            }
        }

        public SyncResult RunSync(string trigger = "manual", string syncCommand = null)
        {
            lock (SyncLock)
            {
                return RunSyncAsyncCore(trigger, syncCommand).GetAwaiter().GetResult();
            }
        }

        public async Task<SyncResult> RunCentralCommandPollAsync()
        {
            if (!Config.UsesCentralCommands())
            {
                return new SyncResult { Message = "Merkez komut modu kapali.", Trigger = "central_poll" };
            }

            var commands = await _central.PollPendingCommandsAsync(Config).ConfigureAwait(false);
            if (commands.Count == 0)
            {
                return new SyncResult { Message = "Bekleyen merkez komutu yok.", Trigger = "central_poll" };
            }

            SyncResult lastResult = null;
            foreach (var command in commands)
            {
                WriteLog("Merkez komutu alindi: " + command.Id + " / " + command.Command);
                Config.PeriodNr = AppConfig.NormalizePeriodNr(command.PeriodNr ?? Config.PeriodNr);
                Config.RefreshProductsPathFromSelection();

                var scales = ResolveScalesForCommand(command);
                lastResult = await ExecuteSyncAsync(
                    scales,
                    "central_command",
                    command.Command ?? "push_changed").ConfigureAwait(false);

                await _central.CompleteCommandAsync(
                    Config,
                    command,
                    lastResult.Success,
                    lastResult.Message).ConfigureAwait(false);
            }

            return lastResult ?? new SyncResult { Message = "Merkez komutu islenemedi.", Trigger = "central_command" };
        }

        private async Task<SyncResult> RunSyncAsyncCore(string trigger, string syncCommand)
        {
            WriteLog("=== Senkron basladi (" + trigger + "): " + DateTime.Now.ToString("dd.MM.yyyy HH:mm:ss") + " ===");

            if (trigger == "auto" && Config.UsesCentralCommands())
            {
                var pollResult = await RunCentralCommandPollAsync().ConfigureAwait(false);
                if (pollResult.SentCount > 0 || pollResult.ProductCount > 0)
                {
                    return pollResult;
                }

                if (!Config.ShouldRunAutoTimerSync())
                {
                    return pollResult;
                }
            }
            else if (trigger == "auto" && !Config.ShouldRunAutoTimerSync())
            {
                return new SyncResult { Message = "Yerel otomatik senkron kapali.", Trigger = trigger };
            }

            if (!Config.IsReadyForAutoSync())
            {
                var msg = "Yapilandirma eksik: Kiracı kodu, firma/magaza ve en az bir aktif terazi gerekli.";
                WriteLog(msg);
                return new SyncResult { Message = msg, Trigger = trigger };
            }

            Config.RefreshProductsPathFromSelection();
            var command = syncCommand;
            if (string.IsNullOrWhiteSpace(command))
            {
                command = Config.IncrementalSyncEnabled && !string.Equals(trigger, "full", StringComparison.OrdinalIgnoreCase)
                    ? "push_changed"
                    : "push_all";
            }

            return await ExecuteSyncAsync(Config.GetActiveScales(), trigger, command).ConfigureAwait(false);
        }

        private async Task<SyncResult> ExecuteSyncAsync(
            IList<ScaleDeviceConfig> scales,
            string trigger,
            string syncCommand)
        {
            if (scales == null || scales.Count == 0)
            {
                var msg = "Aktif terazi yok.";
                WriteLog(msg);
                return new SyncResult { Message = msg, Trigger = trigger };
            }

            var aggregate = new SyncResult
            {
                Success = true,
                Trigger = trigger,
            };

            _scale.RlsHomePath = Config.RlsHomePath;
            _scale.SyncConfig = Config;
            _scale.Log += WriteLog;

            try
            {
                if (!string.IsNullOrWhiteSpace(Config.StoreId))
                {
                    await _central.RegisterAllScalesAsync(Config).ConfigureAwait(false);
                }
            }
            catch (Exception ex)
            {
                WriteLog("Merkez terazi kaydi uyarisi: " + ex.Message);
            }

            var anyWork = false;
            foreach (var scale in scales)
            {
                IncrementalSyncPlan plan;
                try
                {
                    plan = await _incremental.BuildPlanAsync(Config, scale, syncCommand).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    WriteLog(scale.Name + " plan hatasi: " + ex.Message);
                    aggregate.Success = false;
                    aggregate.Errors.Add(scale.Name + ": " + ex.Message);
                    continue;
                }

                if (!plan.HasChanges)
                {
                    WriteLog(scale.Name + ": degisen urun yok (" + plan.Mode + ").");
                    continue;
                }

                anyWork = true;
                aggregate.ProductCount += plan.Products.Count;
                WriteLog(scale.Name + ": " + plan.Products.Count + " urun gonderiliyor (" + plan.Mode + ").");

                ScaleService.ApplyBarcodeSettings(Config);
                if (Config.SendFunctionSetOnSync)
                {
                    _scale.FunctionSetAppliedThisRun = false;
                    var fnResult = _scale.SendFunctionSet(scale.IpAddress, Config);
                    WriteLog("  Terazi ayarlari: " + fnResult.Message);
                    if (!fnResult.Success && fnResult.Errors != null)
                    {
                        foreach (var err in fnResult.Errors) aggregate.Errors.Add(scale.Name + " ayar: " + err);
                    }
                }
                else
                {
                    WriteLog("  UYARI: SendFunctionSetOnSync kapali; cihaz Decimal position=2 ise fiyat /100 gorunur veya CompensateDevicePriceDecimal devreye girer.");
                }

                if (Config.SendLabelOnSync)
                {
                    var slot = string.IsNullOrWhiteSpace(scale.LabelSlot) ? Config.LabelSlot : scale.LabelSlot;
                    var scrPath = Config.ResolveLabelScrPath(scale.LabelScrPath);
                    var labelResult = _scale.SendLabelTemplate(scale.IpAddress, scrPath);
                    WriteLog("  Etiket: " + labelResult.Message);
                    if (!labelResult.Success)
                    {
                        aggregate.Success = false;
                        aggregate.Errors.Add(scale.Name + " etiket: " + labelResult.Message);
                    }
                }

                var scaleLabelId = LabelSlotHelper.ResolveLabelId(
                    string.IsNullOrWhiteSpace(scale.LabelSlot) ? Config.LabelSlot : scale.LabelSlot);

                var result = _scale.SendProducts(
                    scale.IpAddress,
                    plan.Products,
                    Config.LfCodeBase,
                    Config.ClearBeforeSend,
                    Config.SendHotkeys,
                    Config.MergeExistingPlu,
                    scaleLabelId,
                    Config.GetPluDefaults());

                scale.LastSync = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                scale.LastProductCount = result.SentCount;
                scale.LastFailedCount = result.FailedCount;
                scale.LastStatus = result.Success ? "OK" : "HATA";

                var scaleDetail = RetailExCentralService.BuildScaleSyncDetail(scale, plan.Products, result);
                aggregate.ScaleResults.Add(scaleDetail);

                WriteLog("  -> " + result.Message);

                aggregate.SentCount += result.SentCount;
                aggregate.FailedCount += result.FailedCount;
                if (result.Warnings != null && result.Warnings.Count > 0)
                {
                    foreach (var warning in result.Warnings)
                    {
                        aggregate.Warnings.Add(scale.Name + ": " + warning);
                        WriteLog("  UYARI: " + warning);
                    }
                }
                if (!result.Success)
                {
                    aggregate.Success = false;
                    aggregate.Errors.Add(scale.Name + ": " + result.Message);
                    if (result.Errors != null) aggregate.Errors.AddRange(result.Errors);
                }

                try
                {
                    if (!string.IsNullOrWhiteSpace(Config.StoreId))
                    {
                        await _central.ReportScaleSyncAsync(Config, scale, plan, result, trigger)
                            .ConfigureAwait(false);
                    }
                }
                catch (Exception ex)
                {
                    WriteLog("Merkez rapor uyarisi (" + scale.Name + "): " + ex.Message);
                }
            }

            try
            {
                Config.Save();
            }
            catch
            {
                /* optional */
            }

            if (!anyWork)
            {
                aggregate.Message = "Degisen urun bulunamadi; terazilere gonderim yapilmadi.";
            }
            else
            {
                aggregate.Message = aggregate.Success
                    ? scales.Count + " terazi kontrol edildi, " + aggregate.SentCount + " urun gonderildi/guncellendi."
                    : "Bazi terazilere gonderim basarisiz. Merkez durum ekranini kontrol edin.";
                if (aggregate.Warnings.Count > 0)
                {
                    aggregate.Message += " " + aggregate.Warnings.Count + " barkod/isim uyumsuzlugu.";
                }
            }

            WriteLog(aggregate.Message);
            AppendSyncLog(aggregate);
            return aggregate;
        }

        private IList<ScaleDeviceConfig> ResolveScalesForCommand(ScaleSyncCommand command)
        {
            var active = Config.GetActiveScales().ToList();
            if (command?.ScaleIds == null || command.ScaleIds.Count == 0)
            {
                return active;
            }

            return active
                .Where(s => command.ScaleIds.Contains(s.ResolveCentralDeviceId(), StringComparer.OrdinalIgnoreCase)
                    || command.ScaleIds.Contains(s.Id, StringComparer.OrdinalIgnoreCase))
                .ToList();
        }

        private void AppendSyncLog(SyncResult result)
        {
            try
            {
                var logPath = Path.Combine(
                    Path.GetDirectoryName(AppConfig.DefaultConfigPath) ?? "",
                    "terazi-sync.log");
                var line = string.Format(
                    "[{0:yyyy-MM-dd HH:mm:ss}] {1} | tetik={2} urun={3} gonderilen={4} basari={5}",
                    DateTime.Now,
                    result.Message,
                    result.Trigger,
                    result.ProductCount,
                    result.SentCount,
                    result.Success);
                File.AppendAllText(logPath, line + Environment.NewLine, System.Text.Encoding.UTF8);
            }
            catch
            {
                /* logging must not break sync */
            }
        }

        private void WriteLog(string message)
        {
            Log?.Invoke(message);
        }
    }
}
