using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RetailEX.PrintServer.Designer.Config;
using RetailEX.PrintServer.Designer.Logging;

namespace RetailEX.PrintServer.Designer.PostgRest;

/// <summary>
/// Designer tarafı için sıfırdan yazılmış minimal PostgREST adapteri.
/// PrintServer.Core'daki PostgRestClient service host tarafına bağımlı; designer
/// bağımsız çalıştığı için kendi HttpClient sarmalayıcısını kullanır.
/// Tüm sorgular DesignerConfig.PostgRest üzerinden yapılandırılır.
/// </summary>
internal sealed class PostgRestRepository : IDisposable
{
    private readonly HttpClient _http;
    private readonly PostgRestConfig _config;

    public PostgRestRepository(PostgRestConfig config)
    {
        _config = config;
        _http = new HttpClient
        {
            BaseAddress = new Uri(EnsureTrailingSlash(config.BaseUrl)),
            Timeout = TimeSpan.FromSeconds(config.TimeoutSeconds <= 0 ? 30 : config.TimeoutSeconds)
        };

        var mode = (config.AuthMode ?? "none").ToLowerInvariant();
        switch (mode)
        {
            case "bearer" or "jwt":
                if (!string.IsNullOrWhiteSpace(config.BearerToken))
                {
                    _http.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", config.BearerToken);
                }
                break;
            case "apikey":
                if (!string.IsNullOrWhiteSpace(config.ApiKey))
                {
                    _http.DefaultRequestHeaders.Add("apikey", config.ApiKey);
                }
                break;
        }
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }

    public PostgRestConfig Config => _config;

    public string BaseUrl => _config.BaseUrl;

    /// <summary>
    /// Basit SELECT sorgusu; resource path örn. <c>"firms?select=code,name"</c>.
    /// </summary>
    public async Task<JArray> SelectAsync(string resourcePath, CancellationToken ct = default)
    {
        using var resp = await _http.GetAsync(BuildUrl(resourcePath), HttpCompletionOption.ResponseContentRead, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            throw new PostgRestException($"SELECT {resourcePath} -> {(int)resp.StatusCode} {resp.ReasonPhrase}", body, resp.StatusCode);
        }
        if (string.IsNullOrWhiteSpace(body)) return new JArray();
        return JArray.Parse(body);
    }

    /// <summary>
    /// INSERT; payload JSON object olmalı.
    /// </summary>
    public async Task<JArray> InsertAsync(string table, JObject payload, string returning = "*", CancellationToken ct = default)
    {
        var path = $"{table}?select={Uri.EscapeDataString(returning)}";
        using var req = new HttpRequestMessage(HttpMethod.Post, BuildUrl(path));
        req.Content = new StringContent(payload.ToString(Formatting.None), Encoding.UTF8, "application/json");
        req.Headers.Add("Prefer", "return=representation");
        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            throw new PostgRestException($"INSERT {table} -> {(int)resp.StatusCode} {resp.ReasonPhrase}", body, resp.StatusCode);
        }
        return string.IsNullOrWhiteSpace(body) ? new JArray() : JArray.Parse(body);
    }

    /// <summary>
    /// UPDATE; payload + filtre (örn. <c>"id=eq.{guid}"</c>).
    /// </summary>
    public async Task<JArray> UpdateAsync(string table, string filter, JObject payload, string returning = "*", CancellationToken ct = default)
    {
        var path = $"{table}?{filter}&select={Uri.EscapeDataString(returning)}";
        using var req = new HttpRequestMessage(new HttpMethod("PATCH"), BuildUrl(path));
        req.Content = new StringContent(payload.ToString(Formatting.None), Encoding.UTF8, "application/json");
        req.Headers.Add("Prefer", "return=representation");
        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            throw new PostgRestException($"UPDATE {table} -> {(int)resp.StatusCode} {resp.ReasonPhrase}", body, resp.StatusCode);
        }
        return string.IsNullOrWhiteSpace(body) ? new JArray() : JArray.Parse(body);
    }

    public async Task<bool> TestConnectionAsync(CancellationToken ct = default)
    {
        try
        {
            var arr = await SelectAsync($"{_config.Schema}?select=table_name&limit=1", ct);
            DesignerLog.Info($"PostgREST bağlantı testi başarılı ({arr?.Count ?? 0} satır).");
            return true;
        }
        catch (Exception ex)
        {
            DesignerLog.Warn("PostgREST bağlantı testi başarısız", ex);
            return false;
        }
    }

    private string BuildUrl(string resourcePath)
    {
        // PostgREST, schema kökünü URL kökünden ayırır; biz explicit olarak /schema/tablo
        // yazımını resourcePath'e bırakıyoruz (Designer UI'da tablo adlarını kullanırken
        // gerekirse burada schema prefix eklenebilir).
        if (resourcePath.StartsWith("/")) return resourcePath;
        return resourcePath;
    }

    private static string EnsureTrailingSlash(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return "http://127.0.0.1:3001/";
        return url.TrimEnd('/') + "/";
    }

    public void Dispose() => _http.Dispose();
}

internal sealed class PostgRestException : Exception
{
    public string ResponseBody { get; }
    public System.Net.HttpStatusCode StatusCode { get; }

    public PostgRestException(string message, string body, System.Net.HttpStatusCode code)
        : base(message)
    {
        ResponseBody = body;
        StatusCode = code;
    }
}
