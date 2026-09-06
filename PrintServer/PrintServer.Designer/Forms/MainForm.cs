using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using RetailEX.PrintServer.Designer.Config;
using RetailEX.PrintServer.Designer.DataBinding;
using RetailEX.PrintServer.Designer.FastReport;
using RetailEX.PrintServer.Designer.Logging;
using RetailEX.PrintServer.Designer.PostgRest;
using RetailEX.PrintServer.Designer.Templates;

namespace RetailEX.PrintServer.Designer.Forms;

internal sealed class MainForm : Form
{
    private readonly SplitContainer _mainSplit = new() { Orientation = Orientation.Vertical };
    private readonly SplitContainer _leftSplit = new() { Orientation = Orientation.Vertical };
    private readonly SplitContainer _bottomSplit = new() { Orientation = Orientation.Horizontal };

    private readonly TenantPanel _tenantPanel = new();
    private readonly DataBindingPanel _dataPanel = new();
    private readonly Panel _designerPanel = new();
    private readonly ListView _templateList = new();
    private readonly StatusStrip _statusStrip = new();
    private readonly ToolStripStatusLabel _statusLabel = new();

    private readonly ToolStripButton _newButton = new("Yeni");
    private readonly ToolStripButton _openLocalButton = new("Aç (.frx)");
    private readonly ToolStripButton _saveLocalButton = new("Kaydet (.frx lokal)");
    private readonly ToolStripButton _saveDbButton = new("DB'ye Kaydet");
    private readonly ToolStripButton _openDbButton = new("DB'den Aç");
    private readonly ToolStripButton _previewButton = new("Önizleme");
    private readonly ToolStripButton _designWindowButton = new("Designer Pencere");
    private readonly ToolStripButton _registerPreviewButton = new("Veriyi Bağla");
    private readonly ToolStripButton _refreshTemplatesButton = new("Listeyi Yenile");

    private DesignerConfig _config = null!;
    private PostgRestRepository? _pg;
    private TemplateRepository? _repo;
    private DataBindingService? _binding;
    private FastReportDesignerHost? _fastReport;

    private DesignerTemplateRecord? _currentTemplate;
    private System.Data.DataTable? _currentPreviewData;
    private string _currentTemplateName = string.Empty;

    public MainForm()
    {
        Text = "RetailEX FastReport Designer";
        StartPosition = FormStartPosition.CenterScreen;
        Width = 1440;
        Height = 900;
        MinimumSize = new Size(1100, 700);
        Font = new Font("Segoe UI", 9F);
        // app.ico hem apphost .exe'ye hem de Form'a baglanir; tasarim araci
        // basliginda + gorev cubugunda ayni ikon gorunur.
        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
        if (File.Exists(iconPath))
        {
            try
            {
                Icon = new Icon(iconPath);
            }
            catch (Exception ex)
            {
                DesignerLog.Warn("Icon yuklenemedi: " + iconPath, ex);
            }
        }

        _config = DesignerConfig.Load();
        BuildUi();
        ApplyConfig();

        _tenantPanel.TenantChanged += (_, _) => RefreshTemplatesAsync();
        _dataPanel.PreviewRequested += OnPreviewRequested;
        _dataPanel.FieldPathCopied += (_, path) => SetStatus($"Alan yolu kopyalandı: {path}");
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        try
        {
            InitializePostgRest();
            _fastReport = new FastReportDesignerHost(_designerPanel, _config.FastReport.LibDirectory);
            SetStatus(_fastReport.StatusMessage);
            _tenantPanel.Repository = _pg;
            _dataPanel.BindingService = _binding;
            _dataPanel.PopulateSuggestedTables();
            _ = RefreshTemplatesAsync();
        }
        catch (Exception ex)
        {
            DesignerLog.Error("MainForm başlatma hatası", ex);
            SetStatus($"Başlatma hatası: {ex.Message}");
        }
    }

    private void BuildUi()
    {
        var toolStrip = BuildToolStrip();
        BuildSplitters();

        _statusStrip.Items.Add(_statusLabel);
        _statusStrip.Dock = DockStyle.Bottom;

        _mainSplit.Panel1.Controls.Add(_leftSplit);
        _mainSplit.Panel1.Controls.Add(toolStrip);
        _leftSplit.Panel1.Controls.Add(_tenantPanel);
        _leftSplit.Panel2.Controls.Add(_dataPanel);
        _mainSplit.Panel2.Controls.Add(_designerPanel);
        _mainSplit.Panel2.Controls.Add(_bottomSplit);
        _bottomSplit.Panel1.Controls.Add(BuildTemplateList());
        _bottomSplit.Panel2.Controls.Add(new PreviewGridPanel());

        Controls.Add(_mainSplit);
        Controls.Add(_statusStrip);
    }

    private ToolStrip BuildToolStrip()
    {
        var strip = new ToolStrip
        {
            Dock = DockStyle.Top,
            GripStyle = ToolStripGripStyle.Hidden,
            Padding = new Padding(6)
        };

        _newButton.Click += (_, _) => RunFastReportAction(() =>
        {
            _fastReport!.NewReport();
            _currentTemplate = null;
            _currentTemplateName = _config.FastReport.DefaultTemplateName;
            SetStatus("Yeni FastReport raporu oluşturuldu.");
        });

        _openLocalButton.Click += (_, _) => OpenLocalFrx();
        _saveLocalButton.Click += (_, _) => SaveLocalFrx();
        _saveDbButton.Click += async (_, _) => await SaveToDatabaseAsync();
        _openDbButton.Click += (_, _) => OpenSelectedFromDatabase();
        _previewButton.Click += (_, _) => RunFastReportAction(() => _fastReport!.Preview());
        _designWindowButton.Click += (_, _) => RunFastReportAction(() => _fastReport!.OpenDesignerWindow());
        _registerPreviewButton.Click += (_, _) => RegisterPreviewData();
        _refreshTemplatesButton.Click += async (_, _) => await RefreshTemplatesAsync();

        strip.Items.AddRange(new ToolStripItem[]
        {
            _newButton, new ToolStripSeparator(),
            _openLocalButton, _saveLocalButton, new ToolStripSeparator(),
            _saveDbButton, _openDbButton, _refreshTemplatesButton, new ToolStripSeparator(),
            _previewButton, _designWindowButton, _registerPreviewButton
        });
        return strip;
    }

    private void BuildSplitters()
    {
        _mainSplit.Dock = DockStyle.Fill;
        _mainSplit.SplitterDistance = 380;
        _mainSplit.FixedPanel = FixedPanel.Panel1;

        _leftSplit.Dock = DockStyle.Fill;
        _leftSplit.SplitterDistance = 320;

        _bottomSplit.Dock = DockStyle.Fill;
        _bottomSplit.SplitterDistance = 280;
        _bottomSplit.Orientation = Orientation.Horizontal;

        _designerPanel.Dock = DockStyle.Fill;
        _designerPanel.BackColor = Color.White;
    }

    private Control BuildTemplateList()
    {
        var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(4) };
        var title = new Label
        {
            Text = "Bu kiracı için FRX tasarımları",
            Dock = DockStyle.Top,
            Height = 24,
            Font = new Font(Font, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft
        };
        _templateList.Dock = DockStyle.Fill;
        _templateList.View = View.Details;
        _templateList.FullRowSelect = true;
        _templateList.GridLines = true;
        _templateList.Columns.Add("Ad", 220);
        _templateList.Columns.Add("Açıklama", 280);
        _templateList.Columns.Add("Kiracı", 100);
        _templateList.Columns.Add("Güncellendi", 160);
        _templateList.DoubleClick += (_, _) => OpenSelectedFromDatabase();
        panel.Controls.Add(_templateList);
        panel.Controls.Add(title);
        return panel;
    }

    private void InitializePostgRest()
    {
        if (string.IsNullOrWhiteSpace(_config.PostgRest.BaseUrl))
        {
            SetStatus("PostgREST Base URL ayarlanmamış. Lütfen TenantPanel üzerinden girin.");
            return;
        }
        _pg = new PostgRestRepository(_config.PostgRest);
        _repo = new TemplateRepository(_pg);
        _binding = new DataBindingService(_pg);
    }

    private void ApplyConfig()
    {
        _tenantPanel.Config = _config;
    }

    public async Task RefreshTemplatesAsync()
    {
        if (_repo is null)
        {
            SetStatus("PostgREST bağlı değil.");
            return;
        }
        try
        {
            var tenant = _tenantPanel.CurrentTenant;
            var list = await _repo.ListTemplatesAsync(tenant.FirmNr, tenant.PeriodNr);
            _templateList.Items.Clear();
            foreach (var item in list)
            {
                var lvi = new ListViewItem(item.Name);
                lvi.SubItems.Add(item.Description);
                lvi.SubItems.Add($"{item.FirmNr ?? "(sistem)"}/{item.PeriodNr ?? "-"}");
                lvi.SubItems.Add(item.UpdatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm"));
                lvi.Tag = item;
                _templateList.Items.Add(lvi);
            }
            SetStatus($"{list.Count} tasarım yüklendi ({tenant.FirmNr}/{tenant.PeriodNr}).");
        }
        catch (Exception ex)
        {
            DesignerLog.Error("Template listesi yükleme hatası", ex);
            SetStatus($"Şablonlar yüklenemedi: {ex.Message}");
        }
    }

    private void OnPreviewRequested(object? sender, DataTablePreviewRequest req)
    {
        _currentPreviewData = req.Data;
        var grid = _bottomSplit.Panel2.Controls.OfType<PreviewGridPanel>().FirstOrDefault();
        grid?.SetDataTable(_currentPreviewData);
        SetStatus($"Önizleme verisi hazır: {req.Data.Rows.Count} satır. 'Veriyi Bağla' ile FastReport'a bağlayabilirsiniz.");
    }

    private void RegisterPreviewData()
    {
        if (_fastReport is null || !_fastReport.IsAvailable)
        {
            SetStatus("FastReport yüklenmedi.");
            return;
        }
        if (_currentPreviewData is null)
        {
            SetStatus("Önce tablodan önizleme verisi çekin (çift tık veya Önizle).");
            return;
        }
        var tableName = string.IsNullOrWhiteSpace(_currentPreviewData.TableName)
            ? "Preview"
            : _currentPreviewData.TableName;
        _fastReport.RegisterDataTable(tableName, _currentPreviewData);
        SetStatus($"FastReport'a bağlandı: {tableName} ({_currentPreviewData.Rows.Count} satır).");
    }

    private void OpenLocalFrx()
    {
        using var dialog = new OpenFileDialog
        {
            Filter = "FastReport tasarımları (*.frx)|*.frx|Tüm dosyalar (*.*)|*.*",
            Title = "FastReport .frx Aç"
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        RunFastReportAction(() =>
        {
            _fastReport!.LoadFromFile(dialog.FileName);
            _currentTemplate = null;
            _currentTemplateName = Path.GetFileNameWithoutExtension(dialog.FileName);
            SetStatus($"{dialog.FileName} açıldı.");
        });
    }

    private void SaveLocalFrx()
    {
        using var dialog = new SaveFileDialog
        {
            Filter = "FastReport tasarımları (*.frx)|*.frx",
            Title = "FastReport .frx Kaydet",
            FileName = $"{SanitizeFileName(_currentTemplateName)}.frx"
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        RunFastReportAction(() =>
        {
            _fastReport!.SaveToFile(dialog.FileName);
            _currentTemplateName = Path.GetFileNameWithoutExtension(dialog.FileName);
            SetStatus($"{dialog.FileName} kaydedildi.");
        });
    }

    private async Task SaveToDatabaseAsync()
    {
        if (_fastReport is null || !_fastReport.IsAvailable)
        {
            SetStatus("FastReport yüklenmedi.");
            return;
        }
        if (_repo is null)
        {
            SetStatus("PostgREST bağlı değil. Tenant panelden bağlantıyı kurun.");
            return;
        }

        var name = PromptForName("Veritabanına Kaydet", "Şablon adı", _currentTemplateName);
        if (string.IsNullOrWhiteSpace(name)) return;

        try
        {
            UseWaitCursor = true;
            var bytes = _fastReport.SaveToBytes();
            var dataSources = new[] { "products", "sales", "rest_orders" }; // Gerçek bağlamalar DataBindingPanel'den
            var tenant = _tenantPanel.CurrentTenant;
            var id = await _repo.SaveTemplateAsync(_currentTemplate?.Id, tenant, name, bytes, dataSources);
            _currentTemplate = new DesignerTemplateRecord { Id = id, Name = name, FirmNr = tenant.FirmNr, PeriodNr = tenant.PeriodNr };
            _currentTemplateName = name;
            SetStatus($"PostgREST üzerinden kaydedildi: {name} (id={id}).");
            await RefreshTemplatesAsync();
        }
        catch (Exception ex)
        {
            DesignerLog.Error("Veritabanı kayıt hatası", ex);
            MessageBox.Show(this, ex.Message, "Kaydetme hatası", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus($"Kaydetme hatası: {ex.Message}");
        }
        finally
        {
            UseWaitCursor = false;
        }
    }

    private void OpenSelectedFromDatabase()
    {
        if (_repo is null || _fastReport is null) return;
        if (_templateList.SelectedItems.Count == 0)
        {
            SetStatus("Listeden bir tasarım seçin.");
            return;
        }
        if (_templateList.SelectedItems[0].Tag is not DesignerTemplateRecord rec) return;

        try
        {
            var bytes = _repo.DecodeFrx(rec);
            _fastReport.LoadFromBytes(bytes);
            _currentTemplate = rec;
            _currentTemplateName = rec.Name;
            SetStatus($"DB'den açıldı: {rec.Name} ({rec.FirmNr}/{rec.PeriodNr}).");
        }
        catch (Exception ex)
        {
            DesignerLog.Error("DB'den açma hatası", ex);
            MessageBox.Show(this, ex.Message, "Açma hatası", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus($"Açma hatası: {ex.Message}");
        }
    }

    private void RunFastReportAction(Action action)
    {
        try
        {
            if (_fastReport is null || !_fastReport.IsAvailable)
            {
                SetStatus("FastReport yüklenmedi (lib/FastReport.dll?).");
                return;
            }
            action();
        }
        catch (Exception ex)
        {
            DesignerLog.Error("FastReport hatası", ex);
            MessageBox.Show(this, ex.Message, "FastReport hatası", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus($"FastReport hatası: {ex.Message}");
        }
    }

    private static string SanitizeFileName(string value)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        var sanitized = new string(value.Select(ch => invalidChars.Contains(ch) ? '_' : ch).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(sanitized) ? "retailex-fastreport" : sanitized;
    }

    private string PromptForName(string title, string label, string initialValue)
    {
        using var dialog = new Form
        {
            Text = title,
            StartPosition = FormStartPosition.CenterParent,
            Width = 460,
            Height = 180,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MinimizeBox = false,
            MaximizeBox = false
        };
        var lbl = new Label { Text = label, Left = 16, Top = 16, Width = 420 };
        var box = new TextBox { Left = 16, Top = 48, Width = 420, Text = initialValue };
        var ok = new Button { Text = "Tamam", Left = 280, Top = 90, Width = 80, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "İptal", Left = 360, Top = 90, Width = 80, DialogResult = DialogResult.Cancel };
        dialog.AcceptButton = ok;
        dialog.CancelButton = cancel;
        dialog.Controls.Add(lbl); dialog.Controls.Add(box);
        dialog.Controls.Add(ok); dialog.Controls.Add(cancel);
        return dialog.ShowDialog(this) == DialogResult.OK ? box.Text.Trim() : string.Empty;
    }

    private void SetStatus(string message)
    {
        if (InvokeRequired) Invoke(() => _statusLabel.Text = message);
        else _statusLabel.Text = message;
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        try
        {
            _config.PostgRest.BaseUrl = _tenantPanel.Config.PostgRest.BaseUrl;
            _config.Save();
        }
        catch (Exception ex)
        {
            DesignerLog.Warn("Config kaydedilemedi", ex);
        }
        base.OnFormClosing(e);
    }
}

/// <summary>
/// Önizleme verisini tablo olarak gösteren basit panel.
/// </summary>
internal sealed class PreviewGridPanel : UserControl
{
    private readonly DataGridView _grid = new();

    public PreviewGridPanel()
    {
        Dock = DockStyle.Fill;
        _grid.Dock = DockStyle.Fill;
        _grid.ReadOnly = true;
        _grid.AllowUserToAddRows = false;
        _grid.AllowUserToDeleteRows = false;
        _grid.RowHeadersVisible = false;
        _grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        Controls.Add(_grid);
    }

    public void SetDataTable(System.Data.DataTable? dt)
    {
        _grid.DataSource = null;
        if (dt is null) return;
        _grid.DataSource = dt;
    }
}
