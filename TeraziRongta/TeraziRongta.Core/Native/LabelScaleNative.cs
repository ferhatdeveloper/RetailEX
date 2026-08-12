using System;
using System.Runtime.InteropServices;
using System.Text;

namespace TeraziRongta.Core.Native
{
    [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    public delegate void RtscaleJsonCallback(
        [MarshalAs(UnmanagedType.LPStr)] string json,
        int index,
        int total);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    public delegate void RtscaleWeightCallback(double weight);

    [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    public delegate void RtscaleWeightJsonCallback(
        [MarshalAs(UnmanagedType.LPStr)] string json);

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct RtscaleWeightInfo
    {
        public double Weight;
        public double Product;
        public double QtyWeight;
        public int Deptment;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 11)]
        public string Code;
        public double TotalPrice;
        public double UnitPrice;
    }

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    public delegate void RtscaleWeightInfoCallback(ref RtscaleWeightInfo info);

    public static class LabelScaleNative
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

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, EntryPoint = "rtscaleGetPluWeight")]
        public static extern int rtscaleGetPluWeight(int connid, ref double dWeight);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, EntryPoint = "rtscaleGetPluWeight")]
        public static extern int rtscaleGetPluWeightGram(int connid, ref int dWeight);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, EntryPoint = "rtscaleStartGetWeightbyNet")]
        public static extern void rtscaleStartGetWeightbyNet(int connid, IntPtr callback);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, EntryPoint = "rtscaleStopGetWeightbyNet")]
        public static extern int rtscaleStopGetWeightbyNet(int connid);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleUploadSaleData")]
        public static extern int rtscaleUploadSaleData(int connid, bool clearData, IntPtr callback);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern int rtscaleUploadPluData(int connid, IntPtr callback);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, EntryPoint = "rtscaleDownLoadData")]
        public static extern int rtscaleDownLoadData(int connid, byte[] data, int len);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, EntryPoint = "rtscaleDownloadDecimalPlaceSet")]
        public static extern int rtscaleDownloadDecimalPlaceSet(int connid, int decimalPlace);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, EntryPoint = "rtscaleUploadDecimalPlaceSet")]
        public static extern int rtscaleUploadDecimalPlaceSet(int connid, ref int decimalPlace);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, EntryPoint = "rtscaleDownLoadPackTypeFunSet")]
        public static extern int rtscaleDownLoadPackTypeFunSet(int connid, byte[] data, int len);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, EntryPoint = "rtscaleUploadData")]
        public static extern int rtscaleUploadData(int connid, byte[] data, int len, StringBuilder retdata);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleDownLoadMessage")]
        public static extern int rtscaleDownLoadMessage(int connid, int msgId, string message, int dataLen, ref int iLongMsg);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleUploadMessage")]
        public static extern int rtscaleUploadMessage(int connid, IntPtr callback);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleDownLoadAdHead")]
        public static extern int rtscaleDownLoadAdHead(int connid, string adInfo, int len);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleDownLoadAdTail")]
        public static extern int rtscaleDownLoadAdTail(int connid, string adInfo, int len);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleUploadDataAdHead")]
        public static extern int rtscaleUploadDataAdHead(int connid, StringBuilder retData);

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi, EntryPoint = "rtscaleUploadDataAdTail")]
        public static extern int rtscaleUploadDataAdTail(int connid, StringBuilder retData);
    }
}
