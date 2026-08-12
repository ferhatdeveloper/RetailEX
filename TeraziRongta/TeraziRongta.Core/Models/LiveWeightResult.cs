namespace TeraziRongta.Core.Models
{
    public class LiveWeightResult
    {
        public bool Connected { get; set; }
        public double? WeightKg { get; set; }
        public bool Stable { get; set; }
        public string Source { get; set; }
        public int SampleCount { get; set; }
        public string Detail { get; set; }
        public double LastRawSample { get; set; }
    }
}
