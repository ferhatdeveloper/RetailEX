using System;

namespace RetailEX.PrintServer.Core.PostgRest;

/// <summary>
/// PostgREST HTTP hatalarini temsil eder (4xx/5xx).
/// Body kısa kesilerek message icinde verilir; ham govde Body ozelliginde tutulur.
/// </summary>
public sealed class PostgRestException : Exception
{
    /// <summary>HTTP durum kodu (ornek: 401, 404, 500).</summary>
    public int StatusCode { get; }

    /// <summary>Ham yanit govdesi (PostgREST error JSON).</summary>
    public string Body { get; }

    public PostgRestException(int statusCode, string body, string message) : base(message)
    {
        StatusCode = statusCode;
        Body = body;
    }
}