using QrPrintDesktop.Core.Printing;

namespace QrPrintDesktop.Tests;

public class ReceiptCopyTests
{
    [Theory]
    [InlineData("EN", "en")]
    [InlineData("ckb", "ku")]
    [InlineData("", "tr")]
    [InlineData("uzbek", "uz")]
    public void NormalizeLanguage_ShouldMapAliases(string input, string expected)
    {
        Assert.Equal(expected, ReceiptCopy.NormalizeLanguage(input));
    }

    [Fact]
    public void ComposeKitchenTitle_ShouldLocalizeGenericAndKeepCategory()
    {
        Assert.Equal("KITCHEN TICKET", ReceiptCopy.ComposeKitchenTitle("MUTFAK", "en"));
        Assert.Equal("KITCHEN TICKET · Bar", ReceiptCopy.ComposeKitchenTitle("MUTFAK · Bar", "en"));
        Assert.Equal("MUTFAK FİŞİ · Ortak", ReceiptCopy.ComposeKitchenTitle("MUTFAK · Ortak", "tr"));
    }

    [Fact]
    public void KitchenAndAccount_ShouldHaveDistinctDesignCopyPerLanguage()
    {
        Assert.Equal("MUTFAK FİŞİ", ReceiptCopy.Kitchen("tr").Title);
        Assert.Equal("INTERIM BILL", ReceiptCopy.Account("en").Banner);
        Assert.True(ReceiptCopy.IsRtl("ar"));
        Assert.False(ReceiptCopy.IsRtl("tr"));
    }

    [Fact]
    public void AppSettings_ShouldKeepSeparateKitchenAndAccountLanguages()
    {
        var settings = new QrPrintDesktop.Core.Config.AppSettings
        {
            ReceiptLanguage = "en",
            KitchenReceiptLanguage = "ar",
            AccountReceiptLanguage = "uz"
        };
        settings.Normalize();
        Assert.Equal("ar", settings.KitchenReceiptLanguage);
        Assert.Equal("uz", settings.AccountReceiptLanguage);
        Assert.Equal("ar", settings.ReceiptLanguage);
    }

    [Fact]
    public void AppSettings_ShouldCopyLegacyLanguageToBothReceipts()
    {
        var settings = new QrPrintDesktop.Core.Config.AppSettings { ReceiptLanguage = "en" };
        settings.Normalize();
        Assert.Equal("en", settings.KitchenReceiptLanguage);
        Assert.Equal("en", settings.AccountReceiptLanguage);
    }
}
