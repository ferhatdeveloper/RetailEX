using System.Drawing;
using System.Drawing.Printing;
using System.Reflection;
using System.Windows.Forms;
using QrPrintDesktop.Core.Config;
using QrPrintDesktop.Core.Orders;

namespace QrPrintDesktop.Core.Printing;

public sealed class ReceiptPrinterService
{
    private readonly Audio.AudioService _audioService;

    public ReceiptPrinterService(Audio.AudioService audioService)
    {
        _audioService = audioService;
    }

    public bool PrintKitchenReceipt(StoredOrder order, AppSettings settings, string? printerName = null, string? title = null)
    {
        var printer = string.IsNullOrWhiteSpace(printerName)
            ? PrinterInventory.GetDefaultPrinterName()
            : printerName.Trim();
        var language = settings.KitchenReceiptLanguage;
        var heading = ReceiptCopy.ComposeKitchenTitle(title, language);
        var template = ReportTemplates.KitchenReceiptPath(language);
        var success = TryRunFastReport(order, settings, template, includePayment: false, printer, heading, language, preview: false)
            || PrintWithGdi(order, settings, includePayment: false, printer, heading, language);
        if (success)
        {
            _audioService.PlayReceiptPrintSound(settings);
        }

        return success;
    }

    public bool PrintAccountReceipt(StoredOrder order, AppSettings settings, string? printerName = null)
    {
        var printer = string.IsNullOrWhiteSpace(printerName)
            ? PrinterRouter.ResolveAccountPrinter(settings)
            : printerName.Trim();
        var language = settings.AccountReceiptLanguage;
        var banner = ReceiptCopy.Account(language).Banner;
        var template = ReportTemplates.AccountReceiptPath(language);
        var success = TryRunFastReport(order, settings, template, includePayment: true, printer, banner, language, preview: false)
            || PrintWithGdi(order, settings, includePayment: true, printer, banner, language);
        if (success)
        {
            _audioService.PlayReceiptPrintSound(settings);
        }

        return success;
    }

    public bool PrintTestPage(string printerName, AppSettings settings)
    {
        if (string.IsNullOrWhiteSpace(printerName))
        {
            return false;
        }

        var order = new StoredOrder(
            "test",
            "TEST",
            "-",
            "Yazıcı testi",
            DateTime.UtcNow,
            0m,
            0m,
            0m,
            "TRY",
            printerName,
            [new OrderLine("", 1, "Test sayfası", printerName, 0m, 0m, "", "Test")],
            false,
            null,
            "kitchen");
        return PrintOnSta(() => PrintWithGdi(order, settings, includePayment: false, printerName, "YAZICI TESTI", settings.KitchenReceiptLanguage));
    }

    public bool PreviewKitchenReceipt(StoredOrder order, AppSettings settings, string? printerName = null, string? title = null)
    {
        var printer = string.IsNullOrWhiteSpace(printerName)
            ? PrinterInventory.GetDefaultPrinterName()
            : printerName.Trim();
        var language = settings.KitchenReceiptLanguage;
        var heading = ReceiptCopy.ComposeKitchenTitle(title, language);
        var template = ReportTemplates.KitchenReceiptPath(language);
        return TryRunFastReport(order, settings, template, includePayment: false, printer, heading, language, preview: true)
            || PreviewWithGdi(order, settings, includePayment: false, printer, heading, language);
    }

    public bool PreviewAccountReceipt(StoredOrder order, AppSettings settings, string? printerName = null)
    {
        var printer = string.IsNullOrWhiteSpace(printerName)
            ? PrinterRouter.ResolveAccountPrinter(settings)
            : printerName.Trim();
        var language = settings.AccountReceiptLanguage;
        var banner = ReceiptCopy.Account(language).Banner;
        var template = ReportTemplates.AccountReceiptPath(language);
        return TryRunFastReport(order, settings, template, includePayment: true, printer, banner, language, preview: true)
            || PreviewWithGdi(order, settings, includePayment: true, printer, banner, language);
    }

    public static string GetDefaultPrinterName() => PrinterInventory.GetDefaultPrinterName();

    private static bool TryRunFastReport(StoredOrder order, AppSettings settings, string templatePath, bool includePayment, string printerName, string heading, string language, bool preview)
    {
        try
        {
            FastReportThemeFix.Install();
            var dllPath = Path.Combine(AppContext.BaseDirectory, "FastReport.dll");
            if (!File.Exists(dllPath))
            {
                return false;
            }

            var asm = Assembly.LoadFrom(dllPath);
            var reportType = asm.GetType("FastReport.Report");
            if (reportType is null)
            {
                return false;
            }

            var report = Activator.CreateInstance(reportType);
            if (report is null)
            {
                return false;
            }

            try
            {
                if (!File.Exists(templatePath))
                {
                    return false;
                }

                reportType.GetMethod("Load")?.Invoke(report, [templatePath]);
                ReceiptDataBinder.Bind(reportType, report, order, settings, heading, language);

                var printSettingsProp = reportType.GetProperty("PrintSettings");
                var printSettings = printSettingsProp?.GetValue(report);
                if (printSettings is not null)
                {
                    var psType = printSettings.GetType();
                    psType.GetProperty("ShowDialog")?.SetValue(printSettings, false);
                    if (!string.IsNullOrWhiteSpace(printerName))
                    {
                        psType.GetProperty("Printer")?.SetValue(printSettings, printerName);
                    }
                }

                reportType.GetMethod("Prepare", [typeof(bool)])?.Invoke(report, [false]);
                if (preview)
                {
                    var showPrepared = reportType.GetMethod("ShowPrepared", [typeof(bool)])
                        ?? reportType.GetMethod("ShowPrepared", Type.EmptyTypes);
                    if (showPrepared is null)
                    {
                        return false;
                    }

                    if (showPrepared.GetParameters().Length == 1)
                    {
                        showPrepared.Invoke(report, [true]);
                    }
                    else
                    {
                        showPrepared.Invoke(report, null);
                    }
                }
                else
                {
                    reportType.GetMethod("Print")?.Invoke(report, null);
                }

                return true;
            }
            finally
            {
                (report as IDisposable)?.Dispose();
            }
        }
        catch
        {
            return false;
        }
    }

    private static bool PrintWithGdi(StoredOrder order, AppSettings settings, bool includePayment, string printerName, string heading, string language)
    {
        try
        {
            Exception? printError = null;
            var thread = new Thread(() =>
            {
                try
                {
                    using var doc = CreateReceiptDocument(order, settings, includePayment, printerName, heading, language);
                    doc.Print();
                }
                catch (Exception ex)
                {
                    printError = ex;
                }
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            thread.Join();
            return printError is null;
        }
        catch
        {
            return false;
        }
    }

    private static bool PreviewWithGdi(StoredOrder order, AppSettings settings, bool includePayment, string printerName, string heading, string language)
    {
        try
        {
            return PrintOnSta(() =>
            {
                using var doc = CreateReceiptDocument(order, settings, includePayment, printerName, heading, language);
                using var dialog = new PrintPreviewDialog
                {
                    Document = doc,
                    Width = 520,
                    Height = 780,
                    StartPosition = FormStartPosition.CenterParent,
                    Text = "Fiş önizleme · " + order.OrderNumber
                };
                try
                {
                    dialog.PrintPreviewControl.AutoZoom = false;
                    dialog.PrintPreviewControl.Zoom = 1.2;
                }
                catch
                {
                    // varsayılan zoom yeterli
                }

                dialog.ShowDialog();
                return true;
            });
        }
        catch
        {
            return false;
        }
    }

    private static PrintDocument CreateReceiptDocument(
        StoredOrder order,
        AppSettings settings,
        bool includePayment,
        string printerName,
        string heading,
        string language)
    {
        var doc = new PrintDocument();
        if (!string.IsNullOrWhiteSpace(printerName))
        {
            try
            {
                doc.PrinterSettings.PrinterName = printerName;
            }
            catch
            {
                // önizleme yazıcısız da açılır
            }
        }

        doc.DocumentName = $"Siparis-{order.OrderNumber}";
        doc.DefaultPageSettings.PaperSize = new PaperSize("Receipt80", 315, 1575);
        doc.DefaultPageSettings.Margins = new Margins(8, 8, 8, 8);
        doc.PrintPage += (_, e) => DrawEightyMmPage(e, order, settings, includePayment, printerName, heading, language);
        return doc;
    }

    private static bool PrintOnSta(Func<bool> action)
    {
        if (Thread.CurrentThread.GetApartmentState() == ApartmentState.STA)
        {
            return action();
        }

        var result = false;
        var thread = new Thread(() => result = action());
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        return result;
    }

    private static void DrawEightyMmPage(
        PrintPageEventArgs e,
        StoredOrder order,
        AppSettings settings,
        bool includePayment,
        string printerName,
        string heading,
        string language)
    {
        if (e.Graphics is null)
        {
            return;
        }

        var rtl = ReceiptCopy.IsRtl(language);
        var fontName = rtl ? "Arial" : "Courier New";
        using var fontTitle = new Font(fontName, 13, FontStyle.Bold);
        using var fontBold = new Font(fontName, 9, FontStyle.Bold);
        using var fontNormal = new Font(fontName, 8, FontStyle.Regular);
        using var fontLarge = new Font(fontName, 12, FontStyle.Bold);
        using var fontItalic = new Font(fontName, 8, FontStyle.Italic);
        var g = e.Graphics;
        var width = Math.Min(302f, e.MarginBounds.Width > 40 ? e.MarginBounds.Width : 280f);
        var formatRight = new StringFormat { Alignment = StringAlignment.Far };
        var formatCenter = new StringFormat { Alignment = StringAlignment.Center };
        if (rtl)
        {
            formatRight.FormatFlags |= StringFormatFlags.DirectionRightToLeft;
            formatCenter.FormatFlags |= StringFormatFlags.DirectionRightToLeft;
        }

        float y = 8;
        void Line(float thickness = 1)
        {
            g.DrawLine(Pens.Black, 0, y, width, y);
            y += 6 + thickness;
        }

        void Dash()
        {
            using var pen = new Pen(Color.Black, 1) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash };
            g.DrawLine(pen, 0, y, width, y);
            y += 8;
        }

        void Row(string left, string right, Font font)
        {
            g.DrawString(left, font, Brushes.Black, 0, y);
            g.DrawString(right, font, Brushes.Black, new RectangleF(width / 2, y, width / 2, 18), formatRight);
            y += 16;
        }

        var company = string.IsNullOrWhiteSpace(settings.CompanyName) ? "RetailEX" : settings.CompanyName;
        var stamp = order.CreatedAt.ToLocalTime().ToString("dd.MM.yyyy HH:mm", ReceiptCopy.Culture(language));

        if (includePayment)
        {
            var copy = ReceiptCopy.Account(language);
            g.DrawString(company, fontTitle, Brushes.Black, new RectangleF(0, y, width, 22), formatCenter);
            y += 22;
            g.DrawString(heading, fontBold, Brushes.Black, new RectangleF(0, y, width, 18), formatCenter);
            y += 20;
            Line(2);
            Row(copy.ReceiptNo, order.OrderNumber, fontBold);
            Row(copy.Date, stamp, fontNormal);
            Row(copy.Cashier, order.CustomerName, fontNormal);
            Row(copy.Table, order.TableNumber, fontBold);
            Dash();
            g.DrawString($"{copy.Product,-18}{copy.Qty,4}{copy.Amount,10}", fontBold, Brushes.Black, 0, y);
            y += 16;
            Line();
            foreach (var item in order.Items)
            {
                g.DrawString($"{item.Name}", fontBold, Brushes.Black, 0, y);
                g.DrawString($"{item.Quantity}x", fontNormal, Brushes.Black, new RectangleF(width * 0.55f, y, 40, 16), formatCenter);
                g.DrawString(FormatAmount(item.LineTotal, language), fontBold, Brushes.Black, new RectangleF(width - 90, y, 90, 16), formatRight);
                y += 16;
                if (!string.IsNullOrWhiteSpace(item.Note) || !string.IsNullOrWhiteSpace(item.Description))
                {
                    g.DrawString(string.Join(" · ", new[] { item.Description, item.Note }.Where(v => !string.IsNullOrWhiteSpace(v))), fontItalic, Brushes.Black, 8, y);
                    y += 14;
                }
            }

            Line();
            Row(copy.Subtotal, FormatAmount(order.SubtotalAmount, language), fontNormal);
            Row(copy.Discount, FormatAmount(order.DiscountAmount, language), fontNormal);
            Line(2);
            Row(copy.Total, FormatAmount(order.TotalAmount, language), fontTitle);
            y += 4;
            g.DrawString(copy.Payment, fontBold, Brushes.Black, 0, y);
            y += 16;
            Row(copy.Paid, FormatAmount(0m, language), fontNormal);
            Row(copy.Remaining, FormatAmount(order.TotalAmount, language), fontBold);
            Dash();
            g.DrawString(copy.Thanks, fontBold, Brushes.Black, new RectangleF(0, y, width, 16), formatCenter);
            y += 18;
            g.DrawString($"* {order.OrderNumber} *", fontBold, Brushes.Black, new RectangleF(0, y, width, 16), formatCenter);
            y += 16;
            g.DrawString(copy.Footer, fontNormal, Brushes.Black, new RectangleF(0, y, width, 14), formatCenter);
            return;
        }

        var kitchen = ReceiptCopy.Kitchen(language);
        g.DrawString(heading, fontTitle, Brushes.Black, new RectangleF(0, y, width, 24), formatCenter);
        y += 24;
        g.DrawString(company, fontNormal, Brushes.Black, new RectangleF(0, y, width, 14), formatCenter);
        y += 16;
        Line(2);
        Row(kitchen.Table, order.TableNumber, fontBold);
        Row(kitchen.Waiter, order.CustomerName, fontBold);
        Row(kitchen.Time, stamp, fontNormal);
        if (!string.IsNullOrWhiteSpace(order.CustomerNote))
        {
            g.DrawString(order.CustomerNote, fontItalic, Brushes.Black, new RectangleF(0, y, width, 32));
            y += 18;
        }

        Dash();
        g.DrawRectangle(Pens.Black, 0, y, 50, 18);
        g.DrawString(kitchen.Qty, fontBold, Brushes.Black, new RectangleF(0, y, 50, 18), formatCenter);
        g.DrawRectangle(Pens.Black, 50, y, width - 50, 18);
        g.DrawString(kitchen.Product, fontBold, Brushes.Black, 56, y + 2);
        y += 20;
        foreach (var item in order.Items)
        {
            g.DrawRectangle(Pens.Black, 0, y, 50, 22);
            g.DrawString($"{item.Quantity}x", fontLarge, Brushes.Black, new RectangleF(0, y, 50, 22), formatCenter);
            g.DrawRectangle(Pens.Black, 50, y, width - 50, 22);
            g.DrawString(item.Name, fontBold, Brushes.Black, 56, y + 3);
            y += 22;
            var detail = string.Join(" · ", new[] { item.Note, item.Description }.Where(v => !string.IsNullOrWhiteSpace(v)));
            if (!string.IsNullOrWhiteSpace(detail))
            {
                g.DrawRectangle(Pens.Black, 0, y, width, 16);
                g.DrawString(detail, fontItalic, Brushes.Black, 6, y + 1);
                y += 16;
            }
        }

        Dash();
        g.DrawString(kitchen.Footer, fontBold, Brushes.Black, new RectangleF(0, y, width, 16), formatCenter);
    }

    private static string FormatAmount(decimal amount, string? language)
    {
        var culture = ReceiptCopy.Culture(language);
        return amount.ToString("#,0.##", culture);
    }
}
