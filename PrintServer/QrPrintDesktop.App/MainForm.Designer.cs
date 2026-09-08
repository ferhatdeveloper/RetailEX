namespace QrPrintDesktop.App;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        headerPanel = new Panel();
        statusBadge = new Label();
        lblSubtitle = new Label();
        lblTitle = new Label();
        mainTabs = new TabControl();
        tabDashboard = new TabPage();
        panelDashboard = new Panel();
        cardApi = new Panel();
        barApi = new Panel();
        lblKpiApiTitle = new Label();
        lblKpiApiValue = new Label();
        cardPending = new Panel();
        barPending = new Panel();
        lblKpiPendingTitle = new Label();
        lblKpiPendingValue = new Label();
        cardPrinter = new Panel();
        barPrinter = new Panel();
        lblKpiPrinterTitle = new Label();
        lblKpiPrinterValue = new Label();
        cardService = new Panel();
        barService = new Panel();
        lblKpiServiceTitle = new Label();
        lblKpiServiceValue = new Label();
        lblLastPoll = new Label();
        lblHint = new Label();
        btnPoll = new Button();
        btnTestApi = new Button();
        btnInstallService = new Button();
        btnUninstallService = new Button();
        tabOrders = new TabPage();
        panelOrders = new Panel();
        panelOrdersToolbar = new Panel();
        btnKitchen = new Button();
        btnAccount = new Button();
        btnPreview = new Button();
        btnDesignOrder = new Button();
        btnComplete = new Button();
        btnDemo = new Button();
        btnPrintPending = new Button();
        panelOrdersFilter = new Panel();
        lblOrderDate = new Label();
        dtpOrderDate = new DateTimePicker();
        lblOrderStatus = new Label();
        cmbOrderStatus = new ComboBox();
        lblOrderSource = new Label();
        cmbOrderSource = new ComboBox();
        txtOrderSearch = new TextBox();
        lblOrderFilterCount = new Label();
        tabPrinters = new TabPage();
        panelPrinters = new Panel();
        lblInstalledPrinters = new Label();
        gridPrinters = new DataGridView();
        colPrinterName = new DataGridViewTextBoxColumn();
        colPrinterDefault = new DataGridViewTextBoxColumn();
        btnRefreshPrinters = new Button();
        btnTestPrinter = new Button();
        lblDefaultKitchen = new Label();
        chkUseSharedKitchen = new CheckBox();
        cmbDefaultKitchen = new ComboBox();
        lblDefaultAccount = new Label();
        cmbDefaultAccount = new ComboBox();
        lblTenantPrinters = new Label();
        txtTenantPrinters = new TextBox();
        lblRoutes = new Label();
        gridRoutes = new DataGridView();
        colRouteCategory = new DataGridViewTextBoxColumn();
        colRoutePrinter = new DataGridViewComboBoxColumn();
        colRouteAlsoShared = new DataGridViewCheckBoxColumn();
        colRouteEnabled = new DataGridViewCheckBoxColumn();
        btnAddRoute = new Button();
        btnRemoveRoute = new Button();
        btnLoadCategories = new Button();
        btnSaveRoutes = new Button();
        lblPrinterHint = new Label();
        gridOrders = new DataGridView();
        colId = new DataGridViewTextBoxColumn();
        colNo = new DataGridViewTextBoxColumn();
        colTable = new DataGridViewTextBoxColumn();
        colWaiter = new DataGridViewTextBoxColumn();
        colTotal = new DataGridViewTextBoxColumn();
        colSource = new DataGridViewTextBoxColumn();
        colStatus = new DataGridViewTextBoxColumn();
        colTime = new DataGridViewTextBoxColumn();
        tabSettings = new TabPage();
        panelSettings = new Panel();
        lblApiBase = new Label();
        txtApiBase = new TextBox();
        lblTenant = new Label();
        txtTenant = new TextBox();
        lblAuth = new Label();
        cmbAuth = new ComboBox();
        lblToken = new Label();
        txtToken = new TextBox();
        lblFirm = new Label();
        cmbFirm = new ComboBox();
        lblPeriod = new Label();
        cmbPeriod = new ComboBox();
        lblStore = new Label();
        cmbStore = new ComboBox();
        btnRefreshCatalog = new Button();
        lblPoll = new Label();
        numPoll = new NumericUpDown();
        chkOrders = new CheckBox();
        chkAcceptQrOrders = new CheckBox();
        chkAutoPrint = new CheckBox();
        chkMarkCooking = new CheckBox();
        chkUiPoll = new CheckBox();
        chkAutoStart = new CheckBox();
        btnSaveSettings = new Button();
        tabTemplates = new TabPage();
        panelTemplates = new Panel();
        lblTemplateHint = new Label();
        lblReceiptLanguage = new Label();
        cmbReceiptLanguage = new ComboBox();
        lblAccountReceiptLanguage = new Label();
        cmbAccountReceiptLanguage = new ComboBox();
        lblSettingsKitchenLanguage = new Label();
        cmbSettingsKitchenLanguage = new ComboBox();
        lblSettingsAccountLanguage = new Label();
        cmbSettingsAccountLanguage = new ComboBox();
        btnDesignKitchen = new Button();
        btnDesignAccount = new Button();
        btnDesignWaiter = new Button();
        btnDesignFeedback = new Button();
        tabLog = new TabPage();
        panelLog = new Panel();
        panelLogToolbar = new Panel();
        btnClearLog = new Button();
        txtLog = new TextBox();
        statusStrip = new StatusStrip();
        statusLabel = new ToolStripStatusLabel();
        notifyIcon1 = new NotifyIcon(components);
        pollTimer = new System.Windows.Forms.Timer(components);
        clockTimer = new System.Windows.Forms.Timer(components);
        headerPanel.SuspendLayout();
        mainTabs.SuspendLayout();
        tabDashboard.SuspendLayout();
        panelDashboard.SuspendLayout();
        cardApi.SuspendLayout();
        cardPending.SuspendLayout();
        cardPrinter.SuspendLayout();
        cardService.SuspendLayout();
        tabOrders.SuspendLayout();
        panelOrders.SuspendLayout();
        panelOrdersToolbar.SuspendLayout();
        panelOrdersFilter.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)gridOrders).BeginInit();
        tabPrinters.SuspendLayout();
        panelPrinters.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)gridPrinters).BeginInit();
        ((System.ComponentModel.ISupportInitialize)gridRoutes).BeginInit();
        tabSettings.SuspendLayout();
        panelSettings.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)numPoll).BeginInit();
        tabTemplates.SuspendLayout();
        panelTemplates.SuspendLayout();
        tabLog.SuspendLayout();
        panelLog.SuspendLayout();
        panelLogToolbar.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        //
        // headerPanel
        //
        headerPanel.Controls.Add(statusBadge);
        headerPanel.Controls.Add(lblSubtitle);
        headerPanel.Controls.Add(lblTitle);
        headerPanel.Dock = DockStyle.Top;
        headerPanel.Location = new Point(0, 0);
        headerPanel.Name = "headerPanel";
        headerPanel.Size = new Size(1164, 78);
        headerPanel.TabIndex = 0;
        headerPanel.Resize += headerPanel_Resize;
        //
        // lblTitle
        //
        lblTitle.AutoSize = true;
        lblTitle.Font = new Font("Segoe UI Semibold", 16F, FontStyle.Bold);
        lblTitle.Location = new Point(24, 14);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(220, 30);
        lblTitle.TabIndex = 0;
        lblTitle.Text = "RetailEX Printer";
        //
        // lblSubtitle
        //
        lblSubtitle.AutoSize = true;
        lblSubtitle.Location = new Point(26, 46);
        lblSubtitle.Name = "lblSubtitle";
        lblSubtitle.Size = new Size(520, 15);
        lblSubtitle.TabIndex = 1;
        lblSubtitle.Text = "Mutfak / hesap / QR fişi · RetailEX Printer Servisi";
        //
        // statusBadge
        //
        statusBadge.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        statusBadge.AutoSize = true;
        statusBadge.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
        statusBadge.Location = new Point(1070, 26);
        statusBadge.Name = "statusBadge";
        statusBadge.Padding = new Padding(10, 5, 10, 5);
        statusBadge.Size = new Size(62, 25);
        statusBadge.TabIndex = 2;
        statusBadge.Text = "Hazır";
        //
        // mainTabs
        //
        mainTabs.Controls.Add(tabDashboard);
        mainTabs.Controls.Add(tabOrders);
        mainTabs.Controls.Add(tabPrinters);
        mainTabs.Controls.Add(tabSettings);
        mainTabs.Controls.Add(tabTemplates);
        mainTabs.Controls.Add(tabLog);
        mainTabs.Dock = DockStyle.Fill;
        mainTabs.ItemSize = new Size(108, 38);
        mainTabs.Location = new Point(0, 78);
        mainTabs.Name = "mainTabs";
        mainTabs.Padding = new Point(12, 6);
        mainTabs.SelectedIndex = 0;
        mainTabs.Size = new Size(1164, 640);
        mainTabs.SizeMode = TabSizeMode.Fixed;
        mainTabs.TabIndex = 1;
        //
        // tabDashboard
        //
        tabDashboard.Controls.Add(panelDashboard);
        tabDashboard.Location = new Point(4, 42);
        tabDashboard.Name = "tabDashboard";
        tabDashboard.Padding = new Padding(16);
        tabDashboard.Size = new Size(1156, 594);
        tabDashboard.TabIndex = 0;
        tabDashboard.Text = "Kontrol Paneli";
        tabDashboard.UseVisualStyleBackColor = true;
        //
        // panelDashboard
        //
        panelDashboard.Controls.Add(btnUninstallService);
        panelDashboard.Controls.Add(btnInstallService);
        panelDashboard.Controls.Add(btnTestApi);
        panelDashboard.Controls.Add(btnPoll);
        panelDashboard.Controls.Add(lblHint);
        panelDashboard.Controls.Add(lblLastPoll);
        panelDashboard.Controls.Add(cardService);
        panelDashboard.Controls.Add(cardPrinter);
        panelDashboard.Controls.Add(cardPending);
        panelDashboard.Controls.Add(cardApi);
        panelDashboard.Dock = DockStyle.Fill;
        panelDashboard.Location = new Point(16, 16);
        panelDashboard.Name = "panelDashboard";
        panelDashboard.Size = new Size(1124, 562);
        panelDashboard.TabIndex = 0;
        //
        // cardApi
        //
        cardApi.Controls.Add(lblKpiApiValue);
        cardApi.Controls.Add(lblKpiApiTitle);
        cardApi.Controls.Add(barApi);
        cardApi.Location = new Point(0, 0);
        cardApi.Name = "cardApi";
        cardApi.Size = new Size(268, 108);
        cardApi.TabIndex = 0;
        //
        // barApi
        //
        barApi.Dock = DockStyle.Left;
        barApi.Location = new Point(0, 0);
        barApi.Name = "barApi";
        barApi.Size = new Size(4, 108);
        barApi.TabIndex = 0;
        barApi.BackColor = Color.FromArgb(59, 130, 246);
        //
        // lblKpiApiTitle
        //
        lblKpiApiTitle.AutoSize = true;
        lblKpiApiTitle.Font = new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold);
        lblKpiApiTitle.Location = new Point(20, 16);
        lblKpiApiTitle.Name = "lblKpiApiTitle";
        lblKpiApiTitle.Size = new Size(24, 15);
        lblKpiApiTitle.TabIndex = 1;
        lblKpiApiTitle.Text = "API";
        //
        // lblKpiApiValue
        //
        lblKpiApiValue.AutoSize = true;
        lblKpiApiValue.Font = new Font("Segoe UI Semibold", 16F, FontStyle.Bold);
        lblKpiApiValue.Location = new Point(20, 44);
        lblKpiApiValue.Name = "lblKpiApiValue";
        lblKpiApiValue.Size = new Size(28, 30);
        lblKpiApiValue.TabIndex = 2;
        lblKpiApiValue.Text = "—";
        //
        // cardPending
        //
        cardPending.Controls.Add(lblKpiPendingValue);
        cardPending.Controls.Add(lblKpiPendingTitle);
        cardPending.Controls.Add(barPending);
        cardPending.Location = new Point(284, 0);
        cardPending.Name = "cardPending";
        cardPending.Size = new Size(268, 108);
        cardPending.TabIndex = 1;
        //
        // barPending
        //
        barPending.BackColor = Color.FromArgb(245, 158, 11);
        barPending.Dock = DockStyle.Left;
        barPending.Location = new Point(0, 0);
        barPending.Name = "barPending";
        barPending.Size = new Size(4, 108);
        barPending.TabIndex = 0;
        //
        // lblKpiPendingTitle
        //
        lblKpiPendingTitle.AutoSize = true;
        lblKpiPendingTitle.Font = new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold);
        lblKpiPendingTitle.Location = new Point(20, 16);
        lblKpiPendingTitle.Name = "lblKpiPendingTitle";
        lblKpiPendingTitle.Size = new Size(54, 15);
        lblKpiPendingTitle.TabIndex = 1;
        lblKpiPendingTitle.Text = "Bekleyen";
        //
        // lblKpiPendingValue
        //
        lblKpiPendingValue.AutoSize = true;
        lblKpiPendingValue.Font = new Font("Segoe UI Semibold", 16F, FontStyle.Bold);
        lblKpiPendingValue.Location = new Point(20, 44);
        lblKpiPendingValue.Name = "lblKpiPendingValue";
        lblKpiPendingValue.Size = new Size(25, 30);
        lblKpiPendingValue.TabIndex = 2;
        lblKpiPendingValue.Text = "0";
        //
        // cardPrinter
        //
        cardPrinter.Controls.Add(lblKpiPrinterValue);
        cardPrinter.Controls.Add(lblKpiPrinterTitle);
        cardPrinter.Controls.Add(barPrinter);
        cardPrinter.Location = new Point(568, 0);
        cardPrinter.Name = "cardPrinter";
        cardPrinter.Size = new Size(268, 108);
        cardPrinter.TabIndex = 2;
        //
        // barPrinter
        //
        barPrinter.BackColor = Color.FromArgb(34, 197, 94);
        barPrinter.Dock = DockStyle.Left;
        barPrinter.Location = new Point(0, 0);
        barPrinter.Name = "barPrinter";
        barPrinter.Size = new Size(4, 108);
        barPrinter.TabIndex = 0;
        //
        // lblKpiPrinterTitle
        //
        lblKpiPrinterTitle.AutoSize = true;
        lblKpiPrinterTitle.Font = new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold);
        lblKpiPrinterTitle.Location = new Point(20, 16);
        lblKpiPrinterTitle.Name = "lblKpiPrinterTitle";
        lblKpiPrinterTitle.Size = new Size(40, 15);
        lblKpiPrinterTitle.TabIndex = 1;
        lblKpiPrinterTitle.Text = "Yazıcı";
        //
        // lblKpiPrinterValue
        //
        lblKpiPrinterValue.AutoSize = true;
        lblKpiPrinterValue.Font = new Font("Segoe UI Semibold", 16F, FontStyle.Bold);
        lblKpiPrinterValue.Location = new Point(20, 44);
        lblKpiPrinterValue.Name = "lblKpiPrinterValue";
        lblKpiPrinterValue.Size = new Size(28, 30);
        lblKpiPrinterValue.TabIndex = 2;
        lblKpiPrinterValue.Text = "—";
        //
        // cardService
        //
        cardService.Controls.Add(lblKpiServiceValue);
        cardService.Controls.Add(lblKpiServiceTitle);
        cardService.Controls.Add(barService);
        cardService.Location = new Point(852, 0);
        cardService.Name = "cardService";
        cardService.Size = new Size(268, 108);
        cardService.TabIndex = 3;
        //
        // barService
        //
        barService.BackColor = Color.FromArgb(59, 130, 246);
        barService.Dock = DockStyle.Left;
        barService.Location = new Point(0, 0);
        barService.Name = "barService";
        barService.Size = new Size(4, 108);
        barService.TabIndex = 0;
        //
        // lblKpiServiceTitle
        //
        lblKpiServiceTitle.AutoSize = true;
        lblKpiServiceTitle.Font = new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold);
        lblKpiServiceTitle.Location = new Point(20, 16);
        lblKpiServiceTitle.Name = "lblKpiServiceTitle";
        lblKpiServiceTitle.Size = new Size(102, 15);
        lblKpiServiceTitle.TabIndex = 1;
        lblKpiServiceTitle.Text = "Printer Servisi";
        //
        // lblKpiServiceValue
        //
        lblKpiServiceValue.AutoSize = true;
        lblKpiServiceValue.Font = new Font("Segoe UI Semibold", 16F, FontStyle.Bold);
        lblKpiServiceValue.Location = new Point(20, 44);
        lblKpiServiceValue.Name = "lblKpiServiceValue";
        lblKpiServiceValue.Size = new Size(28, 30);
        lblKpiServiceValue.TabIndex = 2;
        lblKpiServiceValue.Text = "—";
        //
        // lblLastPoll
        //
        lblLastPoll.AutoSize = true;
        lblLastPoll.Font = new Font("Segoe UI Semibold", 10F, FontStyle.Bold);
        lblLastPoll.Location = new Point(4, 128);
        lblLastPoll.Name = "lblLastPoll";
        lblLastPoll.Size = new Size(108, 19);
        lblLastPoll.TabIndex = 4;
        lblLastPoll.Text = "Son tarama: —";
        //
        // lblHint
        //
        lblHint.Location = new Point(4, 160);
        lblHint.Name = "lblHint";
        lblHint.Size = new Size(1110, 48);
        lblHint.TabIndex = 5;
        lblHint.Text = "RetailEX mutfak ve QR siparişlerini izler, FastReport 80mm fiş basar. Printer Servisi kurulunca oturum açmadan arka planda çalışır.";
        //
        // btnPoll
        //
        btnPoll.Location = new Point(4, 220);
        btnPoll.Name = "btnPoll";
        btnPoll.Size = new Size(160, 36);
        btnPoll.TabIndex = 6;
        btnPoll.Text = "Şimdi Tara";
        btnPoll.UseVisualStyleBackColor = false;
        btnPoll.Click += btnPoll_Click;
        //
        // btnTestApi
        //
        btnTestApi.Location = new Point(176, 220);
        btnTestApi.Name = "btnTestApi";
        btnTestApi.Size = new Size(160, 36);
        btnTestApi.TabIndex = 7;
        btnTestApi.Text = "API Bağlantısı";
        btnTestApi.UseVisualStyleBackColor = false;
        btnTestApi.Click += btnTestApi_Click;
        //
        // btnInstallService
        //
        btnInstallService.Location = new Point(348, 220);
        btnInstallService.Name = "btnInstallService";
        btnInstallService.Size = new Size(200, 36);
        btnInstallService.TabIndex = 8;
        btnInstallService.Text = "Printer Servisi Kur";
        btnInstallService.UseVisualStyleBackColor = false;
        btnInstallService.Click += btnInstallService_Click;
        //
        // btnUninstallService
        //
        btnUninstallService.Location = new Point(560, 220);
        btnUninstallService.Name = "btnUninstallService";
        btnUninstallService.Size = new Size(150, 36);
        btnUninstallService.TabIndex = 9;
        btnUninstallService.Text = "Servisi Kaldır";
        btnUninstallService.UseVisualStyleBackColor = false;
        btnUninstallService.Click += btnUninstallService_Click;
        //
        // tabOrders
        //
        tabOrders.Controls.Add(panelOrders);
        tabOrders.Location = new Point(4, 42);
        tabOrders.Name = "tabOrders";
        tabOrders.Padding = new Padding(12);
        tabOrders.Size = new Size(1156, 594);
        tabOrders.TabIndex = 1;
        tabOrders.Text = "Siparişler";
        tabOrders.UseVisualStyleBackColor = true;
        //
        // panelOrders
        //
        panelOrders.Controls.Add(gridOrders);
        panelOrders.Controls.Add(panelOrdersFilter);
        panelOrders.Controls.Add(panelOrdersToolbar);
        panelOrders.Dock = DockStyle.Fill;
        panelOrders.Location = new Point(12, 12);
        panelOrders.Name = "panelOrders";
        panelOrders.Size = new Size(1132, 570);
        panelOrders.TabIndex = 0;
        //
        // panelOrdersToolbar
        //
        panelOrdersToolbar.Controls.Add(btnPrintPending);
        panelOrdersToolbar.Controls.Add(btnDemo);
        panelOrdersToolbar.Controls.Add(btnComplete);
        panelOrdersToolbar.Controls.Add(btnDesignOrder);
        panelOrdersToolbar.Controls.Add(btnPreview);
        panelOrdersToolbar.Controls.Add(btnAccount);
        panelOrdersToolbar.Controls.Add(btnKitchen);
        panelOrdersToolbar.Dock = DockStyle.Top;
        panelOrdersToolbar.Location = new Point(0, 0);
        panelOrdersToolbar.Name = "panelOrdersToolbar";
        panelOrdersToolbar.Size = new Size(1132, 52);
        panelOrdersToolbar.TabIndex = 0;
        //
        // btnKitchen
        //
        btnKitchen.Location = new Point(0, 8);
        btnKitchen.Name = "btnKitchen";
        btnKitchen.Size = new Size(140, 36);
        btnKitchen.TabIndex = 0;
        btnKitchen.Text = "Mutfak Fişi";
        btnKitchen.UseVisualStyleBackColor = false;
        btnKitchen.Click += btnKitchen_Click;
        //
        // btnAccount
        //
        btnAccount.Location = new Point(148, 8);
        btnAccount.Name = "btnAccount";
        btnAccount.Size = new Size(130, 36);
        btnAccount.TabIndex = 1;
        btnAccount.Text = "Hesap Fişi";
        btnAccount.UseVisualStyleBackColor = false;
        btnAccount.Click += btnAccount_Click;
        //
        // btnPreview
        //
        btnPreview.Location = new Point(286, 8);
        btnPreview.Name = "btnPreview";
        btnPreview.Size = new Size(110, 36);
        btnPreview.TabIndex = 2;
        btnPreview.Text = "Önizleme";
        btnPreview.UseVisualStyleBackColor = false;
        btnPreview.Click += btnPreview_Click;
        //
        // btnDesignOrder
        //
        btnDesignOrder.Location = new Point(404, 8);
        btnDesignOrder.Name = "btnDesignOrder";
        btnDesignOrder.Size = new Size(110, 36);
        btnDesignOrder.TabIndex = 3;
        btnDesignOrder.Text = "Tasarla";
        btnDesignOrder.UseVisualStyleBackColor = false;
        btnDesignOrder.Click += btnDesignOrder_Click;
        //
        // btnComplete
        //
        btnComplete.Location = new Point(522, 8);
        btnComplete.Name = "btnComplete";
        btnComplete.Size = new Size(110, 36);
        btnComplete.TabIndex = 4;
        btnComplete.Text = "Tamamla";
        btnComplete.UseVisualStyleBackColor = false;
        btnComplete.Click += btnComplete_Click;
        //
        // btnDemo
        //
        btnDemo.Location = new Point(640, 8);
        btnDemo.Name = "btnDemo";
        btnDemo.Size = new Size(140, 36);
        btnDemo.TabIndex = 5;
        btnDemo.Text = "Demo Sipariş";
        btnDemo.UseVisualStyleBackColor = false;
        btnDemo.Click += btnDemo_Click;
        //
        // btnPrintPending
        //
        btnPrintPending.Location = new Point(788, 8);
        btnPrintPending.Name = "btnPrintPending";
        btnPrintPending.Size = new Size(170, 36);
        btnPrintPending.TabIndex = 6;
        btnPrintPending.Text = "Bekleyenleri Yazdır";
        btnPrintPending.UseVisualStyleBackColor = false;
        btnPrintPending.Click += btnPrintPending_Click;
        //
        // panelOrdersFilter
        //
        panelOrdersFilter.Controls.Add(lblOrderFilterCount);
        panelOrdersFilter.Controls.Add(txtOrderSearch);
        panelOrdersFilter.Controls.Add(cmbOrderSource);
        panelOrdersFilter.Controls.Add(lblOrderSource);
        panelOrdersFilter.Controls.Add(dtpOrderDate);
        panelOrdersFilter.Controls.Add(lblOrderDate);
        panelOrdersFilter.Dock = DockStyle.Top;
        panelOrdersFilter.Location = new Point(0, 52);
        panelOrdersFilter.Name = "panelOrdersFilter";
        panelOrdersFilter.Size = new Size(1132, 44);
        panelOrdersFilter.TabIndex = 1;
        //
        // lblOrderDate
        //
        lblOrderDate.AutoSize = true;
        lblOrderDate.Location = new Point(0, 12);
        lblOrderDate.Name = "lblOrderDate";
        lblOrderDate.Size = new Size(35, 15);
        lblOrderDate.TabIndex = 0;
        lblOrderDate.Text = "Tarih";
        //
        // dtpOrderDate
        //
        dtpOrderDate.Format = DateTimePickerFormat.Short;
        dtpOrderDate.Location = new Point(42, 8);
        dtpOrderDate.Name = "dtpOrderDate";
        dtpOrderDate.ShowCheckBox = true;
        dtpOrderDate.Checked = true;
        dtpOrderDate.Size = new Size(140, 23);
        dtpOrderDate.TabIndex = 1;
        dtpOrderDate.ValueChanged += OrderFilterChanged;
        //
        // lblOrderStatus
        //
        lblOrderStatus.AutoSize = true;
        lblOrderStatus.Location = new Point(198, 12);
        lblOrderStatus.Name = "lblOrderStatus";
        lblOrderStatus.Size = new Size(42, 15);
        lblOrderStatus.TabIndex = 2;
        lblOrderStatus.Visible = false;
        //
        // cmbOrderStatus
        //
        cmbOrderStatus.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbOrderStatus.FormattingEnabled = true;
        cmbOrderStatus.Items.AddRange(new object[] { "Tümü", "Bekliyor", "Tamamlandı" });
        cmbOrderStatus.Location = new Point(246, 8);
        cmbOrderStatus.Name = "cmbOrderStatus";
        cmbOrderStatus.Size = new Size(120, 23);
        cmbOrderStatus.TabIndex = 3;
        cmbOrderStatus.SelectedIndex = 0;
        cmbOrderStatus.Visible = false;
        cmbOrderStatus.SelectedIndexChanged += OrderFilterChanged;
        //
        // lblOrderSource
        //
        lblOrderSource.AutoSize = true;
        lblOrderSource.Location = new Point(198, 12);
        lblOrderSource.Name = "lblOrderSource";
        lblOrderSource.Size = new Size(46, 15);
        lblOrderSource.TabIndex = 4;
        lblOrderSource.Text = "Kaynak";
        //
        // cmbOrderSource
        //
        cmbOrderSource.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbOrderSource.FormattingEnabled = true;
        cmbOrderSource.Items.AddRange(new object[] { "Tümü", "Mutfak", "QR", "Hesap" });
        cmbOrderSource.Location = new Point(250, 8);
        cmbOrderSource.Name = "cmbOrderSource";
        cmbOrderSource.Size = new Size(110, 23);
        cmbOrderSource.TabIndex = 5;
        cmbOrderSource.SelectedIndex = 0;
        cmbOrderSource.SelectedIndexChanged += OrderFilterChanged;
        //
        // txtOrderSearch
        //
        txtOrderSearch.Location = new Point(376, 8);
        txtOrderSearch.Name = "txtOrderSearch";
        txtOrderSearch.PlaceholderText = "Sipariş no veya masa";
        txtOrderSearch.Size = new Size(200, 23);
        txtOrderSearch.TabIndex = 6;
        txtOrderSearch.TextChanged += OrderFilterChanged;
        //
        // lblOrderFilterCount
        //
        lblOrderFilterCount.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        lblOrderFilterCount.Location = new Point(780, 12);
        lblOrderFilterCount.Name = "lblOrderFilterCount";
        lblOrderFilterCount.Size = new Size(340, 15);
        lblOrderFilterCount.TabIndex = 7;
        lblOrderFilterCount.Text = "";
        lblOrderFilterCount.TextAlign = ContentAlignment.MiddleRight;
        //
        // gridOrders
        //
        gridOrders.AllowUserToAddRows = false;
        gridOrders.AllowUserToDeleteRows = false;
        gridOrders.ColumnHeadersHeight = 36;
        gridOrders.Columns.AddRange(new DataGridViewColumn[] { colId, colNo, colTable, colWaiter, colTotal, colSource, colStatus, colTime });
        gridOrders.Dock = DockStyle.Fill;
        gridOrders.Location = new Point(0, 96);
        gridOrders.MultiSelect = false;
        gridOrders.Name = "gridOrders";
        gridOrders.RowHeadersVisible = false;
        gridOrders.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        gridOrders.Size = new Size(1132, 474);
        gridOrders.TabIndex = 2;
        //
        // colId
        //
        colId.HeaderText = "Id";
        colId.Name = "colId";
        colId.Visible = false;
        //
        // colNo
        //
        colNo.FillWeight = 90F;
        colNo.HeaderText = "Sipariş";
        colNo.Name = "colNo";
        //
        // colTable
        //
        colTable.FillWeight = 50F;
        colTable.HeaderText = "Masa";
        colTable.Name = "colTable";
        //
        // colWaiter
        //
        colWaiter.FillWeight = 80F;
        colWaiter.HeaderText = "Garson";
        colWaiter.Name = "colWaiter";
        //
        // colTotal
        //
        colTotal.FillWeight = 60F;
        colTotal.HeaderText = "Tutar";
        colTotal.Name = "colTotal";
        //
        // colSource
        //
        colSource.FillWeight = 70F;
        colSource.HeaderText = "Kaynak";
        colSource.Name = "colSource";
        //
        // colStatus
        //
        colStatus.FillWeight = 70F;
        colStatus.HeaderText = "Durum";
        colStatus.Name = "colStatus";
        //
        // colTime
        //
        colTime.FillWeight = 90F;
        colTime.HeaderText = "Zaman";
        colTime.Name = "colTime";
        //
        // tabPrinters
        //
        tabPrinters.Controls.Add(panelPrinters);
        tabPrinters.Location = new Point(4, 42);
        tabPrinters.Name = "tabPrinters";
        tabPrinters.Padding = new Padding(12);
        tabPrinters.Size = new Size(1156, 594);
        tabPrinters.TabIndex = 2;
        tabPrinters.Text = "Yazıcılar";
        tabPrinters.UseVisualStyleBackColor = true;
        //
        // panelPrinters
        //
        panelPrinters.Controls.Add(lblPrinterHint);
        panelPrinters.Controls.Add(btnSaveRoutes);
        panelPrinters.Controls.Add(btnRemoveRoute);
        panelPrinters.Controls.Add(btnAddRoute);
        panelPrinters.Controls.Add(gridRoutes);
        panelPrinters.Controls.Add(lblRoutes);
        panelPrinters.Controls.Add(cmbDefaultAccount);
        panelPrinters.Controls.Add(lblDefaultAccount);
        panelPrinters.Controls.Add(cmbDefaultKitchen);
        panelPrinters.Controls.Add(chkUseSharedKitchen);
        panelPrinters.Controls.Add(lblDefaultKitchen);
        panelPrinters.Controls.Add(btnLoadCategories);
        panelPrinters.Controls.Add(txtTenantPrinters);
        panelPrinters.Controls.Add(lblTenantPrinters);
        panelPrinters.Controls.Add(btnTestPrinter);
        panelPrinters.Controls.Add(btnRefreshPrinters);
        panelPrinters.Controls.Add(gridPrinters);
        panelPrinters.Controls.Add(lblInstalledPrinters);
        panelPrinters.Dock = DockStyle.Fill;
        panelPrinters.Location = new Point(12, 12);
        panelPrinters.Name = "panelPrinters";
        panelPrinters.Size = new Size(1132, 570);
        panelPrinters.TabIndex = 0;
        //
        // lblTenantPrinters
        //
        lblTenantPrinters.AutoSize = true;
        lblTenantPrinters.Location = new Point(8, 4);
        lblTenantPrinters.Name = "lblTenantPrinters";
        lblTenantPrinters.Size = new Size(320, 15);
        lblTenantPrinters.TabIndex = 0;
        lblTenantPrinters.Text = "Kiracı kodu (ör. lovan) — kategoriler buradan listelenir";
        //
        // txtTenantPrinters
        //
        txtTenantPrinters.Location = new Point(8, 24);
        txtTenantPrinters.Name = "txtTenantPrinters";
        txtTenantPrinters.PlaceholderText = "lovan";
        txtTenantPrinters.Size = new Size(240, 23);
        txtTenantPrinters.TabIndex = 1;
        txtTenantPrinters.TextChanged += txtTenantPrinters_TextChanged;
        //
        // btnLoadCategories
        //
        btnLoadCategories.Location = new Point(256, 20);
        btnLoadCategories.Name = "btnLoadCategories";
        btnLoadCategories.Size = new Size(240, 32);
        btnLoadCategories.TabIndex = 2;
        btnLoadCategories.Text = "Kategorileri Listele";
        btnLoadCategories.UseVisualStyleBackColor = false;
        btnLoadCategories.Click += btnLoadCategories_Click;
        //
        // lblDefaultKitchen
        //
        lblDefaultKitchen.AutoSize = true;
        lblDefaultKitchen.Location = new Point(8, 58);
        lblDefaultKitchen.Name = "lblDefaultKitchen";
        lblDefaultKitchen.Size = new Size(280, 15);
        lblDefaultKitchen.TabIndex = 3;
        lblDefaultKitchen.Text = "Ortak yazıcı";
        lblDefaultKitchen.Visible = false;
        //
        // chkUseSharedKitchen
        //
        chkUseSharedKitchen.AutoSize = true;
        chkUseSharedKitchen.Location = new Point(8, 56);
        chkUseSharedKitchen.Name = "chkUseSharedKitchen";
        chkUseSharedKitchen.Size = new Size(200, 19);
        chkUseSharedKitchen.TabIndex = 3;
        chkUseSharedKitchen.Text = "Ortak yazıcı kullan";
        chkUseSharedKitchen.UseVisualStyleBackColor = true;
        //
        // cmbDefaultKitchen
        //
        cmbDefaultKitchen.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbDefaultKitchen.Enabled = false;
        cmbDefaultKitchen.FormattingEnabled = true;
        cmbDefaultKitchen.Location = new Point(8, 78);
        cmbDefaultKitchen.Name = "cmbDefaultKitchen";
        cmbDefaultKitchen.Size = new Size(360, 23);
        cmbDefaultKitchen.TabIndex = 4;
        //
        // lblDefaultAccount
        //
        lblDefaultAccount.AutoSize = true;
        lblDefaultAccount.Location = new Point(400, 58);
        lblDefaultAccount.Name = "lblDefaultAccount";
        lblDefaultAccount.Size = new Size(140, 15);
        lblDefaultAccount.TabIndex = 5;
        lblDefaultAccount.Text = "Hesap yazıcısı";
        //
        // cmbDefaultAccount
        //
        cmbDefaultAccount.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbDefaultAccount.FormattingEnabled = true;
        cmbDefaultAccount.Location = new Point(400, 78);
        cmbDefaultAccount.Name = "cmbDefaultAccount";
        cmbDefaultAccount.Size = new Size(360, 23);
        cmbDefaultAccount.TabIndex = 6;
        //
        // lblRoutes
        //
        lblRoutes.AutoSize = true;
        lblRoutes.Location = new Point(8, 112);
        lblRoutes.Name = "lblRoutes";
        lblRoutes.Size = new Size(420, 15);
        lblRoutes.TabIndex = 7;
        lblRoutes.Text = "Kategoriler — her satıra yazıcı seçin. Ortak yazıcı yalnızca yukarıdaki kutu açıkken kullanılır.";
        //
        // gridRoutes
        //
        gridRoutes.AllowUserToAddRows = true;
        gridRoutes.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        gridRoutes.ColumnHeadersHeight = 36;
        gridRoutes.Columns.AddRange(new DataGridViewColumn[] { colRouteCategory, colRoutePrinter, colRouteAlsoShared, colRouteEnabled });
        gridRoutes.Location = new Point(8, 132);
        gridRoutes.MultiSelect = false;
        gridRoutes.Name = "gridRoutes";
        gridRoutes.RowHeadersVisible = false;
        gridRoutes.SelectionMode = DataGridViewSelectionMode.CellSelect;
        gridRoutes.EditMode = DataGridViewEditMode.EditOnEnter;
        gridRoutes.Size = new Size(1116, 196);
        gridRoutes.TabIndex = 8;
        //
        // colRouteCategory
        //
        colRouteCategory.FillWeight = 140F;
        colRouteCategory.HeaderText = "Kategori";
        colRouteCategory.Name = "colRouteCategory";
        //
        // colRoutePrinter
        //
        colRoutePrinter.FillWeight = 160F;
        colRoutePrinter.FlatStyle = FlatStyle.Flat;
        colRoutePrinter.HeaderText = "Yazıcı";
        colRoutePrinter.Name = "colRoutePrinter";
        //
        // colRouteAlsoShared
        //
        colRouteAlsoShared.FillWeight = 90F;
        colRouteAlsoShared.HeaderText = "Ortak yazıcıya da bas";
        colRouteAlsoShared.Name = "colRouteAlsoShared";
        //
        // colRouteEnabled
        //
        colRouteEnabled.FillWeight = 45F;
        colRouteEnabled.HeaderText = "Aktif";
        colRouteEnabled.Name = "colRouteEnabled";
        //
        // btnAddRoute
        //
        btnAddRoute.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
        btnAddRoute.Location = new Point(8, 336);
        btnAddRoute.Name = "btnAddRoute";
        btnAddRoute.Size = new Size(130, 32);
        btnAddRoute.TabIndex = 9;
        btnAddRoute.Text = "Satır Ekle";
        btnAddRoute.UseVisualStyleBackColor = false;
        btnAddRoute.Click += btnAddRoute_Click;
        //
        // btnRemoveRoute
        //
        btnRemoveRoute.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
        btnRemoveRoute.Location = new Point(146, 336);
        btnRemoveRoute.Name = "btnRemoveRoute";
        btnRemoveRoute.Size = new Size(130, 32);
        btnRemoveRoute.TabIndex = 10;
        btnRemoveRoute.Text = "Satır Sil";
        btnRemoveRoute.UseVisualStyleBackColor = false;
        btnRemoveRoute.Click += btnRemoveRoute_Click;
        //
        // btnSaveRoutes
        //
        btnSaveRoutes.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
        btnSaveRoutes.Location = new Point(284, 336);
        btnSaveRoutes.Name = "btnSaveRoutes";
        btnSaveRoutes.Size = new Size(180, 32);
        btnSaveRoutes.TabIndex = 11;
        btnSaveRoutes.Text = "Yazıcı Ayarlarını Kaydet";
        btnSaveRoutes.UseVisualStyleBackColor = false;
        btnSaveRoutes.Click += btnSaveRoutes_Click;
        //
        // lblInstalledPrinters
        //
        lblInstalledPrinters.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
        lblInstalledPrinters.AutoSize = true;
        lblInstalledPrinters.Location = new Point(8, 376);
        lblInstalledPrinters.Name = "lblInstalledPrinters";
        lblInstalledPrinters.Size = new Size(180, 15);
        lblInstalledPrinters.TabIndex = 12;
        lblInstalledPrinters.Text = "Windows yazıcıları";
        //
        // gridPrinters
        //
        gridPrinters.AllowUserToAddRows = false;
        gridPrinters.AllowUserToDeleteRows = false;
        gridPrinters.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        gridPrinters.ColumnHeadersHeight = 36;
        gridPrinters.Columns.AddRange(new DataGridViewColumn[] { colPrinterName, colPrinterDefault });
        gridPrinters.Location = new Point(8, 394);
        gridPrinters.MultiSelect = false;
        gridPrinters.Name = "gridPrinters";
        gridPrinters.ReadOnly = true;
        gridPrinters.RowHeadersVisible = false;
        gridPrinters.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        gridPrinters.Size = new Size(1116, 108);
        gridPrinters.TabIndex = 13;
        //
        // colPrinterName
        //
        colPrinterName.FillWeight = 220F;
        colPrinterName.HeaderText = "Yazıcı adı";
        colPrinterName.Name = "colPrinterName";
        colPrinterName.ReadOnly = true;
        //
        // colPrinterDefault
        //
        colPrinterDefault.FillWeight = 70F;
        colPrinterDefault.HeaderText = "Windows varsayılanı";
        colPrinterDefault.Name = "colPrinterDefault";
        colPrinterDefault.ReadOnly = true;
        //
        // btnRefreshPrinters
        //
        btnRefreshPrinters.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
        btnRefreshPrinters.Location = new Point(8, 510);
        btnRefreshPrinters.Name = "btnRefreshPrinters";
        btnRefreshPrinters.Size = new Size(170, 32);
        btnRefreshPrinters.TabIndex = 14;
        btnRefreshPrinters.Text = "Yazıcıları Yenile";
        btnRefreshPrinters.UseVisualStyleBackColor = false;
        btnRefreshPrinters.Click += btnRefreshPrinters_Click;
        //
        // btnTestPrinter
        //
        btnTestPrinter.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
        btnTestPrinter.Location = new Point(186, 510);
        btnTestPrinter.Name = "btnTestPrinter";
        btnTestPrinter.Size = new Size(170, 32);
        btnTestPrinter.TabIndex = 15;
        btnTestPrinter.Text = "Test Yazdır";
        btnTestPrinter.UseVisualStyleBackColor = false;
        btnTestPrinter.Click += btnTestPrinter_Click;
        //
        // lblPrinterHint
        //
        lblPrinterHint.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        lblPrinterHint.Location = new Point(8, 546);
        lblPrinterHint.Name = "lblPrinterHint";
        lblPrinterHint.Size = new Size(1116, 22);
        lblPrinterHint.TabIndex = 16;
        lblPrinterHint.Text = "Yazıcı seçimleri otomatik kaydedilir. Ortak yazıcı isteğe bağlıdır; kutuyu işaretlemeden atanmayan kategoriler basılmaz.";
        //
        // tabSettings
        //
        tabSettings.AutoScroll = true;
        tabSettings.Controls.Add(panelSettings);
        tabSettings.Location = new Point(4, 42);
        tabSettings.Name = "tabSettings";
        tabSettings.Padding = new Padding(12);
        tabSettings.Size = new Size(1156, 594);
        tabSettings.TabIndex = 3;
        tabSettings.Text = "Ayarlar";
        tabSettings.UseVisualStyleBackColor = true;
        //
        // panelSettings
        //
        panelSettings.AutoScroll = true;
        panelSettings.Controls.Add(cmbSettingsAccountLanguage);
        panelSettings.Controls.Add(lblSettingsAccountLanguage);
        panelSettings.Controls.Add(cmbSettingsKitchenLanguage);
        panelSettings.Controls.Add(lblSettingsKitchenLanguage);
        panelSettings.Controls.Add(btnSaveSettings);
        panelSettings.Controls.Add(chkAutoStart);
        panelSettings.Controls.Add(chkUiPoll);
        panelSettings.Controls.Add(chkMarkCooking);
        panelSettings.Controls.Add(chkAutoPrint);
        panelSettings.Controls.Add(chkAcceptQrOrders);
        panelSettings.Controls.Add(chkOrders);
        panelSettings.Controls.Add(numPoll);
        panelSettings.Controls.Add(lblPoll);
        panelSettings.Controls.Add(btnRefreshCatalog);
        panelSettings.Controls.Add(cmbStore);
        panelSettings.Controls.Add(lblStore);
        panelSettings.Controls.Add(cmbPeriod);
        panelSettings.Controls.Add(lblPeriod);
        panelSettings.Controls.Add(cmbFirm);
        panelSettings.Controls.Add(lblFirm);
        panelSettings.Controls.Add(txtToken);
        panelSettings.Controls.Add(lblToken);
        panelSettings.Controls.Add(cmbAuth);
        panelSettings.Controls.Add(lblAuth);
        panelSettings.Controls.Add(txtTenant);
        panelSettings.Controls.Add(lblTenant);
        panelSettings.Controls.Add(txtApiBase);
        panelSettings.Controls.Add(lblApiBase);
        panelSettings.Dock = DockStyle.Fill;
        panelSettings.Location = new Point(12, 12);
        panelSettings.Name = "panelSettings";
        panelSettings.Size = new Size(1132, 570);
        panelSettings.TabIndex = 0;
        //
        // lblApiBase
        //
        lblApiBase.AutoSize = true;
        lblApiBase.Location = new Point(8, 8);
        lblApiBase.Name = "lblApiBase";
        lblApiBase.Size = new Size(220, 15);
        lblApiBase.TabIndex = 0;
        lblApiBase.Text = "API adresi (https://api.retailex.app)";
        //
        // txtApiBase
        //
        txtApiBase.Location = new Point(8, 28);
        txtApiBase.Name = "txtApiBase";
        txtApiBase.Size = new Size(520, 23);
        txtApiBase.TabIndex = 1;
        //
        // lblTenant
        //
        lblTenant.AutoSize = true;
        lblTenant.Location = new Point(8, 62);
        lblTenant.Name = "lblTenant";
        lblTenant.Size = new Size(280, 15);
        lblTenant.TabIndex = 2;
        lblTenant.Text = "Kiracı kodu (ör. lovan) — https://api.retailex.app/lovan";
        //
        // txtTenant
        //
        txtTenant.Location = new Point(8, 82);
        txtTenant.Name = "txtTenant";
        txtTenant.Size = new Size(240, 23);
        txtTenant.TabIndex = 3;
        txtTenant.TextChanged += txtTenant_TextChanged;
        //
        // lblAuth
        //
        lblAuth.AutoSize = true;
        lblAuth.Location = new Point(8, 116);
        lblAuth.Name = "lblAuth";
        lblAuth.Size = new Size(108, 15);
        lblAuth.TabIndex = 4;
        lblAuth.Text = "Kimlik doğrulama";
        //
        // cmbAuth
        //
        cmbAuth.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbAuth.FormattingEnabled = true;
        cmbAuth.Items.AddRange(new object[] { "none", "auto", "apikey", "bearer" });
        cmbAuth.Location = new Point(8, 136);
        cmbAuth.Name = "cmbAuth";
        cmbAuth.Size = new Size(220, 23);
        cmbAuth.TabIndex = 5;
        //
        // lblToken
        //
        lblToken.AutoSize = true;
        lblToken.Location = new Point(8, 170);
        lblToken.Name = "lblToken";
        lblToken.Size = new Size(360, 15);
        lblToken.TabIndex = 6;
        lblToken.Text = "API token (apikey / JWT, none modunda boş bırakılabilir)";
        //
        // txtToken
        //
        txtToken.Location = new Point(8, 190);
        txtToken.Name = "txtToken";
        txtToken.Size = new Size(520, 23);
        txtToken.TabIndex = 7;
        txtToken.UseSystemPasswordChar = true;
        //
        // lblFirm
        //
        lblFirm.AutoSize = true;
        lblFirm.Location = new Point(8, 224);
        lblFirm.Name = "lblFirm";
        lblFirm.Size = new Size(36, 15);
        lblFirm.TabIndex = 8;
        lblFirm.Text = "Firma";
        //
        // cmbFirm
        //
        cmbFirm.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbFirm.FormattingEnabled = true;
        cmbFirm.Location = new Point(8, 244);
        cmbFirm.Name = "cmbFirm";
        cmbFirm.Size = new Size(320, 23);
        cmbFirm.TabIndex = 9;
        cmbFirm.SelectedIndexChanged += cmbFirm_SelectedIndexChanged;
        //
        // lblPeriod
        //
        lblPeriod.AutoSize = true;
        lblPeriod.Location = new Point(8, 278);
        lblPeriod.Name = "lblPeriod";
        lblPeriod.Size = new Size(42, 15);
        lblPeriod.TabIndex = 10;
        lblPeriod.Text = "Dönem";
        //
        // cmbPeriod
        //
        cmbPeriod.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbPeriod.FormattingEnabled = true;
        cmbPeriod.Location = new Point(8, 298);
        cmbPeriod.Name = "cmbPeriod";
        cmbPeriod.Size = new Size(220, 23);
        cmbPeriod.TabIndex = 11;
        //
        // lblStore
        //
        lblStore.AutoSize = true;
        lblStore.Location = new Point(8, 332);
        lblStore.Name = "lblStore";
        lblStore.Size = new Size(47, 15);
        lblStore.TabIndex = 12;
        lblStore.Text = "Mağaza";
        //
        // cmbStore
        //
        cmbStore.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbStore.FormattingEnabled = true;
        cmbStore.Location = new Point(8, 352);
        cmbStore.Name = "cmbStore";
        cmbStore.Size = new Size(320, 23);
        cmbStore.TabIndex = 13;
        //
        // btnRefreshCatalog
        //
        btnRefreshCatalog.Location = new Point(8, 390);
        btnRefreshCatalog.Name = "btnRefreshCatalog";
        btnRefreshCatalog.Size = new Size(260, 36);
        btnRefreshCatalog.TabIndex = 14;
        btnRefreshCatalog.Text = "Firma / Dönem / Mağaza Yenile";
        btnRefreshCatalog.UseVisualStyleBackColor = false;
        btnRefreshCatalog.Click += btnRefreshCatalog_Click;
        //
        // lblPoll
        //
        lblPoll.AutoSize = true;
        lblPoll.Location = new Point(8, 438);
        lblPoll.Name = "lblPoll";
        lblPoll.Size = new Size(118, 15);
        lblPoll.TabIndex = 15;
        lblPoll.Text = "Tarama aralığı (sn)";
        //
        // numPoll
        //
        numPoll.Location = new Point(8, 458);
        numPoll.Maximum = new decimal(new int[] { 120, 0, 0, 0 });
        numPoll.Minimum = new decimal(new int[] { 2, 0, 0, 0 });
        numPoll.Name = "numPoll";
        numPoll.Size = new Size(120, 23);
        numPoll.TabIndex = 16;
        numPoll.Value = new decimal(new int[] { 5, 0, 0, 0 });
        //
        // lblSettingsKitchenLanguage
        //
        lblSettingsKitchenLanguage.AutoSize = true;
        lblSettingsKitchenLanguage.Location = new Point(360, 438);
        lblSettingsKitchenLanguage.Name = "lblSettingsKitchenLanguage";
        lblSettingsKitchenLanguage.Size = new Size(120, 15);
        lblSettingsKitchenLanguage.TabIndex = 23;
        lblSettingsKitchenLanguage.Text = "Mutfak fişi dili";
        //
        // cmbSettingsKitchenLanguage
        //
        cmbSettingsKitchenLanguage.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbSettingsKitchenLanguage.FormattingEnabled = true;
        cmbSettingsKitchenLanguage.Location = new Point(360, 458);
        cmbSettingsKitchenLanguage.Name = "cmbSettingsKitchenLanguage";
        cmbSettingsKitchenLanguage.Size = new Size(240, 23);
        cmbSettingsKitchenLanguage.TabIndex = 24;
        //
        // lblSettingsAccountLanguage
        //
        lblSettingsAccountLanguage.AutoSize = true;
        lblSettingsAccountLanguage.Location = new Point(620, 438);
        lblSettingsAccountLanguage.Name = "lblSettingsAccountLanguage";
        lblSettingsAccountLanguage.Size = new Size(120, 15);
        lblSettingsAccountLanguage.TabIndex = 25;
        lblSettingsAccountLanguage.Text = "Hesap fişi dili";
        //
        // cmbSettingsAccountLanguage
        //
        cmbSettingsAccountLanguage.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbSettingsAccountLanguage.FormattingEnabled = true;
        cmbSettingsAccountLanguage.Location = new Point(620, 458);
        cmbSettingsAccountLanguage.Name = "cmbSettingsAccountLanguage";
        cmbSettingsAccountLanguage.Size = new Size(240, 23);
        cmbSettingsAccountLanguage.TabIndex = 26;
        //
        // chkOrders
        //
        chkOrders.AutoSize = true;
        chkOrders.Checked = true;
        chkOrders.CheckState = CheckState.Checked;
        chkOrders.Location = new Point(8, 496);
        chkOrders.Name = "chkOrders";
        chkOrders.Size = new Size(132, 19);
        chkOrders.TabIndex = 17;
        chkOrders.Text = "Sipariş alma aktif";
        chkOrders.UseVisualStyleBackColor = true;
        //
        // chkAcceptQrOrders
        //
        chkAcceptQrOrders.AutoSize = true;
        chkAcceptQrOrders.Checked = true;
        chkAcceptQrOrders.CheckState = CheckState.Checked;
        chkAcceptQrOrders.Location = new Point(360, 496);
        chkAcceptQrOrders.Name = "chkAcceptQrOrders";
        chkAcceptQrOrders.Size = new Size(250, 19);
        chkAcceptQrOrders.TabIndex = 27;
        chkAcceptQrOrders.Text = "QR'den gelen siparişleri de kabul et";
        chkAcceptQrOrders.UseVisualStyleBackColor = true;
        //
        // chkAutoPrint
        //
        chkAutoPrint.AutoSize = true;
        chkAutoPrint.Checked = true;
        chkAutoPrint.CheckState = CheckState.Checked;
        chkAutoPrint.Location = new Point(8, 524);
        chkAutoPrint.Name = "chkAutoPrint";
        chkAutoPrint.Size = new Size(250, 19);
        chkAutoPrint.TabIndex = 18;
        chkAutoPrint.Text = "Yeni mutfak siparişini otomatik yazdır";
        chkAutoPrint.UseVisualStyleBackColor = true;
        //
        // chkMarkCooking
        //
        chkMarkCooking.AutoSize = true;
        chkMarkCooking.Checked = true;
        chkMarkCooking.CheckState = CheckState.Checked;
        chkMarkCooking.Location = new Point(8, 552);
        chkMarkCooking.Name = "chkMarkCooking";
        chkMarkCooking.Size = new Size(310, 19);
        chkMarkCooking.TabIndex = 19;
        chkMarkCooking.Text = "Yazdınca RetailEX mutfak durumunu cooking yap";
        chkMarkCooking.UseVisualStyleBackColor = true;
        //
        // chkUiPoll
        //
        chkUiPoll.AutoSize = true;
        chkUiPoll.Checked = true;
        chkUiPoll.CheckState = CheckState.Checked;
        chkUiPoll.Location = new Point(8, 580);
        chkUiPoll.Name = "chkUiPoll";
        chkUiPoll.Size = new Size(196, 19);
        chkUiPoll.TabIndex = 20;
        chkUiPoll.Text = "Servis durunca da tara (artık tepsi her zaman tarar)";
        chkUiPoll.UseVisualStyleBackColor = true;
        //
        // chkAutoStart
        //
        chkAutoStart.AutoSize = true;
        chkAutoStart.Location = new Point(8, 608);
        chkAutoStart.Name = "chkAutoStart";
        chkAutoStart.Size = new Size(178, 19);
        chkAutoStart.TabIndex = 21;
        chkAutoStart.Text = "Arayüzü Windows ile başlat";
        chkAutoStart.UseVisualStyleBackColor = true;
        //
        // btnSaveSettings
        //
        btnSaveSettings.Location = new Point(8, 640);
        btnSaveSettings.Name = "btnSaveSettings";
        btnSaveSettings.Size = new Size(180, 36);
        btnSaveSettings.TabIndex = 22;
        btnSaveSettings.Text = "Ayarları Kaydet";
        btnSaveSettings.UseVisualStyleBackColor = false;
        btnSaveSettings.Click += btnSaveSettings_Click;
        //
        // tabTemplates
        //
        tabTemplates.Controls.Add(panelTemplates);
        tabTemplates.Location = new Point(4, 42);
        tabTemplates.Name = "tabTemplates";
        tabTemplates.Padding = new Padding(16);
        tabTemplates.Size = new Size(1156, 594);
        tabTemplates.TabIndex = 4;
        tabTemplates.Text = "Şablonlar";
        tabTemplates.UseVisualStyleBackColor = true;
        //
        // panelTemplates
        //
        panelTemplates.Controls.Add(btnDesignFeedback);
        panelTemplates.Controls.Add(btnDesignWaiter);
        panelTemplates.Controls.Add(btnDesignAccount);
        panelTemplates.Controls.Add(btnDesignKitchen);
        panelTemplates.Controls.Add(cmbAccountReceiptLanguage);
        panelTemplates.Controls.Add(lblAccountReceiptLanguage);
        panelTemplates.Controls.Add(cmbReceiptLanguage);
        panelTemplates.Controls.Add(lblReceiptLanguage);
        panelTemplates.Controls.Add(lblTemplateHint);
        panelTemplates.Dock = DockStyle.Fill;
        panelTemplates.Location = new Point(16, 16);
        panelTemplates.Name = "panelTemplates";
        panelTemplates.Size = new Size(1124, 562);
        panelTemplates.TabIndex = 0;
        //
        // lblTemplateHint
        //
        lblTemplateHint.Location = new Point(8, 8);
        lblTemplateHint.Name = "lblTemplateHint";
        lblTemplateHint.Size = new Size(980, 40);
        lblTemplateHint.TabIndex = 0;
        lblTemplateHint.Text = "Mutfak ve hesap fişi dilleri ayrı seçilir ve otomatik kaydedilir. Yazdırma bu dillere göre gider. Şablonu düzenlemek için ilgili dili seçip tasarla düğmesine basın.";
        //
        // lblReceiptLanguage
        //
        lblReceiptLanguage.AutoSize = true;
        lblReceiptLanguage.Location = new Point(8, 56);
        lblReceiptLanguage.Name = "lblReceiptLanguage";
        lblReceiptLanguage.Size = new Size(220, 15);
        lblReceiptLanguage.TabIndex = 1;
        lblReceiptLanguage.Text = "Mutfak fişi dili";
        //
        // cmbReceiptLanguage
        //
        cmbReceiptLanguage.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbReceiptLanguage.FormattingEnabled = true;
        cmbReceiptLanguage.Location = new Point(8, 76);
        cmbReceiptLanguage.Name = "cmbReceiptLanguage";
        cmbReceiptLanguage.Size = new Size(280, 23);
        cmbReceiptLanguage.TabIndex = 2;
        //
        // lblAccountReceiptLanguage
        //
        lblAccountReceiptLanguage.AutoSize = true;
        lblAccountReceiptLanguage.Location = new Point(312, 56);
        lblAccountReceiptLanguage.Name = "lblAccountReceiptLanguage";
        lblAccountReceiptLanguage.Size = new Size(120, 15);
        lblAccountReceiptLanguage.TabIndex = 3;
        lblAccountReceiptLanguage.Text = "Hesap fişi dili";
        //
        // cmbAccountReceiptLanguage
        //
        cmbAccountReceiptLanguage.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbAccountReceiptLanguage.FormattingEnabled = true;
        cmbAccountReceiptLanguage.Location = new Point(312, 76);
        cmbAccountReceiptLanguage.Name = "cmbAccountReceiptLanguage";
        cmbAccountReceiptLanguage.Size = new Size(280, 23);
        cmbAccountReceiptLanguage.TabIndex = 4;
        //
        // btnDesignKitchen
        //
        btnDesignKitchen.Location = new Point(8, 116);
        btnDesignKitchen.Name = "btnDesignKitchen";
        btnDesignKitchen.Size = new Size(220, 36);
        btnDesignKitchen.TabIndex = 3;
        btnDesignKitchen.Text = "Mutfak 80mm Tasarla";
        btnDesignKitchen.UseVisualStyleBackColor = false;
        btnDesignKitchen.Click += btnDesignKitchen_Click;
        //
        // btnDesignAccount
        //
        btnDesignAccount.Location = new Point(236, 116);
        btnDesignAccount.Name = "btnDesignAccount";
        btnDesignAccount.Size = new Size(220, 36);
        btnDesignAccount.TabIndex = 4;
        btnDesignAccount.Text = "Hesap 80mm Tasarla";
        btnDesignAccount.UseVisualStyleBackColor = false;
        btnDesignAccount.Click += btnDesignAccount_Click;
        //
        // btnDesignWaiter
        //
        btnDesignWaiter.Location = new Point(8, 164);
        btnDesignWaiter.Name = "btnDesignWaiter";
        btnDesignWaiter.Size = new Size(180, 36);
        btnDesignWaiter.TabIndex = 5;
        btnDesignWaiter.Text = "Garson Çağrı Fişi";
        btnDesignWaiter.UseVisualStyleBackColor = false;
        btnDesignWaiter.Click += btnDesignWaiter_Click;
        //
        // btnDesignFeedback
        //
        btnDesignFeedback.Location = new Point(196, 164);
        btnDesignFeedback.Name = "btnDesignFeedback";
        btnDesignFeedback.Size = new Size(160, 36);
        btnDesignFeedback.TabIndex = 6;
        btnDesignFeedback.Text = "Feedback Fişi";
        btnDesignFeedback.UseVisualStyleBackColor = false;
        btnDesignFeedback.Click += btnDesignFeedback_Click;
        //
        // tabLog
        //
        tabLog.Controls.Add(panelLog);
        tabLog.Location = new Point(4, 42);
        tabLog.Name = "tabLog";
        tabLog.Padding = new Padding(12);
        tabLog.Size = new Size(1156, 594);
        tabLog.TabIndex = 5;
        tabLog.Text = "Günlük";
        tabLog.UseVisualStyleBackColor = true;
        //
        // panelLog
        //
        panelLog.Controls.Add(txtLog);
        panelLog.Controls.Add(panelLogToolbar);
        panelLog.Dock = DockStyle.Fill;
        panelLog.Location = new Point(12, 12);
        panelLog.Name = "panelLog";
        panelLog.Size = new Size(1132, 570);
        panelLog.TabIndex = 0;
        //
        // panelLogToolbar
        //
        panelLogToolbar.Controls.Add(btnClearLog);
        panelLogToolbar.Dock = DockStyle.Top;
        panelLogToolbar.Location = new Point(0, 0);
        panelLogToolbar.Name = "panelLogToolbar";
        panelLogToolbar.Size = new Size(1132, 48);
        panelLogToolbar.TabIndex = 0;
        //
        // btnClearLog
        //
        btnClearLog.Location = new Point(0, 6);
        btnClearLog.Name = "btnClearLog";
        btnClearLog.Size = new Size(160, 36);
        btnClearLog.TabIndex = 0;
        btnClearLog.Text = "Günlüğü Temizle";
        btnClearLog.UseVisualStyleBackColor = false;
        btnClearLog.Click += btnClearLog_Click;
        //
        // txtLog
        //
        txtLog.Dock = DockStyle.Fill;
        txtLog.Font = new Font("Consolas", 9F);
        txtLog.Location = new Point(0, 48);
        txtLog.Multiline = true;
        txtLog.Name = "txtLog";
        txtLog.ReadOnly = true;
        txtLog.ScrollBars = ScrollBars.Vertical;
        txtLog.Size = new Size(1132, 522);
        txtLog.TabIndex = 1;
        //
        // statusStrip
        //
        statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel });
        statusStrip.Location = new Point(0, 718);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1164, 22);
        statusStrip.TabIndex = 2;
        statusStrip.Text = "statusStrip";
        //
        // statusLabel
        //
        statusLabel.Name = "statusLabel";
        statusLabel.Size = new Size(34, 17);
        statusLabel.Text = "Hazır";
        //
        // notifyIcon1
        //
        notifyIcon1.Text = "RetailEX Printer";
        notifyIcon1.Visible = true;
        notifyIcon1.DoubleClick += notifyIcon1_DoubleClick;
        //
        // pollTimer
        //
        pollTimer.Tick += pollTimer_Tick;
        //
        // clockTimer
        //
        clockTimer.Interval = 4000;
        clockTimer.Tick += clockTimer_Tick;
        //
        // MainForm
        //
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1164, 740);
        Controls.Add(mainTabs);
        Controls.Add(headerPanel);
        Controls.Add(statusStrip);
        MinimumSize = new Size(1080, 720);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "RetailEX Printer";
        FormClosing += MainForm_FormClosing;
        headerPanel.ResumeLayout(false);
        headerPanel.PerformLayout();
        mainTabs.ResumeLayout(false);
        tabDashboard.ResumeLayout(false);
        panelDashboard.ResumeLayout(false);
        panelDashboard.PerformLayout();
        cardApi.ResumeLayout(false);
        cardApi.PerformLayout();
        cardPending.ResumeLayout(false);
        cardPending.PerformLayout();
        cardPrinter.ResumeLayout(false);
        cardPrinter.PerformLayout();
        cardService.ResumeLayout(false);
        cardService.PerformLayout();
        tabOrders.ResumeLayout(false);
        panelOrders.ResumeLayout(false);
        panelOrdersToolbar.ResumeLayout(false);
        panelOrdersFilter.ResumeLayout(false);
        panelOrdersFilter.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)gridOrders).EndInit();
        tabPrinters.ResumeLayout(false);
        panelPrinters.ResumeLayout(false);
        panelPrinters.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)gridPrinters).EndInit();
        ((System.ComponentModel.ISupportInitialize)gridRoutes).EndInit();
        tabSettings.ResumeLayout(false);
        panelSettings.ResumeLayout(false);
        panelSettings.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)numPoll).EndInit();
        tabTemplates.ResumeLayout(false);
        panelTemplates.ResumeLayout(false);
        tabLog.ResumeLayout(false);
        panelLog.ResumeLayout(false);
        panelLog.PerformLayout();
        panelLogToolbar.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    #endregion

    private Panel headerPanel;
    private Label lblTitle;
    private Label lblSubtitle;
    private Label statusBadge;
    private TabControl mainTabs;
    private TabPage tabDashboard;
    private Panel panelDashboard;
    private Panel cardApi;
    private Panel barApi;
    private Label lblKpiApiTitle;
    private Label lblKpiApiValue;
    private Panel cardPending;
    private Panel barPending;
    private Label lblKpiPendingTitle;
    private Label lblKpiPendingValue;
    private Panel cardPrinter;
    private Panel barPrinter;
    private Label lblKpiPrinterTitle;
    private Label lblKpiPrinterValue;
    private Panel cardService;
    private Panel barService;
    private Label lblKpiServiceTitle;
    private Label lblKpiServiceValue;
    private Label lblLastPoll;
    private Label lblHint;
    private Button btnPoll;
    private Button btnTestApi;
    private Button btnInstallService;
    private Button btnUninstallService;
    private TabPage tabOrders;
    private Panel panelOrders;
    private Panel panelOrdersToolbar;
    private Panel panelOrdersFilter;
    private Label lblOrderDate;
    private DateTimePicker dtpOrderDate;
    private Label lblOrderStatus;
    private ComboBox cmbOrderStatus;
    private Label lblOrderSource;
    private ComboBox cmbOrderSource;
    private TextBox txtOrderSearch;
    private Label lblOrderFilterCount;
    private Button btnKitchen;
    private Button btnAccount;
    private Button btnPreview;
    private Button btnDesignOrder;
    private Button btnComplete;
    private Button btnDemo;
    private Button btnPrintPending;
    private TabPage tabPrinters;
    private Panel panelPrinters;
    private Label lblInstalledPrinters;
    private DataGridView gridPrinters;
    private DataGridViewTextBoxColumn colPrinterName;
    private DataGridViewTextBoxColumn colPrinterDefault;
    private Button btnRefreshPrinters;
    private Button btnTestPrinter;
    private Label lblDefaultKitchen;
    private CheckBox chkUseSharedKitchen;
    private ComboBox cmbDefaultKitchen;
    private Label lblDefaultAccount;
    private ComboBox cmbDefaultAccount;
    private Label lblTenantPrinters;
    private TextBox txtTenantPrinters;
    private Label lblRoutes;
    private DataGridView gridRoutes;
    private DataGridViewTextBoxColumn colRouteCategory;
    private DataGridViewComboBoxColumn colRoutePrinter;
    private DataGridViewCheckBoxColumn colRouteAlsoShared;
    private DataGridViewCheckBoxColumn colRouteEnabled;
    private Button btnAddRoute;
    private Button btnRemoveRoute;
    private Button btnLoadCategories;
    private Button btnSaveRoutes;
    private Label lblPrinterHint;
    private DataGridView gridOrders;
    private DataGridViewTextBoxColumn colId;
    private DataGridViewTextBoxColumn colNo;
    private DataGridViewTextBoxColumn colTable;
    private DataGridViewTextBoxColumn colWaiter;
    private DataGridViewTextBoxColumn colTotal;
    private DataGridViewTextBoxColumn colSource;
    private DataGridViewTextBoxColumn colStatus;
    private DataGridViewTextBoxColumn colTime;
    private TabPage tabSettings;
    private Panel panelSettings;
    private Label lblApiBase;
    private TextBox txtApiBase;
    private Label lblTenant;
    private TextBox txtTenant;
    private Label lblAuth;
    private ComboBox cmbAuth;
    private Label lblToken;
    private TextBox txtToken;
    private Label lblFirm;
    private ComboBox cmbFirm;
    private Label lblPeriod;
    private ComboBox cmbPeriod;
    private Label lblStore;
    private ComboBox cmbStore;
    private Button btnRefreshCatalog;
    private Label lblPoll;
    private NumericUpDown numPoll;
    private CheckBox chkOrders;
    private CheckBox chkAcceptQrOrders;
    private CheckBox chkAutoPrint;
    private CheckBox chkMarkCooking;
    private CheckBox chkUiPoll;
    private CheckBox chkAutoStart;
    private Button btnSaveSettings;
    private TabPage tabTemplates;
    private Panel panelTemplates;
    private Label lblTemplateHint;
    private Label lblReceiptLanguage;
    private ComboBox cmbReceiptLanguage;
    private Label lblAccountReceiptLanguage;
    private ComboBox cmbAccountReceiptLanguage;
    private Label lblSettingsKitchenLanguage;
    private ComboBox cmbSettingsKitchenLanguage;
    private Label lblSettingsAccountLanguage;
    private ComboBox cmbSettingsAccountLanguage;
    private Button btnDesignKitchen;
    private Button btnDesignAccount;
    private Button btnDesignWaiter;
    private Button btnDesignFeedback;
    private TabPage tabLog;
    private Panel panelLog;
    private Panel panelLogToolbar;
    private Button btnClearLog;
    private TextBox txtLog;
    private StatusStrip statusStrip;
    private ToolStripStatusLabel statusLabel;
    private NotifyIcon notifyIcon1;
    private System.Windows.Forms.Timer pollTimer;
    private System.Windows.Forms.Timer clockTimer;
}
