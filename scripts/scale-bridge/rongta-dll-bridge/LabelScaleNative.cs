using System;
using System.Runtime.InteropServices;
using System.Text;

namespace RetailEX.RongtaDllBridge
{
    [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    internal delegate void RtscaleJsonCallback(
        [MarshalAs(UnmanagedType.LPStr)] string json,
        int index,
        int total);

    internal static class LabelScaleNative
    {
        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleConnect")]
        public static extern int rtscaleConnect(string addr, int baudRate, ref int connid);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, EntryPoint = "rtscaleDisConnect")]
        public static extern int rtscaleDisConnect(int connid);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleLoadIniFile")]
        public static extern int rtscaleLoadIniFile(string cfgFileName);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern int rtscaleClearPLUData(int connid);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleDownLoadPLU")]
        public static extern int rtscaleDownLoadPLU(int connid, string pluJson, int ipack);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleDownLoadHotkey")]
        public static extern int rtscaleDownLoadHotkey(int connid, int[] hotkeyTable, int tableIndex);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern int rtscaleGetPluWeight(int connid, ref double dWeight);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleUploadSaleData")]
        public static extern int rtscaleUploadSaleData(int connid, bool clearData, IntPtr callback);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern int rtscaleUploadPluData(int connid, IntPtr callback);
    }
}
