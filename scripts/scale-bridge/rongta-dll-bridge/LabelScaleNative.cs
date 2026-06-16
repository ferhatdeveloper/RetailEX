using System;
using System.Runtime.InteropServices;

namespace RetailEX.RongtaDllBridge
{
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

        [DllImport("rtslabelscale.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern int rtscaleGetPluWeight(int connid, ref double dWeight);
    }
}
