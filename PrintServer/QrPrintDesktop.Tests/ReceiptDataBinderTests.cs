using QrPrintDesktop.Core.Config;
using QrPrintDesktop.Core.Printing;

namespace QrPrintDesktop.Tests;

public class ReceiptDataBinderTests
{
    [Fact]
    public void BuildDataSet_ShouldListDatabaseFields()
    {
        var settings = new AppSettings { CompanyName = "RetailEX" };
        var order = ReceiptDataBinder.SampleOrder(settings);
        var data = ReceiptDataBinder.BuildDataSet(order, settings, "MUTFAK FİŞİ", "tr");

        Assert.Contains("waiter", data.Tables["kitchen_orders"]!.Columns.Cast<System.Data.DataColumn>().Select(c => c.ColumnName));
        Assert.Contains("table_number", data.Tables["kitchen_orders"]!.Columns.Cast<System.Data.DataColumn>().Select(c => c.ColumnName));
        Assert.Contains("product_name", data.Tables["kitchen_order_items"]!.Columns.Cast<System.Data.DataColumn>().Select(c => c.ColumnName));
        Assert.Contains("quantity", data.Tables["kitchen_order_items"]!.Columns.Cast<System.Data.DataColumn>().Select(c => c.ColumnName));
        Assert.Contains("course", data.Tables["kitchen_order_items"]!.Columns.Cast<System.Data.DataColumn>().Select(c => c.ColumnName));

        var parameters = ReceiptDataBinder.BuildParameters(order, settings, "MUTFAK FİŞİ", "tr");
        Assert.Equal("12", parameters["table_number"]);
        Assert.Equal("Garson", parameters["waiter"]);
    }
}
