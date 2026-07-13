using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using TeraziRongta.Core.Config;
using TeraziRongta.Core.Models;

namespace TeraziRongta.Core.Services
{
    public class ScaleIncrementalSyncService
    {
        public const string Scope = "scale_products";

        private readonly RetailExApiClient _api = new RetailExApiClient();
        private readonly RetailExCentralService _central = new RetailExCentralService();

        public async Task<IncrementalSyncPlan> BuildPlanAsync(AppConfig config, ScaleDeviceConfig scale, string command)
        {
            var firmNr = AppConfig.NormalizeFirmNr(config.FirmNr);
            var tableName = "rex_" + firmNr + "_products";
            var deviceId = scale.ResolveCentralDeviceId();
            var forceFull = !config.IncrementalSyncEnabled
                || string.Equals(command, "push_all", StringComparison.OrdinalIgnoreCase);

            var cursor = await _central.GetCursorAsync(config, deviceId, Scope).ConfigureAwait(false);
            var watermarkFrom = cursor?.LastWatermarkAt;

            if (forceFull || !watermarkFrom.HasValue)
            {
                var all = await _api.FetchScaleProductsAsync(config).ConfigureAwait(false);
                return new IncrementalSyncPlan
                {
                    Mode = "full",
                    Products = all,
                    WatermarkFrom = watermarkFrom,
                    WatermarkTo = DateTime.UtcNow,
                };
            }

            var changed = await GetChangedProductsAsync(config, tableName, watermarkFrom.Value).ConfigureAwait(false);
            if (changed.Products.Count == 0)
            {
                return new IncrementalSyncPlan
                {
                    Mode = "none",
                    WatermarkFrom = watermarkFrom,
                    WatermarkTo = DateTime.UtcNow,
                };
            }

            return new IncrementalSyncPlan
            {
                Mode = "incremental",
                Products = changed.Products,
                PriceChanges = changed.PriceChanges,
                WatermarkFrom = watermarkFrom,
                WatermarkTo = DateTime.UtcNow,
            };
        }

        public async Task<IList<DeviceSyncStatusDto>> FetchDeviceStatusesAsync(AppConfig config)
        {
            var statuses = new List<DeviceSyncStatusDto>();
            if (string.IsNullOrWhiteSpace(config.StoreId)) return statuses;

            var firmNr = AppConfig.NormalizeFirmNr(config.FirmNr);
            var tableName = "rex_" + firmNr + "_products";
            var logs = await _central.FetchRecentSyncLogsAsync(config, 100).ConfigureAwait(false);
            var cursors = await _central.FetchCursorsAsync(config, Scope).ConfigureAwait(false);

            foreach (var scale in config.Scales ?? new List<ScaleDeviceConfig>())
            {
                if (scale == null) continue;
                var deviceId = scale.ResolveCentralDeviceId();
                var cursor = cursors.FirstOrDefault(c =>
                    string.Equals(c.DeviceId, deviceId, StringComparison.OrdinalIgnoreCase));

                var lastLog = logs.FirstOrDefault(l =>
                    string.Equals(l["device_id"]?.ToString(), deviceId, StringComparison.OrdinalIgnoreCase));

                var pending = 0;
                if (cursor?.LastWatermarkAt != null)
                {
                    var pendingChanges = await GetChangedProductsAsync(
                        config, tableName, cursor.LastWatermarkAt.Value).ConfigureAwait(false);
                    pending = pendingChanges.Products.Count;
                }

                statuses.Add(new DeviceSyncStatusDto
                {
                    DeviceId = deviceId,
                    DeviceName = scale.Name,
                    IpAddress = scale.IpAddress,
                    LastSuccessAt = cursor?.LastSuccessAt,
                    LastWatermarkAt = cursor?.LastWatermarkAt,
                    LastTransferStatus = lastLog?["status"]?.ToString(),
                    LastTransferMessage = lastLog?["message"]?.ToString(),
                    LastTransferAt = ParseDate(lastLog?["created_at"]?.ToString()),
                    PendingChangeCount = pending,
                });
            }

            return statuses;
        }

        private async Task<IncrementalSyncPlan> GetChangedProductsAsync(
            AppConfig config,
            string tableName,
            DateTime watermark)
        {
            var firmNr = AppConfig.NormalizeFirmNr(config.FirmNr);
            var watermarkIso = watermark.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);
            var recordIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var priceChanges = new List<PriceChangeDto>();

            var priceJson = await RetailExHttp.GetAsync(
                config,
                "/price_change_log?firm_nr=eq." + Uri.EscapeDataString(firmNr)
                + "&table_name=eq." + Uri.EscapeDataString(tableName)
                + "&changed_at=gt." + Uri.EscapeDataString(watermarkIso)
                + "&order=changed_at.asc"
                + "&select=id,record_id,product_code,product_name,changed_at,table_name").ConfigureAwait(false);

            foreach (var row in JArray.Parse(priceJson).OfType<JObject>())
            {
                var recordId = row["record_id"]?.ToString();
                if (!string.IsNullOrWhiteSpace(recordId))
                {
                    recordIds.Add(recordId);
                }

                priceChanges.Add(new PriceChangeDto
                {
                    Id = row["id"]?.ToString(),
                    RecordId = recordId,
                    ProductCode = row["product_code"]?.ToString(),
                    ProductName = row["product_name"]?.ToString(),
                    ChangedAt = ParseDate(row["changed_at"]?.ToString()) ?? DateTime.UtcNow,
                    TableName = row["table_name"]?.ToString(),
                });
            }

            var updatedJson = await RetailExHttp.GetAsync(
                config,
                "/" + tableName
                + "?is_scale_product=eq.true&is_active=eq.true"
                + "&updated_at=gt." + Uri.EscapeDataString(watermarkIso)
                + "&select=id,code,name,barcode,unit,price,is_scale_product,plu_code,is_active,shelf_life_days,updated_at").ConfigureAwait(false);

            foreach (var row in JArray.Parse(updatedJson).OfType<JObject>())
            {
                var recordId = row["id"]?.ToString();
                if (!string.IsNullOrWhiteSpace(recordId))
                {
                    recordIds.Add(recordId);
                }
            }

            if (recordIds.Count == 0)
            {
                return new IncrementalSyncPlan();
            }

            var products = await _api.FetchProductsByRecordIdsAsync(config, recordIds).ConfigureAwait(false);
            return new IncrementalSyncPlan
            {
                Products = products,
                PriceChanges = priceChanges,
            };
        }

        private static DateTime? ParseDate(string value)
        {
            DateTime parsed;
            if (DateTime.TryParse(value, out parsed)) return parsed;
            return null;
        }
    }
}
