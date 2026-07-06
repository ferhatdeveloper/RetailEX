using System;
using System.Collections.Generic;

namespace TeraziRongta.Core.Models
{
    public class DeviceSyncCursorDto
    {
        public string Id { get; set; }
        public string DeviceId { get; set; }
        public string FirmNr { get; set; }
        public string Scope { get; set; }
        public DateTime? LastSuccessAt { get; set; }
        public DateTime? LastWatermarkAt { get; set; }
        public string SyncMode { get; set; }
    }

    public class PriceChangeDto
    {
        public string Id { get; set; }
        public string RecordId { get; set; }
        public string ProductCode { get; set; }
        public string ProductName { get; set; }
        public DateTime ChangedAt { get; set; }
        public string TableName { get; set; }
    }

    public class IncrementalSyncPlan
    {
        public string Mode { get; set; } = "full";
        public IList<ScaleProductDto> Products { get; set; } = new List<ScaleProductDto>();
        public IList<PriceChangeDto> PriceChanges { get; set; } = new List<PriceChangeDto>();
        public DateTime? WatermarkFrom { get; set; }
        public DateTime WatermarkTo { get; set; } = DateTime.UtcNow;
        public bool HasChanges => Products != null && Products.Count > 0;
    }

    public class DeviceSyncStatusDto
    {
        public string DeviceId { get; set; }
        public string DeviceName { get; set; }
        public string IpAddress { get; set; }
        public DateTime? LastSuccessAt { get; set; }
        public DateTime? LastWatermarkAt { get; set; }
        public string LastTransferStatus { get; set; }
        public string LastTransferMessage { get; set; }
        public DateTime? LastTransferAt { get; set; }
        public int PendingChangeCount { get; set; }
    }
}
