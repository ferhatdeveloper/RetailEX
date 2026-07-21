namespace RetailEX.FastReportDesigner;

internal sealed class MainForm : Form
{
    private readonly TextBox _hostTextBox = new();
    private readonly NumericUpDown _portInput = new();
    private readonly TextBox _databaseTextBox = new();
    private readonly TextBox _userTextBox = new();
    private readonly TextBox _passwordTextBox = new();
    private readonly TextBox _firmTextBox = new();
    private readonly TextBox _periodTextBox = new();
    private readonly Button _connectButton = new();
    private readonly TreeView _fieldTree = new();
    private readonly Panel _designerPanel = new();
    private readonly StatusStrip _statusStrip = new();
    private readonly ToolStripStatusLabel _statusLabel = new();
    private readonly ToolStripButton _newButton = new("Yeni");
    private readonly ToolStripButton _openButton = new("Aç (.frx)");
    private readonly ToolStripButton _saveButton = new("Kaydet (.frx lokal)");
    private readonly ToolStripButton _saveDbButton = new("Veritabanına Kaydet");
    private readonly ToolStripButton _openDbButton = new("Veritabanından Aç");
    private readonly ToolStripButton _previewButton = new("Önizleme");

    private AppConfig _config = AppConfig.Load();
    private DatabaseService? _database;
    private FastReportHost? _fastReport;
    private IReadOnlyList<DatabaseField> _loadedFields = [];
    private Guid? _currentTemplateId;
    private string _currentTemplateName = "Yeni FastReport Tasarımı";

    public MainForm()
    {
        InitializeComponent();
        ApplyConfigToInputs(_config);
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        _fastReport = new FastReportHost(_designerPanel);
        SetStatus(_fastReport.StatusMessage);
    }

    private void InitializeComponent()
    {
        Text = "RetailEX FastReport Tasarımcı";
        StartPosition = FormStartPosition.CenterScreen;
        Width = 1280;
        Height = 800;
        MinimumSize = new Size(1040, 680);
        Font = new Font("Segoe UI", 9F);

        var connectionPanel = BuildConnectionPanel();
        var toolStrip = BuildToolStrip();

        var splitContainer = new SplitContainer
        {
            Dock = DockStyle.Fill,
            SplitterDistance = 340,
            FixedPanel = FixedPanel.Panel1
        };

        splitContainer.Panel1.Controls.Add(BuildFieldPanel());
        splitContainer.Panel2.Controls.Add(_designerPanel);
        splitContainer.Panel2.Controls.Add(toolStrip);

        _designerPanel.Dock = DockStyle.Fill;
        _designerPanel.BackColor = Color.White;

        _statusStrip.Items.Add(_statusLabel);
        _statusStrip.Dock = DockStyle.Bottom;

        Controls.Add(splitContainer);
        Controls.Add(connectionPanel);
        Controls.Add(_statusStrip);
    }

    private Control BuildConnectionPanel()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 92,
            ColumnCount = 16,
            RowCount = 2,
            Padding = new Padding(10, 8, 10, 8),
            BackColor = Color.FromArgb(248, 250, 252)
        };

        for (var i = 0; i < 16; i++)
        {
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, i is 1 or 3 or 5 or 7 or 9 ? 10 : 5));
        }

        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));

        _portInput.Minimum = 1;
        _portInput.Maximum = 65535;
        _portInput.Value = 5432;
        _passwordTextBox.UseSystemPasswordChar = true;
        _connectButton.Text = "Bağlan";
        _connectButton.Dock = DockStyle.Fill;
        _connectButton.Click += async (_, _) => await ConnectAsync();

        AddLabeledInput(panel, "Host", _hostTextBox, 0, 0);
        AddLabeledInput(panel, "Port", _portInput, 2, 0);
        AddLabeledInput(panel, "Database", _databaseTextBox, 4, 0);
        AddLabeledInput(panel, "User", _userTextBox, 6, 0);
        AddLabeledInput(panel, "Password", _passwordTextBox, 8, 0);
        AddLabeledInput(panel, "FirmNr", _firmTextBox, 10, 0);
        AddLabeledInput(panel, "PeriodNr", _periodTextBox, 12, 0);
        panel.Controls.Add(_connectButton, 14, 0);
        panel.SetColumnSpan(_connectButton, 2);
        panel.SetRowSpan(_connectButton, 2);

        var hint = new Label
        {
            Text = "Env: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD. Opsiyonel designer.config.json gitignore kapsamındadır.",
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(71, 85, 105),
            TextAlign = ContentAlignment.MiddleLeft
        };
        panel.Controls.Add(hint, 0, 1);
        panel.SetColumnSpan(hint, 14);

        return panel;
    }

    private ToolStrip BuildToolStrip()
    {
        var toolStrip = new ToolStrip
        {
            Dock = DockStyle.Top,
            GripStyle = ToolStripGripStyle.Hidden,
            Padding = new Padding(6)
        };

        _newButton.Click += (_, _) => RunFastReportAction(() =>
        {
            _fastReport!.NewReport();
            _currentTemplateId = null;
            _currentTemplateName = "Yeni FastReport Tasarımı";
            SetStatus("Yeni FastReport tasarımı oluşturuldu.");
        });

        _openButton.Click += (_, _) => OpenLocalFrx();
        _saveButton.Click += (_, _) => SaveLocalFrx();
        _saveDbButton.Click += async (_, _) => await SaveToDatabaseAsync();
        _openDbButton.Click += async (_, _) => await OpenFromDatabaseAsync();
        _previewButton.Click += (_, _) => RunFastReportAction(() => _fastReport!.Preview());

        toolStrip.Items.AddRange([
            _newButton,
            new ToolStripSeparator(),
            _openButton,
            _saveButton,
            new ToolStripSeparator(),
            _saveDbButton,
            _openDbButton,
            new ToolStripSeparator(),
            _previewButton
        ]);

        return toolStrip;
    }

    private Control BuildFieldPanel()
    {
        var panel = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(8)
        };

        var title = new Label
        {
            Text = "DB alanları",
            Dock = DockStyle.Top,
            Height = 32,
            Font = new Font(Font, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft
        };

        var help = new Label
        {
            Text = "Çift tık: alan yolunu panoya kopyalar. Sürükle: designer içine metin olarak bırakır.",
            Dock = DockStyle.Bottom,
            Height = 46,
            ForeColor = Color.FromArgb(71, 85, 105)
        };

        _fieldTree.Dock = DockStyle.Fill;
        _fieldTree.HideSelection = false;
        _fieldTree.ShowNodeToolTips = true;
        _fieldTree.NodeMouseDoubleClick += (_, e) => CopyFieldPath(e.Node);
        _fieldTree.ItemDrag += (_, e) =>
        {
            if (e.Item is TreeNode { Tag: DatabaseField field })
            {
                _fieldTree.DoDragDrop(field.FieldPath, DragDropEffects.Copy);
            }
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("Alan yolunu kopyala", null, (_, _) => CopyFieldPath(_fieldTree.SelectedNode));
        _fieldTree.ContextMenuStrip = menu;

        panel.Controls.Add(_fieldTree);
        panel.Controls.Add(help);
        panel.Controls.Add(title);
        return panel;
    }

    private static void AddLabeledInput(TableLayoutPanel panel, string label, Control input, int column, int row)
    {
        var labelControl = new Label
        {
            Text = label,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleRight,
            Padding = new Padding(0, 0, 4, 0)
        };

        input.Dock = DockStyle.Fill;
        panel.Controls.Add(labelControl, column, row);
        panel.Controls.Add(input, column + 1, row);
    }

    private async Task ConnectAsync()
    {
        try
        {
            UseWaitCursor = true;
            _connectButton.Enabled = false;
            _config = ReadConfigFromInputs();
            _database = new DatabaseService(_config);
            await _database.TestConnectionAsync();
            _loadedFields = await _database.LoadFieldsAsync();
            PopulateFieldTree(_loadedFields);
            SetStatus($"Bağlandı. {_loadedFields.Count} alan yüklendi.");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Bağlantı hatası", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus($"Bağlantı hatası: {ex.Message}");
        }
        finally
        {
            _connectButton.Enabled = true;
            UseWaitCursor = false;
        }
    }

    private void OpenLocalFrx()
    {
        using var dialog = new OpenFileDialog
        {
            Filter = "FastReport tasarımları (*.frx)|*.frx|Tüm dosyalar (*.*)|*.*",
            Title = "FastReport .frx Aç"
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        RunFastReportAction(() =>
        {
            _fastReport!.LoadFromFile(dialog.FileName);
            _currentTemplateId = null;
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

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        RunFastReportAction(() =>
        {
            _fastReport!.SaveToFile(dialog.FileName);
            _currentTemplateName = Path.GetFileNameWithoutExtension(dialog.FileName);
            SetStatus($"{dialog.FileName} kaydedildi.");
        });
    }

    private async Task SaveToDatabaseAsync()
    {
        if (!EnsureDatabaseConnected() || !EnsureFastReportAvailable())
        {
            return;
        }

        try
        {
            var name = Dialogs.Prompt("Veritabanına Kaydet", "Şablon adı", _currentTemplateName);
            if (string.IsNullOrWhiteSpace(name))
            {
                return;
            }

            UseWaitCursor = true;
            var frxBytes = _fastReport!.SaveToBytes();
            var dataSources = _loadedFields.Select(x => x.DisplayTableName).Distinct(StringComparer.OrdinalIgnoreCase);
            _currentTemplateId = await _database!.SaveTemplateAsync(_currentTemplateId, name, frxBytes, dataSources);
            _currentTemplateName = name;
            SetStatus($"Veritabanına kaydedildi: {name}");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Kaydetme hatası", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus($"Kaydetme hatası: {ex.Message}");
        }
        finally
        {
            UseWaitCursor = false;
        }
    }

    private async Task OpenFromDatabaseAsync()
    {
        if (!EnsureDatabaseConnected() || !EnsureFastReportAvailable())
        {
            return;
        }

        try
        {
            UseWaitCursor = true;
            var templates = await _database!.LoadTemplateListAsync();
            UseWaitCursor = false;

            if (templates.Count == 0)
            {
                MessageBox.Show(this, "Bu firma için kayıtlı FastReport .frx tasarımı yok.", "Veritabanından Aç", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var selected = Dialogs.SelectTemplate(templates);
            if (selected is null)
            {
                return;
            }

            UseWaitCursor = true;
            var content = await _database.LoadTemplateContentAsync(selected.Id);
            _fastReport!.LoadFromBytes(content);
            _currentTemplateId = selected.Id;
            _currentTemplateName = selected.Name;
            SetStatus($"Veritabanından açıldı: {selected.Name}");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Açma hatası", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus($"Açma hatası: {ex.Message}");
        }
        finally
        {
            UseWaitCursor = false;
        }
    }

    private bool EnsureDatabaseConnected()
    {
        if (_database is not null)
        {
            return true;
        }

        MessageBox.Show(this, "Önce PostgreSQL bağlantısı kurun.", "Bağlantı gerekli", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return false;
    }

    private bool EnsureFastReportAvailable()
    {
        if (_fastReport is { IsAvailable: true })
        {
            return true;
        }

        MessageBox.Show(this, "FastReport DLL'lerini lib/ klasörüne koyun.", "FastReport yok", MessageBoxButtons.OK, MessageBoxIcon.Information);
        return false;
    }

    private void RunFastReportAction(Action action)
    {
        try
        {
            if (!EnsureFastReportAvailable())
            {
                return;
            }

            action();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "FastReport hatası", MessageBoxButtons.OK, MessageBoxIcon.Error);
            SetStatus($"FastReport hatası: {ex.Message}");
        }
    }

    private void PopulateFieldTree(IReadOnlyList<DatabaseField> fields)
    {
        _fieldTree.BeginUpdate();
        _fieldTree.Nodes.Clear();

        foreach (var group in fields.GroupBy(x => x.DisplayTableName).OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase))
        {
            var tableNode = new TreeNode($"{group.Key} ({group.First().QualifiedTableName})")
            {
                Tag = group.Key,
                ToolTipText = group.First().QualifiedTableName
            };

            foreach (var field in group.OrderBy(x => x.OrdinalPosition))
            {
                tableNode.Nodes.Add(new TreeNode($"{field.ColumnName}  [{field.DataType}]")
                {
                    Tag = field,
                    ToolTipText = field.FieldPath
                });
            }

            _fieldTree.Nodes.Add(tableNode);
        }

        _fieldTree.ExpandAll();
        _fieldTree.EndUpdate();
    }

    private static void CopyFieldPath(TreeNode? node)
    {
        if (node?.Tag is not DatabaseField field)
        {
            return;
        }

        Clipboard.SetText(field.FieldPath);
    }

    private AppConfig ReadConfigFromInputs()
    {
        var config = new AppConfig
        {
            Host = _hostTextBox.Text,
            Port = (int)_portInput.Value,
            Database = _databaseTextBox.Text,
            User = _userTextBox.Text,
            Password = _passwordTextBox.Text,
            FirmNr = _firmTextBox.Text,
            PeriodNr = _periodTextBox.Text
        };
        config.Normalize();
        ApplyConfigToInputs(config);
        return config;
    }

    private void ApplyConfigToInputs(AppConfig config)
    {
        _hostTextBox.Text = config.Host;
        _portInput.Value = Math.Min(Math.Max(config.Port, (int)_portInput.Minimum), (int)_portInput.Maximum);
        _databaseTextBox.Text = config.Database;
        _userTextBox.Text = config.User;
        _passwordTextBox.Text = config.Password;
        _firmTextBox.Text = config.FirmNr;
        _periodTextBox.Text = config.PeriodNr;
    }

    private void SetStatus(string message)
    {
        _statusLabel.Text = message;
    }

    private static string SanitizeFileName(string value)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        var sanitized = new string(value.Select(ch => invalidChars.Contains(ch) ? '_' : ch).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(sanitized) ? "retailex-fastreport" : sanitized;
    }
}
