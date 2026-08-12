using System;
using System.Collections.Generic;

namespace TeraziRongta.Core.Helpers
{
    public static class LabelSlotHelper
    {
        public static readonly IReadOnlyList<string> Slots = new[] { "D0", "D1", "C0", "C1", "B0", "B1", "A0", "A1" };

        public static byte ResolveLabelId(string slot)
        {
            switch ((slot ?? "D0").Trim().ToUpperInvariant())
            {
                case "A0": return 1;
                case "A1": return 2;
                case "B0": return 4;
                case "B1": return 8;
                case "C0": return 16;
                case "C1": return 32;
                case "D1": return 128;
                case "D0":
                default: return 64;
            }
        }

        public static int ResolveFunctionLabelType(string slot)
        {
            switch ((slot ?? "D0").Trim().ToUpperInvariant())
            {
                case "A0": return 0;
                case "A1": return 1;
                case "B0": return 2;
                case "B1": return 3;
                case "C0": return 4;
                case "C1": return 5;
                case "D1": return 7;
                case "D0":
                default: return 6;
            }
        }
    }
}
