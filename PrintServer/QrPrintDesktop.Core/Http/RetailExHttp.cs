using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using QrPrintDesktop.Core.Config;

namespace QrPrintDesktop.Core.Http;

internal enum RetailExAuthStrategy
{
    None,
    Bearer,
    ApiKeyOnly
}

public static class RetailExHttp
{
    private static readonly HttpClient Http = CreateClient();
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(45) };
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    public static Task<string> GetAsync(AppSettings settings, string path, string schema = "public")
        => SendAsync(settings, HttpMethod.Get, path, null, schema, "return=representation");

    public static Task<string> PatchAsync(AppSettings settings, string path, object body, string schema = "public")
        => SendAsync(settings, new HttpMethod("PATCH"), path, body, schema, "return=minimal");

    public static Task<string> PostAsync(AppSettings settings, string path, object body, string schema = "public")
        => SendAsync(settings, HttpMethod.Post, path, body, schema, "return=representation");

    private static async Task<string> SendAsync(
        AppSettings settings,
        HttpMethod method,
        string path,
        object? body,
        string schema,
        string prefer)
    {
        var baseUrl = settings.ResolvedApiUrl();
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            throw new InvalidOperationException("API adresi yapılandırılmamış.");
        }

        var url = baseUrl.TrimEnd('/') + (path.StartsWith('/') ? path : "/" + path);
        Exception? lastError = null;

        foreach (var auth in GetAuthStrategies(settings))
        {
            try
            {
                using var request = new HttpRequestMessage(method, url);
                ApplyAuth(request, settings.ApiToken, auth);
                request.Headers.TryAddWithoutValidation("Accept", "application/json");
                request.Headers.TryAddWithoutValidation("Prefer", prefer);
                if (!string.IsNullOrWhiteSpace(schema))
                {
                    request.Headers.TryAddWithoutValidation("Accept-Profile", schema);
                    request.Headers.TryAddWithoutValidation("Content-Profile", schema);
                }

                if (body is not null)
                {
                    request.Content = new StringContent(
                        JsonSerializer.Serialize(body, JsonOptions),
                        Encoding.UTF8,
                        "application/json");
                }

                using var response = await Http.SendAsync(request).ConfigureAwait(false);
                var responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    lastError = new InvalidOperationException(
                        $"RetailEX API ({(int)response.StatusCode}) {path}: {Truncate(responseBody, 220)}");

                    if (IsJwtSecretError(responseBody) && auth != RetailExAuthStrategy.None)
                    {
                        continue;
                    }

                    if (response.StatusCode is System.Net.HttpStatusCode.NotFound or System.Net.HttpStatusCode.BadRequest)
                    {
                        throw lastError;
                    }

                    continue;
                }

                return responseBody ?? string.Empty;
            }
            catch (Exception ex) when (ex is not InvalidOperationException)
            {
                lastError = ex;
            }
        }

        throw lastError ?? new InvalidOperationException("RetailEX API isteği başarısız: " + path);
    }

    private static IEnumerable<RetailExAuthStrategy> GetAuthStrategies(AppSettings settings)
    {
        var mode = (settings.AuthMode ?? "none").Trim().ToLowerInvariant();
        var placeholder = AppSettings.IsPlaceholderToken(settings.ApiToken);

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
        if (strategy == RetailExAuthStrategy.None)
        {
            return;
        }

        var t = (token ?? "").Trim();
        if (string.IsNullOrEmpty(t) || AppSettings.IsPlaceholderToken(t))
        {
            return;
        }

        var bearer = t.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? t[7..].Trim()
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

    public static bool IsJwtSecretError(string? body)
    {
        if (string.IsNullOrEmpty(body))
        {
            return false;
        }

        return body.Contains("PGRST300", StringComparison.OrdinalIgnoreCase)
            || body.Contains("Server lacks JWT secret", StringComparison.OrdinalIgnoreCase);
    }

    public static string Truncate(string? value, int max)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= max)
        {
            return value ?? string.Empty;
        }

        return value[..max] + "...";
    }
}
