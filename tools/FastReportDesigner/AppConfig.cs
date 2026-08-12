using System.Text.Json;
using Npgsql;

namespace RetailEX.FastReportDesigner;

internal sealed class AppConfig
{
    public string Host { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 5432;
    public string Database { get; set; } = "retailex_local";
    public string User { get; set; } = "postgres";
    public string Password { get; set; } = string.Empty;
    public string FirmNr { get; set; } = "001";
    public string PeriodNr { get; set; } = "01";

    public static AppConfig Load()
    {
        var config = new AppConfig();
        config.ApplyEnvironment();

        foreach (var path in CandidateConfigPaths())
        {
            if (!File.Exists(path))
            {
                continue;
            }

            try
            {
                var loaded = JsonSerializer.Deserialize<AppConfig>(
                    File.ReadAllText(path),
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (loaded is not null)
                {
                    config = loaded;
                    config.ApplyEnvironment(missingOnly: true);
                    break;
                }
            }
            catch
            {
                // Bozuk config dosyası uygulamayı açılmadan durdurmasın; kullanıcı bağlantı alanlarından düzeltebilir.
            }
        }

        config.Normalize();
        return config;
    }

    public string ToConnectionString()
    {
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = Host,
            Port = Port,
            Database = Database,
            Username = User,
            Password = Password,
            Timeout = 15,
            CommandTimeout = 60,
            Pooling = true,
            IncludeErrorDetail = true
        };

        return builder.ConnectionString;
    }

    public void Normalize()
    {
        Host = string.IsNullOrWhiteSpace(Host) ? "127.0.0.1" : Host.Trim();
        Database = string.IsNullOrWhiteSpace(Database) ? "retailex_local" : Database.Trim();
        User = string.IsNullOrWhiteSpace(User) ? "postgres" : User.Trim();
        Password ??= string.Empty;
        FirmNr = NormalizeFirm(FirmNr);
        PeriodNr = NormalizePeriod(PeriodNr);
        if (Port <= 0)
        {
            Port = 5432;
        }
    }

    public static string NormalizeFirm(string? firmNr)
    {
        var value = string.IsNullOrWhiteSpace(firmNr) ? "001" : firmNr.Trim();
        return value.PadLeft(3, '0');
    }

    public static string NormalizePeriod(string? periodNr)
    {
        var value = string.IsNullOrWhiteSpace(periodNr) ? "01" : periodNr.Trim();
        return value.PadLeft(2, '0');
    }

    private void ApplyEnvironment(bool missingOnly = false)
    {
        ApplyString("PGHOST", value => Host = value, Host);
        ApplyInt("PGPORT", value => Port = value, Port);
        ApplyString("PGDATABASE", value => Database = value, Database);
        ApplyString("PGUSER", value => User = value, User);
        ApplyString("PGPASSWORD", value => Password = value, Password);
        ApplyString("RETAILEX_FIRM_NR", value => FirmNr = value, FirmNr);
        ApplyString("RETAILEX_PERIOD_NR", value => PeriodNr = value, PeriodNr);

        void ApplyString(string key, Action<string> set, string currentValue)
        {
            var value = Environment.GetEnvironmentVariable(key);
            if (!string.IsNullOrWhiteSpace(value) && (!missingOnly || string.IsNullOrWhiteSpace(currentValue)))
            {
                set(value.Trim());
            }
        }

        void ApplyInt(string key, Action<int> set, int currentValue)
        {
            var value = Environment.GetEnvironmentVariable(key);
            if ((!missingOnly || currentValue <= 0) && int.TryParse(value, out var parsed))
            {
                set(parsed);
            }
        }
    }

    private static IEnumerable<string> CandidateConfigPaths()
    {
        yield return Path.Combine(AppContext.BaseDirectory, "designer.config.json");
        yield return Path.Combine(Environment.CurrentDirectory, "designer.config.json");
    }
}
