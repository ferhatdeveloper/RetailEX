using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RetailEX.PrintServer.Core.Config;

namespace RetailEX.PrintServer.Core.PostgRest;

/// <summary>
/// PostgREST uzerinden SELECT/INSERT/UPDATE/RPC yapar.
/// HttpClient DI uzerinden tek instance olarak enjekte edilir (connection pooling).
/// Tum isteklerde base url + tenant birlesiminden tam url uretilir.
/// Desen: PrintServerConfig.ResolvedApiUrl.
/// </summary>
public sealed class PostgRestClient
{
    private readonly HttpClient _http;
    private readonly PrintServerConfig _cfg;
    private readonly string _baseUrl;

    public PostgRestClient(HttpClient http, PrintServerConfig cfg)
    {
        _http = http ?? throw new ArgumentNullException(nameof(http));
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));

        _baseUrl = cfg.ResolvedApiUrl();
        if (string.IsNullOrWhiteSpace(_baseUrl))
        {
            throw new InvalidOperationException("PostgREST BaseUrl yapilandirmasi bos.");
        }

        if (_http.BaseAddress == null)
        {
            _http.BaseAddress = new Uri(_baseUrl.TrimEnd('/') + "/");
        }

        if (_http.Timeout == System.Threading.Timeout.InfiniteTimeSpan)
        {
            _http.Timeout = TimeSpan.FromSeconds(30);
        }

        ApplyAuthHeader();
    }

    /// <summary>Base url (tenant dahil). Debug icin.</summary>
    public string BaseUrl => _baseUrl;

    /// <summary>Auth modu (none | bearer | apikey).</summary>
    public string AuthMode => _cfg.PostgRest.AuthMode;

    /// <summary>
    /// SELECT sorgusu yapar; sonucu JArray olarak doner.
    /// Ornek: <c>SelectAsync("firms", "select=id,code,name", ct)</c>.
    /// </summary>
    public async Task<JArray> SelectAsync(string tableOrPath, string query, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(tableOrPath)) throw new ArgumentException("table bos", nameof(tableOrPath));
        var url = BuildUrl(tableOrPath, query);
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        var body = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        EnsureSuccess(resp, body, "SELECT", tableOrPath);
        if (string.IsNullOrWhiteSpace(body)) return new JArray();
        return JArray.Parse(body);
    }

    /// <summary>
    /// INSERT yapar; eklenen satiri (returning ile) JArray olarak doner.
    /// Ornek: <c>InsertAsync("table", "*", payloadJObject, ct)</c>.
    /// </summary>
    public async Task<JArray> InsertAsync(string tableOrPath, string returning, JObject body, CancellationToken ct)
    {
        if (body == null) throw new ArgumentNullException(nameof(body));
        var url = BuildUrl(tableOrPath, string.IsNullOrEmpty(returning) ? "select=*" : $"select={Uri.EscapeDataString(returning)}");
        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(body.ToString(Formatting.None), Encoding.UTF8, "application/json")
        };
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.Add("Prefer", "return=representation");

        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        var respBody = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        EnsureSuccess(resp, respBody, "INSERT", tableOrPath);
        if (string.IsNullOrWhiteSpace(respBody)) return new JArray();
        var token = JToken.Parse(respBody);
        return token is JArray arr ? arr : new JArray(token);
    }

    /// <summary>
    /// UPDATE yapar; guncellenen satirlari (returning ile) JArray doner.
    /// Ornek: <c>UpdateAsync("table", "id=eq.123", "select=*", body, ct)</c>.
    /// </summary>
    public async Task<JArray> UpdateAsync(
        string tableOrPath,
        string filter,
        string returning,
        JObject body,
        CancellationToken ct)
    {
        if (body == null) throw new ArgumentNullException(nameof(body));
        var query = string.IsNullOrEmpty(filter) ? "" : filter.TrimStart('?', '&');
        if (!string.IsNullOrEmpty(returning))
        {
            query = string.IsNullOrEmpty(query)
                ? $"select={Uri.EscapeDataString(returning)}"
                : $"{query}&select={Uri.EscapeDataString(returning)}";
        }
        var url = BuildUrl(tableOrPath, query);
        using var req = new HttpRequestMessage(new HttpMethod("PATCH"), url)
        {
            Content = new StringContent(body.ToString(Formatting.None), Encoding.UTF8, "application/json")
        };
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.Add("Prefer", "return=representation");

        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        var respBody = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        EnsureSuccess(resp, respBody, "UPDATE", tableOrPath);
        if (string.IsNullOrWhiteSpace(respBody)) return new JArray();
        var token = JToken.Parse(respBody);
        return token is JArray arr ? arr : new JArray(token);
    }

    /// <summary>
    /// DELETE yapar; silinen satirlari returning ile JArray doner (PostgREST default).
    /// </summary>
    public async Task<JArray> DeleteAsync(string tableOrPath, string filter, string returning, CancellationToken ct)
    {
        var query = string.IsNullOrEmpty(filter) ? "" : filter.TrimStart('?', '&');
        if (!string.IsNullOrEmpty(returning))
        {
            query = string.IsNullOrEmpty(query)
                ? $"select={Uri.EscapeDataString(returning)}"
                : $"{query}&select={Uri.EscapeDataString(returning)}";
        }
        var url = BuildUrl(tableOrPath, query);
        using var req = new HttpRequestMessage(HttpMethod.Delete, url);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.Add("Prefer", "return=representation");

        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        var respBody = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        EnsureSuccess(resp, respBody, "DELETE", tableOrPath);
        if (string.IsNullOrWhiteSpace(respBody)) return new JArray();
        var token = JToken.Parse(respBody);
        return token is JArray arr ? arr : new JArray(token);
    }

    /// <summary>
    /// PostgREST RPC fonksiyonu (POST /rpc/func_name). Body JObject, sonuc JArray.
    /// </summary>
    public async Task<JArray> RpcAsync(string functionName, JObject body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(functionName)) throw new ArgumentException("function bos", nameof(functionName));
        if (body == null) throw new ArgumentNullException(nameof(body));
        var url = "rpc/" + Uri.EscapeDataString(functionName);
        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(body.ToString(Formatting.None), Encoding.UTF8, "application/json")
        };
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        var respBody = await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        EnsureSuccess(resp, respBody, "RPC", functionName);
        if (string.IsNullOrWhiteSpace(respBody)) return new JArray();
        var token = JToken.Parse(respBody);
        return token is JArray arr ? arr : new JArray(token);
    }

    /// <summary>URL'yi base + path + query olarak insa eder.</summary>
    public string BuildUrl(string tableOrPath, string query)
    {
        var path = (tableOrPath ?? "").TrimStart('/');
        if (!path.Contains("?") && !string.IsNullOrEmpty(query))
        {
            return path + "?" + query.TrimStart('?', '&');
        }
        return path;
    }

    private void ApplyAuthHeader()
    {
        var mode = (_cfg.PostgRest.AuthMode ?? "apikey").Trim().ToLowerInvariant();
        var token = _cfg.PostgRest.ApiToken ?? "";
        _http.DefaultRequestHeaders.Authorization = null;
        _http.DefaultRequestHeaders.Remove("apikey");
        switch (mode)
        {
            case "bearer":
                if (!string.IsNullOrWhiteSpace(token))
                {
                    _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
                }
                break;
            case "apikey":
                if (!string.IsNullOrWhiteSpace(token))
                {
                    _http.DefaultRequestHeaders.Add("apikey", token);
                }
                break;
            case "none":
            default:
                break;
        }
    }

    private void EnsureSuccess(HttpResponseMessage resp, string body, string verb, string target)
    {
        if (resp.IsSuccessStatusCode) return;
        var status = (int)resp.StatusCode;
        var snippet = string.IsNullOrEmpty(body) ? "" : body;
        if (snippet.Length > 500) snippet = snippet.Substring(0, 500) + "...";
        var message = $"PostgREST {verb} {target} basarisiz. HTTP {status} {resp.ReasonPhrase}. Yanit: {snippet}";
        throw new PostgRestException(status, body, message);
    }
}
