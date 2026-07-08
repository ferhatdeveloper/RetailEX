using System;

using System.Collections.Generic;

using System.Globalization;

using System.Linq;

using TeraziRongta.Core.Models;



namespace TeraziRongta.Core.Helpers

{

    public static class SaleReportHelper

    {

        public static readonly DateTime UnknownDateSentinel = DateTime.MinValue.Date;



        public struct ResolvedSaleDate

        {

            public DateTime Date { get; set; }

            public bool IsKnown { get; set; }

            public string Source { get; set; }

        }



        public static DateTime? ParseSaleTime(string saleTime)

        {

            if (string.IsNullOrWhiteSpace(saleTime)) return null;



            var trimmed = saleTime.Trim();

            if (TryParseCompactNumericDate(trimmed, out var compact))

                return compact;



            if (DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))

                return dt;

            if (DateTime.TryParse(trimmed, CultureInfo.CurrentCulture, DateTimeStyles.None, out dt))

                return dt;



            var formats = new[]

            {

                "yyyy-MM-dd HH:mm:ss",

                "yyyy/MM/dd HH:mm:ss",

                "yyyy-MM-ddTHH:mm:ss",

                "dd.MM.yyyy HH:mm:ss",

                "dd/MM/yyyy HH:mm:ss",

                "dd.MM.yyyy",

                "dd/MM/yyyy",

                "yyyy-MM-dd",

                "yyyy/MM/dd"

            };



            foreach (var format in formats)

            {

                if (DateTime.TryParseExact(trimmed, format, CultureInfo.InvariantCulture, DateTimeStyles.None, out dt))

                    return dt;

            }



            return null;

        }



        private static bool TryParseCompactNumericDate(string value, out DateTime result)

        {

            result = default;

            if (string.IsNullOrEmpty(value) || !value.All(char.IsDigit))

                return false;



            switch (value.Length)

            {

                case 14:

                    return DateTime.TryParseExact(value, "yyyyMMddHHmmss", CultureInfo.InvariantCulture, DateTimeStyles.None, out result);

                case 12:

                    return DateTime.TryParseExact(value, "yyMMddHHmmss", CultureInfo.InvariantCulture, DateTimeStyles.None, out result);

                case 8:

                    return DateTime.TryParseExact(value, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out result);

                case 6:

                    return DateTime.TryParseExact(value, "yyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out result);

                case 10:

                    if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var seconds)

                        && seconds > 946684800L && seconds < 4102444800L)

                    {

                        result = DateTimeOffset.FromUnixTimeSeconds(seconds).LocalDateTime;

                        return true;

                    }

                    return false;

                case 13:

                    if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var millis)

                        && millis > 946684800000L && millis < 4102444800000L)

                    {

                        result = DateTimeOffset.FromUnixTimeMilliseconds(millis).LocalDateTime;

                        return true;

                    }

                    return false;

                default:

                    return false;

            }

        }



        public static ResolvedSaleDate ResolveSaleDate(ScaleAccountData record, DateTime? fallbackDate = null)

        {

            if (record == null)

                return CreateUnknown(fallbackDate);



            var fromSaleTime = ParseSaleTime(record.SaleTime);

            if (fromSaleTime.HasValue)

                return new ResolvedSaleDate { Date = fromSaleTime.Value, IsKnown = true, Source = "SaleTime" };



            var fromOnline = ParseSaleTime(record.OnlineTime);

            if (fromOnline.HasValue)

                return new ResolvedSaleDate { Date = fromOnline.Value, IsKnown = true, Source = "OnlineTime" };



            if (TryBuildDateFromParts(record, out var fromParts))

                return new ResolvedSaleDate { Date = fromParts, IsKnown = true, Source = "DateParts" };



            if (fallbackDate.HasValue)

                return new ResolvedSaleDate { Date = fallbackDate.Value, IsKnown = false, Source = "Fallback" };



            return CreateUnknown(null);

        }



        private static ResolvedSaleDate CreateUnknown(DateTime? fallbackDate)

        {

            return new ResolvedSaleDate

            {

                Date = fallbackDate?.Date ?? UnknownDateSentinel,

                IsKnown = false,

                Source = "Unknown"

            };

        }



        private static bool TryBuildDateFromParts(ScaleAccountData record, out DateTime date)

        {

            date = default;

            var day = record.DateDay > 0 ? record.DateDay : record.Date_DD;

            var month = record.DateMonth > 0 ? record.DateMonth : record.Date_MM;

            var year = record.DateYear > 0 ? record.DateYear : record.Date_YYYY;

            if (year <= 0 && record.Date_YY > 0)

                year = record.Date_YY < 100 ? 2000 + record.Date_YY : record.Date_YY;



            if (day <= 0 || month <= 0 || year <= 0 || year < 2000 || year > 2100)

                return false;



            try

            {

                date = new DateTime(year, month, day);

                return true;

            }

            catch

            {

                return false;

            }

        }



        public static int LabelCountForRecord(ScaleAccountData record)

        {

            if (record == null) return 0;

            return record.Quantity > 0 ? record.Quantity : 1;

        }



        public static IList<ScaleAccountData> FilterByDateRange(

            IEnumerable<ScaleAccountData> records,

            DateTime from,

            DateTime to,

            bool includeAllDates = false,

            bool includeUnknownDates = false)

        {

            if (includeAllDates)

                return (records ?? Enumerable.Empty<ScaleAccountData>()).ToList();



            var fromDate = from.Date;

            var toDate = to.Date;

            var list = new List<ScaleAccountData>();



            foreach (var record in records ?? Enumerable.Empty<ScaleAccountData>())

            {

                var resolved = ResolveSaleDate(record);

                if (!resolved.IsKnown)

                {

                    if (includeUnknownDates)

                        list.Add(record);

                    continue;

                }



                var saleDate = resolved.Date.Date;

                if (saleDate < fromDate || saleDate > toDate) continue;

                list.Add(record);

            }



            return list;

        }



        public static DateRangeSummary GetKnownDateRange(IEnumerable<ScaleAccountData> records)

        {

            var dates = (records ?? Enumerable.Empty<ScaleAccountData>())

                .Select(r => ResolveSaleDate(r))

                .Where(x => x.IsKnown)

                .Select(x => x.Date.Date)

                .ToList();



            if (dates.Count == 0)

            {

                return new DateRangeSummary

                {

                    KnownCount = 0,

                    UnknownCount = (records ?? Enumerable.Empty<ScaleAccountData>()).Count()

                };

            }



            var all = (records ?? Enumerable.Empty<ScaleAccountData>()).ToList();

            return new DateRangeSummary

            {

                MinDate = dates.Min(),

                MaxDate = dates.Max(),

                KnownCount = dates.Count,

                UnknownCount = all.Count - dates.Count

            };

        }



        public static IList<SaleDailySummary> AggregateByDay(IEnumerable<ScaleAccountData> records)

        {

            return (records ?? Enumerable.Empty<ScaleAccountData>())

                .Select(r => new { Record = r, Resolved = ResolveSaleDate(r) })

                .GroupBy(x => x.Resolved.IsKnown ? x.Resolved.Date.Date : UnknownDateSentinel)

                .Select(g => new SaleDailySummary

                {

                    Date = g.Key,

                    IsKnownDate = g.Key != UnknownDateSentinel,

                    LabelCount = g.Sum(x => LabelCountForRecord(x.Record)),

                    TotalWeight = g.Sum(x => x.Record.Weight),

                    TotalAmount = g.Sum(x => x.Record.TotalPrice)

                })

                .OrderByDescending(s => s.IsKnownDate)

                .ThenByDescending(s => s.Date)

                .ToList();

        }



        public static IList<SaleProductSummary> AggregateByDayAndProduct(IEnumerable<ScaleAccountData> records)

        {

            return (records ?? Enumerable.Empty<ScaleAccountData>())

                .Select(r => new { Record = r, Resolved = ResolveSaleDate(r) })

                .GroupBy(x => new

                {

                    Date = x.Resolved.IsKnown ? x.Resolved.Date.Date : UnknownDateSentinel,

                    IsKnownDate = x.Resolved.IsKnown,

                    Name = string.IsNullOrWhiteSpace(x.Record.PluName) ? "(Isimsiz)" : x.Record.PluName.Trim(),

                    x.Record.LFCode

                })

                .Select(g => new SaleProductSummary

                {

                    Date = g.Key.Date,

                    IsKnownDate = g.Key.IsKnownDate,

                    PluName = g.Key.Name,

                    LfCode = g.Key.LFCode,

                    LabelCount = g.Sum(x => LabelCountForRecord(x.Record)),

                    TotalWeight = g.Sum(x => x.Record.Weight),

                    TotalAmount = g.Sum(x => x.Record.TotalPrice)

                })

                .OrderByDescending(s => s.IsKnownDate)

                .ThenByDescending(s => s.Date)

                .ThenBy(s => s.PluName)

                .ToList();

        }



        public static string FormatReportDate(DateTime date, bool isKnownDate)

        {

            return isKnownDate ? date.ToString("dd.MM.yyyy") : "Bilinmeyen tarih";

        }

    }



    public class DateRangeSummary

    {

        public DateTime? MinDate { get; set; }

        public DateTime? MaxDate { get; set; }

        public int KnownCount { get; set; }

        public int UnknownCount { get; set; }



        public bool HasKnownDates => MinDate.HasValue && MaxDate.HasValue;

    }

}


