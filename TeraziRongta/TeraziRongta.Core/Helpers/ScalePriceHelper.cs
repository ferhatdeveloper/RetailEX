using System;

using System.Globalization;

using System.Linq;

using Newtonsoft.Json.Linq;



namespace TeraziRongta.Core.Helpers

{

    /// <summary>
    /// Rongta PLU UnitPrice: tam sayi. API/ekran degeri ondaliksiz (or. 7500).
    /// Cihaz Decimal position &gt; 0 ise gonderimde carpim uygulanir.
    /// </summary>
    public static class ScalePriceHelper
    {
        public const int MaxUnitPrice = 9999999;

        public static int ToUnitPrice(double price)

        {

            if (price <= 0 || double.IsNaN(price) || double.IsInfinity(price)) return 0;

            return (int)Math.Round(price, MidpointRounding.AwayFromZero);

        }



        public static int ParsePriceText(string text)

        {

            if (string.IsNullOrWhiteSpace(text)) return 0;



            text = text.Trim();



            if (int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var direct))

            {

                return direct;

            }



            // tr-TR binlik ayirici: "7.500", "14.000" (ondalik virgul yok)

            if (text.IndexOf('.') >= 0 && text.IndexOf(',') < 0)

            {

                var digitsOnly = text.Replace(".", "");

                if (digitsOnly.Length > 0

                    && digitsOnly.All(char.IsDigit)

                    && int.TryParse(digitsOnly, NumberStyles.Integer, CultureInfo.InvariantCulture, out var grouped))

                {

                    return grouped;

                }

            }



            if (double.TryParse(text, NumberStyles.Any, CultureInfo.GetCultureInfo("tr-TR"), out var tr))

            {

                return ToUnitPrice(tr);

            }



            if (double.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var inv))

            {

                return ToUnitPrice(inv);

            }



            return 0;

        }



        public static int ReadUnitPrice(JToken token)

        {

            if (token == null || token.Type == JTokenType.Null) return 0;



            switch (token.Type)

            {

                case JTokenType.Integer:

                    return token.Value<int>();

                case JTokenType.Float:

                    return ToUnitPrice(token.Value<double>());

            }



            return ParsePriceText(token.ToString());

        }



        public static void SetUnitPrice(JObject plu, int unitPrice)

        {

            if (plu == null) return;

            plu["UnitPrice"] = unitPrice;

        }



        public static void NormalizePluUnitPrice(JObject plu)
        {
            if (plu == null || plu["UnitPrice"] == null) return;
            SetUnitPrice(plu, ReadUnitPrice(plu["UnitPrice"]));
        }

        /// <summary>
        /// Cihaz ekran ondaligi icin PLU UnitPrice carpani (position=2 -&gt; x100).
        /// </summary>
        public static int ToDeviceUnitPrice(int apiUnitPrice, int deviceDecimalPosition, bool compensate)
        {
            if (apiUnitPrice <= 0 || !compensate) return apiUnitPrice;
            var decimals = Math.Max(0, Math.Min(3, deviceDecimalPosition));
            if (decimals == 0) return apiUnitPrice;

            try
            {
                var factor = (int)Math.Pow(10, decimals);
                if (apiUnitPrice > MaxUnitPrice / factor)
                {
                    return apiUnitPrice;
                }

                var scaled = (long)apiUnitPrice * factor;
                return scaled > MaxUnitPrice ? MaxUnitPrice : (int)scaled;
            }
            catch (OverflowException)
            {
                return MaxUnitPrice;
            }
        }

        public static int FromDeviceUnitPrice(int deviceUnitPrice, int deviceDecimalPosition, bool compensate)
        {
            if (deviceUnitPrice <= 0 || !compensate) return deviceUnitPrice;
            var decimals = Math.Max(0, Math.Min(3, deviceDecimalPosition));
            if (decimals == 0) return deviceUnitPrice;
            return deviceUnitPrice / (int)Math.Pow(10, decimals);
        }
    }
}
