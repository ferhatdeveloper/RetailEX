using System;
using System.Linq;
using System.Net;
using System.Text;

namespace RetailEX.PrintServer.Core.PostgRest;

/// <summary>
/// PostgREST filtre / siralama / secim sorgu parcasi ureteci.
/// Tum metodlar statik; sonuc tek bir sorgu string'idir.
/// Ornek: <c>Eq("status", "pending")</c> &rarr; <c>status=eq.pending</c>.
/// </summary>
public static class PostgRestFilterBuilder
{
    /// <summary>col=eq.value (URL-encoded).</summary>
    public static string Eq(string col, object? val)
    {
        if (string.IsNullOrWhiteSpace(col)) throw new ArgumentException("kolon bos", nameof(col));
        return $"{col}=eq.{Enc(val)}";
    }

    /// <summary>col=neq.value.</summary>
    public static string NotEq(string col, object? val)
    {
        if (string.IsNullOrWhiteSpace(col)) throw new ArgumentException("kolon bos", nameof(col));
        return $"{col}=neq.{Enc(val)}";
    }

    /// <summary>col=in.(v1,v2,v3).</summary>
    public static string In(string col, params object?[] vals)
    {
        if (string.IsNullOrWhiteSpace(col)) throw new ArgumentException("kolon bos", nameof(col));
        if (vals == null || vals.Length == 0) throw new ArgumentException("vals bos", nameof(vals));
        var list = string.Join(",", vals.Select(v => Enc(v)));
        return $"{col}=in.({list})";
    }

    /// <summary>col=lt.value.</summary>
    public static string Lt(string col, object? val)
    {
        if (string.IsNullOrWhiteSpace(col)) throw new ArgumentException("kolon bos", nameof(col));
        return $"{col}=lt.{Enc(val)}";
    }

    /// <summary>col=gt.value.</summary>
    public static string Gt(string col, object? val)
    {
        if (string.IsNullOrWhiteSpace(col)) throw new ArgumentException("kolon bos", nameof(col));
        return $"{col}=gt.{Enc(val)}";
    }

    /// <summary>col=like.value (value tek % ... % ile kullanilir).</summary>
    public static string Like(string col, string val)
    {
        if (string.IsNullOrWhiteSpace(col)) throw new ArgumentException("kolon bos", nameof(col));
        return $"{col}=like.{Enc(val)}";
    }

    /// <summary>col=is.null.</summary>
    public static string IsNull(string col)
    {
        if (string.IsNullOrWhiteSpace(col)) throw new ArgumentException("kolon bos", nameof(col));
        return $"{col}=is.null";
    }

    /// <summary>order=col.asc | order=col.desc.</summary>
    public static string Order(string col, bool asc = true)
    {
        if (string.IsNullOrWhiteSpace(col)) throw new ArgumentException("kolon bos", nameof(col));
        return asc ? $"order={col}.asc" : $"order={col}.desc";
    }

    /// <summary>limit=N.</summary>
    public static string Limit(int n)
    {
        if (n < 1) throw new ArgumentOutOfRangeException(nameof(n));
        return $"limit={n}";
    }

    /// <summary>offset=N.</summary>
    public static string Offset(int n)
    {
        if (n < 0) throw new ArgumentOutOfRangeException(nameof(n));
        return $"offset={n}";
    }

    /// <summary>select=a,b,c — virgulle ayrilmis liste.</summary>
    public static string Select(params string[] cols)
    {
        if (cols == null || cols.Length == 0) return "select=*";
        var safe = cols.Where(c => !string.IsNullOrWhiteSpace(c)).Select(c => c.Trim()).ToArray();
        if (safe.Length == 0) return "select=*";
        return "select=" + string.Join(",", safe);
    }

    /// <summary>Birden cok filtreyi '&' ile birlestirir.</summary>
    public static string And(params string[] filters)
    {
        if (filters == null || filters.Length == 0) return "";
        var sb = new StringBuilder();
        var first = true;
        foreach (var f in filters)
        {
            if (string.IsNullOrWhiteSpace(f)) continue;
            var trimmed = f.TrimStart('?', '&');
            if (string.IsNullOrEmpty(trimmed)) continue;
            if (!first) sb.Append('&');
            sb.Append(trimmed);
            first = false;
        }
        return sb.ToString();
    }

    private static string Enc(object? val)
    {
        if (val == null) return "null";
        return Uri.EscapeDataString(Convert.ToString(val, System.Globalization.CultureInfo.InvariantCulture) ?? "");
    }
}
