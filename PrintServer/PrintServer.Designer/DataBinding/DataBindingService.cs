using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using RetailEX.PrintServer.Designer.PostgRest;

namespace RetailEX.PrintServer.Designer.DataBinding;

/// <summary>
/// PostgREST'ten gelen JSON yanıtı DataTable'a çevirir; önizleme için kullanılır.
/// Sütun tipleri JTokenType'a göre tahmin edilir (string / long / double / bool / DateTime).
/// </summary>
internal sealed class DataBindingService
{
    private readonly PostgRestRepository _pg;

    public DataBindingService(PostgRestRepository pg) => _pg = pg;

    /// <summary>
    /// Verilen kaynak için PostgREST'ten önizleme verisi çeker.
    /// <paramref name="resourcePath"/> örnek: <c>products?select=code,name,unit_price&amp;limit=20</c>.
    /// </summary>
    public async Task<DataTable> FetchAsync(string resourcePath, CancellationToken ct = default)
    {
        var arr = await _pg.SelectAsync(resourcePath, ct);
        var table = new DataTable();

        if (arr.Count == 0)
        {
            table.TableName = SafeTableName(resourcePath);
            return table;
        }

        var first = (JObject)arr[0];
        foreach (var prop in first.Properties())
        {
            var clrType = InferClrType(prop.Value);
            table.Columns.Add(prop.Name, clrType);
        }

        foreach (var item in arr)
        {
            var row = table.NewRow();
            var obj = (JObject)item;
            foreach (var prop in obj.Properties())
            {
                if (!table.Columns.Contains(prop.Name))
                {
                    table.Columns.Add(prop.Name, typeof(string));
                }
                row[prop.Name] = prop.Value.Type == JTokenType.Null
                    ? (object?)DBNull.Value
                    : prop.Value.ToObject(table.Columns[prop.Name].DataType);
            }
            table.Rows.Add(row);
        }

        table.TableName = SafeTableName(resourcePath);
        return table;
    }

    private static Type InferClrType(JToken token)
    {
        return token.Type switch
        {
            JTokenType.Integer => typeof(long),
            JTokenType.Float => typeof(double),
            JTokenType.Boolean => typeof(bool),
            JTokenType.Date => typeof(DateTime),
            _ => typeof(string)
        };
    }

    private static string SafeTableName(string resourcePath)
    {
        var name = resourcePath.Split('?', 2)[0];
        name = name.Split('/').Last();
        return name.Replace('-', '_');
    }
}
