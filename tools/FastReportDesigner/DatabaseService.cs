using System.Text.Json;
using Npgsql;

namespace RetailEX.FastReportDesigner;

internal sealed class DatabaseService
{
    private const string ReportCategory = "fastreport_frx";
    private const string ReportTemplateType = "fastreport_frx";

    private static readonly string[] FirmTables =
    [
        "products",
        "customers",
        "suppliers",
        "stores",
        "cash_registers"
    ];

    private static readonly string[] PeriodTables =
    [
        "sales",
        "sale_items",
        "cash_lines",
        "bank_lines",
        "stock_movements"
    ];

    private static readonly string[] RestaurantTables =
    [
        "orders",
        "order_items",
        "kitchen_orders",
        "kitchen_order_items",
        "rest_orders",
        "rest_order_items",
        "rest_kitchen_orders",
        "rest_kitchen_order_items"
    ];

    private readonly AppConfig _config;

    public DatabaseService(AppConfig config)
    {
        _config = config;
    }

    public async Task TestConnectionAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new NpgsqlConnection(_config.ToConnectionString());
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand("SELECT 1", connection);
        await command.ExecuteScalarAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<DatabaseField>> LoadFieldsAsync(CancellationToken cancellationToken = default)
    {
        var candidates = BuildTableCandidates(_config.FirmNr, _config.PeriodNr).ToList();
        var aliasByQualifiedName = candidates
            .GroupBy(x => x.QualifiedName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(x => x.Key, x => x.First().Alias, StringComparer.OrdinalIgnoreCase);

        var whereParts = new List<string>();
        var parameters = new List<NpgsqlParameter>();
        var parameterIndex = 0;

        foreach (var group in candidates.GroupBy(x => x.Schema, StringComparer.OrdinalIgnoreCase))
        {
            var parameterName = $"p{parameterIndex++}";
            whereParts.Add($"(table_schema = @{parameterName}schema AND table_name = ANY(@{parameterName}tables))");
            parameters.Add(new NpgsqlParameter($"{parameterName}schema", group.Key));
            parameters.Add(new NpgsqlParameter($"{parameterName}tables", group.Select(x => x.TableName).Distinct(StringComparer.OrdinalIgnoreCase).ToArray()));
        }

        var sql = $"""
            SELECT table_schema, table_name, column_name, data_type, ordinal_position
              FROM information_schema.columns
             WHERE {string.Join(" OR ", whereParts)}
             ORDER BY table_schema, table_name, ordinal_position
            """;

        var fields = new List<DatabaseField>();
        await using var connection = new NpgsqlConnection(_config.ToConnectionString());
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddRange(parameters.ToArray());

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var schema = reader.GetString(0);
            var table = reader.GetString(1);
            var key = $"{schema}.{table}";
            var alias = aliasByQualifiedName.TryGetValue(key, out var mappedAlias) ? mappedAlias : table;

            fields.Add(new DatabaseField(
                schema,
                table,
                alias,
                reader.GetString(2),
                reader.GetString(3),
                reader.GetInt32(4)));
        }

        var displayTableOrder = AllDisplayTables;
        return fields
            .OrderBy(x =>
            {
                var index = Array.IndexOf(displayTableOrder, x.DisplayTableName);
                return index < 0 ? int.MaxValue : index;
            })
            .ThenBy(x => x.DisplayTableName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(x => x.OrdinalPosition)
            .ToList();
    }

    public async Task<IReadOnlyList<ReportTemplateRecord>> LoadTemplateListAsync(CancellationToken cancellationToken = default)
    {
        const string sql = """
            SELECT id, name, firm_nr, period_nr, updated_at
              FROM public.report_templates
             WHERE category = @category
               AND template_type = @template_type
               AND (firm_nr = @firm_nr OR firm_nr IS NULL)
             ORDER BY CASE WHEN firm_nr = @firm_nr THEN 0 ELSE 1 END, updated_at DESC, name
            """;

        var items = new List<ReportTemplateRecord>();
        await using var connection = new NpgsqlConnection(_config.ToConnectionString());
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("category", ReportCategory);
        command.Parameters.AddWithValue("template_type", ReportTemplateType);
        command.Parameters.AddWithValue("firm_nr", _config.FirmNr);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new ReportTemplateRecord(
                reader.GetGuid(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetFieldValue<DateTimeOffset>(4)));
        }

        return items;
    }

    public async Task<byte[]> LoadTemplateContentAsync(Guid id, CancellationToken cancellationToken = default)
    {
        const string sql = """
            SELECT content::text
              FROM public.report_templates
             WHERE id = @id
               AND category = @category
               AND template_type = @template_type
            """;

        await using var connection = new NpgsqlConnection(_config.ToConnectionString());
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("category", ReportCategory);
        command.Parameters.AddWithValue("template_type", ReportTemplateType);

        var contentText = (string?)await command.ExecuteScalarAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(contentText))
        {
            throw new InvalidOperationException("Şablon içeriği boş.");
        }

        using var document = JsonDocument.Parse(contentText);
        if (!document.RootElement.TryGetProperty("frxBase64", out var base64Property))
        {
            throw new InvalidOperationException("Şablon JSON içeriğinde frxBase64 alanı yok.");
        }

        var base64 = base64Property.GetString();
        if (string.IsNullOrWhiteSpace(base64))
        {
            throw new InvalidOperationException("Şablon frxBase64 alanı boş.");
        }

        return Convert.FromBase64String(base64);
    }

    public async Task<Guid> SaveTemplateAsync(
        Guid? id,
        string name,
        byte[] frxBytes,
        IEnumerable<string> dataSources,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Şablon adı boş olamaz.", nameof(name));
        }

        if (frxBytes.Length == 0)
        {
            throw new ArgumentException(".frx içeriği boş olamaz.", nameof(frxBytes));
        }

        var payload = JsonSerializer.Serialize(new
        {
            version = 1,
            format = "frx",
            engine = "fastreport",
            frxBase64 = Convert.ToBase64String(frxBytes),
            dataSources = dataSources.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToArray(),
            updatedAt = DateTimeOffset.UtcNow.ToString("O")
        });

        await using var connection = new NpgsqlConnection(_config.ToConnectionString());
        await connection.OpenAsync(cancellationToken);

        if (id.HasValue)
        {
            const string updateSql = """
                UPDATE public.report_templates
                   SET name = @name,
                       description = @description,
                       category = @category,
                       template_type = @template_type,
                       content = @content::jsonb,
                       firm_nr = @firm_nr,
                       period_nr = @period_nr,
                       updated_at = NOW()
                 WHERE id = @id
                 RETURNING id
                """;

            await using var command = CreateTemplateCommand(connection, updateSql, name, payload);
            command.Parameters.AddWithValue("id", id.Value);
            var updated = (Guid?)await command.ExecuteScalarAsync(cancellationToken);
            if (updated.HasValue)
            {
                return updated.Value;
            }
        }

        const string insertSql = """
            INSERT INTO public.report_templates
              (name, description, category, template_type, content, is_default, firm_nr, period_nr)
            VALUES
              (@name, @description, @category, @template_type, @content::jsonb, false, @firm_nr, @period_nr)
            RETURNING id
            """;

        await using var insertCommand = CreateTemplateCommand(connection, insertSql, name, payload);
        var inserted = (Guid?)await insertCommand.ExecuteScalarAsync(cancellationToken);
        return inserted ?? throw new InvalidOperationException("Şablon kaydedilemedi.");
    }

    private NpgsqlCommand CreateTemplateCommand(NpgsqlConnection connection, string sql, string name, string contentJson)
    {
        var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("name", name.Trim());
        command.Parameters.AddWithValue("description", "FastReport .frx tasarımı");
        command.Parameters.AddWithValue("category", ReportCategory);
        command.Parameters.AddWithValue("template_type", ReportTemplateType);
        command.Parameters.AddWithValue("content", contentJson);
        command.Parameters.AddWithValue("firm_nr", _config.FirmNr);
        command.Parameters.AddWithValue("period_nr", _config.PeriodNr);
        return command;
    }

    private static IEnumerable<TableCandidate> BuildTableCandidates(string firmNr, string periodNr)
    {
        firmNr = AppConfig.NormalizeFirm(firmNr);
        periodNr = AppConfig.NormalizePeriod(periodNr);

        foreach (var table in FirmTables)
        {
            yield return new TableCandidate("public", table, table);
            yield return new TableCandidate("public", $"rex_{firmNr}_{table}", table);
        }

        foreach (var table in PeriodTables)
        {
            yield return new TableCandidate("public", table, table);
            yield return new TableCandidate("public", $"rex_{firmNr}_{periodNr}_{table}", table);
        }

        foreach (var table in RestaurantTables)
        {
            var alias = table.StartsWith("rest_", StringComparison.OrdinalIgnoreCase) ? table[5..] : table;
            yield return new TableCandidate("public", table, alias);
            yield return new TableCandidate("rest", table, alias);
            yield return new TableCandidate("rest", alias, alias);
            yield return new TableCandidate("public", $"rex_{firmNr}_{periodNr}_{table}", alias);
            yield return new TableCandidate("rest", $"rex_{firmNr}_{periodNr}_{table}", alias);
        }
    }

    private static string[] AllDisplayTables => FirmTables
        .Concat(PeriodTables)
        .Concat(RestaurantTables.Select(x => x.StartsWith("rest_", StringComparison.OrdinalIgnoreCase) ? x[5..] : x))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

    private sealed record TableCandidate(string Schema, string TableName, string Alias)
    {
        public string QualifiedName => $"{Schema}.{TableName}";
    }
}
