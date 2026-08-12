using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using TeraziRongta.Core.Config;

namespace TeraziRongta.Core.Services
{
    internal enum RetailExAuthStrategy
    {
        None,
        Bearer,
        ApiKeyOnly,
    }

    internal static class RetailExHttp
    {
        private static readonly HttpClient Http = CreateClient();

        private static HttpClient CreateClient()
        {
            var client = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            return client;
        }

        public static async Task<string> GetAsync(AppConfig config, string path)
        {
            return await SendAsync(config, HttpMethod.Get, path, null).ConfigureAwait(false);
        }

        public static async Task<string> PostAsync(AppConfig config, string path, object body)
        {
            return await SendAsync(config, HttpMethod.Post, path, body).ConfigureAwait(false);
        }

        public static async Task<string> PatchAsync(AppConfig config, string path, object body)
        {
            return await SendAsync(config, new HttpMethod("PATCH"), path, body).ConfigureAwait(false);
        }

        private static async Task<string> SendAsync(AppConfig config, HttpMethod method, string path, object body)
        {
            var baseUrl = config.ResolvedApiUrl();
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                throw new InvalidOperationException("API adresi yapilandirilmamis.");
            }

            var url = baseUrl.TrimEnd('/') + (path.StartsWith("/") ? path : "/" + path);
            Exception lastError = null;

            foreach (var auth in GetAuthStrategies(config))
            {
                try
                {
                    var request = new HttpRequestMessage(method, url);
                    ApplyAuth(request, config.ApiToken, auth);
                    request.Headers.TryAddWithoutValidation("Accept", "application/json");
                    request.Headers.TryAddWithoutValidation("Prefer", "return=representation");

                    if (body != null)
                    {
                        request.Content = new StringContent(
                            JsonConvert.SerializeObject(body),
                            Encoding.UTF8,
                            "application/json");
                    }

                    var response = await Http.SendAsync(request).ConfigureAwait(false);
                    var responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                    if (!response.IsSuccessStatusCode)
                    {
                        lastError = new InvalidOperationException(
                            "RetailEX API (" + (int)response.StatusCode + ") " + path + ": "
                            + Truncate(responseBody, 220));

                        if (IsJwtSecretError(responseBody) && auth != RetailExAuthStrategy.None)
                        {
                            continue;
                        }

                        if (response.StatusCode == System.Net.HttpStatusCode.NotFound
                            || response.StatusCode == System.Net.HttpStatusCode.BadRequest)
                        {
                            throw lastError;
                        }

                        continue;
                    }

                    return responseBody ?? "";
                }
                catch (Exception ex) when (!(ex is InvalidOperationException))
                {
                    lastError = ex;
                }
            }

            throw lastError ?? new InvalidOperationException("RetailEX API istegi basarisiz: " + path);
        }

        private static IEnumerable<RetailExAuthStrategy> GetAuthStrategies(AppConfig config)
        {
            var mode = (config.AuthMode ?? "none").Trim().ToLowerInvariant();
            var placeholder = AppConfig.IsPlaceholderToken(config.ApiToken);

            switch (mode)
            {
                case "none":
                    yield return RetailExAuthStrategy.None;
                    yield break;
                case "bearer":
                    if (!placeholder) yield return RetailExAuthStrategy.Bearer;
                    yield return RetailExAuthStrategy.None;
                    yield break;
                case "apikey":
                    if (!placeholder) yield return RetailExAuthStrategy.ApiKeyOnly;
                    yield return RetailExAuthStrategy.None;
                    yield break;
                default:
                    yield return RetailExAuthStrategy.None;
                    if (!placeholder)
                    {
                        yield return RetailExAuthStrategy.ApiKeyOnly;
                        yield return RetailExAuthStrategy.Bearer;
                    }
                    yield break;
            }
        }

        private static void ApplyAuth(HttpRequestMessage request, string token, RetailExAuthStrategy strategy)
        {
            if (strategy == RetailExAuthStrategy.None) return;

            var t = (token ?? "").Trim();
            if (string.IsNullOrEmpty(t) || AppConfig.IsPlaceholderToken(t)) return;

            var bearer = t.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                ? t.Substring(7).Trim()
                : t;

            if (strategy == RetailExAuthStrategy.Bearer)
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
                request.Headers.TryAddWithoutValidation("apikey", bearer);
            }
            else if (strategy == RetailExAuthStrategy.ApiKeyOnly)
            {
                request.Headers.TryAddWithoutValidation("apikey", bearer);
            }
        }

        public static bool IsJwtSecretError(string body)
        {
            if (string.IsNullOrEmpty(body)) return false;
            return body.IndexOf("PGRST300", StringComparison.OrdinalIgnoreCase) >= 0
                || body.IndexOf("Server lacks JWT secret", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        public static string Truncate(string value, int max)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= max) return value;
            return value.Substring(0, max) + "...";
        }
    }
}
