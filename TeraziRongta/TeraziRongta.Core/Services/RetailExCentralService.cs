using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using TeraziRongta.Core.Config;
using TeraziRongta.Core.Models;

namespace TeraziRongta.Core.Services
{
    public class RetailExCentralService
    {
        public const string ScaleCommandTable = "scale_plu_sync";

        public async Task<IList<FirmDto>> FetchFirmsAsync(AppConfig config)
        {
            var json = await RetailExHttp.GetAsync(
                config,
                "/firms?is_active=eq.true&select=id,firm_nr,name,title&order=firm_nr").ConfigureAwait(false);

            return JArray.Parse(json).OfType<JObject>().Select(row => new FirmDto
            {
                Id = row["id"]?.ToString(),
                FirmNr = row["firm_nr"]?.ToString(),
                Name = row["name"]?.ToString(),
                Title = row["title"]?.ToString(),
            }).Where(f => !string.IsNullOrWhiteSpace(f.FirmNr)).ToList();
        }

        public async Task<IList<PeriodDto>> FetchPeriodsAsync(AppConfig config, string firmId)
        {
            if (string.IsNullOrWhiteSpace(firmId)) return new List<PeriodDto>();

            var json = await RetailExHttp.GetAsync(
                config,
                "/periods?is_active=eq.true&firm_id=eq." + Uri.EscapeDataString(firmId)
                + "&select=nr,beg_date,end_date,firm_id,default&order=nr").ConfigureAwait(false);

            return JArray.Parse(json).OfType<JObject>().Select(row => new PeriodDto
            {
                Nr = row["nr"]?.Value<int?>() ?? 0,
                FirmId = row["firm_id"]?.ToString(),
                BegDate = row["beg_date"]?.ToString(),
                EndDate = row["end_date"]?.ToString(),
                IsDefault = row["default"]?.Value<bool?>() ?? false,
            }).Where(p => p.Nr > 0).ToList();
        }

        public async Task<IList<StoreDto>> FetchStoresAsync(AppConfig config, string firmNr = null)
        {
            var path = "/stores?select=id,name,firm_nr,scale_bridge_url&order=name";
            if (!string.IsNullOrWhiteSpace(firmNr))
            {
                path += "&firm_nr=eq." + Uri.EscapeDataString(AppConfig.NormalizeFirmNr(firmNr));
            }

            var json = await RetailExHttp.GetAsync(config, path).ConfigureAwait(false);
            return JArray.Parse(json).OfType<JObject>().Select(row => new StoreDto
            {
                Id = row["id"]?.ToString(),
                Name = row["name"]?.ToString(),
                FirmNr = row["firm_nr"]?.ToString(),
                ScaleBridgeUrl = row["scale_bridge_url"]?.ToString(),
            }).Where(s => !string.IsNullOrWhiteSpace(s.Id)).ToList();
        }

        public async Task RegisterScaleAsync(AppConfig config, ScaleDeviceConfig scale)
        {
            if (scale == null || string.IsNullOrWhiteSpace(config.StoreId)) return;

            var deviceId = scale.ResolveCentralDeviceId();
            var existing = await FindStoreDeviceAsync(config, deviceId).ConfigureAwait(false);
            var payload = new
            {
                store_id = config.StoreId,
                device_id = deviceId,
                device_name = scale.Name,
                status = scale.Enabled ? "online" : "offline",
                last_sync_at = ParseDateOrNull(scale.LastSync),
                app_version = "RetailEX.TeraziManager",
            };

            if (existing == null)
            {
                var json = await RetailExHttp.PostAsync(config, "/store_devices", payload).ConfigureAwait(false);
                var created = ParseFirstObject(json);
                scale.StoreDeviceRecordId = created?["id"]?.ToString();
            }
            else
            {
                scale.StoreDeviceRecordId = existing["id"]?.ToString();
                await RetailExHttp.PatchAsync(
                    config,
                    "/store_devices?device_id=eq." + Uri.EscapeDataString(deviceId),
                    payload).ConfigureAwait(false);
            }
        }

        public async Task RegisterAllScalesAsync(AppConfig config)
        {
            foreach (var scale in config.Scales ?? new List<ScaleDeviceConfig>())
            {
                if (scale == null) continue;
                await RegisterScaleAsync(config, scale).ConfigureAwait(false);
            }
        }

        public async Task ReportScaleSyncAsync(
            AppConfig config,
            ScaleDeviceConfig scale,
            IncrementalSyncPlan plan,
            SyncResult result,
            string trigger)
        {
            if (string.IsNullOrWhiteSpace(config.StoreId)) return;

            var products = plan?.Products ?? new List<ScaleProductDto>();
            var detail = new JObject
            {
                ["scale_id"] = scale.Id,
                ["scale_name"] = scale.Name,
                ["scale_ip"] = scale.IpAddress,
                ["firm_nr"] = AppConfig.NormalizeFirmNr(config.FirmNr),
                ["period_nr"] = AppConfig.NormalizePeriodNr(config.PeriodNr),
                ["trigger"] = trigger,
                ["sync_mode"] = plan?.Mode ?? "full",
                ["watermark_from"] = plan?.WatermarkFrom?.ToUniversalTime().ToString("o"),
                ["watermark_to"] = plan?.WatermarkTo.ToUniversalTime().ToString("o"),
                ["products"] = BuildProductStatusArray(products, result.Success),
            };

            await RetailExHttp.PostAsync(config, "/device_sync_transfer_log", new
            {
                device_id = scale.ResolveCentralDeviceId(),
                firm_nr = AppConfig.NormalizeFirmNr(config.FirmNr),
                store_id = config.StoreId,
                terminal_name = scale.Name,
                direction = "push",
                sync_mode = plan?.Mode ?? trigger,
                status = result.Success ? "completed" : "failed",
                record_count = products.Count,
                inserted_count = result.Success ? Math.Max(0, result.SentCount) : 0,
                updated_count = result.Success ? Math.Max(0, result.SentCount) : 0,
                failed_count = result.Success ? 0 : Math.Max(1, products.Count),
                watermark_from = plan?.WatermarkFrom?.ToUniversalTime().ToString("o"),
                watermark_to = plan?.WatermarkTo.ToUniversalTime().ToString("o"),
                message = result.Message,
                detail = detail.ToString(),
            }).ConfigureAwait(false);

            if (result.Success)
            {
                await UpsertCursorAsync(
                    config,
                    scale.ResolveCentralDeviceId(),
                    Scope,
                    plan?.WatermarkTo ?? DateTime.UtcNow,
                    plan?.Mode ?? "incremental").ConfigureAwait(false);

                await AcknowledgePriceChangesAsync(config, scale, plan?.PriceChanges).ConfigureAwait(false);
            }

            await RegisterScaleAsync(config, scale).ConfigureAwait(false);
        }

        public const string Scope = ScaleIncrementalSyncService.Scope;

        public async Task<DeviceSyncCursorDto> GetCursorAsync(AppConfig config, string deviceId, string scope)
        {
            var firmNr = AppConfig.NormalizeFirmNr(config.FirmNr);
            var json = await RetailExHttp.GetAsync(
                config,
                "/device_sync_cursor?firm_nr=eq." + Uri.EscapeDataString(firmNr)
                + "&device_id=eq." + Uri.EscapeDataString(deviceId)
                + "&scope=eq." + Uri.EscapeDataString(scope)
                + "&select=*&limit=1").ConfigureAwait(false);

            var row = ParseFirstObject(json);
            if (row == null) return null;

            return MapCursor(row);
        }

        public async Task<IList<DeviceSyncCursorDto>> FetchCursorsAsync(AppConfig config, string scope)
        {
            var firmNr = AppConfig.NormalizeFirmNr(config.FirmNr);
            var json = await RetailExHttp.GetAsync(
                config,
                "/device_sync_cursor?firm_nr=eq." + Uri.EscapeDataString(firmNr)
                + "&scope=eq." + Uri.EscapeDataString(scope)
                + "&select=*").ConfigureAwait(false);

            return JArray.Parse(json).OfType<JObject>().Select(MapCursor).ToList();
        }

        public async Task UpsertCursorAsync(
            AppConfig config,
            string deviceId,
            string scope,
            DateTime watermarkTo,
            string syncMode)
        {
            var firmNr = AppConfig.NormalizeFirmNr(config.FirmNr);
            var existing = await GetCursorAsync(config, deviceId, scope).ConfigureAwait(false);
            var payload = new
            {
                device_id = deviceId,
                firm_nr = firmNr,
                scope,
                sync_mode = syncMode,
                last_success_at = DateTime.UtcNow,
                last_watermark_at = watermarkTo.ToUniversalTime(),
            };

            if (existing == null)
            {
                await RetailExHttp.PostAsync(config, "/device_sync_cursor", payload).ConfigureAwait(false);
            }
            else
            {
                await RetailExHttp.PatchAsync(
                    config,
                    "/device_sync_cursor?id=eq." + Uri.EscapeDataString(existing.Id),
                    payload).ConfigureAwait(false);
            }
        }

        public async Task AcknowledgePriceChangesAsync(
            AppConfig config,
            ScaleDeviceConfig scale,
            IList<PriceChangeDto> priceChanges)
        {
            if (priceChanges == null || priceChanges.Count == 0) return;
            if (string.IsNullOrWhiteSpace(config.StoreId)) return;

            foreach (var change in priceChanges)
            {
                if (string.IsNullOrWhiteSpace(change?.Id)) continue;

                try
                {
                    await RetailExHttp.PostAsync(config, "/device_price_ack", new
                    {
                        price_change_log_id = change.Id,
                        device_id = scale.ResolveCentralDeviceId(),
                        store_id = config.StoreId,
                        terminal_name = scale.Name,
                        firm_nr = AppConfig.NormalizeFirmNr(config.FirmNr),
                        table_name = change.TableName,
                        record_id = change.RecordId,
                        product_code = change.ProductCode,
                        ack_at = DateTime.UtcNow,
                    }).ConfigureAwait(false);
                }
                catch
                {
                    /* duplicate ack is ok */
                }
            }
        }

        public async Task ReportScaleSyncAsync(
            AppConfig config,
            ScaleDeviceConfig scale,
            IList<ScaleProductDto> products,
            SyncResult result,
            string trigger)
        {
            await ReportScaleSyncAsync(
                config,
                scale,
                new IncrementalSyncPlan
                {
                    Mode = "full",
                    Products = products ?? new List<ScaleProductDto>(),
                    WatermarkTo = DateTime.UtcNow,
                },
                result,
                trigger).ConfigureAwait(false);
        }

        public async Task<IList<ScaleSyncCommand>> PollPendingCommandsAsync(AppConfig config)
        {
            if (string.IsNullOrWhiteSpace(config.StoreId)) return new List<ScaleSyncCommand>();

            var path = "/sync_queue?table_name=eq." + ScaleCommandTable
                + "&status=eq.pending"
                + "&firm_nr=eq." + Uri.EscapeDataString(AppConfig.NormalizeFirmNr(config.FirmNr))
                + "&target_store_id=eq." + Uri.EscapeDataString(config.StoreId)
                + "&order=created_at.asc&limit=20";

            var json = await RetailExHttp.GetAsync(config, path).ConfigureAwait(false);
            var commands = new List<ScaleSyncCommand>();

            foreach (var row in JArray.Parse(json).OfType<JObject>())
            {
                var data = row["data"] as JObject ?? new JObject();
                commands.Add(new ScaleSyncCommand
                {
                    Id = row["id"]?.ToString(),
                    RecordId = row["record_id"]?.ToString(),
                    FirmNr = row["firm_nr"]?.ToString(),
                    PeriodNr = data["period_nr"]?.ToString() ?? config.PeriodNr,
                    TargetStoreId = row["target_store_id"]?.ToString(),
                    Command = data["command"]?.ToString() ?? "push_all",
                    ScaleIds = data["scale_ids"]?.Values<string>().Where(s => !string.IsNullOrWhiteSpace(s)).ToList()
                        ?? new List<string>(),
                    CreatedAt = row["created_at"]?.Value<DateTime?>() ?? DateTime.MinValue,
                });
            }

            return commands;
        }

        public async Task CompleteCommandAsync(AppConfig config, ScaleSyncCommand command, bool success, string message)
        {
            if (command == null || string.IsNullOrWhiteSpace(command.Id)) return;

            await RetailExHttp.PatchAsync(
                config,
                "/sync_queue?id=eq." + Uri.EscapeDataString(command.Id),
                new
                {
                    status = success ? "completed" : "failed",
                    synced_at = DateTime.UtcNow,
                    error_message = success ? null : message,
                }).ConfigureAwait(false);
        }

        public async Task<string> CreatePushCommandAsync(
            AppConfig config,
            IEnumerable<string> scaleIds,
            string trigger = "manual",
            string command = "push_changed")
        {
            if (string.IsNullOrWhiteSpace(config.StoreId))
            {
                throw new InvalidOperationException("Merkez komutu icin magaza (StoreId) secin.");
            }

            var ids = (scaleIds ?? config.GetActiveScales().Select(s => s.ResolveCentralDeviceId()))
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Distinct()
                .ToList();

            var recordId = Guid.NewGuid().ToString();
            await RetailExHttp.PostAsync(config, "/sync_queue", new
            {
                table_name = ScaleCommandTable,
                record_id = recordId,
                action = "PUSH",
                firm_nr = AppConfig.NormalizeFirmNr(config.FirmNr),
                target_store_id = config.StoreId,
                status = "pending",
                source_system = string.IsNullOrWhiteSpace(trigger) || trigger == "manual"
                    ? "RetailEX-Web"
                    : "RetailEX-TeraziManager",
                data = new
                {
                    command = string.IsNullOrWhiteSpace(command) ? "push_changed" : command,
                    trigger,
                    firm_nr = AppConfig.NormalizeFirmNr(config.FirmNr),
                    period_nr = AppConfig.NormalizePeriodNr(config.PeriodNr),
                    scale_ids = ids,
                    agent_device_id = config.ResolveAgentDeviceId(),
                    incremental = !string.Equals(command, "push_all", StringComparison.OrdinalIgnoreCase),
                },
            }).ConfigureAwait(false);

            return recordId;
        }

        /// <summary>
        /// Son transfer kayıtlarını getirir. maxAgeDays &gt; 0 ise yalnızca son N gün (WinForm işlem günlüğü kuralı).
        /// </summary>
        public async Task<IList<JObject>> FetchRecentSyncLogsAsync(
            AppConfig config,
            int limit = 50,
            int maxAgeDays = 0)
        {
            if (string.IsNullOrWhiteSpace(config.StoreId)) return new List<JObject>();

            var path = "/device_sync_transfer_log?store_id=eq." + Uri.EscapeDataString(config.StoreId)
                + "&firm_nr=eq." + Uri.EscapeDataString(AppConfig.NormalizeFirmNr(config.FirmNr));

            if (maxAgeDays > 0)
            {
                var since = DateTime.UtcNow.Date.AddDays(-(maxAgeDays - 1));
                path += "&created_at=gte." + Uri.EscapeDataString(since.ToString("yyyy-MM-ddTHH:mm:ssZ"));
            }

            path += "&order=created_at.desc&limit=" + Math.Max(1, limit);

            var json = await RetailExHttp.GetAsync(config, path).ConfigureAwait(false);
            var rows = JArray.Parse(json).OfType<JObject>().ToList();

            // API filtreyi yok sayarsa / eski PostgREST: istemci tarafında da son N gün uygula
            if (maxAgeDays > 0)
            {
                var cutoff = DateTime.UtcNow.Date.AddDays(-(maxAgeDays - 1));
                rows = rows.Where(row =>
                {
                    var raw = row["created_at"]?.ToString();
                    if (string.IsNullOrWhiteSpace(raw)) return false;
                    if (!DateTime.TryParse(raw, out var created)) return true;
                    return created.ToUniversalTime() >= cutoff;
                }).ToList();
            }

            return rows;
        }

        public static ScaleSyncDetail BuildScaleSyncDetail(
            ScaleDeviceConfig scale,
            IList<ScaleProductDto> products,
            SyncResult result)
        {
            var detail = new ScaleSyncDetail
            {
                ScaleId = scale?.Id,
                ScaleName = scale?.Name,
                IpAddress = scale?.IpAddress,
                Success = result?.Success ?? false,
                SentCount = result?.SentCount ?? 0,
                FailedCount = result?.FailedCount ?? 0,
                Message = result?.Message,
            };

            foreach (var product in products ?? new List<ScaleProductDto>())
            {
                detail.Products.Add(new ProductSyncStatus
                {
                    ProductCode = product.Barcode ?? product.PluCode ?? product.LfCode.ToString(),
                    ProductName = product.Name,
                    Unit = product.Unit,
                    Status = detail.Success ? "sent" : "failed",
                    Message = detail.Success ? "Teraziye gonderildi" : detail.Message,
                });
            }

            return detail;
        }

        private static JArray BuildProductStatusArray(IList<ScaleProductDto> products, bool success)
        {
            var array = new JArray();
            foreach (var product in products ?? new List<ScaleProductDto>())
            {
                array.Add(new JObject
                {
                    ["code"] = product.PluCode ?? product.LfCode.ToString(),
                    ["barcode"] = product.Barcode ?? product.PluCode ?? product.LfCode.ToString(),
                    ["name"] = product.Name,
                    ["unit"] = product.Unit,
                    ["status"] = success ? "sent" : "failed",
                });
            }

            return array;
        }

        private static async Task<JObject> FindStoreDeviceAsync(AppConfig config, string deviceId)
        {
            var json = await RetailExHttp.GetAsync(
                config,
                "/store_devices?device_id=eq." + Uri.EscapeDataString(deviceId) + "&select=*&limit=1")
                .ConfigureAwait(false);

            return ParseFirstObject(json);
        }

        private static JObject ParseFirstObject(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            var token = JToken.Parse(json);
            if (token is JArray arr && arr.Count > 0) return arr[0] as JObject;
            return token as JObject;
        }

        private static DateTime? ParseDateOrNull(string value)
        {
            DateTime parsed;
            if (DateTime.TryParse(value, out parsed)) return parsed;
            return null;
        }

        private static DeviceSyncCursorDto MapCursor(JObject row)
        {
            return new DeviceSyncCursorDto
            {
                Id = row["id"]?.ToString(),
                DeviceId = row["device_id"]?.ToString(),
                FirmNr = row["firm_nr"]?.ToString(),
                Scope = row["scope"]?.ToString(),
                LastSuccessAt = row["last_success_at"]?.Value<DateTime?>(),
                LastWatermarkAt = row["last_watermark_at"]?.Value<DateTime?>(),
                SyncMode = row["sync_mode"]?.ToString(),
            };
        }
    }
}
