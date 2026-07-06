using System;
using System.Collections.Generic;

namespace TeraziRongta.Core.Models
{
    public class FirmDto
    {
        public string FirmNr { get; set; }
        public string Name { get; set; }
        public string Title { get; set; }
        public string Id { get; set; }

        public string DisplayText => (FirmNr ?? "") + " - " + (Name ?? "");
    }

    public class PeriodDto
    {
        public int Nr { get; set; }
        public string FirmId { get; set; }
        public string BegDate { get; set; }
        public string EndDate { get; set; }
        public bool IsDefault { get; set; }

        public string DisplayText => Nr.ToString("00") + " (" + BegDate + " - " + EndDate + ")";
    }

    public class StoreDto
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string FirmNr { get; set; }
        public string ScaleBridgeUrl { get; set; }

        public string DisplayText => (Name ?? "") + " [" + (FirmNr ?? "") + "]";
    }

    public class ScaleSyncCommand
    {
        public string Id { get; set; }
        public string RecordId { get; set; }
        public string FirmNr { get; set; }
        public string PeriodNr { get; set; }
        public string TargetStoreId { get; set; }
        public string Command { get; set; }
        public IList<string> ScaleIds { get; set; } = new List<string>();
        public DateTime CreatedAt { get; set; }
    }

    public class ProductSyncStatus
    {
        public string ProductCode { get; set; }
        public string ProductName { get; set; }
        public string Unit { get; set; }
        public string Status { get; set; }
        public string Message { get; set; }
    }

    public class ScaleSyncDetail
    {
        public string ScaleId { get; set; }
        public string ScaleName { get; set; }
        public string IpAddress { get; set; }
        public bool Success { get; set; }
        public int SentCount { get; set; }
        public int FailedCount { get; set; }
        public string Message { get; set; }
        public IList<ProductSyncStatus> Products { get; set; } = new List<ProductSyncStatus>();
    }
}
