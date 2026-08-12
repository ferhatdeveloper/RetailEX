using System;

namespace TeraziRongta.Core.Models
{
    public class SaleDailySummary
    {
        public DateTime Date { get; set; }
        public bool IsKnownDate { get; set; } = true;
        public string DateDisplay => IsKnownDate ? Date.ToString("dd.MM.yyyy") : "Bilinmeyen tarih";
        public int LabelCount { get; set; }
        public double TotalWeight { get; set; }
        public double TotalAmount { get; set; }
    }

    public class SaleProductSummary
    {
        public DateTime Date { get; set; }
        public bool IsKnownDate { get; set; } = true;
        public string DateDisplay => IsKnownDate ? Date.ToString("dd.MM.yyyy") : "Bilinmeyen tarih";
        public string PluName { get; set; }
        public int LfCode { get; set; }
        public int LabelCount { get; set; }
        public double TotalWeight { get; set; }
        public double TotalAmount { get; set; }
    }
}
