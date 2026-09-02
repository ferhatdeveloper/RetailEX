using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using RetailEX.PrintServer.Designer.Config;
using RetailEX.PrintServer.Designer.Logging;
using RetailEX.PrintServer.Designer.PostgRest;
using RetailEX.PrintServer.Designer.Templates;

namespace RetailEX.PrintServer.Designer.Forms;

/// <summary>
/// Üstte PostgREST bağlantı satırı + kiracı seçim combobox'ları + kiracı listesi paneli.
/// "Kaydet" ile seçilen kiracı DesignerConfig'e yazılır; designer yeniden açıldığında
/// aynı kiracı aktif kalır.
/// </summary>
internal sealed class TenantPanel : UserControl
{
    private readonly TextBox _baseUrlBox = new();
    private readonly ComboBox _authModeCombo = new();
    private readonly TextBox _bearerBox = new();
    private readonly TextBox _apiKeyBox = new();
    private readonly Button _testButton = new();
    private readonly Button _saveButton = new();
    private readonly Label _connectionStatus = new();
    private readonly ComboBox _firmCombo = new();
    private readonly ComboBox _periodCombo = new();
    private readonly Button _refreshButton = new();
    private readonly Button _saveTenantButton = new();
    private readonly ListView _tenantList = new();

    private DesignerConfig _config = null!;
    private PostgRestRepository? _pg;
    private TemplateRepository? Repo => _pg is null ? null : new TemplateRepository(_pg);

    public event EventHandler<TenantRef>? TenantChanged;

    public TenantPanel()
    {
        Dock = DockStyle.Fill;
        Padding = new Padding(8);
        BuildUi();
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public DesignerConfig Config
    {
        get => _config;
        set
        {
            _config = value;
            ApplyConfig();
        }
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public PostgRestRepository? Repository
    {
        get => _pg;
        set => _pg = value;
    }

    /// <summary>Template repository'ye Repository üzerinden ulaşmak için.</summary>
    public TemplateRepository? TemplateRepository => Repo;

    public TenantRef CurrentTenant =>
        new()
        {
            FirmNr = (_firmCombo.SelectedItem as TenantRef)?.FirmNr ?? _config.Tenants.Active.FirmNr,
            PeriodNr = (_periodCombo.SelectedItem as TenantRef)?.PeriodNr ?? _config.Tenants.Active.PeriodNr,
            Name = _config.Tenants.Known.FirstOrDefault(k =>
                k.FirmNr == _config.Tenants.Active.FirmNr &&
                k.PeriodNr == _config.Tenants.Active.PeriodNr)?.Name
        };

    private void BuildUi()
    {
        var outer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4
        };
        outer.RowStyles.Add(new RowStyle(SizeType.Absolute, 100));
        outer.RowStyles.Add(new RowStyle(SizeType.Absolute, 80));
        outer.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        outer.RowStyles.Add(new RowStyle(SizeType.Absolute, 26));

        outer.Controls.Add(BuildConnectionGroup(), 0, 0);
        outer.Controls.Add(BuildTenantSelector(), 0, 1);
        outer.Controls.Add(BuildTenantList(), 0, 2);
        outer.Controls.Add(_connectionStatus, 0, 3);
        _connectionStatus.Dock = DockStyle.Fill;
        _connectionStatus.ForeColor = Color.FromArgb(71, 85, 105);

        Controls.Add(outer);
    }

    private Control BuildConnectionGroup()
    {
        var group = new GroupBox
        {
            Text = "PostgREST bağlantısı",
            Dock = DockStyle.Fill,
            Padding = new Padding(8)
        };

        var grid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 6,
            RowCount = 2
        };
        for (var i = 0; i < 6; i++)
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / 6f));

        _baseUrlBox.Dock = DockStyle.Fill;
        _authModeCombo.Dock = DockStyle.Fill;
        _authModeCombo.Items.AddRange(new object[] { "none", "bearer", "apikey" });
        _authModeCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _bearerBox.Dock = DockStyle.Fill; _bearerBox.UseSystemPasswordChar = true;
        _apiKeyBox.Dock = DockStyle.Fill; _apiKeyBox.UseSystemPasswordChar = true;
        _testButton.Text = "Bağlantıyı Test Et"; _testButton.Dock = DockStyle.Fill;
        _testButton.Click += async (_, _) => await TestConnectionAsync();

        _saveButton.Text = "Bağlantıyı Kaydet"; _saveButton.Dock = DockStyle.Fill;
        _saveButton.Click += (_, _) =>
        {
            UpdateConfigFromInputs();
            _config.Save();
            SetStatus("Bağlantı ayarları kaydedildi.");
        };

        grid.Controls.Add(MakeLabeled("Base URL", _baseUrlBox), 0, 0); grid.SetColumnSpan(MakeLabeled("Base URL", _baseUrlBox), 2);
        grid.Controls.Add(MakeLabeled("Auth", _authModeCombo), 2, 0);
        grid.Controls.Add(MakeLabeled("Bearer", _bearerBox), 3, 0);
        grid.Controls.Add(_testButton, 4, 0);
        grid.Controls.Add(_saveButton, 5, 0);
        grid.Controls.Add(MakeLabeled("API Key", _apiKeyBox), 0, 1); grid.SetColumnSpan(MakeLabeled("API Key", _apiKeyBox), 3);
        grid.Controls.Add(_connectionStatus, 4, 1); grid.SetColumnSpan(_connectionStatus, 2);
        _connectionStatus.Text = string.Empty;

        group.Controls.Add(grid);
        return group;
    }

    private Control BuildTenantSelector()
    {
        var group = new GroupBox
        {
            Text = "Aktif kiracı",
            Dock = DockStyle.Fill,
            Padding = new Padding(8)
        };

        var grid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4
        };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 10));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 10));

        _firmCombo.Dock = DockStyle.Fill;
        _firmCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _firmCombo.SelectedIndexChanged += async (_, _) => await OnFirmChangedAsync();

        _periodCombo.Dock = DockStyle.Fill;
        _periodCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _periodCombo.SelectedIndexChanged += (_, _) => NotifyTenantChanged();

        _refreshButton.Text = "Yenile";
        _refreshButton.Dock = DockStyle.Fill;
        _refreshButton.Click += async (_, _) => await RefreshTenantsAsync();

        _saveTenantButton.Text = "Kiracıyı Kaydet";
        _saveTenantButton.Dock = DockStyle.Fill;
        _saveTenantButton.Click += (_, _) =>
        {
            _config.Tenants.Active.FirmNr = _firmCombo.Text.PadLeft(3, '0');
            _config.Tenants.Active.PeriodNr = _periodCombo.Text.PadLeft(2, '0');
            _config.Save();
            SetStatus($"Aktif kiracı kaydedildi: {_config.Tenants.Active.FirmNr}/{_config.Tenants.Active.PeriodNr}");
        };

        grid.Controls.Add(MakeLabeled("Firma", _firmCombo), 0, 0);
        grid.Controls.Add(MakeLabeled("Dönem", _periodCombo), 1, 0);
        grid.Controls.Add(_refreshButton, 2, 0);
        grid.Controls.Add(_saveTenantButton, 3, 0);

        group.Controls.Add(grid);
        return group;
    }

    private Control BuildTenantList()
    {
        var group = new GroupBox
        {
            Text = "Bilinen kiracılar",
            Dock = DockStyle.Fill,
            Padding = new Padding(8)
        };

        _tenantList.Dock = DockStyle.Fill;
        _tenantList.View = View.Details;
        _tenantList.FullRowSelect = true;
        _tenantList.GridLines = true;
        _tenantList.Columns.Add("Firma", 80);
        _tenantList.Columns.Add("Dönem", 80);
        _tenantList.Columns.Add("Ad", 360);
        _tenantList.DoubleClick += (_, _) => ApplySelectedTenantFromList();
        _tenantList.SelectedIndexChanged += (_, _) => ApplySelectedTenantFromList();

        group.Controls.Add(_tenantList);
        return group;
    }

    private static Control MakeLabeled(string label, Control input)
    {
        var wrapper = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1
        };
        wrapper.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 60));
        wrapper.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var lbl = new Label
        {
            Text = label,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        };
        wrapper.Controls.Add(lbl, 0, 0);
        wrapper.Controls.Add(input, 1, 0);
        return wrapper;
    }

    public void ApplyConfig()
    {
        _baseUrlBox.Text = _config.PostgRest.BaseUrl;
        _authModeCombo.SelectedItem = (_config.PostgRest.AuthMode ?? "none").ToLowerInvariant();
        _bearerBox.Text = _config.PostgRest.BearerToken;
        _apiKeyBox.Text = _config.PostgRest.ApiKey;

        PopulateKnownTenants();
        _firmCombo.SelectedItem = _config.Tenants.Known.FirstOrDefault(t => t.FirmNr == _config.Tenants.Active.FirmNr)
            ?? new TenantRef { FirmNr = _config.Tenants.Active.FirmNr, Name = _config.Tenants.Active.FirmNr };
        if (_firmCombo.SelectedIndex < 0 && _firmCombo.Items.Count > 0) _firmCombo.SelectedIndex = 0;
        _periodCombo.SelectedItem = _config.Tenants.Known.FirstOrDefault(t =>
            t.FirmNr == _config.Tenants.Active.FirmNr && t.PeriodNr == _config.Tenants.Active.PeriodNr)
            ?? new TenantRef
            {
                FirmNr = _config.Tenants.Active.FirmNr,
                PeriodNr = _config.Tenants.Active.PeriodNr,
                Name = _config.Tenants.Active.PeriodNr
            };
        if (_periodCombo.SelectedIndex < 0 && _periodCombo.Items.Count > 0) _periodCombo.SelectedIndex = 0;
    }

    private void PopulateKnownTenants()
    {
        // Known listesinden combo'lara koy (henüz PG'den çekmediysek yalnız config'dekiler)
        _firmCombo.Items.Clear();
        var distinctFirms = _config.Tenants.Known
            .Select(t => new TenantRef { FirmNr = t.FirmNr, Name = t.Name })
            .GroupBy(t => t.FirmNr, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();
        foreach (var f in distinctFirms) _firmCombo.Items.Add(f);

        _tenantList.Items.Clear();
        foreach (var t in _config.Tenants.Known)
        {
            var item = new ListViewItem(t.FirmNr);
            item.SubItems.Add(t.PeriodNr);
            item.SubItems.Add(t.Name ?? string.Empty);
            item.Tag = t;
            _tenantList.Items.Add(item);
        }
    }

    public async Task RefreshTenantsAsync()
    {
        if (_pg is null)
        {
            SetStatus("Önce bağlantıyı kurun.");
            return;
        }
        try
        {
            UseWaitCursor = true;
            var arr = await _pg.SelectAsync("firms?select=code,name&is_active=eq.true&order=code");
            var firms = new List<TenantRef>();
            foreach (var row in arr)
            {
                firms.Add(new TenantRef
                {
                    FirmNr = (row["code"] ?? "").ToString().PadLeft(3, '0'),
                    Name = (row["name"] ?? "").ToString()
                });
            }

            var activeFirm = _firmCombo.SelectedItem is TenantRef f ? f.FirmNr : _config.Tenants.Active.FirmNr;
            var periods = await TemplateRepository!.ListPeriodsAsync(activeFirm);

            _config.Tenants.Known = firms
                .SelectMany(f => periods
                    .Where(p => p.FirmNr == f.FirmNr)
                    .Select(p => new TenantRef { FirmNr = f.FirmNr, PeriodNr = p.PeriodNr, Name = $"{f.Name} - {p.PeriodNr}" }))
                .ToList();

            _config.Save();
            ApplyConfig();
            SetStatus($"{firms.Count} firma, {periods.Count} dönem yüklendi.");
        }
        catch (Exception ex)
        {
            DesignerLog.Error("Kiracı listesi yenileme hatası", ex);
            SetStatus($"Kiracı listesi yüklenemedi: {ex.Message}");
        }
        finally
        {
            UseWaitCursor = false;
        }
    }

    public async Task TestConnectionAsync()
    {
        if (_pg is null)
        {
            UpdateConfigFromInputs();
            _pg = new PostgRestRepository(_config.PostgRest);
        }
        try
        {
            UseWaitCursor = true;
            var ok = await _pg.TestConnectionAsync();
            SetStatus(ok ? $"Bağlantı başarılı ({_pg.BaseUrl})" : $"Bağlantı başarısız ({_pg.BaseUrl})");
            _connectionStatus.ForeColor = ok ? Color.FromArgb(22, 163, 74) : Color.FromArgb(220, 38, 38);
        }
        catch (Exception ex)
        {
            DesignerLog.Error("PostgREST bağlantı testi", ex);
            SetStatus($"Bağlantı hatası: {ex.Message}");
            _connectionStatus.ForeColor = Color.FromArgb(220, 38, 38);
        }
        finally
        {
            UseWaitCursor = false;
        }
    }

    private async Task OnFirmChangedAsync()
    {
        if (_firmCombo.SelectedItem is not TenantRef firm || _pg is null) return;
        try
        {
            var repo = TemplateRepository!;
            var periods = await repo.ListPeriodsAsync(firm.FirmNr);
            _periodCombo.Items.Clear();
            foreach (var p in periods) _periodCombo.Items.Add(p);
            if (_periodCombo.Items.Count > 0) _periodCombo.SelectedIndex = 0;
            NotifyTenantChanged();
        }
        catch (Exception ex)
        {
            DesignerLog.Error("Dönem listesi yüklenemedi", ex);
            SetStatus($"Dönemler yüklenemedi: {ex.Message}");
        }
    }

    private void NotifyTenantChanged()
    {
        TenantChanged?.Invoke(this, CurrentTenant);
    }

    private void ApplySelectedTenantFromList()
    {
        if (_tenantList.SelectedItems.Count == 0) return;
        if (_tenantList.SelectedItems[0].Tag is not TenantRef t) return;

        _firmCombo.SelectedItem = _firmCombo.Items.OfType<TenantRef>()
            .FirstOrDefault(f => f.FirmNr == t.FirmNr);
        if (_periodCombo.Items.OfType<TenantRef>().Any(p => p.PeriodNr == t.PeriodNr))
        {
            _periodCombo.SelectedItem = _periodCombo.Items.OfType<TenantRef>()
                .First(p => p.PeriodNr == t.PeriodNr);
        }
        NotifyTenantChanged();
    }

    private void UpdateConfigFromInputs()
    {
        _config.PostgRest.BaseUrl = _baseUrlBox.Text.Trim();
        _config.PostgRest.AuthMode = (_authModeCombo.SelectedItem?.ToString() ?? "none").Trim();
        _config.PostgRest.BearerToken = _bearerBox.Text.Trim();
        _config.PostgRest.ApiKey = _apiKeyBox.Text.Trim();
        _config.Normalize();
    }

    private void SetStatus(string message)
    {
        if (InvokeRequired)
        {
            Invoke(() => _connectionStatus.Text = message);
        }
        else
        {
            _connectionStatus.Text = message;
        }
    }
}
