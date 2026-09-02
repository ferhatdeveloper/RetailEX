namespace RetailEX.PrintServer.Core.I18n;

public static class SupportedPrintLocale
{
    public const string Tr = "tr";
    public const string En = "en";
    public const string Ar = "ar";
    public const string Ku = "ku";

    public static readonly string[] All = { Tr, En, Ar, Ku };

    public static string Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return Tr;
        input = input.ToLowerInvariant();
        return input switch
        {
            "tr" or "tr-tr" => Tr,
            "en" or "en-us" or "en-gb" => En,
            "ar" or "ar-sa" => Ar,
            "ku" or "ku-iq" or "kmr" => Ku,
            _ => Tr
        };
    }
}