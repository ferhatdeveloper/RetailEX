using System;
using System.Collections.Generic;

namespace TeraziRongta.Core.Models
{
    public class ScaleProductDto
    {
        public string PluCode { get; set; }
        public string Barcode { get; set; }
        public string Name { get; set; }
        public double Price { get; set; }
        public string Unit { get; set; } = "KG";
        public int BarcodeType { get; set; } = 99;
        public int Department { get; set; } = 21;
        public int LfCode { get; set; }
        public string ExternalId { get; set; }
        /// <summary>false ise terazi gonderim listesine alinmaz.</summary>
        public bool IsActive { get; set; } = true;
        /// <summary>API'den gelen plu_code doluysa true; otomatik atama ayirt etmek icin.</summary>
        public bool HasExplicitPlu { get; set; }
        /// <summary>RetailEX shelf_life_days (gun). Etikette SKT = basim tarihi + ShlefTime.</summary>
        public int ShelfLifeDays { get; set; }
    }

    public class SyncResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public int ProductCount { get; set; }
        public int SentCount { get; set; }
        public int FailedCount { get; set; }
        public string Trigger { get; set; } = "manual";
        public List<string> Errors { get; set; } = new List<string>();
        public List<string> Warnings { get; set; } = new List<string>();
        public List<ScaleSyncDetail> ScaleResults { get; set; } = new List<ScaleSyncDetail>();
        public DateTime Timestamp { get; set; } = DateTime.Now;
    }

    public class ScaleAccountData
    {
        public int UserID { get; set; }
        public string PluName { get; set; }
        public int LFCode { get; set; }
        public double UnitPrice { get; set; }
        public int WeightUnit { get; set; }
        public double TotalPrice { get; set; }
        public double Weight { get; set; }
        public string SaleTime { get; set; }
        public int Rebate { get; set; }
        public string OnlineTime { get; set; }
        public int Quantity { get; set; }
        public int Clerk { get; set; }

        // Rongta bazi modellerde ayri tarih alanlari gonderebilir
        public int Date_DD { get; set; }
        public int Date_MM { get; set; }
        public int Date_YY { get; set; }
        public int Date_YYYY { get; set; }
        public int DateDay { get; set; }
        public int DateMonth { get; set; }
        public int DateYear { get; set; }
    }

    public class Pludata
    {
        public int HotKey { get; set; }
        public string PluName { get; set; }
        public int LFCode { get; set; }
        public string Code { get; set; }
        public int BarCode { get; set; }
        public int UnitPrice { get; set; }
        public int WeightUnit { get; set; }
        public int Deptment { get; set; }
        public double Tare { get; set; }
        public int ShlefTime { get; set; }
        public int PackageType { get; set; }
        public double PackageWeight { get; set; }
        public int Tolerance { get; set; }
        public int Message1 { get; set; }
        public byte Message2 { get; set; }
        public byte LabelId { get; set; }
        public byte Rebate { get; set; }
        public int Account { get; set; }
        public int QtyUnit { get; set; }
    }
}
