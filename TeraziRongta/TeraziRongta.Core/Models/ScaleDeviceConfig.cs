using System;

namespace TeraziRongta.Core.Models
{
    public class ScaleDeviceConfig
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Name { get; set; } = "Terazi 1";
        public string IpAddress { get; set; } = "";
        public bool Enabled { get; set; } = true;
        public string CentralDeviceId { get; set; }
        public string StoreDeviceRecordId { get; set; }
        public string LastSync { get; set; }
        public int LastProductCount { get; set; }
        public int LastFailedCount { get; set; }
        public string LastStatus { get; set; }
        public string LabelScrPath { get; set; }
        public string LabelSlot { get; set; } = "D0";

        public string ResolveCentralDeviceId()
        {
            return string.IsNullOrWhiteSpace(CentralDeviceId) ? Id : CentralDeviceId.Trim();
        }
    }
}
