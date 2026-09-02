using System.Globalization;
using System.Reflection;
using System.Resources;
using RetailEX.PrintServer.Core.Models;

namespace RetailEX.PrintServer.Core.I18n;

/// <summary>
/// Print etiketlerinin 4-dilli cozumleyicisi.
/// Oncelik sirasi:
///   1. payload.translations[locale] (kuyruktan gelen) — dinamik, kiraci/operator override
///   2. PrintStrings.resx (yerel fallback) — compile-time embedded
///   3. Ingilizce fallback (PrintStrings.en.resx)
///   4. Anahtar adinin kendisi (son care)
/// </summary>
public static class PrintStrings
{
    private static readonly ResourceManager ResourceManager = new(
        "RetailEX.PrintServer.Core.I18n.PrintStrings",
        typeof(PrintStrings).Assembly);

    private static readonly ResourceManager FallbackResourceManager = new(
        "RetailEX.PrintServer.Core.I18n.PrintStrings",
        typeof(PrintStrings).Assembly);

    public static string Resolve(
        string locale,
        string key,
        IDictionary<string, IDictionary<string, string>>? payloadTranslations = null)
    {
        var normalizedLocale = SupportedPrintLocale.Normalize(locale);

        // 1) payload.translations (en oncelikli)
        if (payloadTranslations != null
            && payloadTranslations.TryGetValue(normalizedLocale, out var dict)
            && dict.TryGetValue(key, out var value)
            && !string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        // 2) resource fallback
        try
        {
            var culture = CultureInfo.GetCultureInfo(normalizedLocale);
            return ResourceManager.GetString(key, culture) ?? Fallback(key);
        }
        catch
        {
            return Fallback(key);
        }
    }

    public static string Fallback(string key)
    {
        try
        {
            return FallbackResourceManager.GetString(key, CultureInfo.InvariantCulture) ?? key;
        }
        catch
        {
            return key;
        }
    }

    /// <summary>
    /// payload.locale veya default ('tr') ile bir print job icin Resolve yapan kisayol.
    /// </summary>
    public static string Resolve(PrintJob job, string key)
    {
        var payloadDict = ExtractPayloadTranslations(job);
        return Resolve(job.Locale ?? "tr", key, payloadDict);
    }

    private static IDictionary<string, IDictionary<string, string>>? ExtractPayloadTranslations(PrintJob job)
    {
        if (job.PayloadJson == null) return null;
        try
        {
            var jo = Newtonsoft.Json.Linq.JObject.Parse(job.PayloadJson);
            var t = jo["translations"];
            if (t == null || t.Type != Newtonsoft.Json.Linq.JTokenType.Object) return null;
            var result = new Dictionary<string, IDictionary<string, string>>();
            foreach (var localeProp in (Newtonsoft.Json.Linq.JObject)t)
            {
                var localeDict = new Dictionary<string, string>();
                if (localeProp.Value is Newtonsoft.Json.Linq.JObject inner)
                {
                    foreach (var kv in inner)
                    {
                        if (kv.Value?.Type == Newtonsoft.Json.Linq.JTokenType.String)
                        {
                            var token = (Newtonsoft.Json.Linq.JToken)kv.Value;
                            localeDict[kv.Key] = token.ToString() ?? "";
                        }
                    }
                }
                result[localeProp.Key] = localeDict;
            }
            return result;
        }
        catch
        {
            return null;
        }
    }
}