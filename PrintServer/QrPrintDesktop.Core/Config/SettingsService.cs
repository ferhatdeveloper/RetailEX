using System.Text.Json;

namespace QrPrintDesktop.Core.Config;

public sealed class SettingsService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly string _settingsPath;

    public SettingsService(string? settingsPath = null)
    {
        _settingsPath = settingsPath ?? DefaultSettingsPath;
        Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath)!);
    }

    public static string DefaultDirectory =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "RetailEX",
            "QrPrint");

    public static string DefaultSettingsPath => Path.Combine(DefaultDirectory, "settings.json");

    public static string DefaultInboxPath => Path.Combine(DefaultDirectory, "inbox.json");

    public static string DefaultLogPath => Path.Combine(DefaultDirectory, "qrprint-service.log");

    public string SettingsPath => _settingsPath;

    public AppSettings Load()
    {
        try
        {
            MigrateLegacySettingsIfNeeded();
            if (!File.Exists(_settingsPath))
            {
                var defaults = new AppSettings();
                defaults.Normalize();
                Save(defaults);
                return defaults;
            }

            var json = File.ReadAllText(_settingsPath);
            var settings = JsonSerializer.Deserialize<AppSettings>(json, JsonOptions) ?? new AppSettings();
            settings.Normalize();
            return settings;
        }
        catch
        {
            var fallback = new AppSettings();
            fallback.Normalize();
            return fallback;
        }
    }

    public void Save(AppSettings settings)
    {
        settings.Normalize();
        Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath)!);
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        File.WriteAllText(_settingsPath, json);
    }

    private void MigrateLegacySettingsIfNeeded()
    {
        if (File.Exists(_settingsPath))
        {
            return;
        }

        var legacy = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "QrPrintDesktop",
            "settings.json");
        if (!File.Exists(legacy))
        {
            return;
        }

        try
        {
            File.Copy(legacy, _settingsPath, overwrite: false);
        }
        catch
        {
            // ilk kurulumda varsayılan oluşturulur
        }
    }
}
