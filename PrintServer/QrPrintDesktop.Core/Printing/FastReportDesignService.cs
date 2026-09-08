using System.Reflection;
using QrPrintDesktop.Core.Config;
using QrPrintDesktop.Core.Orders;

namespace QrPrintDesktop.Core.Printing;

public sealed class FastReportDesignService
{
    public bool OpenDesigner(string reportPath, out string errorMessage) =>
        OpenDesigner(reportPath, new AppSettings(), ReceiptDataBinder.SampleOrder(new AppSettings()), "MUTFAK FİŞİ", "tr", out errorMessage);

    public bool OpenDesigner(
        string reportPath,
        AppSettings settings,
        StoredOrder? sample,
        string heading,
        string language,
        out string errorMessage)
    {
        errorMessage = string.Empty;

        try
        {
            FastReportThemeFix.Install();
            var fastReportDll = Path.Combine(AppContext.BaseDirectory, "FastReport.dll");
            var editorDll = Path.Combine(AppContext.BaseDirectory, "FastReport.Editor.dll");

            if (!File.Exists(fastReportDll))
            {
                errorMessage = "FastReport.dll bulunamadı.";
                return false;
            }

            if (!File.Exists(editorDll))
            {
                errorMessage = "FastReport.Editor.dll bulunamadı.";
                return false;
            }

            if (!File.Exists(reportPath))
            {
                errorMessage = "Şablon bulunamadı: " + reportPath;
                return false;
            }

            _ = Assembly.LoadFrom(editorDll);
            var asm = Assembly.LoadFrom(fastReportDll);
            var reportType = asm.GetType("FastReport.Report");
            if (reportType is null)
            {
                errorMessage = "FastReport.Report tipi bulunamadı.";
                return false;
            }

            var report = Activator.CreateInstance(reportType);
            if (report is null)
            {
                errorMessage = "Report instance oluşturulamadı.";
                return false;
            }

            try
            {
                reportType.GetMethod("Load", [typeof(string)])?.Invoke(report, [reportPath]);
                var order = sample ?? ReceiptDataBinder.SampleOrder(settings);
                ReceiptDataBinder.Bind(reportType, report, order, settings, heading, language);

                var designMethod =
                    reportType.GetMethod("Design", Type.EmptyTypes) ??
                    reportType.GetMethod("Design", [typeof(bool)]);

                if (designMethod is null)
                {
                    errorMessage = "Design metodu bulunamadı.";
                    return false;
                }

                _ = designMethod.GetParameters().Length switch
                {
                    0 => designMethod.Invoke(report, null),
                    1 => designMethod.Invoke(report, [true]),
                    _ => null
                };

                reportType.GetMethod("Save", [typeof(string)])?.Invoke(report, [reportPath]);
                ReportTemplates.PublishTemplate(reportPath);
                return true;
            }
            finally
            {
                (report as IDisposable)?.Dispose();
            }
        }
        catch (Exception ex)
        {
            errorMessage = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
    }
}
