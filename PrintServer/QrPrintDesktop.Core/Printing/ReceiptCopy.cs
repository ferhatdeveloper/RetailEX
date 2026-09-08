using System.Globalization;

namespace QrPrintDesktop.Core.Printing;

public sealed record KitchenReceiptCopy(
    string Title,
    string Table,
    string Waiter,
    string Time,
    string Qty,
    string Product,
    string Note,
    string Empty,
    string Footer);

public sealed record AccountReceiptCopy(
    string Banner,
    string ReceiptNo,
    string Date,
    string Cashier,
    string Table,
    string Customer,
    string Product,
    string Qty,
    string Amount,
    string Subtotal,
    string Discount,
    string Total,
    string Payment,
    string Paid,
    string Remaining,
    string Thanks,
    string KeepSlip,
    string Footer);

public static class ReceiptCopy
{
    public static readonly string[] Languages = ["tr", "en", "ar", "ku", "uz"];

    public static string NormalizeLanguage(string? language)
    {
        var value = (language ?? "tr").Trim().ToLowerInvariant();
        return value switch
        {
            "en" or "eng" or "english" => "en",
            "ar" or "arabic" => "ar",
            "ku" or "ckb" or "kurdish" => "ku",
            "uz" or "uzbek" => "uz",
            _ => "tr"
        };
    }

    public static bool IsRtl(string? language)
    {
        var lang = NormalizeLanguage(language);
        return lang is "ar" or "ku";
    }

    public static CultureInfo Culture(string? language)
    {
        return NormalizeLanguage(language) switch
        {
            "en" => CultureInfo.GetCultureInfo("en-GB"),
            "ar" => CultureInfo.GetCultureInfo("ar-IQ"),
            "ku" => CultureInfo.GetCultureInfo("tr-TR"),
            "uz" => CultureInfo.GetCultureInfo("uz-UZ"),
            _ => CultureInfo.GetCultureInfo("tr-TR")
        };
    }

    public static string DisplayName(string language)
    {
        return NormalizeLanguage(language) switch
        {
            "en" => "English",
            "ar" => "العربية",
            "ku" => "Kurdî / کوردی",
            "uz" => "Oʻzbekcha",
            _ => "Türkçe"
        };
    }

    public static KitchenReceiptCopy Kitchen(string? language)
    {
        return NormalizeLanguage(language) switch
        {
            "en" => new KitchenReceiptCopy(
                "KITCHEN TICKET", "TABLE / SOURCE:", "SERVER:", "TIME:",
                "Qty", "Item", "NOTE", "(no items)", "— to prepare —"),
            "ar" => new KitchenReceiptCopy(
                "فاتورة المطبخ", "طاولة / مصدر:", "نادل:", "الوقت:",
                "العدد", "الصنف", "ملاحظة", "(لا عناصر)", "— للتحضير —"),
            "ku" => new KitchenReceiptCopy(
                "پسوولەی چێشتخانە", "مێز / سەرچاوە:", "گەرسۆن:", "کات:",
                "ژمارە", "بەرهەم", "تێبینی", "(بێ بەرهەم)", "— بۆ ئامادەکردن —"),
            "uz" => new KitchenReceiptCopy(
                "OSHXONA CHEKI", "STOL / MANBA:", "OFITSANT:", "VAQT:",
                "Soni", "Mahsulot", "IZOH", "(mahsulot yo'q)", "— tayyorlash uchun —"),
            _ => new KitchenReceiptCopy(
                "MUTFAK FİŞİ", "MASA / KAYNAK:", "GARSON:", "SAAT:",
                "Adet", "Ürün", "NOT", "(kalem yok)", "— hazırlanacak —")
        };
    }

    public static AccountReceiptCopy Account(string? language)
    {
        return NormalizeLanguage(language) switch
        {
            "en" => new AccountReceiptCopy(
                "INTERIM BILL", "RECEIPT NO", "DATE", "SERVER", "TABLE", "CUSTOMER",
                "Item", "Qty", "Amount", "SUBTOTAL", "DISCOUNT", "TOTAL",
                "PAYMENT", "PAID", "REMAINING", "Thank You For Choosing Us",
                "Please keep this slip.", "RetailEX · 80mm"),
            "ar" => new AccountReceiptCopy(
                "فاتورة مؤقتة", "رقم الإيصال", "التاريخ", "الكاشير", "طاولة", "العميل",
                "الصنف", "العدد", "المبلغ", "المجموع الفرعي", "الخصم", "الإجمالي",
                "الدفع", "المدفوع", "المتبقي", "شكراً لاختياركم لنا",
                "يرجى الاحتفاظ بالإيصال.", "RetailEX · 80mm"),
            "ku" => new AccountReceiptCopy(
                "وەسڵی پێشووەختە", "ژ. پسوولە", "بەروار", "کاشێر", "مێز", "کڕیار",
                "بەرهەم", "ژمارە", "بڕ", "کۆی ناوەند", "داشکاندن", "کۆی گشتی",
                "پارەدان", "پارەدراو", "ماوە", "سپاس بۆ هەڵبژاردنمان",
                "ئەم پسوولەیە بپارێزە.", "RetailEX · 80mm"),
            "uz" => new AccountReceiptCopy(
                "OLDINDAN HISOB", "CHEK №", "SANA", "OFITSANT", "STOL", "MIJOZ",
                "Mahsulot", "Soni", "Summa", "ORALIQ JAMI", "CHEGIRMA", "JAMI",
                "TO'LOV", "TO'LANGAN", "QOLDIQ", "Bizni tanlaganingiz uchun rahmat",
                "Chekni saqlang.", "RetailEX · 80mm"),
            _ => new AccountReceiptCopy(
                "ÖN HESAP", "FİŞ NO", "TARİH", "GARSON", "MASA", "MÜŞTERİ",
                "Ürün", "Adet", "Tutar", "ARA TOPLAM", "İNDİRİM", "TOPLAM",
                "ÖDEME", "ÖDENEN", "KALAN", "Bizi Tercih Ettiğiniz İçin Teşekkürler",
                "Bu fiş iade ve değişimde gereklidir.", "RetailEX · 80mm")
        };
    }

    public static string ComposeKitchenTitle(string? heading, string? language)
    {
        var copy = Kitchen(language);
        var value = (heading ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value) ||
            value.Equals("MUTFAK", StringComparison.OrdinalIgnoreCase) ||
            value.StartsWith("MUTFAK SIPARIS", StringComparison.OrdinalIgnoreCase))
        {
            return copy.Title;
        }

        var separator = value.IndexOf('·');
        if (separator >= 0)
        {
            var suffix = value[(separator + 1)..].Trim();
            return string.IsNullOrWhiteSpace(suffix) ? copy.Title : copy.Title + " · " + suffix;
        }

        return value;
    }
}
