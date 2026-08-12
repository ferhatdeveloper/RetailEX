namespace WindowsFormsApplication1
{
    partial class Form1
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

        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            this.headerPanel = new System.Windows.Forms.Panel();
            this.lblSubtitle = new System.Windows.Forms.Label();
            this.lblTitle = new System.Windows.Forms.Label();
            this.statusBadge = new System.Windows.Forms.Label();
            this.mainTabs = new System.Windows.Forms.TabControl();
            this.tabDashboard = new System.Windows.Forms.TabPage();
            this.tabScales = new System.Windows.Forms.TabPage();
            this.panelScales = new System.Windows.Forms.Panel();
            this.gridScales = new System.Windows.Forms.DataGridView();
            this.colScaleName = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colScaleIp = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colScaleEnabled = new System.Windows.Forms.DataGridViewCheckBoxColumn();
            this.colScaleLastSync = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colScaleLastStatus = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.btnRemoveScale = new System.Windows.Forms.Button();
            this.btnAddScale = new System.Windows.Forms.Button();
            this.lblScalesHint = new System.Windows.Forms.Label();
            this.panelDashboard = new System.Windows.Forms.Panel();
            this.lblLastSync = new System.Windows.Forms.Label();
            this.lblAutoInfo = new System.Windows.Forms.Label();
            this.btnInstallService = new System.Windows.Forms.Button();
            this.lblProductCount = new System.Windows.Forms.Label();
            this.lblScaleStatus = new System.Windows.Forms.Label();
            this.btnQuickSync = new System.Windows.Forms.Button();
            this.btnTestScale = new System.Windows.Forms.Button();
            this.tabSync = new System.Windows.Forms.TabPage();
            this.panelSync = new System.Windows.Forms.Panel();
            this.panelSyncToolbar = new System.Windows.Forms.Panel();
            this.gridProducts = new System.Windows.Forms.DataGridView();
            this.colName = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colPrice = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colUnit = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colShelfLife = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colPlu = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.colBarcode = new System.Windows.Forms.DataGridViewTextBoxColumn();
            this.btnFetchProducts = new System.Windows.Forms.Button();
            this.btnSendToScale = new System.Windows.Forms.Button();
            this.btnLoadFromDevice = new System.Windows.Forms.Button();
            this.tabScale = new System.Windows.Forms.TabPage();
            this.panelScale = new System.Windows.Forms.Panel();
            this.btnUploadSales = new System.Windows.Forms.Button();
            this.btnSaleReport = new System.Windows.Forms.Button();
            this.btnClearPlu = new System.Windows.Forms.Button();
            this.btnGetWeight = new System.Windows.Forms.Button();
            this.btnConnect = new System.Windows.Forms.Button();
            this.cmbScale = new System.Windows.Forms.ComboBox();
            this.lblSelectScale = new System.Windows.Forms.Label();
            this.cmbAuthMode = new System.Windows.Forms.ComboBox();
            this.lblAuthMode = new System.Windows.Forms.Label();
            this.tabSettings = new System.Windows.Forms.TabPage();
            this.panelSettings = new System.Windows.Forms.Panel();
            this.chkAutoSync = new System.Windows.Forms.CheckBox();
            this.chkSyncOnStartup = new System.Windows.Forms.CheckBox();
            this.chkSendHotkeys = new System.Windows.Forms.CheckBox();
            this.chkClearBeforeSend = new System.Windows.Forms.CheckBox();
            this.numSyncInterval = new System.Windows.Forms.NumericUpDown();
            this.lblSyncInterval = new System.Windows.Forms.Label();
            this.numLfCodeBase = new System.Windows.Forms.NumericUpDown();
            this.lblLfCodeBase = new System.Windows.Forms.Label();
            this.txtProductsPath = new System.Windows.Forms.TextBox();
            this.lblProductsPath = new System.Windows.Forms.Label();
            this.txtApiToken = new System.Windows.Forms.TextBox();
            this.lblApiToken = new System.Windows.Forms.Label();
            this.txtTenantCode = new System.Windows.Forms.TextBox();
            this.lblTenantCode = new System.Windows.Forms.Label();
            this.txtApiBaseUrl = new System.Windows.Forms.TextBox();
            this.lblApiBaseUrl = new System.Windows.Forms.Label();
            this.btnSaveSettings = new System.Windows.Forms.Button();
            this.btnTestApi = new System.Windows.Forms.Button();
            this.tabLog = new System.Windows.Forms.TabPage();
            this.txtLog = new System.Windows.Forms.TextBox();
            this.statusStrip = new System.Windows.Forms.StatusStrip();
            this.statusLabel = new System.Windows.Forms.ToolStripStatusLabel();
            this.syncTimer = new System.Windows.Forms.Timer(this.components);
            this.notifyIcon1 = new System.Windows.Forms.NotifyIcon(this.components);
            this.headerPanel.SuspendLayout();
            this.mainTabs.SuspendLayout();
            this.tabDashboard.SuspendLayout();
            this.tabScales.SuspendLayout();
            this.panelScales.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.gridScales)).BeginInit();
            this.panelDashboard.SuspendLayout();
            this.tabSync.SuspendLayout();
            this.panelSync.SuspendLayout();
            this.panelSyncToolbar.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.gridProducts)).BeginInit();
            this.tabScale.SuspendLayout();
            this.panelScale.SuspendLayout();
            this.tabSettings.SuspendLayout();
            this.panelSettings.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numSyncInterval)).BeginInit();
            ((System.ComponentModel.ISupportInitialize)(this.numLfCodeBase)).BeginInit();
            this.tabLog.SuspendLayout();
            this.statusStrip.SuspendLayout();
            this.SuspendLayout();
            // headerPanel
            this.headerPanel.Dock = System.Windows.Forms.DockStyle.Top;
            this.headerPanel.Height = 72;
            this.headerPanel.Padding = new System.Windows.Forms.Padding(24, 16, 24, 12);
            this.headerPanel.Controls.Add(this.statusBadge);
            this.headerPanel.Controls.Add(this.lblSubtitle);
            this.headerPanel.Controls.Add(this.lblTitle);
            // lblTitle
            this.lblTitle.AutoSize = true;
            this.lblTitle.Font = new System.Drawing.Font("Segoe UI Semibold", 14F, System.Drawing.FontStyle.Bold);
            this.lblTitle.Location = new System.Drawing.Point(24, 16);
            this.lblTitle.Text = "RetailEX Terazi Yönetici";
            // lblSubtitle
            this.lblSubtitle.AutoSize = true;
            this.lblSubtitle.Location = new System.Drawing.Point(26, 44);
            this.lblSubtitle.Text = "Rongta etiket terazisi · REST API senkronizasyonu";
            // statusBadge
            this.statusBadge.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Right;
            this.statusBadge.AutoSize = true;
            this.statusBadge.Location = new System.Drawing.Point(820, 26);
            this.statusBadge.Padding = new System.Windows.Forms.Padding(8, 4, 8, 4);
            this.statusBadge.Text = "Hazır";
            // mainTabs
            this.mainTabs.Controls.Add(this.tabDashboard);
            this.mainTabs.Controls.Add(this.tabScales);
            this.mainTabs.Controls.Add(this.tabSync);
            this.mainTabs.Controls.Add(this.tabScale);
            this.mainTabs.Controls.Add(this.tabSettings);
            this.mainTabs.Controls.Add(this.tabLog);
            this.mainTabs.Dock = System.Windows.Forms.DockStyle.Fill;
            this.mainTabs.Location = new System.Drawing.Point(0, 72);
            this.mainTabs.Name = "mainTabs";
            this.mainTabs.SelectedIndex = 0;
            this.mainTabs.Size = new System.Drawing.Size(984, 487);
            // tabDashboard
            this.tabDashboard.Controls.Add(this.panelDashboard);
            this.tabDashboard.Text = "Kontrol Paneli";
            this.tabDashboard.Padding = new System.Windows.Forms.Padding(12);
            // tabScales
            this.tabScales.Controls.Add(this.panelScales);
            this.tabScales.Text = "Teraziler";
            this.tabScales.Padding = new System.Windows.Forms.Padding(12);
            // panelScales
            this.panelScales.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelScales.Padding = new System.Windows.Forms.Padding(16);
            this.panelScales.Controls.Add(this.gridScales);
            this.panelScales.Controls.Add(this.btnRemoveScale);
            this.panelScales.Controls.Add(this.btnAddScale);
            this.panelScales.Controls.Add(this.lblScalesHint);
            // lblScalesHint
            this.lblScalesHint.AutoSize = false;
            this.lblScalesHint.Location = new System.Drawing.Point(20, 16);
            this.lblScalesHint.Size = new System.Drawing.Size(860, 36);
            this.lblScalesHint.Text = "Birden fazla Rongta terazisi ekleyin. Senkronizasyon tum aktif terazilere PLU gonderir.";
            // btnAddScale
            this.btnAddScale.Location = new System.Drawing.Point(20, 56);
            this.btnAddScale.Size = new System.Drawing.Size(120, 36);
            this.btnAddScale.Text = "Terazi Ekle";
            this.btnAddScale.Click += new System.EventHandler(this.btnAddScale_Click);
            // btnRemoveScale
            this.btnRemoveScale.Location = new System.Drawing.Point(148, 56);
            this.btnRemoveScale.Size = new System.Drawing.Size(120, 36);
            this.btnRemoveScale.Text = "Secili Sil";
            this.btnRemoveScale.Click += new System.EventHandler(this.btnRemoveScale_Click);
            // gridScales
            this.gridScales.AllowUserToAddRows = false;
            this.gridScales.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
            this.gridScales.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
                this.colScaleName, this.colScaleIp, this.colScaleEnabled, this.colScaleLastSync, this.colScaleLastStatus});
            this.gridScales.Location = new System.Drawing.Point(20, 104);
            this.gridScales.RowHeadersVisible = false;
            this.gridScales.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect;
            this.gridScales.Size = new System.Drawing.Size(920, 340);
            this.colScaleName.HeaderText = "Ad";
            this.colScaleName.Name = "colScaleName";
            this.colScaleIp.HeaderText = "IP Adresi";
            this.colScaleIp.Name = "colScaleIp";
            this.colScaleEnabled.HeaderText = "Aktif";
            this.colScaleEnabled.Name = "colScaleEnabled";
            this.colScaleLastSync.HeaderText = "Son Senkron";
            this.colScaleLastSync.Name = "colScaleLastSync";
            this.colScaleLastSync.ReadOnly = true;
            this.colScaleLastStatus.HeaderText = "Durum";
            this.colScaleLastStatus.Name = "colScaleLastStatus";
            this.colScaleLastStatus.ReadOnly = true;
            // panelDashboard
            this.panelDashboard.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelDashboard.Padding = new System.Windows.Forms.Padding(16);
            this.panelDashboard.Controls.Add(this.btnInstallService);
            this.panelDashboard.Controls.Add(this.btnTestScale);
            this.panelDashboard.Controls.Add(this.btnQuickSync);
            this.panelDashboard.Controls.Add(this.lblAutoInfo);
            this.panelDashboard.Controls.Add(this.lblLastSync);
            this.panelDashboard.Controls.Add(this.lblProductCount);
            this.panelDashboard.Controls.Add(this.lblScaleStatus);
            // lblScaleStatus
            this.lblScaleStatus.AutoSize = true;
            this.lblScaleStatus.Font = new System.Drawing.Font("Segoe UI Semibold", 10F, System.Drawing.FontStyle.Bold);
            this.lblScaleStatus.Location = new System.Drawing.Point(20, 20);
            this.lblScaleStatus.Text = "Terazi: Bekleniyor";
            // lblProductCount
            this.lblProductCount.AutoSize = true;
            this.lblProductCount.Location = new System.Drawing.Point(20, 52);
            this.lblProductCount.Text = "Ürün: —";
            // lblLastSync
            this.lblLastSync.AutoSize = true;
            this.lblLastSync.Location = new System.Drawing.Point(20, 76);
            this.lblLastSync.Text = "Son senkron: —";
            // lblAutoInfo
            this.lblAutoInfo.AutoSize = false;
            this.lblAutoInfo.Location = new System.Drawing.Point(20, 100);
            this.lblAutoInfo.Size = new System.Drawing.Size(860, 48);
            this.lblAutoInfo.Text = "RLS1000 (.TXP dosyasi + manuel gonder) yerine RetailEX API otomatik PLU gonderir. Windows servisi kurunca PC acikken arka planda calisir.";
            // btnInstallService
            this.btnInstallService.Location = new System.Drawing.Point(384, 120);
            this.btnInstallService.Size = new System.Drawing.Size(180, 40);
            this.btnInstallService.Text = "Windows Servisi Kur";
            this.btnInstallService.Click += new System.EventHandler(this.btnInstallService_Click);
            // btnQuickSync
            this.btnQuickSync.Location = new System.Drawing.Point(20, 120);
            this.btnQuickSync.Size = new System.Drawing.Size(180, 40);
            this.btnQuickSync.Text = "Şimdi Senkronize Et";
            this.btnQuickSync.Click += new System.EventHandler(this.btnQuickSync_Click);
            // btnTestScale
            this.btnTestScale.Location = new System.Drawing.Point(212, 120);
            this.btnTestScale.Size = new System.Drawing.Size(160, 40);
            this.btnTestScale.Text = "Terazi Bağlantısı";
            this.btnTestScale.Click += new System.EventHandler(this.btnTestScale_Click);
            // tabSync
            this.tabSync.Controls.Add(this.panelSync);
            this.tabSync.Text = "Senkronizasyon";
            // panelSync
            this.panelSync.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelSync.Padding = new System.Windows.Forms.Padding(12);
            this.panelSync.Controls.Add(this.gridProducts);
            this.panelSync.Controls.Add(this.panelSyncToolbar);
            // panelSyncToolbar
            this.panelSyncToolbar.Dock = System.Windows.Forms.DockStyle.Top;
            this.panelSyncToolbar.Height = 52;
            this.panelSyncToolbar.Padding = new System.Windows.Forms.Padding(0, 0, 0, 8);
            this.panelSyncToolbar.Controls.Add(this.btnLoadFromDevice);
            this.panelSyncToolbar.Controls.Add(this.btnSendToScale);
            this.panelSyncToolbar.Controls.Add(this.btnFetchProducts);
            // btnFetchProducts
            this.btnFetchProducts.Location = new System.Drawing.Point(0, 4);
            this.btnFetchProducts.Size = new System.Drawing.Size(170, 36);
            this.btnFetchProducts.Text = "RetailEX'ten Çek";
            this.btnFetchProducts.Click += new System.EventHandler(this.btnFetchProducts_Click);
            // btnSendToScale
            this.btnSendToScale.Location = new System.Drawing.Point(180, 4);
            this.btnSendToScale.Size = new System.Drawing.Size(170, 36);
            this.btnSendToScale.Text = "Çek ve Terazilere Gönder";
            this.btnSendToScale.Click += new System.EventHandler(this.btnSendToScale_Click);
            // btnLoadFromDevice
            this.btnLoadFromDevice.Location = new System.Drawing.Point(360, 4);
            this.btnLoadFromDevice.Size = new System.Drawing.Size(170, 36);
            this.btnLoadFromDevice.Text = "Cihazdan Veri Al";
            this.btnLoadFromDevice.Click += new System.EventHandler(this.btnLoadFromDevice_Click);
            // gridProducts
            this.gridProducts.AllowUserToAddRows = false;
            this.gridProducts.AllowUserToDeleteRows = false;
            this.gridProducts.Columns.AddRange(new System.Windows.Forms.DataGridViewColumn[] {
                this.colPlu, this.colName, this.colBarcode, this.colPrice, this.colUnit, this.colShelfLife});
            this.gridProducts.Dock = System.Windows.Forms.DockStyle.Fill;
            this.gridProducts.ReadOnly = true;
            this.gridProducts.RowHeadersVisible = false;
            this.gridProducts.SelectionMode = System.Windows.Forms.DataGridViewSelectionMode.FullRowSelect;
            this.colName.HeaderText = "Ürün Adı";
            this.colName.Name = "colName";
            this.colBarcode.HeaderText = "Barkod";
            this.colBarcode.Name = "colBarcode";
            this.colPrice.HeaderText = "Fiyat";
            this.colPrice.Name = "colPrice";
            this.colUnit.HeaderText = "Birim";
            this.colUnit.Name = "colUnit";
            this.colShelfLife.HeaderText = "Raf Ömrü (gün)";
            this.colShelfLife.Name = "colShelfLife";
            this.colShelfLife.MinimumWidth = 70;
            this.colPlu.HeaderText = "PLU No";
            this.colPlu.MinimumWidth = 72;
            this.colPlu.Name = "colPlu";
            // tabScale
            this.tabScale.Controls.Add(this.panelScale);
            this.tabScale.Text = "Terazi İşlemleri";
            // panelScale
            this.panelScale.AutoScroll = true;
            this.panelScale.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelScale.Padding = new System.Windows.Forms.Padding(16);
            this.panelScale.Controls.Add(this.btnSaleReport);
            this.panelScale.Controls.Add(this.btnUploadSales);
            this.panelScale.Controls.Add(this.btnClearPlu);
            this.panelScale.Controls.Add(this.btnGetWeight);
            this.panelScale.Controls.Add(this.btnConnect);
            this.panelScale.Controls.Add(this.cmbScale);
            this.panelScale.Controls.Add(this.lblSelectScale);
            // lblSelectScale
            this.lblSelectScale.AutoSize = true;
            this.lblSelectScale.Location = new System.Drawing.Point(20, 24);
            this.lblSelectScale.Text = "Islem yapilacak terazi";
            // cmbScale
            this.cmbScale.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cmbScale.Location = new System.Drawing.Point(20, 44);
            this.cmbScale.Size = new System.Drawing.Size(280, 23);
            // btnConnect
            this.btnConnect.Location = new System.Drawing.Point(20, 80);
            this.btnConnect.Size = new System.Drawing.Size(140, 36);
            this.btnConnect.Text = "Bağlan";
            this.btnConnect.Click += new System.EventHandler(this.btnConnect_Click);
            // btnGetWeight
            this.btnGetWeight.Location = new System.Drawing.Point(172, 80);
            this.btnGetWeight.Size = new System.Drawing.Size(140, 36);
            this.btnGetWeight.Text = "Ağırlık Oku";
            this.btnGetWeight.Click += new System.EventHandler(this.btnGetWeight_Click);
            // btnClearPlu
            this.btnClearPlu.Location = new System.Drawing.Point(324, 80);
            this.btnClearPlu.Size = new System.Drawing.Size(140, 36);
            this.btnClearPlu.Text = "Cihaz Verilerini Bosalt";
            this.btnClearPlu.Click += new System.EventHandler(this.btnClearPlu_Click);
            // btnUploadSales
            this.btnUploadSales.Location = new System.Drawing.Point(476, 80);
            this.btnUploadSales.Size = new System.Drawing.Size(160, 36);
            this.btnUploadSales.Text = "Satış Verisi Al";
            this.btnUploadSales.Click += new System.EventHandler(this.btnUploadSales_Click);
            // btnSaleReport
            this.btnSaleReport.Location = new System.Drawing.Point(648, 80);
            this.btnSaleReport.Size = new System.Drawing.Size(170, 36);
            this.btnSaleReport.Text = "Günlük Etiket Raporu";
            this.btnSaleReport.Click += new System.EventHandler(this.btnSaleReport_Click);
            // tabSettings
            this.tabSettings.Controls.Add(this.panelSettings);
            this.tabSettings.Text = "Ayarlar";
            // panelSettings
            this.panelSettings.AutoScroll = true;
            this.panelSettings.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelSettings.Padding = new System.Windows.Forms.Padding(16);
            this.panelSettings.Controls.Add(this.cmbAuthMode);
            this.panelSettings.Controls.Add(this.lblAuthMode);
            this.panelSettings.Controls.Add(this.btnTestApi);
            this.panelSettings.Controls.Add(this.btnSaveSettings);
            this.panelSettings.Controls.Add(this.chkSyncOnStartup);
            this.panelSettings.Controls.Add(this.chkAutoSync);
            this.panelSettings.Controls.Add(this.chkSendHotkeys);
            this.panelSettings.Controls.Add(this.chkClearBeforeSend);
            this.panelSettings.Controls.Add(this.numSyncInterval);
            this.panelSettings.Controls.Add(this.lblSyncInterval);
            this.panelSettings.Controls.Add(this.numLfCodeBase);
            this.panelSettings.Controls.Add(this.lblLfCodeBase);
            this.panelSettings.Controls.Add(this.txtProductsPath);
            this.panelSettings.Controls.Add(this.lblProductsPath);
            this.panelSettings.Controls.Add(this.txtApiToken);
            this.panelSettings.Controls.Add(this.lblApiToken);
            this.panelSettings.Controls.Add(this.txtTenantCode);
            this.panelSettings.Controls.Add(this.lblTenantCode);
            this.panelSettings.Controls.Add(this.txtApiBaseUrl);
            this.panelSettings.Controls.Add(this.lblApiBaseUrl);
            // lblApiBaseUrl
            this.lblApiBaseUrl.AutoSize = true;
            this.lblApiBaseUrl.Location = new System.Drawing.Point(20, 16);
            this.lblApiBaseUrl.Text = "RetailEX API adresi";
            // txtApiBaseUrl
            this.txtApiBaseUrl.Location = new System.Drawing.Point(20, 36);
            this.txtApiBaseUrl.Size = new System.Drawing.Size(420, 23);
            // lblTenantCode
            this.lblTenantCode.AutoSize = true;
            this.lblTenantCode.Location = new System.Drawing.Point(460, 16);
            this.lblTenantCode.Text = "Kiracı kodu";
            // txtTenantCode
            this.txtTenantCode.Location = new System.Drawing.Point(460, 36);
            this.txtTenantCode.Size = new System.Drawing.Size(200, 23);
            // lblApiToken
            this.lblApiToken.AutoSize = true;
            this.lblApiToken.Location = new System.Drawing.Point(20, 72);
            this.lblApiToken.Text = "API Token (Bearer)";
            // txtApiToken
            this.txtApiToken.Location = new System.Drawing.Point(20, 92);
            this.txtApiToken.Size = new System.Drawing.Size(640, 23);
            // lblProductsPath
            this.lblProductsPath.AutoSize = true;
            this.lblProductsPath.Location = new System.Drawing.Point(20, 128);
            this.lblProductsPath.Text = "Ürün endpoint (PostgREST)";
            // txtProductsPath
            this.txtProductsPath.Location = new System.Drawing.Point(20, 148);
            this.txtProductsPath.Size = new System.Drawing.Size(640, 23);
            // lblLfCodeBase
            this.lblLfCodeBase.AutoSize = true;
            this.lblLfCodeBase.Location = new System.Drawing.Point(20, 184);
            this.lblLfCodeBase.Text = "LF Code tabanı";
            // numLfCodeBase
            this.numLfCodeBase.Location = new System.Drawing.Point(20, 204);
            this.numLfCodeBase.Maximum = new decimal(new int[] { 999999, 0, 0, 0 });
            this.numLfCodeBase.Size = new System.Drawing.Size(120, 23);
            this.numLfCodeBase.Value = new decimal(new int[] { 10000, 0, 0, 0 });
            // lblSyncInterval
            this.lblSyncInterval.AutoSize = true;
            this.lblSyncInterval.Location = new System.Drawing.Point(160, 184);
            this.lblSyncInterval.Text = "Senkron aralığı (dk)";
            // numSyncInterval
            this.numSyncInterval.Location = new System.Drawing.Point(160, 204);
            this.numSyncInterval.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
            this.numSyncInterval.Maximum = new decimal(new int[] { 1440, 0, 0, 0 });
            this.numSyncInterval.Size = new System.Drawing.Size(120, 23);
            this.numSyncInterval.Value = new decimal(new int[] { 5, 0, 0, 0 });
            // chkClearBeforeSend
            this.chkClearBeforeSend.AutoSize = true;
            this.chkClearBeforeSend.Location = new System.Drawing.Point(20, 244);
            this.chkClearBeforeSend.Text = "Gonderimden once PLU temizle (tam yenileme)";
            // chkSendHotkeys
            this.chkSendHotkeys.AutoSize = true;
            this.chkSendHotkeys.Location = new System.Drawing.Point(260, 244);
            this.chkSendHotkeys.Text = "Hotkey tablosu gonder (ilk kurulum)";
            this.chkSendHotkeys.Checked = false;
            // chkAutoSync
            this.chkAutoSync.AutoSize = true;
            this.chkAutoSync.Location = new System.Drawing.Point(460, 244);
            this.chkAutoSync.Text = "Otomatik senkron (UI zamanlayıcı)";
            this.chkAutoSync.Checked = true;
            // chkSyncOnStartup
            this.chkSyncOnStartup.AutoSize = true;
            this.chkSyncOnStartup.Location = new System.Drawing.Point(20, 268);
            this.chkSyncOnStartup.Text = "Uygulama acilinca hemen senkronize et";
            this.chkSyncOnStartup.Checked = true;
            // lblAuthMode
            this.lblAuthMode.AutoSize = true;
            this.lblAuthMode.Location = new System.Drawing.Point(300, 184);
            this.lblAuthMode.Text = "API kimlik dogrulama";
            // cmbAuthMode
            this.cmbAuthMode.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            this.cmbAuthMode.Items.AddRange(new object[] { "auto", "none", "bearer", "apikey" });
            this.cmbAuthMode.Location = new System.Drawing.Point(300, 204);
            this.cmbAuthMode.Size = new System.Drawing.Size(160, 23);
            // btnSaveSettings
            this.btnSaveSettings.Location = new System.Drawing.Point(20, 304);
            this.btnSaveSettings.Size = new System.Drawing.Size(140, 36);
            this.btnSaveSettings.Text = "Ayarları Kaydet";
            this.btnSaveSettings.Click += new System.EventHandler(this.btnSaveSettings_Click);
            // btnTestApi
            this.btnTestApi.Location = new System.Drawing.Point(172, 304);
            this.btnTestApi.Size = new System.Drawing.Size(140, 36);
            this.btnTestApi.Text = "API Bağlantısı";
            this.btnTestApi.Click += new System.EventHandler(this.btnTestApi_Click);
            // tabLog
            this.tabLog.Controls.Add(this.txtLog);
            // tabLog — canlı uygulama konsolu (İşlem Günlüğü sekmesinden ayrı)
            this.tabLog.Text = "Uygulama Günlüğü";
            // txtLog
            this.txtLog.Dock = System.Windows.Forms.DockStyle.Fill;
            this.txtLog.Multiline = true;
            this.txtLog.ReadOnly = true;
            this.txtLog.ScrollBars = System.Windows.Forms.ScrollBars.Vertical;
            this.txtLog.Font = new System.Drawing.Font("Consolas", 9F);
            // statusStrip
            this.statusStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] { this.statusLabel });
            // statusLabel
            this.statusLabel.Text = "RetailEX Terazi · x86 platform · rtslabelscale.dll";
            // syncTimer
            this.syncTimer.Interval = 300000;
            this.syncTimer.Tick += new System.EventHandler(this.syncTimer_Tick);
            // notifyIcon1
            this.notifyIcon1.Text = "RetailEX Terazi";
            this.notifyIcon1.Visible = true;
            // Form1
            this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(984, 581);
            this.Controls.Add(this.mainTabs);
            this.Controls.Add(this.headerPanel);
            this.Controls.Add(this.statusStrip);
            this.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.MinimumSize = new System.Drawing.Size(900, 620);
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "RetailEX Terazi Yönetici";
            this.Load += new System.EventHandler(this.Form1_Load);
            this.headerPanel.ResumeLayout(false);
            this.headerPanel.PerformLayout();
            this.mainTabs.ResumeLayout(false);
            this.tabDashboard.ResumeLayout(false);
            this.tabScales.ResumeLayout(false);
            this.panelScales.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.gridScales)).EndInit();
            this.panelDashboard.ResumeLayout(false);
            this.panelDashboard.PerformLayout();
            this.tabSync.ResumeLayout(false);
            this.panelSync.ResumeLayout(false);
            this.panelSyncToolbar.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.gridProducts)).EndInit();
            this.tabScale.ResumeLayout(false);
            this.panelScale.ResumeLayout(false);
            this.panelScale.PerformLayout();
            this.tabSettings.ResumeLayout(false);
            this.tabSettings.PerformLayout();
            this.panelSettings.ResumeLayout(false);
            this.panelSettings.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.numSyncInterval)).EndInit();
            ((System.ComponentModel.ISupportInitialize)(this.numLfCodeBase)).EndInit();
            this.tabLog.ResumeLayout(false);
            this.tabLog.PerformLayout();
            this.statusStrip.ResumeLayout(false);
            this.statusStrip.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        private System.Windows.Forms.Panel headerPanel;
        private System.Windows.Forms.Label lblTitle;
        private System.Windows.Forms.Label lblSubtitle;
        private System.Windows.Forms.Label statusBadge;
        private System.Windows.Forms.TabControl mainTabs;
        private System.Windows.Forms.TabPage tabDashboard;
        private System.Windows.Forms.TabPage tabScales;
        private System.Windows.Forms.Panel panelScales;
        private System.Windows.Forms.Label lblScalesHint;
        private System.Windows.Forms.Button btnAddScale;
        private System.Windows.Forms.Button btnRemoveScale;
        private System.Windows.Forms.DataGridView gridScales;
        private System.Windows.Forms.DataGridViewTextBoxColumn colScaleName;
        private System.Windows.Forms.DataGridViewTextBoxColumn colScaleIp;
        private System.Windows.Forms.DataGridViewCheckBoxColumn colScaleEnabled;
        private System.Windows.Forms.DataGridViewTextBoxColumn colScaleLastSync;
        private System.Windows.Forms.DataGridViewTextBoxColumn colScaleLastStatus;
        private System.Windows.Forms.Panel panelDashboard;
        private System.Windows.Forms.Label lblScaleStatus;
        private System.Windows.Forms.Label lblProductCount;
        private System.Windows.Forms.Label lblLastSync;
        private System.Windows.Forms.Label lblAutoInfo;
        private System.Windows.Forms.Button btnInstallService;
        private System.Windows.Forms.Button btnQuickSync;
        private System.Windows.Forms.Button btnTestScale;
        private System.Windows.Forms.TabPage tabSync;
        private System.Windows.Forms.Panel panelSync;
        private System.Windows.Forms.Panel panelSyncToolbar;
        private System.Windows.Forms.Button btnFetchProducts;
        private System.Windows.Forms.Button btnSendToScale;
        private System.Windows.Forms.Button btnLoadFromDevice;
        private System.Windows.Forms.DataGridView gridProducts;
        private System.Windows.Forms.DataGridViewTextBoxColumn colName;
        private System.Windows.Forms.DataGridViewTextBoxColumn colPrice;
        private System.Windows.Forms.DataGridViewTextBoxColumn colUnit;
        private System.Windows.Forms.DataGridViewTextBoxColumn colShelfLife;
        private System.Windows.Forms.DataGridViewTextBoxColumn colPlu;
        private System.Windows.Forms.DataGridViewTextBoxColumn colBarcode;
        private System.Windows.Forms.TabPage tabScale;
        private System.Windows.Forms.Panel panelScale;
        private System.Windows.Forms.Label lblSelectScale;
        private System.Windows.Forms.ComboBox cmbScale;
        private System.Windows.Forms.Label lblAuthMode;
        private System.Windows.Forms.ComboBox cmbAuthMode;
        private System.Windows.Forms.Button btnConnect;
        private System.Windows.Forms.Button btnGetWeight;
        private System.Windows.Forms.Button btnClearPlu;
        private System.Windows.Forms.Button btnUploadSales;
        private System.Windows.Forms.Button btnSaleReport;
        private System.Windows.Forms.TabPage tabSettings;
        private System.Windows.Forms.Panel panelSettings;
        private System.Windows.Forms.Label lblApiBaseUrl;
        private System.Windows.Forms.TextBox txtApiBaseUrl;
        private System.Windows.Forms.Label lblTenantCode;
        private System.Windows.Forms.TextBox txtTenantCode;
        private System.Windows.Forms.Label lblApiToken;
        private System.Windows.Forms.TextBox txtApiToken;
        private System.Windows.Forms.Label lblProductsPath;
        private System.Windows.Forms.TextBox txtProductsPath;
        private System.Windows.Forms.Label lblLfCodeBase;
        private System.Windows.Forms.NumericUpDown numLfCodeBase;
        private System.Windows.Forms.Label lblSyncInterval;
        private System.Windows.Forms.NumericUpDown numSyncInterval;
        private System.Windows.Forms.CheckBox chkClearBeforeSend;
        private System.Windows.Forms.CheckBox chkSendHotkeys;
        private System.Windows.Forms.CheckBox chkAutoSync;
        private System.Windows.Forms.CheckBox chkSyncOnStartup;
        private System.Windows.Forms.Button btnSaveSettings;
        private System.Windows.Forms.Button btnTestApi;
        private System.Windows.Forms.TabPage tabLog;
        private System.Windows.Forms.TextBox txtLog;
        private System.Windows.Forms.StatusStrip statusStrip;
        private System.Windows.Forms.ToolStripStatusLabel statusLabel;
        private System.Windows.Forms.Timer syncTimer;
        private System.Windows.Forms.NotifyIcon notifyIcon1;
    }
}
