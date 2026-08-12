using Newtonsoft.Json.Linq;
using TeraziRongta.Core.Helpers;

namespace TeraziRongta.Core.Models
{
    public class ScalePluRecord
    {
        public int PluOrder { get; set; }

        public int PluRowNumber => PluOrder + 1;

        public JObject Raw { get; set; } = new JObject();

        public string PluName
        {
            get => (Raw["PluName"] ?? "").ToString();
            set => Raw["PluName"] = (value ?? "").Trim();
        }

        public int LfCode
        {
            get => ReadInt("LFCode");
            set => Raw["LFCode"] = value;
        }

        public string Code
        {
            get => (Raw["Code"] ?? "").ToString();
            set => Raw["Code"] = (value ?? "").Trim();
        }

        public int BarCode
        {
            get => ReadInt("BarCode");
            set => Raw["BarCode"] = value;
        }

        public int Price
        {
            get => ScalePriceHelper.ReadUnitPrice(Raw?["UnitPrice"]);
            set => ScalePriceHelper.SetUnitPrice(Raw, ScalePriceHelper.ToUnitPrice(value));
        }

        public int WeightUnit
        {
            get => ReadInt("WeightUnit", 4);
            set => Raw["WeightUnit"] = value;
        }

        public int Department
        {
            get => ReadInt("Deptment");
            set => Raw["Deptment"] = value;
        }

        public int ShelfDays
        {
            get => ReadInt("ShlefTime", 15);
            set => Raw["ShlefTime"] = value;
        }

        public int LabelId
        {
            get => ReadInt("LabelId", 64);
            set => Raw["LabelId"] = value;
        }

        public double PackageWeight
        {
            get => ReadDouble("PackageWeight");
            set => Raw["PackageWeight"] = value;
        }

        public int PackageType
        {
            get => ReadInt("PackageType");
            set => Raw["PackageType"] = value;
        }

        public int HotKey
        {
            get => ReadInt("HotKey");
            set => Raw["HotKey"] = value;
        }

        private int ReadInt(string key, int fallback = 0)
        {
            if (Raw[key] == null) return fallback;
            int.TryParse(Raw[key].ToString(), out var value);
            return value;
        }

        private double ReadDouble(string key, double fallback = 0)
        {
            if (Raw[key] == null) return fallback;
            double.TryParse(Raw[key].ToString(), out var value);
            return value;
        }
    }
}
