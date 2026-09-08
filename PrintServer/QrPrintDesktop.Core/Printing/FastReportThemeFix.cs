using System.Reflection;
using System.Runtime.InteropServices;
using HarmonyLib;

namespace QrPrintDesktop.Core.Printing;

/// <summary>
/// FastReport 2015 ComboBoxEx, SetWindowTheme'i user32'den çağırır; fonksiyon uxtheme.dll'dedir.
/// .NET 9'da bu EntryPointNotFoundException ile uygulamayı düşürür.
/// </summary>
public static class FastReportThemeFix
{
    private static int _installed;
    private static Harmony? _harmony;

    public static void Install()
    {
        if (Interlocked.Exchange(ref _installed, 1) != 0)
        {
            return;
        }

        AppDomain.CurrentDomain.AssemblyLoad += (_, e) => TryPatch(e.LoadedAssembly);
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            TryPatch(assembly);
        }
    }

    private static void TryPatch(Assembly assembly)
    {
        if (!string.Equals(assembly.GetName().Name, "FastReport.Bars", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        try
        {
            var comboBoxEx = assembly.GetType("FastReport.DevComponents.DotNetBar.Controls.ComboBoxEx");
            if (comboBoxEx is null)
            {
                return;
            }

            var removeTheme = comboBoxEx.GetMethod(
                "RemoveTheme",
                BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public,
                [typeof(IntPtr)]);
            var setWindowTheme = comboBoxEx.GetMethod(
                "SetWindowTheme",
                BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public,
                [typeof(IntPtr), typeof(string), typeof(string)]);

            _harmony ??= new Harmony("retailex.qrprint.fastreport.uxtheme");
            if (removeTheme is not null)
            {
                _harmony.Patch(removeTheme, prefix: new HarmonyMethod(typeof(FastReportThemeFix), nameof(RemoveThemePrefix)));
            }

            if (setWindowTheme is not null)
            {
                _harmony.Patch(setWindowTheme, prefix: new HarmonyMethod(typeof(FastReportThemeFix), nameof(SetWindowThemePrefix)));
            }
        }
        catch
        {
            // Yama uygulanamazsa FastReport tasarımcısı açılamayabilir; yazdırma GDI yedeğine düşer.
        }
    }

    private static bool RemoveThemePrefix(IntPtr handle)
    {
        if (handle != IntPtr.Zero)
        {
            _ = NativeSetWindowTheme(handle, string.Empty, string.Empty);
        }

        return false;
    }

    private static bool SetWindowThemePrefix(IntPtr hWnd, string pszSubAppName, string pszSubIdList, ref int __result)
    {
        __result = NativeSetWindowTheme(hWnd, pszSubAppName ?? string.Empty, pszSubIdList ?? string.Empty);
        return false;
    }

    [DllImport("uxtheme.dll", CharSet = CharSet.Unicode, ExactSpelling = true, EntryPoint = "SetWindowTheme")]
    private static extern int NativeSetWindowTheme(IntPtr hWnd, string pszSubAppName, string pszSubIdList);
}
