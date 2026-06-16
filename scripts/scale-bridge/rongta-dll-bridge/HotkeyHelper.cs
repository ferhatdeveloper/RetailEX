using System;
using System.Collections.Generic;

namespace RetailEX.RongtaDllBridge
{
    /// <summary>
    /// TeraziRongta Form1.SendHotKey — 3 paket (84+84+56 = 224 tuş).
    /// </summary>
    internal static class HotkeyHelper
    {
        public const int TotalHotkeys = 224;
        public const int PackSize = 84;

        public static IList<int[]> BuildHotkeyTables(IList<int> lfCodes)
        {
            var table = new int[TotalHotkeys];
            for (var i = 0; i < TotalHotkeys; i++)
            {
                table[i] = i < lfCodes.Count ? lfCodes[i] : 0;
            }

            return new[]
            {
                Slice(table, 0, PackSize),
                Slice(table, PackSize, PackSize),
                Slice(table, PackSize * 2, TotalHotkeys - PackSize * 2),
            };
        }

        /// <summary>
        /// C# demo: 10001 + index (Form1.SendHotKey).
        /// </summary>
        public static IList<int[]> BuildDemoHotkeyTables(int baseLfCode = 10001)
        {
            var lfCodes = new List<int>(TotalHotkeys);
            for (var i = 0; i < TotalHotkeys; i++)
            {
                lfCodes.Add(baseLfCode + i);
            }
            return BuildHotkeyTables(lfCodes);
        }

        private static int[] Slice(int[] source, int offset, int length)
        {
            var dest = new int[length];
            Array.Copy(source, offset, dest, 0, length);
            return dest;
        }
    }
}
