using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using TeraziRongta.Core.Config;
using TeraziRongta.Core.Helpers;
using TeraziRongta.Core.Models;

namespace TeraziRongta.Core.Services
{
    public class RetailExApiClient
    {
        private static readonly string[] WeightUnits =
        {
            "KG", "KILOGRAM", "KGM", "G", "GRAM", "GR", "LT", "LITRE", "LITER", "L"
        };

        public async Task<IList<ScaleProductDto>> FetchScaleProductsAsync(AppConfig config)
        {
            var paths = BuildPaths(config);
            Exception lastError = null;
            Exception lastJwtError = null;
            Exception lastNoneError = null;
            Exception lastRexError = null;

            foreach (var path in paths)
            {
                try
                {
                    var body = await RetailExHttp.GetAsync(config, path).ConfigureAwait(false);
                    var products = FilterScaleProducts(ParseProducts(body, config.LfCodeBase));
                    products = AssignAndSortPluCodes(products, config.LfCodeBase);
                    if (products.Count > 0)
                    {
                        try
                        {
                            await PersistAssignedPluCodesAsync(config, products).ConfigureAwait(false);
                        }
                        catch
                        {
                            // PLU geri yazma basarisiz olsa da gonderime devam
                        }
                        return products;
                    }

                    lastError = new InvalidOperationException(
                        "Endpoint bos veya tartili/kg urun yok: " + path);
                }
                catch (Exception ex)
                {
                    lastError = ex;
                    if (IsRexProductsPath(path))
                    {
                        lastRexError = ex;
                    }

                    if (ex.Message.IndexOf("PGRST300", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        lastJwtError = ex;
                    }
                    else if (ex.Message.IndexOf("[None]", StringComparison.OrdinalIgnoreCase) >= 0
                        || ex.Message.IndexOf("(404)", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        lastNoneError = ex;
                    }
                }
            }

            if (lastNoneError != null && lastJwtError != null)
            {
                throw new InvalidOperationException(
                    "RetailEX API baglantisi basarisiz. AuthMode = none kullanin. "
                    + RetailExHttp.Truncate(lastNoneError.Message, 220));
            }

            if (lastRexError != null)
            {
                throw lastRexError;
            }

            throw lastError ?? new InvalidOperationException(
                "RetailEX API'den tartilabilir urun alinamadi. Firma/donem ve ProductsPath kontrol edin.");
        }

        public async Task<bool> TestConnectionAsync(AppConfig config)
        {
            var products = await FetchScaleProductsAsync(config).ConfigureAwait(false);
            return products != null && products.Count > 0;
        }

        public async Task<IList<ScaleProductDto>> FetchProductsByRecordIdsAsync(AppConfig config, IEnumerable<string> recordIds)
        {
            var ids = (recordIds ?? Enumerable.Empty<string>())
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (ids.Count == 0) return new List<ScaleProductDto>();

            var all = new List<ScaleProductDto>();
            const int batchSize = 40;
            for (var i = 0; i < ids.Count; i += batchSize)
            {
                var batch = ids.Skip(i).Take(batchSize).ToList();
                var inList = string.Join(",", batch.Select(id => Uri.EscapeDataString(id)));
                var path = AppConfig.BuildProductsPath(config.FirmNr)
                    + "&id=in.(" + inList + ")";

                var body = await RetailExHttp.GetAsync(config, path).ConfigureAwait(false);
                all.AddRange(FilterScaleProducts(ParseProducts(body, config.LfCodeBase)));
            }

            return AssignAndSortPluCodes(all, config.LfCodeBase);
        }

        public static IList<ScaleProductDto> ParseProducts(string json, int lfCodeBase)
        {
            if (string.IsNullOrWhiteSpace(json)) return new List<ScaleProductDto>();

            var token = JToken.Parse(json);
            JArray rows = null;

            if (token is JArray arr) rows = arr;
            else if (token["rows"] is JArray r) rows = r;
            else if (token["products"] is JArray p) rows = p;
            else if (token["data"] is JArray d) rows = d;
            else if (token["items"] is JArray i) rows = i;

            if (rows == null) return new List<ScaleProductDto>();

            var list = new List<ScaleProductDto>();
            var rank = 1;
            foreach (var item in rows.OfType<JObject>())
            {
                var dto = MapRow(item, rank++, lfCodeBase);
                if (dto != null && !string.IsNullOrWhiteSpace(dto.Name))
                {
                    list.Add(dto);
                }
            }

            return list;
        }

        public static IList<ScaleProductDto> FilterScaleProducts(IList<ScaleProductDto> products)
        {
            if (products == null || products.Count == 0) return new List<ScaleProductDto>();

            return products
                .Where(p => p != null
                    && p.IsActive
                    && !string.IsNullOrWhiteSpace(p.Name)
                    && IsWeightUnit(p.Unit))
                .ToList();
        }

        /// <summary>
        /// PLU'ya gore sirala; bos PLU'lara max+1 atayarak LfCode/PluCode doldur.
        /// </summary>
        public static IList<ScaleProductDto> AssignAndSortPluCodes(IList<ScaleProductDto> products, int lfCodeBase)
        {
            if (products == null || products.Count == 0) return new List<ScaleProductDto>();

            var list = products.Where(p => p != null).ToList();
            var used = new HashSet<int>();
            var maxPlu = Math.Max(0, lfCodeBase > 0 ? lfCodeBase - 1 : 0);

            foreach (var p in list)
            {
                var lf = p.LfCode > 0 ? p.LfCode : 0;
                if (lf <= 0 && TryParsePluLfDigits(p.PluCode, out var fromCode))
                {
                    lf = fromCode;
                }

                if (lf > 0)
                {
                    p.LfCode = lf;
                    p.PluCode = lf.ToString(CultureInfo.InvariantCulture);
                    p.HasExplicitPlu = true;
                    used.Add(lf);
                    if (lf > maxPlu) maxPlu = lf;
                }
                else
                {
                    p.HasExplicitPlu = false;
                    p.LfCode = 0;
                }
            }

            var next = maxPlu + 1;
            if (next < 1) next = 1;

            foreach (var p in list.Where(x => x.LfCode <= 0).OrderBy(x => x.Name ?? "", StringComparer.OrdinalIgnoreCase))
            {
                while (used.Contains(next)) next++;
                p.LfCode = next;
                p.PluCode = next.ToString(CultureInfo.InvariantCulture);
                used.Add(next);
                next++;
            }

            return list
                .OrderBy(p => p.LfCode)
                .ThenBy(p => p.Name ?? "", StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        /// <summary>Otomatik atanan plu_code degerlerini RetailEX'e geri yazar (best-effort).</summary>
        public static async Task PersistAssignedPluCodesAsync(AppConfig config, IList<ScaleProductDto> products)
        {
            if (config == null || products == null || products.Count == 0) return;

            var firm = AppConfig.NormalizeFirmNr(config.FirmNr);
            var table = "rex_" + firm + "_products";

            foreach (var p in products)
            {
                if (p == null || p.HasExplicitPlu) continue;
                if (string.IsNullOrWhiteSpace(p.ExternalId) || p.LfCode <= 0) continue;

                try
                {
                    var path = "/" + table + "?id=eq." + Uri.EscapeDataString(p.ExternalId.Trim());
                    await RetailExHttp.PatchAsync(
                        config,
                        path,
                        new { plu_code = p.LfCode.ToString(CultureInfo.InvariantCulture) }).ConfigureAwait(false);
                    p.HasExplicitPlu = true;
                }
                catch
                {
                    // kolon yoksa veya yetki yoksa sessizce gec
                }
            }
        }

        private static List<string> BuildPaths(AppConfig config)
        {
            var paths = new List<string>();
            var custom = (config.ProductsPath ?? "").Trim();
            if (!string.IsNullOrEmpty(custom))
            {
                paths.Add(custom.StartsWith("/") ? custom : "/" + custom);
            }

            var firmPath = AppConfig.BuildProductsPath(config.FirmNr);
            if (!paths.Contains(firmPath, StringComparer.OrdinalIgnoreCase))
            {
                paths.Add(firmPath);
            }

            var altFirm = AppConfig.NormalizeFirmNr(config.FirmNr);
            if (altFirm != "002")
            {
                var altPath = AppConfig.BuildProductsPath("002");
                if (!paths.Contains(altPath, StringComparer.OrdinalIgnoreCase))
                {
                    paths.Add(altPath);
                }
            }

            return paths;
        }

        private static bool IsRexProductsPath(string path)
        {
            return (path ?? "").IndexOf("_products", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static ScaleProductDto MapRow(JObject row, int rank, int lfCodeBase)
        {
            if (!IsWeighableRow(row)) return null;

            var name = FirstString(row, "name", "item_name", "product_name", "PluName", "title");
            if (string.IsNullOrWhiteSpace(name)) return null;

            var unit = FirstString(row, "unit", "weight_unit", "measure_unit") ?? "KG";
            if (!IsWeightUnit(unit)) return null;

            var price = ParsePrice(row);

            var barcode = FirstString(row, "barcode", "barcode_no", "ean", "barcode_number");
            // Yalnizca acik plu_code — urun code/sku PLU sayilmaz (otomatik atama icin)
            var explicitPlu = FirstString(row, "plu_code", "pluCode");
            var hasExplicit = TryParsePluLfDigits(explicitPlu, out var lfFromPlu);

            var isActive = true;
            if (row["is_active"] != null && row["is_active"].Type != JTokenType.Null)
            {
                isActive = ParseBool(row["is_active"]);
            }
            else
            {
                var status = FirstString(row, "status", "state");
                if (!string.IsNullOrWhiteSpace(status)
                    && (status.Equals("passive", StringComparison.OrdinalIgnoreCase)
                        || status.Equals("pasif", StringComparison.OrdinalIgnoreCase)
                        || status.Equals("inactive", StringComparison.OrdinalIgnoreCase)))
                {
                    isActive = false;
                }
            }

            return new ScaleProductDto
            {
                Name = name.Length > 36 ? name.Substring(0, 36) : name,
                Price = ScalePriceHelper.ToUnitPrice(price),
                PluCode = hasExplicit ? lfFromPlu.ToString(CultureInfo.InvariantCulture) : explicitPlu,
                Barcode = barcode ?? explicitPlu,
                Unit = NormalizeUnit(unit),
                BarcodeType = ParseInt(row, "barcode_type", "barcodeType", "BarCode", 99),
                Department = ParseInt(row, "department", "department_id", "Deptment", 21),
                LfCode = hasExplicit ? lfFromPlu : 0,
                ExternalId = FirstString(row, "id", "item_id", "product_id"),
                IsActive = isActive,
                HasExplicitPlu = hasExplicit,
                ShelfLifeDays = ParseInt(row, "shelf_life_days", "shelfLifeDays", "ShlefTime", 0),
            };
        }

        private static bool IsWeighableRow(JObject row)
        {
            if (row == null) return false;

            if (row["is_scale_product"] != null) return ParseBool(row["is_scale_product"]);
            if (row["weighable"] != null) return ParseBool(row["weighable"]);
            if (row["is_weighable"] != null) return ParseBool(row["is_weighable"]);
            return true;
        }

        private static bool ParseBool(JToken token)
        {
            if (token == null) return false;
            if (token.Type == JTokenType.Boolean) return token.Value<bool>();

            var text = token.ToString().Trim();
            return text.Equals("true", StringComparison.OrdinalIgnoreCase)
                || text == "1"
                || text.Equals("yes", StringComparison.OrdinalIgnoreCase);
        }

        public static bool IsWeightUnit(string unit)
        {
            if (string.IsNullOrWhiteSpace(unit)) return false;

            var normalized = unit.Trim().ToUpperInvariant()
                .Replace(".", "")
                .Replace(" ", "");

            if (WeightUnits.Contains(normalized)) return true;
            if (normalized.StartsWith("KILO", StringComparison.Ordinal)) return true;
            if (normalized.StartsWith("GRAM", StringComparison.Ordinal)) return true;
            if (normalized.StartsWith("LIT", StringComparison.Ordinal)) return true;
            return false;
        }

        private static string NormalizeUnit(string unit)
        {
            var normalized = (unit ?? "KG").Trim().ToUpperInvariant()
                .Replace(".", "")
                .Replace(" ", "");

            if (normalized.StartsWith("KILO", StringComparison.Ordinal) || normalized == "KGM") return "KG";
            if (normalized.StartsWith("GRAM", StringComparison.Ordinal) || normalized == "GR" || normalized == "G") return "G";
            if (normalized.StartsWith("LIT", StringComparison.Ordinal) || normalized == "L") return "LT";
            return normalized;
        }

        private static int ResolveStableLfCode(JObject row, string pluCode, int lfCodeBase, int rank)
        {
            if (TryParsePluLfDigits(pluCode, out var lf)) return lf;
            return 0;
        }

        private static bool TryParsePluLfDigits(string value, out int lfCode)
        {
            lfCode = 0;
            if (string.IsNullOrWhiteSpace(value)) return false;

            var digits = new string(value.Where(char.IsDigit).ToArray());
            if (digits.Length == 0 || digits.Length > 6) return false;
            if (!int.TryParse(digits, out lfCode) || lfCode <= 0) return false;

            return true;
        }

        private static string FirstString(JObject row, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (row[key] != null && !string.IsNullOrWhiteSpace(row[key].ToString()))
                {
                    return row[key].ToString().Trim();
                }
            }

            return null;
        }

        private static int ParseInt(JObject row, string k1, string k2, string k3, int fallback)
        {
            if (row[k1] != null && int.TryParse(row[k1].ToString(), out var v)) return v;
            if (row[k2] != null && int.TryParse(row[k2].ToString(), out v)) return v;
            if (row[k3] != null && int.TryParse(row[k3].ToString(), out v)) return v;
            return fallback;
        }

        // rex_*_products: Satis Fiyati = price (ham tamsayi, or. 7500). Legacy /items: sale_price.
        private static readonly string[] RexPriceFieldKeys =
        {
            "price", "unit_price", "unitPrice", "sale_price", "salePrice", "retail_price", "list_price",
        };

        private static readonly string[] LegacyPriceFieldKeys =
        {
            "sale_price", "salePrice", "price", "unit_price", "unitPrice", "retail_price", "list_price",
        };

        internal static double ParsePrice(JObject row)
        {
            if (row == null) return 0;
            return ParseRawPrice(row, IsRexProductRow(row) ? RexPriceFieldKeys : LegacyPriceFieldKeys);
        }

        private static bool IsRexProductRow(JObject row)
        {
            if (row == null) return false;
            if (row["firm_nr"] != null && row["firm_nr"].Type != JTokenType.Null) return true;
            if (row["is_scale_product"] != null && row["is_scale_product"].Type != JTokenType.Null) return true;
            return row["price"] != null && row["price"].Type != JTokenType.Null;
        }

        private static double ParseRawPrice(JObject row, string[] fieldKeys)
        {
            foreach (var key in fieldKeys)
            {
                var token = row[key];
                if (token == null || token.Type == JTokenType.Null) continue;

                if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float)
                {
                    return ScalePriceHelper.ToUnitPrice(token.Value<double>());
                }

                if (TryParsePriceString(token.ToString(), out var parsed))
                {
                    return ScalePriceHelper.ToUnitPrice(parsed);
                }
            }

            return 0;
        }

        private static bool TryParsePriceString(string text, out double price)
        {
            price = ScalePriceHelper.ParsePriceText(text);
            return price > 0;
        }
    }
}
