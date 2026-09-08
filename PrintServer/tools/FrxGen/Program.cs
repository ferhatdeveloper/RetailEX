using System.Text;
using QrPrintDesktop.Core.Printing;

var root = args.Length > 0 ? args[0] : Path.GetFullPath("Reports");
Directory.CreateDirectory(root);

foreach (var lang in ReceiptCopy.Languages)
{
    var dir = Path.Combine(root, lang);
    Directory.CreateDirectory(dir);
    var kitchen = ReceiptCopy.Kitchen(lang);
    var account = ReceiptCopy.Account(lang);
    var font = ReceiptCopy.IsRtl(lang) ? "Arial" : "Courier New";
    File.WriteAllText(Path.Combine(dir, "Kitchen80.frx"), KitchenFrx(kitchen, font), new UTF8Encoding(false));
    File.WriteAllText(Path.Combine(dir, "Account80.frx"), AccountFrx(account, font), new UTF8Encoding(false));
    Console.WriteLine(lang);
}

File.Copy(Path.Combine(root, "tr", "Kitchen80.frx"), Path.Combine(root, "OrderReceipt.frx"), overwrite: true);
File.Copy(Path.Combine(root, "tr", "Account80.frx"), Path.Combine(root, "AccountReceipt.frx"), overwrite: true);

static string X(string value) =>
    value.Replace("&", "&amp;", StringComparison.Ordinal)
        .Replace("<", "&lt;", StringComparison.Ordinal)
        .Replace(">", "&gt;", StringComparison.Ordinal);

static string KitchenFrx(KitchenReceiptCopy L, string font) =>
    $$"""
<?xml version="1.0" encoding="utf-8"?>
<Report ScriptLanguage="CSharp" TextQuality="Regular" ReportInfo.Created="09/06/2026 20:50:00" ReportInfo.Modified="09/06/2026 20:50:00" ReportInfo.CreatorVersion="2024.1.0.0">
  <Dictionary>
    <Parameter Name="CompanyName" DataType="System.String" AsString="RetailEX" />
    <Parameter Name="KitchenTitle" DataType="System.String" AsString="{{X(L.Title)}}" />
    <Parameter Name="ReceiptNo" DataType="System.String" AsString="" />
    <Parameter Name="OrderNumber" DataType="System.String" AsString="" />
    <Parameter Name="TableNumber" DataType="System.String" AsString="" />
    <Parameter Name="CreatedAt" DataType="System.String" AsString="" />
    <Parameter Name="CustomerName" DataType="System.String" AsString="" />
    <Parameter Name="CustomerNote" DataType="System.String" AsString="" />
    <TableDataSource Name="OrderItems" ReferenceName="OrderItems" DataType="System.Int32" Enabled="true">
      <Column Name="Qty" DataType="System.String" />
      <Column Name="Name" DataType="System.String" />
      <Column Name="Description" DataType="System.String" />
      <Column Name="Price" DataType="System.String" />
      <Column Name="LineTotal" DataType="System.String" />
      <Column Name="Note" DataType="System.String" />
      <Column Name="Category" DataType="System.String" />
    </TableDataSource>
  </Dictionary>
  <ReportPage Name="Page1" PaperWidth="80" PaperHeight="297" LeftMargin="2" RightMargin="2" TopMargin="2" BottomMargin="2">
    <PageHeaderBand Name="PageHeader1" Width="287.28" Height="151.2">
      <TextObject Name="TextDashTop" Width="287.28" Height="11.34" Text="----------------------------------------------" HorzAlign="Center" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="TextTitle" Top="12.47" Width="287.28" Height="30.24" Text="[KitchenTitle]" HorzAlign="Center" Font="{{font}}, 14pt, style=Bold" />
      <TextObject Name="TextCompany" Top="42.71" Width="287.28" Height="13.23" Text="[CompanyName]" HorzAlign="Center" Font="{{font}}, 8pt" />
      <LineObject Name="Line1" Top="58.59" Width="287.28" Border.Width="1.5" Border.Color="Black" />
      <TextObject Name="LblTable" Top="62.37" Width="151.2" Height="17.01" Text="{{X(L.Table)}}" Font="{{font}}, 9pt, style=Bold" />
      <TextObject Name="ValTable" Top="62.37" Left="151.2" Width="136.08" Height="17.01" Text="[TableNumber]" HorzAlign="Right" Font="{{font}}, 11pt, style=Bold" />
      <TextObject Name="LblWaiter" Top="79.38" Width="151.2" Height="15.12" Text="{{X(L.Waiter)}}" Font="{{font}}, 9pt, style=Bold" />
      <TextObject Name="ValWaiter" Top="79.38" Left="151.2" Width="136.08" Height="15.12" Text="[CustomerName]" HorzAlign="Right" Font="{{font}}, 9pt, style=Bold" />
      <TextObject Name="LblTime" Top="94.5" Width="151.2" Height="15.12" Text="{{X(L.Time)}}" Font="{{font}}, 9pt, style=Bold" />
      <TextObject Name="ValTime" Top="94.5" Left="151.2" Width="136.08" Height="15.12" Text="[CreatedAt]" HorzAlign="Right" Font="{{font}}, 9pt" />
      <TextObject Name="ValNote" Top="109.62" Width="287.28" Height="15.12" Text="[CustomerNote]" CanGrow="true" Font="{{font}}, 8pt, style=Italic" />
      <LineObject Name="Line2" Top="126.63" Width="287.28" Border.Style="Dash" Border.Color="Black" />
      <TextObject Name="ColQty" Top="130.41" Width="56.7" Height="18.9" Text="{{X(L.Qty)}}" HorzAlign="Center" Font="{{font}}, 9pt, style=Bold" Border.Lines="All" />
      <TextObject Name="ColProduct" Top="130.41" Left="56.7" Width="230.58" Height="18.9" Text="{{X(L.Product)}}" Font="{{font}}, 9pt, style=Bold" Border.Lines="All" Padding="4, 2, 2, 2" />
    </PageHeaderBand>
    <DataBand Name="Data1" Top="155.4" Width="287.28" Height="47.25" DataSource="OrderItems" CanGrow="true">
      <TextObject Name="ItemQty" Width="56.7" Height="26.46" Text="[OrderItems.Qty]" HorzAlign="Center" VertAlign="Center" Font="{{font}}, 14pt, style=Bold" Border.Lines="All" />
      <TextObject Name="ItemName" Left="56.7" Width="230.58" Height="26.46" Text="[OrderItems.Name]" VertAlign="Center" Font="{{font}}, 11pt, style=Bold" Border.Lines="All" Padding="4, 2, 2, 2" />
      <TextObject Name="ItemDesc" Top="26.46" Width="287.28" Height="20.79" Text="[OrderItems.Note]" CanGrow="true" Font="{{font}}, 8pt, style=Italic" Border.Lines="Left, Right, Bottom" Padding="4, 2, 2, 2" />
    </DataBand>
    <ReportSummaryBand Name="ReportSummary1" Top="206.65" Width="287.28" Height="49.14">
      <LineObject Name="Line3" Width="287.28" Border.Style="Dash" Border.Color="Black" />
      <TextObject Name="TextFooter" Top="7.56" Width="287.28" Height="18.9" Text="{{X(L.Footer)}}" HorzAlign="Center" Font="{{font}}, 9pt, style=Bold" />
      <TextObject Name="TextDashBottom" Top="28.35" Width="287.28" Height="15.12" Text="----------------------------------------------" HorzAlign="Center" Font="{{font}}, 8pt" />
    </ReportSummaryBand>
  </ReportPage>
</Report>
""";

static string AccountFrx(AccountReceiptCopy L, string font) =>
    $$"""
<?xml version="1.0" encoding="utf-8"?>
<Report ScriptLanguage="CSharp" TextQuality="Regular" ReportInfo.Created="09/06/2026 20:50:00" ReportInfo.Modified="09/06/2026 20:50:00" ReportInfo.CreatorVersion="2024.1.0.0">
  <Dictionary>
    <Parameter Name="CompanyName" DataType="System.String" AsString="RetailEX" />
    <Parameter Name="ReceiptNo" DataType="System.String" AsString="" />
    <Parameter Name="Cashier" DataType="System.String" AsString="" />
    <Parameter Name="OrderNumber" DataType="System.String" AsString="" />
    <Parameter Name="TableNumber" DataType="System.String" AsString="" />
    <Parameter Name="CreatedAt" DataType="System.String" AsString="" />
    <Parameter Name="CustomerName" DataType="System.String" AsString="" />
    <Parameter Name="CustomerNote" DataType="System.String" AsString="" />
    <Parameter Name="Subtotal" DataType="System.String" AsString="0,00" />
    <Parameter Name="DiscountAmount" DataType="System.String" AsString="0,00" />
    <Parameter Name="Total" DataType="System.String" AsString="0,00" />
    <Parameter Name="PaidAmount" DataType="System.String" AsString="0,00" />
    <Parameter Name="RemainingAmount" DataType="System.String" AsString="0,00" />
    <Parameter Name="Banner" DataType="System.String" AsString="{{X(L.Banner)}}" />
    <TableDataSource Name="OrderItems" ReferenceName="OrderItems" DataType="System.Int32" Enabled="true">
      <Column Name="Qty" DataType="System.String" />
      <Column Name="Name" DataType="System.String" />
      <Column Name="Description" DataType="System.String" />
      <Column Name="Price" DataType="System.String" />
      <Column Name="LineTotal" DataType="System.String" />
      <Column Name="Note" DataType="System.String" />
      <Column Name="Category" DataType="System.String" />
    </TableDataSource>
  </Dictionary>
  <ReportPage Name="Page1" PaperWidth="80" PaperHeight="320" LeftMargin="2" RightMargin="2" TopMargin="2" BottomMargin="2">
    <PageHeaderBand Name="PageHeader1" Width="287.28" Height="170.1">
      <TextObject Name="TextCompany" Width="287.28" Height="22.68" Text="[CompanyName]" HorzAlign="Center" Font="{{font}}, 12pt, style=Bold" />
      <TextObject Name="TextBanner" Top="22.68" Width="287.28" Height="22.68" Text="[Banner]" HorzAlign="Center" Font="{{font}}, 11pt, style=Bold" />
      <LineObject Name="LineDouble" Top="47.25" Width="287.28" Border.Width="2" Border.Color="Black" />
      <TextObject Name="LblNo" Top="51.03" Width="132.3" Height="15.12" Text="{{X(L.ReceiptNo)}}" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="ValNo" Top="51.03" Left="132.3" Width="154.98" Height="15.12" Text="[ReceiptNo]" HorzAlign="Right" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="LblDate" Top="66.15" Width="132.3" Height="15.12" Text="{{X(L.Date)}}" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="ValDate" Top="66.15" Left="132.3" Width="154.98" Height="15.12" Text="[CreatedAt]" HorzAlign="Right" Font="{{font}}, 8pt" />
      <TextObject Name="LblCashier" Top="81.27" Width="132.3" Height="15.12" Text="{{X(L.Cashier)}}" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="ValCashier" Top="81.27" Left="132.3" Width="154.98" Height="15.12" Text="[CustomerName]" HorzAlign="Right" Font="{{font}}, 8pt" />
      <TextObject Name="LblTable" Top="96.39" Width="132.3" Height="15.12" Text="{{X(L.Table)}}" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="ValTable" Top="96.39" Left="132.3" Width="154.98" Height="15.12" Text="[TableNumber]" HorzAlign="Right" Font="{{font}}, 10pt, style=Bold" />
      <LineObject Name="LineDash" Top="113.4" Width="287.28" Border.Style="Dash" Border.Color="Black" />
      <TextObject Name="ColProduct" Top="117.18" Width="151.2" Height="15.12" Text="{{X(L.Product)}}" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="ColQty" Top="117.18" Left="151.2" Width="45.36" Height="15.12" Text="{{X(L.Qty)}}" HorzAlign="Center" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="ColAmount" Top="117.18" Left="196.56" Width="90.72" Height="15.12" Text="{{X(L.Amount)}}" HorzAlign="Right" Font="{{font}}, 8pt, style=Bold" />
      <LineObject Name="LineCols" Top="134.19" Width="287.28" Border.Color="Black" />
    </PageHeaderBand>
    <DataBand Name="Data1" Top="174.28" Width="287.28" Height="37.8" DataSource="OrderItems" CanGrow="true">
      <TextObject Name="ItemName" Width="151.2" Height="18.9" Text="[OrderItems.Name]" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="ItemQty" Left="151.2" Width="45.36" Height="18.9" Text="[OrderItems.Qty]" HorzAlign="Center" Font="{{font}}, 8pt" />
      <TextObject Name="ItemTotal" Left="196.56" Width="90.72" Height="18.9" Text="[OrderItems.LineTotal]" HorzAlign="Right" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="ItemNote" Top="18.9" Width="287.28" Height="15.12" Text="[OrderItems.Note]" CanGrow="true" Font="{{font}}, 7pt, style=Italic" />
    </DataBand>
    <ReportSummaryBand Name="ReportSummary1" Top="216.08" Width="287.28" Height="198.45">
      <LineObject Name="LineSum" Width="287.28" Border.Color="Black" />
      <TextObject Name="LblSub" Top="5.67" Width="170.1" Height="15.12" Text="{{X(L.Subtotal)}}" Font="{{font}}, 8pt" />
      <TextObject Name="ValSub" Top="5.67" Left="170.1" Width="117.18" Height="15.12" Text="[Subtotal]" HorzAlign="Right" Font="{{font}}, 8pt" />
      <TextObject Name="LblDisc" Top="20.79" Width="170.1" Height="15.12" Text="{{X(L.Discount)}}" Font="{{font}}, 8pt" />
      <TextObject Name="ValDisc" Top="20.79" Left="170.1" Width="117.18" Height="15.12" Text="[DiscountAmount]" HorzAlign="Right" Font="{{font}}, 8pt" />
      <LineObject Name="LineTot" Top="39.69" Width="287.28" Border.Width="2" Border.Color="Black" />
      <TextObject Name="LblTot" Top="43.47" Width="170.1" Height="22.68" Text="{{X(L.Total)}}" Font="{{font}}, 12pt, style=Bold" />
      <TextObject Name="ValTot" Top="43.47" Left="170.1" Width="117.18" Height="22.68" Text="[Total]" HorzAlign="Right" Font="{{font}}, 12pt, style=Bold" />
      <TextObject Name="LblPay" Top="69.93" Width="287.28" Height="13.23" Text="{{X(L.Payment)}}" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="LblPaid" Top="83.16" Width="170.1" Height="15.12" Text="{{X(L.Paid)}}" Font="{{font}}, 8pt" />
      <TextObject Name="ValPaid" Top="83.16" Left="170.1" Width="117.18" Height="15.12" Text="[PaidAmount]" HorzAlign="Right" Font="{{font}}, 8pt" />
      <TextObject Name="LblRem" Top="98.28" Width="170.1" Height="18.9" Text="{{X(L.Remaining)}}" Font="{{font}}, 10pt, style=Bold" />
      <TextObject Name="ValRem" Top="98.28" Left="170.1" Width="117.18" Height="18.9" Text="[RemainingAmount]" HorzAlign="Right" Font="{{font}}, 10pt, style=Bold" />
      <LineObject Name="LineThanks" Top="120.96" Width="287.28" Border.Style="Dash" Border.Color="Black" />
      <TextObject Name="TextThanks" Top="126.63" Width="287.28" Height="18.9" Text="{{X(L.Thanks)}}" HorzAlign="Center" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="TextKeep" Top="145.53" Width="287.28" Height="15.12" Text="{{X(L.KeepSlip)}}" HorzAlign="Center" Font="{{font}}, 7pt" />
      <TextObject Name="TextBarcode" Top="162.54" Width="287.28" Height="15.12" Text="* [ReceiptNo] *" HorzAlign="Center" Font="{{font}}, 8pt, style=Bold" />
      <TextObject Name="TextFoot" Top="177.66" Width="287.28" Height="13.23" Text="{{X(L.Footer)}}" HorzAlign="Center" Font="{{font}}, 7pt" />
    </ReportSummaryBand>
  </ReportPage>
</Report>
""";
