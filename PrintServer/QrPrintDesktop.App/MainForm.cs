using System.Diagnostics;
using QrPrintDesktop.App.UI;
using QrPrintDesktop.Core.Assets;
using QrPrintDesktop.Core.Config;
using QrPrintDesktop.Core.Engine;
using QrPrintDesktop.Core.Http;
using QrPrintDesktop.Core.Orders;
using QrPrintDesktop.Core.Printing;
using QrPrintDesktop.Core.Windows;

namespace QrPrintDesktop.App;

public partial class MainForm : Form
{
    private PrintAgentEngine? _engine;
    private SettingsService? _settingsService;
    private StartupManager? _startupManager;
    private AssetBootstrapper? _assets;
    private readonly FastReportDesignService _designer = new();
    private bool _exitRequested;
    private bool _busy;
    private IList<FirmDto> _firms = [];
    private IList<PeriodDto> _periods = [];
    private IList<StoreDto> _stores = [];

    private bool _suppressPrinterPersist;
    private bool _suppressLanguagePersist;
    private SplitContainer? _splitOrders;
    private DataGridView? _gridCompleted;
    private DataGridView? _activeOrderGrid;

    /// <summary>Visual Studio WinForms Designer bu kurucuyu kullanır.</summary>
    public MainForm()
    {
        InitializeComponent();
        ApplyTheme();
    }

    public MainForm(PrintAgentEngine engine, SettingsService settingsService, StartupManager startupManager, AssetBootstrapper assets)
        : this()
    {
        _engine = engine;
        _settingsService = settingsService;
        _startupManager = startupManager;
        _assets = assets;
        StartRuntime();
    }

    private void ApplyTheme()
    {
        UiTheme.ApplyForm(this);
        UiTheme.StylePanel(headerPanel, card: false);
        UiTheme.StylePanel(panelDashboard, card: false);
        UiTheme.StylePanel(panelOrders, card: false);
        UiTheme.StylePanel(panelPrinters, card: false);
        UiTheme.StylePanel(panelSettings, card: false);
        UiTheme.StylePanel(panelTemplates, card: false);
        UiTheme.StylePanel(panelLog, card: false);
        UiTheme.StylePanel(panelOrdersToolbar, card: false);
        UiTheme.StylePanel(panelOrdersFilter, card: false);
        UiTheme.StylePanel(panelLogToolbar, card: false);
        UiTheme.StylePanel(cardApi);
        UiTheme.StylePanel(cardPending);
        UiTheme.StylePanel(cardPrinter);
        UiTheme.StylePanel(cardService);
        UiTheme.StyleTabControl(mainTabs);
        foreach (TabPage page in mainTabs.TabPages)
        {
            page.BackColor = UiTheme.Background;
            page.ForeColor = UiTheme.Text;
        }

        lblTitle.ForeColor = UiTheme.Text;
        lblSubtitle.ForeColor = UiTheme.Muted;
        statusBadge.BackColor = UiTheme.Panel;
        statusBadge.ForeColor = UiTheme.Success;
        lblKpiApiTitle.ForeColor = UiTheme.Muted;
        lblKpiPendingTitle.ForeColor = UiTheme.Muted;
        lblKpiPrinterTitle.ForeColor = UiTheme.Muted;
        lblKpiServiceTitle.ForeColor = UiTheme.Muted;
        lblKpiApiValue.ForeColor = UiTheme.Text;
        lblKpiPendingValue.ForeColor = UiTheme.Text;
        lblKpiPrinterValue.ForeColor = UiTheme.Text;
        lblKpiServiceValue.ForeColor = UiTheme.Text;
        lblLastPoll.ForeColor = UiTheme.Text;
        lblHint.ForeColor = UiTheme.Muted;
        lblPrinterHint.ForeColor = UiTheme.Muted;
        lblTemplateHint.ForeColor = UiTheme.Muted;
        statusStrip.BackColor = UiTheme.Panel;
        statusLabel.ForeColor = UiTheme.Muted;
        txtLog.BackColor = UiTheme.InputBg;
        txtLog.ForeColor = UiTheme.Text;
        txtLog.BorderStyle = BorderStyle.FixedSingle;

        UiTheme.StylePrimaryButton(btnPoll);
        UiTheme.StyleSecondaryButton(btnTestApi);
        UiTheme.StylePrimaryButton(btnInstallService);
        UiTheme.StyleSecondaryButton(btnUninstallService);
        UiTheme.StylePrimaryButton(btnKitchen);
        UiTheme.StyleSecondaryButton(btnAccount);
        UiTheme.StyleSecondaryButton(btnPreview);
        UiTheme.StyleSecondaryButton(btnDesignOrder);
        UiTheme.StyleSecondaryButton(btnComplete);
        UiTheme.StyleSecondaryButton(btnDemo);
        UiTheme.StylePrimaryButton(btnPrintPending);
        UiTheme.StyleComboBox(cmbOrderStatus);
        UiTheme.StyleComboBox(cmbOrderSource);
        UiTheme.StyleTextBox(txtOrderSearch);
        UiTheme.StyleDatePicker(dtpOrderDate);
        UiTheme.StyleSecondaryButton(btnRefreshPrinters);
        UiTheme.StylePrimaryButton(btnTestPrinter);
        UiTheme.StyleSecondaryButton(btnAddRoute);
        UiTheme.StyleDangerButton(btnRemoveRoute);
        UiTheme.StyleSecondaryButton(btnLoadCategories);
        UiTheme.StylePrimaryButton(btnSaveRoutes);
        UiTheme.StyleSecondaryButton(btnRefreshCatalog);
        UiTheme.StylePrimaryButton(btnSaveSettings);
        UiTheme.StylePrimaryButton(btnDesignKitchen);
        UiTheme.StyleSecondaryButton(btnDesignAccount);
        UiTheme.StyleSecondaryButton(btnDesignWaiter);
        UiTheme.StyleSecondaryButton(btnDesignFeedback);
        UiTheme.StyleSecondaryButton(btnClearLog);
        UiTheme.StyleTextBox(txtApiBase);
        UiTheme.StyleTextBox(txtTenant);
        UiTheme.StyleTextBox(txtTenantPrinters);
        UiTheme.StyleTextBox(txtToken);
        UiTheme.StyleComboBox(cmbAuth);
        UiTheme.StyleComboBox(cmbFirm);
        UiTheme.StyleComboBox(cmbPeriod);
        UiTheme.StyleComboBox(cmbStore);
        UiTheme.StyleComboBox(cmbDefaultKitchen);
        UiTheme.StyleComboBox(cmbDefaultAccount);
        UiTheme.StyleCheckBox(chkUseSharedKitchen);
        UiTheme.StyleComboBox(cmbReceiptLanguage);
        UiTheme.StyleComboBox(cmbAccountReceiptLanguage);
        UiTheme.StyleComboBox(cmbSettingsKitchenLanguage);
        UiTheme.StyleComboBox(cmbSettingsAccountLanguage);
        UiTheme.StyleNumeric(numPoll);
        UiTheme.StyleCheckBox(chkOrders);
        UiTheme.StyleCheckBox(chkAcceptQrOrders);
        UiTheme.StyleCheckBox(chkAutoPrint);
        UiTheme.StyleCheckBox(chkMarkCooking);
        UiTheme.StyleCheckBox(chkUiPoll);
        UiTheme.StyleCheckBox(chkAutoStart);
        UiTheme.StyleGrid(gridOrders);
        BuildOrderSplitUi();
        if (_gridCompleted is not null)
        {
            UiTheme.StyleGrid(_gridCompleted);
            _gridCompleted.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        }
        UiTheme.StyleGrid(gridPrinters);
        UiTheme.StyleGrid(gridRoutes);
        gridOrders.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        if (gridOrders.Columns["colPrint"] is DataGridViewColumn printCol)
        {
            printCol.AutoSizeMode = DataGridViewAutoSizeColumnMode.None;
            printCol.Width = 92;
        }

        if (gridOrders.Columns["colPreview"] is DataGridViewColumn previewCol)
        {
            previewCol.AutoSizeMode = DataGridViewAutoSizeColumnMode.None;
            previewCol.Width = 88;
        }

        if (_gridCompleted?.Columns["colPreview"] is DataGridViewColumn donePreview)
        {
            donePreview.AutoSizeMode = DataGridViewAutoSizeColumnMode.None;
            donePreview.Width = 88;
        }
        gridPrinters.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        gridRoutes.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        gridRoutes.AllowUserToAddRows = true;
        gridRoutes.AllowUserToDeleteRows = true;
        gridRoutes.DataError -= GridRoutesOnDataError;
        gridRoutes.DataError += GridRoutesOnDataError;
        gridRoutes.CurrentCellDirtyStateChanged -= GridRoutesOnDirty;
        gridRoutes.CurrentCellDirtyStateChanged += GridRoutesOnDirty;
        foreach (var label in new[]
                 {
                     lblApiBase, lblTenant, lblAuth, lblToken, lblFirm, lblPeriod, lblStore, lblPoll,
                     lblInstalledPrinters, lblDefaultAccount, lblRoutes, lblTenantPrinters, lblReceiptLanguage,
                     lblAccountReceiptLanguage, lblSettingsKitchenLanguage, lblSettingsAccountLanguage,
                     lblOrderDate, lblOrderStatus, lblOrderSource, lblOrderFilterCount
                 })
        {
            label.ForeColor = UiTheme.Muted;
        }

        ResetOrderFiltersToToday();
        LayoutDashboardCards();
    }

    private void StartRuntime()
    {
        if (_engine is null || _assets is null)
        {
            return;
        }

        try
        {
            notifyIcon1.Icon = LoadAppIcon();
            Icon = notifyIcon1.Icon;
        }
        catch
        {
            notifyIcon1.Icon = SystemIcons.Application;
        }

        notifyIcon1.ContextMenuStrip = BuildTrayMenu();
        panelDashboard.Resize += (_, _) => LayoutDashboardCards();
        LoadSettingsToUi(_engine.Settings);
        HookPrinterPersistence();
        HookLanguagePersistence();
        pollTimer.Interval = Math.Max(2, _engine.Settings.PollIntervalSeconds) * 1000;
        pollTimer.Start();
        clockTimer.Start();
        AgentLog.Message += OnLog;
        _engine.InboxChanged += () =>
        {
            if (IsHandleCreated)
            {
                BeginInvoke(new Action(RefreshOrdersGrid));
            }
        };
        RefreshDashboard();
        RefreshOrdersGrid();
        AgentLog.Write("Arayüz hazır. RetailEX restoran siparişleri dinleniyor.");
    }

    private void ResetOrderFiltersToToday()
    {
        dtpOrderDate.Value = DateTime.Today;
        dtpOrderDate.Checked = true;
        if (cmbOrderSource.Items.Count > 0)
        {
            cmbOrderSource.SelectedIndex = 0;
        }

        txtOrderSearch.Clear();
    }

    private void OrderFilterChanged(object? sender, EventArgs e)
    {
        RefreshOrdersGrid();
    }

    private void BuildOrderSplitUi()
    {
        if (_splitOrders is not null)
        {
            return;
        }

        panelOrders.Controls.Remove(gridOrders);

        var pendingHost = new Panel { Dock = DockStyle.Fill };
        var completedHost = new Panel { Dock = DockStyle.Fill };
        var lblPending = new Label
        {
            Dock = DockStyle.Top,
            Height = 28,
            Text = "Bekleyen",
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI Semibold", 10F, FontStyle.Bold),
            ForeColor = UiTheme.Warning,
            Padding = new Padding(4, 0, 0, 0)
        };
        var lblCompleted = new Label
        {
            Dock = DockStyle.Top,
            Height = 28,
            Text = "Tamamlanan",
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI Semibold", 10F, FontStyle.Bold),
            ForeColor = UiTheme.Success,
            Padding = new Padding(4, 0, 0, 0)
        };

        colStatus.Visible = false;
        if (gridOrders.Columns["colPreview"] is null)
        {
            gridOrders.Columns.Add(CreateActionButton("colPreview", "Önizle", UiTheme.Border));
        }

        if (gridOrders.Columns["colPrint"] is null)
        {
            gridOrders.Columns.Add(CreateActionButton("colPrint", "Yazdır", UiTheme.Accent));
        }

        gridOrders.CellContentClick -= GridPendingOnActionClick;
        gridOrders.CellContentClick += GridPendingOnActionClick;
        gridOrders.CellDoubleClick -= GridPendingOnDoubleClick;
        gridOrders.CellDoubleClick += GridPendingOnDoubleClick;
        gridOrders.CellClick -= GridPendingOnRowClick;
        gridOrders.CellClick += GridPendingOnRowClick;
        _activeOrderGrid = gridOrders;

        pendingHost.Controls.Add(gridOrders);
        pendingHost.Controls.Add(lblPending);
        UiTheme.StylePanel(pendingHost, card: false);

        _gridCompleted = new DataGridView
        {
            Name = "gridCompleted",
            Dock = DockStyle.Fill,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            RowHeadersVisible = false,
            MultiSelect = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill
        };
        _gridCompleted.Columns.AddRange(
            new DataGridViewTextBoxColumn { Name = "colId", HeaderText = "Id", Visible = false },
            new DataGridViewTextBoxColumn { Name = "colNo", HeaderText = "Sipariş", FillWeight = 90 },
            new DataGridViewTextBoxColumn { Name = "colTable", HeaderText = "Masa", FillWeight = 50 },
            new DataGridViewTextBoxColumn { Name = "colWaiter", HeaderText = "Garson", FillWeight = 80 },
            new DataGridViewTextBoxColumn { Name = "colTotal", HeaderText = "Tutar", FillWeight = 60 },
            new DataGridViewTextBoxColumn { Name = "colSource", HeaderText = "Kaynak", FillWeight = 70 },
            new DataGridViewTextBoxColumn { Name = "colTime", HeaderText = "Zaman", FillWeight = 90 },
            CreateActionButton("colPreview", "Önizle", UiTheme.Border));
        _gridCompleted.CellClick += (_, _) => _activeOrderGrid = _gridCompleted;
        _gridCompleted.CellContentClick += GridCompletedOnActionClick;
        _gridCompleted.CellDoubleClick += GridCompletedOnDoubleClick;

        completedHost.Controls.Add(_gridCompleted);
        completedHost.Controls.Add(lblCompleted);
        UiTheme.StylePanel(completedHost, card: false);

        _splitOrders = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Horizontal,
            SplitterWidth = 8,
            BackColor = UiTheme.Background,
            Panel1MinSize = 120,
            Panel2MinSize = 120
        };
        _splitOrders.Panel1.Controls.Add(pendingHost);
        _splitOrders.Panel2.Controls.Add(completedHost);
        panelOrders.Controls.Add(_splitOrders);
        panelOrders.Controls.SetChildIndex(_splitOrders, 0);
        try
        {
            _splitOrders.SplitterDistance = 250;
        }
        catch
        {
            // handle henüz yoksa varsayılan oran kullanılır
        }
    }

    private static DataGridViewButtonColumn CreateActionButton(string name, string text, Color back)
    {
        var col = new DataGridViewButtonColumn
        {
            Name = name,
            HeaderText = "",
            Text = text,
            UseColumnTextForButtonValue = true,
            Width = 88,
            AutoSizeMode = DataGridViewAutoSizeColumnMode.None,
            FlatStyle = FlatStyle.Flat
        };
        col.DefaultCellStyle.BackColor = back;
        col.DefaultCellStyle.ForeColor = Color.White;
        col.DefaultCellStyle.SelectionBackColor = back;
        col.DefaultCellStyle.SelectionForeColor = Color.White;
        col.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
        return col;
    }

    private async void GridPendingOnActionClick(object? sender, DataGridViewCellEventArgs e)
    {
        if (e.RowIndex < 0 || _engine is null)
        {
            return;
        }

        var column = gridOrders.Columns[e.ColumnIndex].Name;
        var id = Convert.ToString(gridOrders.Rows[e.RowIndex].Cells["colId"].Value);
        if (string.IsNullOrWhiteSpace(id))
        {
            return;
        }

        if (column == "colPreview")
        {
            ShowOrderPreview(id);
            return;
        }

        if (column != "colPrint")
        {
            return;
        }

        await RunBusyAsync(async () => await PrintPendingOrderAsync(id));
    }

    private void GridPendingOnDoubleClick(object? sender, DataGridViewCellEventArgs e)
    {
        if (e.RowIndex < 0)
        {
            return;
        }

        ShowOrderPreview(Convert.ToString(gridOrders.Rows[e.RowIndex].Cells["colId"].Value));
    }

    private void GridCompletedOnActionClick(object? sender, DataGridViewCellEventArgs e)
    {
        if (_gridCompleted is null || e.RowIndex < 0)
        {
            return;
        }

        if (_gridCompleted.Columns[e.ColumnIndex].Name != "colPreview")
        {
            return;
        }

        ShowOrderPreview(Convert.ToString(_gridCompleted.Rows[e.RowIndex].Cells["colId"].Value));
    }

    private void GridCompletedOnDoubleClick(object? sender, DataGridViewCellEventArgs e)
    {
        if (_gridCompleted is null || e.RowIndex < 0)
        {
            return;
        }

        ShowOrderPreview(Convert.ToString(_gridCompleted.Rows[e.RowIndex].Cells["colId"].Value));
    }

    private void ShowOrderPreview(string? orderId)
    {
        if (_engine is null || string.IsNullOrWhiteSpace(orderId))
        {
            return;
        }

        if (!_engine.PreviewOrder(orderId))
        {
            MessageBox.Show("Fiş önizlemesi açılamadı.", "Önizleme", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void btnPreview_Click(object? sender, EventArgs e)
    {
        var grid = _activeOrderGrid ?? gridOrders;
        if (grid.CurrentRow is null)
        {
            MessageBox.Show("Önizlemek için bir sipariş seçin.", "Önizleme", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ShowOrderPreview(Convert.ToString(grid.CurrentRow.Cells["colId"].Value));
    }

    private void GridPendingOnRowClick(object? sender, DataGridViewCellEventArgs e)
    {
        _activeOrderGrid = gridOrders;
    }

    private List<string> CollectPendingOrderIds()
    {
        var ids = new List<string>();
        foreach (DataGridViewRow row in gridOrders.Rows)
        {
            var id = Convert.ToString(row.Cells["colId"].Value);
            if (!string.IsNullOrWhiteSpace(id))
            {
                ids.Add(id);
            }
        }

        return ids;
    }

    private async Task<bool> PrintPendingOrderAsync(string orderId)
    {
        if (_engine is null || !_engine.Inbox.TryGet(orderId, out var order) || order is null)
        {
            return false;
        }

        if (string.Equals(order.Source, OrderSource.Account, StringComparison.OrdinalIgnoreCase))
        {
            var printed = _engine.ReprintAccount(orderId);
            if (printed)
            {
                await _engine.CompleteOnlyAsync(orderId).ConfigureAwait(true);
            }

            return printed;
        }

        return await _engine.PrintKitchenAndCompleteAsync(orderId).ConfigureAwait(true);
    }

    private void LayoutDashboardCards()
    {
        if (panelDashboard is null || cardApi is null)
        {
            return;
        }

        var gap = 12;
        var width = Math.Max(180, (panelDashboard.ClientSize.Width - (gap * 3)) / 4);
        cardApi.SetBounds(0, 0, width, 108);
        cardPending.SetBounds(width + gap, 0, width, 108);
        cardPrinter.SetBounds((width + gap) * 2, 0, width, 108);
        cardService.SetBounds((width + gap) * 3, 0, width, 108);
    }

    private void headerPanel_Resize(object? sender, EventArgs e)
    {
        statusBadge.Location = new Point(headerPanel.Width - statusBadge.Width - 28, 26);
        LayoutDashboardCards();
    }

    private async void btnPoll_Click(object? sender, EventArgs e)
    {
        if (_engine is null) return;
        await RunBusyAsync(async () =>
        {
            var result = await _engine.PollAsync(force: true);
            SetStatus(result.Message);
        });
    }

    private async void btnTestApi_Click(object? sender, EventArgs e)
    {
        if (_engine is null) return;
        await RunBusyAsync(async () =>
        {
            SaveSettingsFromUi();
            var health = await _engine.HealthCheckAsync();
            SetBadge(health.Success ? "Bağlı" : "Hata", health.Success);
            SetStatus(health.Message);
            MessageBox.Show(health.Message, "RetailEX API", MessageBoxButtons.OK,
                health.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        });
    }

    private void btnInstallService_Click(object? sender, EventArgs e) => InstallService();

    private void btnUninstallService_Click(object? sender, EventArgs e) => UninstallService();

    private async void btnKitchen_Click(object? sender, EventArgs e)
    {
        if (_engine is null) return;
        await WithSelectedOrder(async id => await _engine.PrintKitchenAndCompleteAsync(id));
    }

    private async void btnAccount_Click(object? sender, EventArgs e)
    {
        if (_engine is null) return;
        await WithSelectedOrder(id =>
        {
            _engine.ReprintAccount(id);
            return Task.CompletedTask;
        });
    }

    private async void btnComplete_Click(object? sender, EventArgs e)
    {
        if (_engine is null) return;
        await WithSelectedOrder(async id => await _engine.CompleteOnlyAsync(id));
    }

    private void btnDemo_Click(object? sender, EventArgs e)
    {
        _engine?.AddDemoOrder();
        Balloon("Yeni sipariş", "Demo mutfak siparişi eklendi.");
    }

    private async void btnPrintPending_Click(object? sender, EventArgs e)
    {
        if (_engine is null)
        {
            return;
        }

        var ids = CollectPendingOrderIds();
        if (ids.Count == 0)
        {
            MessageBox.Show("Yazdırılacak bekleyen sipariş yok.", "Siparişler", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        await RunBusyAsync(async () =>
        {
            var printed = 0;
            foreach (var id in ids)
            {
                if (await PrintPendingOrderAsync(id).ConfigureAwait(true))
                {
                    printed++;
                }
            }

            SetStatus($"{printed} bekleyen sipariş yazdırıldı.");
        });
    }

    private async void btnRefreshCatalog_Click(object? sender, EventArgs e)
    {
        await RunBusyAsync(LoadCatalogAsync);
    }

    private void btnSaveSettings_Click(object? sender, EventArgs e)
    {
        if (_settingsService is null) return;
        SaveSettingsFromUi();
        SetStatus("Ayarlar kaydedildi: " + _settingsService.SettingsPath);
        MessageBox.Show("Ayarlar kaydedildi.", "QR Print", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void btnDesignKitchen_Click(object? sender, EventArgs e)
    {
        var language = ReadLanguageCombo(cmbReceiptLanguage);
        OpenTemplate(
            ReportTemplates.KitchenReceiptPath(language),
            ReceiptCopy.ComposeKitchenTitle(null, language),
            language);
    }

    private void btnDesignAccount_Click(object? sender, EventArgs e)
    {
        var language = ReadLanguageCombo(cmbAccountReceiptLanguage);
        OpenTemplate(
            ReportTemplates.AccountReceiptPath(language),
            ReceiptCopy.Account(language).Banner,
            language);
    }

    private void btnDesignWaiter_Click(object? sender, EventArgs e) =>
        OpenTemplate(ReportTemplates.WaiterCallReceiptPath, "GARSON ÇAĞRI", "tr");

    private void btnDesignFeedback_Click(object? sender, EventArgs e) =>
        OpenTemplate(ReportTemplates.FeedbackReceiptPath, "GERİ BİLDİRİM", "tr");

    private void btnDesignOrder_Click(object? sender, EventArgs e)
    {
        if (_engine is null)
        {
            return;
        }

        var grid = _activeOrderGrid ?? gridOrders;
        if (grid.CurrentRow is null)
        {
            MessageBox.Show("Tasarlamak için bir sipariş seçin.", "Tasarla", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var id = Convert.ToString(grid.CurrentRow.Cells["colId"].Value);
        if (string.IsNullOrWhiteSpace(id) || !_engine.Inbox.TryGet(id, out var order) || order is null)
        {
            MessageBox.Show("Seçili sipariş bulunamadı.", "Tasarla", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var account = string.Equals(order.Source, OrderSource.Account, StringComparison.OrdinalIgnoreCase);
        var language = account ? _engine.Settings.AccountReceiptLanguage : _engine.Settings.KitchenReceiptLanguage;
        var path = account
            ? ReportTemplates.AccountReceiptPath(language)
            : ReportTemplates.KitchenReceiptPath(language);
        var heading = account
            ? ReceiptCopy.Account(language).Banner
            : ReceiptCopy.ComposeKitchenTitle(null, language);
        OpenTemplate(path, heading, language, order);
    }

    private void btnClearLog_Click(object? sender, EventArgs e) => txtLog.Clear();

    private void btnRefreshPrinters_Click(object? sender, EventArgs e) => BindPrintersUi(reloadRoutes: false);

    private void btnTestPrinter_Click(object? sender, EventArgs e)
    {
        if (_engine is null)
        {
            return;
        }

        var printer = GetSelectedInstalledPrinter();
        if (string.IsNullOrWhiteSpace(printer))
        {
            MessageBox.Show("Listeden bir yazıcı seçin.", "Yazıcı", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (_engine.PrintTestPage(printer))
        {
            SetStatus("Test sayfası gönderildi: " + printer);
        }
        else
        {
            MessageBox.Show("Test yazdırılamadı: " + printer, "Yazıcı", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void btnAddRoute_Click(object? sender, EventArgs e)
    {
        EnsureRoutePrinterItems();
        AddRouteRow("Yeni kategori", RouteDefaultPrinter(), alsoShared: false, enabled: true);
        PersistPrinterRouting();
    }

    private void btnRemoveRoute_Click(object? sender, EventArgs e)
    {
        if (gridRoutes.CurrentRow is null || gridRoutes.CurrentRow.IsNewRow)
        {
            return;
        }

        gridRoutes.Rows.Remove(gridRoutes.CurrentRow);
        PersistPrinterRouting();
    }

    private async void btnLoadCategories_Click(object? sender, EventArgs e)
    {
        if (_engine is null)
        {
            return;
        }

        var engine = _engine;
        await RunBusyAsync(async () =>
        {
            var tenant = txtTenantPrinters.Text.Trim();
            if (string.IsNullOrWhiteSpace(tenant))
            {
                tenant = txtTenant.Text.Trim();
            }

            if (string.IsNullOrWhiteSpace(tenant))
            {
                MessageBox.Show(
                    "Önce kiracı kodunu girin (ör. lovan). RetailEX adresiniz https://api.retailex.app/{kiracı} şeklindedir.",
                    "Kiracı kodu",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                txtTenantPrinters.Focus();
                return;
            }

            SetTenantText(txtTenantPrinters, tenant);
            SetTenantText(txtTenant, tenant);
            SaveSettingsFromUi();
            var categories = (await engine.Catalog.FetchCategoriesAsync(engine.Settings)).ToList();
            if (categories.Count == 0)
            {
                MessageBox.Show(
                    "Bu kiracı / firma için kategori bulunamadı. Ayarlar sekmesinde firma numarasını kontrol edin.",
                    "Kategoriler",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            var restaurant = categories.Where(c => c.IsRestaurant).ToList();
            if (restaurant.Count == 0)
            {
                restaurant = categories;
            }

            EnsureRoutePrinterItems();
            var existing = PrinterRouter.MergeListedCategories(
                restaurant.Select(c => c.Name),
                ReadRoutesFromGrid().Concat(engine.Settings.PrinterRoutes ?? []));
            LoadRoutesGrid(existing);
            PersistPrinterRouting();
            SetStatus($"{restaurant.Count} kategori listelendi. Yazıcı seçimleri kaydedilir.");
        });
    }

    private void btnSaveRoutes_Click(object? sender, EventArgs e) => btnSaveSettings_Click(sender, e);

    private void txtTenantPrinters_TextChanged(object? sender, EventArgs e) => SetTenantText(txtTenant, txtTenantPrinters.Text);

    private void txtTenant_TextChanged(object? sender, EventArgs e) => SetTenantText(txtTenantPrinters, txtTenant.Text);

    private void SetTenantText(TextBox target, string value)
    {
        if (target.Text == value)
        {
            return;
        }

        target.Text = value;
    }

    private void HookPrinterPersistence()
    {
        cmbDefaultKitchen.SelectedIndexChanged -= PrinterSettingChanged;
        cmbDefaultAccount.SelectedIndexChanged -= PrinterSettingChanged;
        chkUseSharedKitchen.CheckedChanged -= UseSharedKitchenChanged;
        cmbDefaultKitchen.SelectedIndexChanged += PrinterSettingChanged;
        cmbDefaultAccount.SelectedIndexChanged += PrinterSettingChanged;
        chkUseSharedKitchen.CheckedChanged += UseSharedKitchenChanged;
        gridRoutes.CellValueChanged -= GridRoutesOnCellValueChanged;
        gridRoutes.CellValueChanged += GridRoutesOnCellValueChanged;
        gridRoutes.UserDeletedRow -= GridRoutesOnUserDeletedRow;
        gridRoutes.UserDeletedRow += GridRoutesOnUserDeletedRow;
    }

    private void GridRoutesOnDirty(object? sender, EventArgs e)
    {
        if (gridRoutes.IsCurrentCellDirty)
        {
            gridRoutes.CommitEdit(DataGridViewDataErrorContexts.Commit);
        }
    }

    private void GridRoutesOnCellValueChanged(object? sender, DataGridViewCellEventArgs e)
    {
        if (e.RowIndex < 0)
        {
            return;
        }

        PersistPrinterRouting();
    }

    private void GridRoutesOnUserDeletedRow(object? sender, DataGridViewRowEventArgs e) => PersistPrinterRouting();

    private void PrinterSettingChanged(object? sender, EventArgs e) => PersistPrinterRouting();

    private void UseSharedKitchenChanged(object? sender, EventArgs e)
    {
        UpdateSharedPrinterUi();
        PersistPrinterRouting();
    }

    private bool UseSharedKitchen => chkUseSharedKitchen.Checked;

    private string RouteDefaultPrinter() =>
        UseSharedKitchen ? SharedPrinterLabel : UnassignedPrinterLabel;

    private void CommitRouteGrid()
    {
        if (gridRoutes.IsCurrentCellInEditMode)
        {
            gridRoutes.EndEdit();
        }

        gridRoutes.CommitEdit(DataGridViewDataErrorContexts.Commit);
        if (gridRoutes.EditingControl is ComboBox combo)
        {
            combo.SelectionLength = 0;
        }
    }

    private void PersistPrinterRouting()
    {
        if (_suppressPrinterPersist || _engine is null)
        {
            return;
        }

        CommitRouteGrid();
        ApplyPrinterSettingsFromUi(_engine.Settings);
        _engine.SaveSettings(_engine.Settings);
    }

    private static void GridRoutesOnDataError(object? sender, DataGridViewDataErrorEventArgs e)
    {
        e.ThrowException = false;
    }

    private const string WindowsDefaultPrinterLabel = "(Windows varsayılanı)";
    private const string SharedPrinterLabel = PrinterRouter.SharedPrinterLabel;
    private const string UnassignedPrinterLabel = PrinterRouter.UnassignedPrinterLabel;

    private void BindPrintersUi(bool reloadRoutes)
    {
        _suppressPrinterPersist = true;
        try
        {
            var printers = PrinterInventory.ListInstalled();
            gridPrinters.Rows.Clear();
            foreach (var printer in printers)
            {
                gridPrinters.Rows.Add(printer.Name, printer.IsDefault ? "Evet" : "");
            }

            if (reloadRoutes)
            {
                chkUseSharedKitchen.Checked = _engine?.Settings.UseSharedKitchenPrinter ?? false;
            }

            var kitchen = reloadRoutes
                ? (_engine?.Settings.DefaultKitchenPrinter ?? "")
                : ComboPrinterValue(cmbDefaultKitchen);
            var account = reloadRoutes
                ? (_engine?.Settings.DefaultAccountPrinter ?? "")
                : ComboPrinterValue(cmbDefaultAccount);
            FillPrinterCombo(cmbDefaultKitchen, kitchen);
            FillPrinterCombo(cmbDefaultAccount, account);
            UpdateSharedPrinterUi();

            if (reloadRoutes)
            {
                LoadRoutesGrid(_engine?.Settings.PrinterRoutes ?? []);
            }
        }
        finally
        {
            _suppressPrinterPersist = false;
        }
    }

    private void FillPrinterCombo(ComboBox combo, string selected)
    {
        var names = PrinterInventory.ListInstalled().Select(p => p.Name).ToList();
        combo.Items.Clear();
        combo.Items.Add(WindowsDefaultPrinterLabel);
        foreach (var name in names)
        {
            combo.Items.Add(name);
        }

        if (!string.IsNullOrWhiteSpace(selected) &&
            !names.Contains(selected, StringComparer.OrdinalIgnoreCase))
        {
            combo.Items.Add(selected);
        }

        if (string.IsNullOrWhiteSpace(selected))
        {
            combo.SelectedItem = WindowsDefaultPrinterLabel;
            return;
        }

        var match = combo.Items.Cast<object>()
            .Select(x => Convert.ToString(x) ?? "")
            .FirstOrDefault(x => string.Equals(x, selected, StringComparison.OrdinalIgnoreCase));
        combo.SelectedItem = match ?? WindowsDefaultPrinterLabel;
    }

    private void EnsureRoutePrinterItems()
    {
        var names = PrinterInventory.ListInstalled().Select(p => p.Name).ToList();
        foreach (DataGridViewRow row in gridRoutes.Rows)
        {
            var current = Convert.ToString(row.Cells[colRoutePrinter.Index].Value);
            if (!string.IsNullOrWhiteSpace(current) &&
                !PrinterRouter.IsSharedPrinterChoice(current) &&
                !string.Equals(current, UnassignedPrinterLabel, StringComparison.Ordinal) &&
                !names.Contains(current, StringComparer.OrdinalIgnoreCase))
            {
                names.Add(current);
            }
        }

        if (UseSharedKitchen)
        {
            if (!ComboColumnContains(colRoutePrinter, SharedPrinterLabel))
            {
                colRoutePrinter.Items.Insert(0, SharedPrinterLabel);
            }

            if (ComboColumnContains(colRoutePrinter, UnassignedPrinterLabel))
            {
                colRoutePrinter.Items.Remove(UnassignedPrinterLabel);
            }
        }
        else
        {
            if (ComboColumnContains(colRoutePrinter, SharedPrinterLabel))
            {
                colRoutePrinter.Items.Remove(SharedPrinterLabel);
            }

            if (!ComboColumnContains(colRoutePrinter, UnassignedPrinterLabel))
            {
                colRoutePrinter.Items.Insert(0, UnassignedPrinterLabel);
            }
        }

        foreach (var name in names)
        {
            if (!ComboColumnContains(colRoutePrinter, name))
            {
                colRoutePrinter.Items.Add(name);
            }
        }
    }

    private void UpdateSharedPrinterUi()
    {
        cmbDefaultKitchen.Enabled = UseSharedKitchen;
        colRouteAlsoShared.Visible = UseSharedKitchen;

        var suppress = _suppressPrinterPersist;
        _suppressPrinterPersist = true;
        try
        {
            if (UseSharedKitchen)
            {
                if (!ComboColumnContains(colRoutePrinter, SharedPrinterLabel))
                {
                    colRoutePrinter.Items.Insert(0, SharedPrinterLabel);
                }
            }
            else if (!ComboColumnContains(colRoutePrinter, UnassignedPrinterLabel))
            {
                colRoutePrinter.Items.Insert(0, UnassignedPrinterLabel);
            }

            foreach (DataGridViewRow row in gridRoutes.Rows)
            {
                if (row.IsNewRow)
                {
                    continue;
                }

                var printer = Convert.ToString(row.Cells[colRoutePrinter.Index].Value)?.Trim() ?? "";
                if (UseSharedKitchen)
                {
                    if (string.IsNullOrWhiteSpace(printer) ||
                        string.Equals(printer, UnassignedPrinterLabel, StringComparison.Ordinal) ||
                        PrinterRouter.IsSharedPrinterChoice(printer))
                    {
                        row.Cells[colRoutePrinter.Index].Value = SharedPrinterLabel;
                    }
                }
                else if (PrinterRouter.IsSharedPrinterChoice(printer) ||
                         string.Equals(printer, UnassignedPrinterLabel, StringComparison.Ordinal))
                {
                    row.Cells[colRoutePrinter.Index].Value = UnassignedPrinterLabel;
                }
            }
        }
        finally
        {
            _suppressPrinterPersist = suppress;
        }

        EnsureRoutePrinterItems();
    }

    private static bool ComboColumnContains(DataGridViewComboBoxColumn column, string value)
    {
        foreach (var item in column.Items)
        {
            if (string.Equals(Convert.ToString(item), value, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private void LoadRoutesGrid(IEnumerable<CategoryPrinterRoute> routes)
    {
        var suppress = _suppressPrinterPersist;
        _suppressPrinterPersist = true;
        try
        {
            gridRoutes.Rows.Clear();
            EnsureRoutePrinterItems();
            foreach (var route in routes)
            {
                if (string.IsNullOrWhiteSpace(route.Category))
                {
                    continue;
                }

                var printer = route.PrinterName?.Trim() ?? "";
                if (UseSharedKitchen && PrinterRouter.IsSharedPrinterChoice(printer))
                {
                    printer = SharedPrinterLabel;
                }
                else if (!UseSharedKitchen && (string.IsNullOrWhiteSpace(printer) || PrinterRouter.IsSharedPrinterChoice(printer)))
                {
                    printer = UnassignedPrinterLabel;
                }
                else if (!ComboColumnContains(colRoutePrinter, printer))
                {
                    colRoutePrinter.Items.Add(printer);
                }

                AddRouteRow(route.Category, printer, route.AlsoPrintToShared, route.Enabled);
            }
        }
        finally
        {
            _suppressPrinterPersist = suppress;
        }
    }

    private void AddRouteRow(string category, string? printer, bool alsoShared, bool enabled)
    {
        object printerCell;
        if (string.IsNullOrWhiteSpace(printer) || PrinterRouter.IsSharedPrinterChoice(printer))
        {
            printerCell = UseSharedKitchen ? SharedPrinterLabel : UnassignedPrinterLabel;
        }
        else if (string.Equals(printer, UnassignedPrinterLabel, StringComparison.Ordinal))
        {
            printerCell = UnassignedPrinterLabel;
        }
        else
        {
            printerCell = printer.Trim();
        }
        gridRoutes.Rows.Add(category, printerCell, alsoShared, enabled);
    }

    private void ApplyPrinterSettingsFromUi(AppSettings settings)
    {
        settings.UseSharedKitchenPrinter = chkUseSharedKitchen.Checked;
        settings.DefaultKitchenPrinter = ComboPrinterValue(cmbDefaultKitchen);
        settings.DefaultAccountPrinter = ComboPrinterValue(cmbDefaultAccount);
        settings.PrinterRoutes = ReadRoutesFromGrid();
    }

    private List<CategoryPrinterRoute> ReadRoutesFromGrid()
    {
        CommitRouteGrid();
        var routes = new List<CategoryPrinterRoute>();
        foreach (DataGridViewRow row in gridRoutes.Rows)
        {
            if (row.IsNewRow)
            {
                continue;
            }

            var category = Convert.ToString(row.Cells[colRouteCategory.Index].Value)?.Trim() ?? "";
            if (string.IsNullOrWhiteSpace(category))
            {
                continue;
            }

            var printer = Convert.ToString(row.Cells[colRoutePrinter.Index].Value)?.Trim() ?? "";
            if (PrinterRouter.IsSharedPrinterChoice(printer) ||
                string.Equals(printer, UnassignedPrinterLabel, StringComparison.Ordinal))
            {
                printer = string.Empty;
            }

            var enabled = row.Cells[colRouteEnabled.Index].Value is not false;
            var alsoShared = row.Cells[colRouteAlsoShared.Index].Value is true;
            routes.Add(new CategoryPrinterRoute
            {
                Category = category,
                PrinterName = printer,
                Enabled = enabled,
                AlsoPrintToShared = alsoShared
            });
        }

        return routes;
    }

    private static string ComboPrinterValue(ComboBox combo)
    {
        var text = combo.SelectedItem?.ToString() ?? "";
        return string.Equals(text, WindowsDefaultPrinterLabel, StringComparison.Ordinal)
            ? string.Empty
            : text.Trim();
    }

    private string GetSelectedInstalledPrinter()
    {
        if (gridPrinters.CurrentRow is null)
        {
            return ComboPrinterValue(cmbDefaultKitchen);
        }

        return Convert.ToString(gridPrinters.CurrentRow.Cells[colPrinterName.Index].Value)?.Trim() ?? "";
    }

    private void BindLanguageCombos(AppSettings settings)
    {
        _suppressLanguagePersist = true;
        try
        {
            FillLanguageCombo(cmbReceiptLanguage, settings.KitchenReceiptLanguage);
            FillLanguageCombo(cmbSettingsKitchenLanguage, settings.KitchenReceiptLanguage);
            FillLanguageCombo(cmbAccountReceiptLanguage, settings.AccountReceiptLanguage);
            FillLanguageCombo(cmbSettingsAccountLanguage, settings.AccountReceiptLanguage);
        }
        finally
        {
            _suppressLanguagePersist = false;
        }
    }

    private static void FillLanguageCombo(ComboBox combo, string language)
    {
        var selected = ReceiptCopy.NormalizeLanguage(language);
        if (combo.Items.Count == 0)
        {
            foreach (var code in ReceiptCopy.Languages)
            {
                combo.Items.Add($"{code} — {ReceiptCopy.DisplayName(code)}");
            }
        }

        var match = combo.Items.Cast<object>()
            .Select(x => Convert.ToString(x) ?? "")
            .FirstOrDefault(x => x.StartsWith(selected + " ", StringComparison.OrdinalIgnoreCase));
        combo.SelectedItem = match ?? combo.Items[0];
    }

    private static string ReadLanguageCombo(ComboBox combo)
    {
        var text = combo.SelectedItem?.ToString() ?? "tr";
        var code = text.Split(' ', 2)[0];
        return ReceiptCopy.NormalizeLanguage(code);
    }

    private void HookLanguagePersistence()
    {
        foreach (var combo in new[]
                 {
                     cmbReceiptLanguage, cmbAccountReceiptLanguage,
                     cmbSettingsKitchenLanguage, cmbSettingsAccountLanguage
                 })
        {
            combo.SelectedIndexChanged -= ReceiptLanguageChanged;
            combo.SelectedIndexChanged += ReceiptLanguageChanged;
        }
    }

    private void ReceiptLanguageChanged(object? sender, EventArgs e)
    {
        if (_suppressLanguagePersist || _engine is null || sender is not ComboBox combo)
        {
            return;
        }

        var language = ReadLanguageCombo(combo);
        if (combo == cmbReceiptLanguage || combo == cmbSettingsKitchenLanguage)
        {
            _engine.Settings.KitchenReceiptLanguage = language;
            _engine.Settings.ReceiptLanguage = language;
        }
        else
        {
            _engine.Settings.AccountReceiptLanguage = language;
        }

        _engine.SaveSettings(_engine.Settings);
        BindLanguageCombos(_engine.Settings);
    }

    private void notifyIcon1_DoubleClick(object? sender, EventArgs e) => RestoreFromTray();

    private async void pollTimer_Tick(object? sender, EventArgs e) => await PollIfNeededAsync();

    private void clockTimer_Tick(object? sender, EventArgs e) => RefreshDashboard();

    private async void cmbFirm_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_engine is null) return;
        if (cmbFirm.SelectedItem is FirmDto firm)
        {
            await LoadPeriodsAsync(firm);
        }
    }

    private void LoadSettingsToUi(AppSettings s)
    {
        txtApiBase.Text = s.ApiBaseUrl;
        txtTenant.Text = s.TenantCode;
        SetTenantText(txtTenantPrinters, s.TenantCode);
        txtToken.Text = s.ApiToken;
        cmbAuth.SelectedItem = string.IsNullOrWhiteSpace(s.AuthMode) ? "none" : s.AuthMode.ToLowerInvariant();
        if (cmbAuth.SelectedIndex < 0) cmbAuth.SelectedIndex = 0;
        numPoll.Value = Math.Clamp(s.PollIntervalSeconds, 2, 120);
        chkOrders.Checked = s.OrdersEnabled;
        chkAcceptQrOrders.Checked = s.AcceptQrOrders;
        chkAutoPrint.Checked = s.AutoPrintKitchen;
        chkMarkCooking.Checked = s.AutoMarkKitchenCooking;
        chkUiPoll.Checked = s.UiPollingWhenServiceStopped;
        chkAutoStart.Checked = s.AutoStartWithWindows;
        BindLanguageCombos(s);
        BindPrintersUi(reloadRoutes: true);
    }

    private void SaveSettingsFromUi()
    {
        if (_engine is null || _startupManager is null) return;
        var s = _engine.Settings;
        s.ApiBaseUrl = txtApiBase.Text.Trim();
        s.TenantCode = string.IsNullOrWhiteSpace(txtTenantPrinters.Text)
            ? txtTenant.Text.Trim()
            : txtTenantPrinters.Text.Trim();
        SetTenantText(txtTenant, s.TenantCode);
        SetTenantText(txtTenantPrinters, s.TenantCode);
        s.ApiToken = txtToken.Text.Trim();
        s.AuthMode = cmbAuth.SelectedItem?.ToString() ?? "none";
        s.PollIntervalSeconds = (int)numPoll.Value;
        s.OrdersEnabled = chkOrders.Checked;
        s.AcceptQrOrders = chkAcceptQrOrders.Checked;
        s.AutoPrintKitchen = chkAutoPrint.Checked;
        s.AutoMarkKitchenCooking = chkMarkCooking.Checked;
        s.UiPollingWhenServiceStopped = chkUiPoll.Checked;
        s.AutoStartWithWindows = chkAutoStart.Checked;
        s.KitchenReceiptLanguage = ReadLanguageCombo(cmbReceiptLanguage);
        s.AccountReceiptLanguage = ReadLanguageCombo(cmbAccountReceiptLanguage);
        s.ReceiptLanguage = s.KitchenReceiptLanguage;
        if (cmbFirm.SelectedItem is FirmDto firm)
        {
            s.FirmId = firm.Id;
            s.FirmNr = firm.FirmNr;
            s.CompanyName = firm.DisplayName;
        }

        if (cmbPeriod.SelectedItem is PeriodDto period)
        {
            s.PeriodNr = period.PeriodNr;
        }

        if (cmbStore.SelectedItem is StoreDto store)
        {
            s.StoreId = store.Id;
            s.StoreName = store.Name;
        }

        ApplyPrinterSettingsFromUi(s);
        _engine.SaveSettings(s);
        _startupManager.SetEnabled(s.AutoStartWithWindows, Application.ExecutablePath);
        pollTimer.Interval = Math.Max(2, s.PollIntervalSeconds) * 1000;
        RefreshDashboard();
    }

    private async Task LoadCatalogAsync()
    {
        if (_engine is null) return;
        SaveSettingsFromUi();
        try
        {
            _firms = (await _engine.Catalog.FetchFirmsAsync(_engine.Settings)).ToList();
            cmbFirm.Items.Clear();
            foreach (var firm in _firms)
            {
                cmbFirm.Items.Add(firm);
            }

            var selected = _firms.FirstOrDefault(f => f.Id == _engine.Settings.FirmId)
                ?? _firms.FirstOrDefault(f => f.FirmNr == _engine.Settings.FirmNr)
                ?? _firms.FirstOrDefault();
            if (selected is not null)
            {
                cmbFirm.SelectedItem = selected;
                await LoadPeriodsAsync(selected);
            }

            _stores = (await _engine.Catalog.FetchStoresAsync(_engine.Settings, _engine.Settings.FirmNr)).ToList();
            cmbStore.Items.Clear();
            foreach (var store in _stores)
            {
                cmbStore.Items.Add(store);
            }

            var selectedStore = _stores.FirstOrDefault(s => s.Id == _engine.Settings.StoreId) ?? _stores.FirstOrDefault();
            if (selectedStore is not null)
            {
                cmbStore.SelectedItem = selectedStore;
            }

            SetStatus($"Katalog yüklendi: {_firms.Count} firma, {_stores.Count} mağaza.");
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Katalog", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private async Task LoadPeriodsAsync(FirmDto firm)
    {
        if (_engine is null) return;
        _periods = (await _engine.Catalog.FetchPeriodsAsync(_engine.Settings, firm.Id)).ToList();
        cmbPeriod.Items.Clear();
        foreach (var period in _periods)
        {
            cmbPeriod.Items.Add(period);
        }

        var selected = _periods.FirstOrDefault(p => p.PeriodNr == _engine.Settings.PeriodNr)
            ?? _periods.FirstOrDefault(p => p.IsDefault)
            ?? _periods.FirstOrDefault();
        if (selected is not null)
        {
            cmbPeriod.SelectedItem = selected;
        }
    }

    private void RefreshDashboard()
    {
        if (IsDisposed || _engine is null)
        {
            return;
        }

        var printer = _engine.Settings.UseSharedKitchenPrinter
            ? (string.IsNullOrWhiteSpace(_engine.Settings.DefaultKitchenPrinter)
                ? ReceiptPrinterService.GetDefaultPrinterName()
                : _engine.Settings.DefaultKitchenPrinter.Trim())
            : "Kategoriye göre";
        lblKpiPrinterValue.Text = string.IsNullOrWhiteSpace(printer) ? "Yok" : printer;
        lblKpiPendingValue.Text = _engine.Inbox.GetPending()
            .Count(o => !string.Equals(o.Source, OrderSource.Account, StringComparison.OrdinalIgnoreCase))
            .ToString();
        lblKpiServiceValue.Text = WindowsServiceHelper.StatusText();
        lblKpiApiValue.Text = string.IsNullOrWhiteSpace(_engine.Settings.TenantCode)
            ? _engine.Settings.FirmNr
            : _engine.Settings.TenantCode + " / " + _engine.Settings.FirmNr;
        lblLastPoll.Text = _engine.LastPollAt is null
            ? "Son tarama: —"
            : "Son tarama: " + _engine.LastPollAt.Value.ToString("HH:mm:ss") + "  ·  " + _engine.LastStatus;
        statusLabel.Text = _engine.LastStatus;
        SetBadge(WindowsServiceHelper.IsRunning() ? "Servis aktif" : "Hazır", true);
        LayoutDashboardCards();
    }

    private void RefreshOrdersGrid()
    {
        if (IsDisposed || _engine is null)
        {
            return;
        }

        gridOrders.Rows.Clear();
        _gridCompleted?.Rows.Clear();
        var all = _engine.Inbox.GetAll();
        var filtered = all.Where(MatchesOrderFilter).Take(400).ToList();
        var pending = filtered.Where(o => !o.IsCompleted).ToList();
        var completed = filtered.Where(o => o.IsCompleted).Take(200).ToList();
        foreach (var order in pending)
        {
            AddOrderRow(gridOrders, order);
        }

        if (_gridCompleted is not null)
        {
            foreach (var order in completed)
            {
                AddOrderRow(_gridCompleted, order);
            }
        }

        lblOrderFilterCount.Text = $"{pending.Count} bekleyen · {completed.Count} tamamlanan";
        RefreshDashboard();
    }

    private static void AddOrderRow(DataGridView grid, StoredOrder order)
    {
        var index = grid.Rows.Add();
        var row = grid.Rows[index];
        row.Cells["colId"].Value = order.Id;
        row.Cells["colNo"].Value = order.OrderNumber;
        row.Cells["colTable"].Value = order.TableNumber;
        row.Cells["colWaiter"].Value = order.CustomerName;
        row.Cells["colTotal"].Value = order.TotalAmount.ToString("N2");
        row.Cells["colSource"].Value = order.Source == "account" ? "Hesap" : OrderSource.IsQr(order) ? "QR" : "Mutfak";
        if (grid.Columns.Contains("colStatus"))
        {
            row.Cells["colStatus"].Value = order.IsCompleted ? "Tamamlandı" : "Bekliyor";
        }

        row.Cells["colTime"].Value = order.CreatedAt.ToLocalTime().ToString("dd.MM HH:mm");
    }

    private bool MatchesOrderFilter(StoredOrder order)
    {
        if (dtpOrderDate.Checked && order.CreatedAt.ToLocalTime().Date != dtpOrderDate.Value.Date)
        {
            return false;
        }

        var source = cmbOrderSource.SelectedItem?.ToString();
        var isAccount = string.Equals(order.Source, OrderSource.Account, StringComparison.OrdinalIgnoreCase);

        // Açık masa hesabı her taramada gelir; mutfağa gönderince asıl fiş Mutfak'tır.
        // "Tümü" bekleyen listesinde hesap satırını gösterme — kullanıcı Hesap filtresinden bakar.
        if (string.IsNullOrWhiteSpace(source) || source == "Tümü")
        {
            if (isAccount)
            {
                return false;
            }
        }
        else if (source == "Hesap")
        {
            if (!isAccount)
            {
                return false;
            }
        }
        else if (source == "QR")
        {
            if (!OrderSource.IsQr(order))
            {
                return false;
            }
        }
        else if (source == "Mutfak")
        {
            if (isAccount || OrderSource.IsQr(order))
            {
                return false;
            }
        }

        var query = (txtOrderSearch.Text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(query))
        {
            return true;
        }

        return (order.OrderNumber ?? string.Empty).Contains(query, StringComparison.OrdinalIgnoreCase)
            || (order.TableNumber ?? string.Empty).Contains(query, StringComparison.OrdinalIgnoreCase)
            || (order.CustomerName ?? string.Empty).Contains(query, StringComparison.OrdinalIgnoreCase);
    }

    private async Task PollIfNeededAsync()
    {
        if (_busy || _engine is null)
        {
            return;
        }

        // Tepsi veya pencere açıkken yazdırma kullanıcı oturumunda yapılır.
        // Servis, PrintAgentMutex ile bekler — ikisi birden basmaz.
        await _engine.PollAsync();
        RefreshOrdersGrid();
    }

    private async Task RunBusyAsync(Func<Task> action)
    {
        if (_busy)
        {
            return;
        }

        _busy = true;
        UseWaitCursor = true;
        try
        {
            await action();
            RefreshOrdersGrid();
        }
        catch (Exception ex)
        {
            AgentLog.Write(ex.Message);
            MessageBox.Show(ex.Message, "QR Print", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _busy = false;
            UseWaitCursor = false;
        }
    }

    private async Task WithSelectedOrder(Func<string, Task> action)
    {
        var grid = _activeOrderGrid ?? gridOrders;
        if (grid.CurrentRow is null)
        {
            return;
        }

        var id = Convert.ToString(grid.CurrentRow.Cells["colId"].Value);
        if (string.IsNullOrWhiteSpace(id))
        {
            return;
        }

        await RunBusyAsync(() => action(id));
    }

    private void OpenTemplate(string path, string heading, string language, StoredOrder? order = null)
    {
        var editable = ReportTemplates.EditablePath(path);
        if (!File.Exists(editable))
        {
            MessageBox.Show("Şablon bulunamadı: " + path, "Şablon", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var settings = _engine?.Settings ?? new AppSettings();
        var sample = order ?? FindSampleOrder(editable) ?? ReceiptDataBinder.SampleOrder(settings);
        if (!_designer.OpenDesigner(editable, settings, sample, heading, language, out var error))
        {
            MessageBox.Show(error, "FastReport", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private StoredOrder? FindSampleOrder(string templatePath)
    {
        if (_engine is null)
        {
            return null;
        }

        var file = Path.GetFileName(templatePath) ?? string.Empty;
        var account = file.Contains("Account", StringComparison.OrdinalIgnoreCase);
        var all = _engine.Inbox.GetAll();
        if (account)
        {
            return all.LastOrDefault(o => string.Equals(o.Source, OrderSource.Account, StringComparison.OrdinalIgnoreCase))
                ?? all.LastOrDefault();
        }

        return all.LastOrDefault(o => !string.Equals(o.Source, OrderSource.Account, StringComparison.OrdinalIgnoreCase))
            ?? all.LastOrDefault();
    }

    private void InstallService()
    {
        SaveSettingsFromUi();
        var script = WindowsServiceHelper.FindInstallScript();
        if (script is null)
        {
            MessageBox.Show(
                "install-service.ps1 bulunamadı. Yönetici PowerShell ile kurun.",
                "Servis",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        try
        {
            var exe = WindowsServiceHelper.FindServiceExe();
            var args = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"";
            if (!string.IsNullOrWhiteSpace(exe))
            {
                args += " -ExePath \"" + exe + "\"";
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = args,
                Verb = "runas",
                UseShellExecute = true
            });
            AgentLog.Write("Printer Servisi kurulum scripti başlatıldı.");
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Servis kurulumu", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void UninstallService()
    {
        var script = WindowsServiceHelper.FindInstallScript()?.Replace("install-service.ps1", "uninstall-service.ps1");
        if (script is null || !File.Exists(script))
        {
            MessageBox.Show("uninstall-service.ps1 bulunamadı.", "Servis", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"",
                Verb = "runas",
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Servis", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private ContextMenuStrip BuildTrayMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Paneli Aç", null, (_, _) => RestoreFromTray());
        menu.Items.Add("Şimdi Tara", null, async (_, _) =>
        {
            if (_engine is not null)
            {
                await _engine.PollAsync(force: true);
            }
        });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Çıkış", null, (_, _) =>
        {
            _exitRequested = true;
            Close();
        });
        return menu;
    }

    private void RestoreFromTray()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_engine is null)
        {
            return;
        }

        if (_exitRequested || e.CloseReason != CloseReason.UserClosing)
        {
            return;
        }

        e.Cancel = true;
        Hide();
        Balloon("RetailEX Printer", "Tepside yazdırma sürüyor. Tamamen çıkmak için tepsi simgesine sağ tıklayıp Çıkış deyin.");
    }

    private void OnLog(string line)
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke(new Action<string>(OnLog), line);
            return;
        }

        txtLog.AppendText(line + Environment.NewLine);
    }

    private void SetStatus(string text)
    {
        statusLabel.Text = text;
        AgentLog.Write(text);
    }

    private void SetBadge(string text, bool ok)
    {
        statusBadge.Text = text;
        statusBadge.ForeColor = ok ? UiTheme.Success : UiTheme.Danger;
    }

    private void Balloon(string title, string text)
    {
        notifyIcon1.BalloonTipTitle = title;
        notifyIcon1.BalloonTipText = text;
        notifyIcon1.ShowBalloonTip(2200);
    }

    private Icon LoadAppIcon()
    {
        try
        {
            return new Icon(_assets!.EnsureAppIcon());
        }
        catch
        {
            return SystemIcons.Application;
        }
    }
}
