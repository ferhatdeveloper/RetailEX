using QrPrintDesktop.Core.Config;

namespace QrPrintDesktop.Core.Printing;

public static class ReportTemplates
{
    public static string KitchenReceiptPath(string? language = null) =>
        ResolveLocalized("Kitchen80.frx", language, "OrderReceipt.frx");

    public static string AccountReceiptPath(string? language = null) =>
        ResolveLocalized("Account80.frx", language, "AccountReceipt.frx");

    public static string WaiterCallReceiptPath => ResolveReportPath("WaiterCallReceipt.frx");

    public static string FeedbackReceiptPath => ResolveReportPath("FeedbackReceipt.frx");

    public static IReadOnlyList<string> ReportsRootCandidates()
    {
        return
        [
            Path.Combine(AppContext.BaseDirectory, "Reports"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Reports"))
        ];
    }

    private static string ResolveLocalized(string fileName, string? language, string legacyFile)
    {
        var lang = ReceiptCopy.NormalizeLanguage(language);
        foreach (var root in ReportsRootCandidates())
        {
            var localized = Path.Combine(root, lang, fileName);
            if (File.Exists(localized))
            {
                return localized;
            }
        }

        if (lang != "tr")
        {
            foreach (var root in ReportsRootCandidates())
            {
                var turkish = Path.Combine(root, "tr", fileName);
                if (File.Exists(turkish))
                {
                    return turkish;
                }
            }
        }

        return ResolveReportPath(legacyFile);
    }

    private static string ResolveReportPath(string fileName)
    {
        foreach (var root in ReportsRootCandidates())
        {
            var path = Path.Combine(root, fileName);
            if (File.Exists(path))
            {
                return path;
            }
        }

        return Path.Combine(AppContext.BaseDirectory, "Reports", fileName);
    }

    public static string EditablePath(string resolvedPath)
    {
        if (string.IsNullOrWhiteSpace(resolvedPath))
        {
            return resolvedPath;
        }

        var relative = RelativeReportsPath(resolvedPath);
        if (string.IsNullOrWhiteSpace(relative))
        {
            return resolvedPath;
        }

        var repo = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Reports", relative));
        return File.Exists(repo) ? repo : resolvedPath;
    }

    public static void PublishTemplate(string savedPath)
    {
        if (string.IsNullOrWhiteSpace(savedPath) || !File.Exists(savedPath))
        {
            return;
        }

        var relative = RelativeReportsPath(savedPath);
        if (string.IsNullOrWhiteSpace(relative))
        {
            return;
        }

        var source = Path.GetFullPath(savedPath);
        foreach (var root in ReportsRootCandidates())
        {
            var dest = Path.GetFullPath(Path.Combine(root, relative));
            if (string.Equals(dest, source, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
            File.Copy(source, dest, overwrite: true);
        }
    }

    private static string RelativeReportsPath(string path)
    {
        var full = Path.GetFullPath(path);
        var marker = $"{Path.DirectorySeparatorChar}Reports{Path.DirectorySeparatorChar}";
        var idx = full.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (idx >= 0)
        {
            return full[(idx + marker.Length)..];
        }

        var file = Path.GetFileName(full);
        var parent = Path.GetFileName(Path.GetDirectoryName(full));
        return parent is "tr" or "en" or "ar" or "ku" or "uz"
            ? Path.Combine(parent, file)
            : file;
    }
}
