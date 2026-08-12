using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using TeraziRongta.Core.Config;
using TeraziRongta.Core.Helpers;
using TeraziRongta.Core.Models;
using TeraziRongta.Core.Services;
using WindowsFormsApplication1.I18n;
using WindowsFormsApplication1.UI;

namespace WindowsFormsApplication1
{
    public partial class Form1 : Form
    {
        private AppConfig _config;
        private readonly SyncEngine _syncEngine = new SyncEngine();
        private readonly ScaleService _scaleService = new ScaleService();
        private readonly RetailExApiClient _apiClient = new RetailExApiClient();
        private readonly RetailExCentralService _centralService = new RetailExCentralService();
        private readonly ScaleIncrementalSyncService _incrementalService = new ScaleIncrementalSyncService();
        private IList<ScaleProductDto> _cachedProducts = new List<ScaleProductDto>();
        private IList<FirmDto> _firms = new List<FirmDto>();
        private IList<PeriodDto> _periods = new List<PeriodDto>();
        private IList<StoreDto> _stores = new List<StoreDto>();
        private bool _busy;
        private TextBox txtRlsHome;
        private TextBox txtLabelScr;
        private ComboBox cmbLabelSlot;
        private CheckBox chkSendLabelOnSync;
        private Button btnSendLabel;
        private Button btnUseDefaultMegalLabel;
        private Button btnOpenLabelEditor;
        private Button btnBrowseLabel;
        private PictureBox picLabelPreview;
        private Label lblLabelPreviewHint;
        private ComboBox cmbFirm;
        private ComboBox cmbPeriod;
        private ComboBox cmbStore;
        private ComboBox cmbSyncMode;
        private TabPage tabCentral;
        private Panel panelCentral;
        private DataGridView gridCentralStatus;
        private Button btnRefreshCentral;
        private Button btnRegisterScales;
        private Button btnCreateCentralCommand;
        private Button btnPollCentralCommands;
        private Button btnCreateCentralFullCommand;
        private CheckBox chkIncrementalSync;
        private Label lblCentralHint;
        /// <summary>device_sync_transfer_log — ayrı sekme; WinForm'da son 7 gün kuralı.</summary>
        private const int TransferLogMaxAgeDays = 7;
        private TabPage tabTransferLog;
        private Panel panelTransferLog;
        private DataGridView gridTransferLog;
        private Button btnRefreshTransferLog;
        private Label lblTransferLogHint;
        private Label lblBarcodeSettings;
        private Label lblBarcodeType;
        private NumericUpDown numBarcodeType;
        private Label lblDepartment;
        private NumericUpDown numDepartment;
        private Label lblBarcode99Format;
        private TextBox txtBarcode99Format;
        private Label lblWeightDecimals99;
        private NumericUpDown numWeightDecimals99;
        private CheckBox chkSendFunctionSetOnSync;
        private Button btnSendFunctionSet;
        private Button btnOpenDeviceData;
        private TabPage tabScaleData;
        private Panel panelScaleData;
        private Label lblScaleDataHint;
        private ComboBox cmbScaleData;
        private DataGridView gridScalePlu;
        private Button btnLoadScalePlu;
        private Button btnSaveScalePlu;
        private Button btnAddScalePluRow;
        private Button btnDeleteScalePluRow;
        private Button btnExportScalePlu;
        private Button btnImportScalePlu;
        private CheckBox chkClearBeforePluSave;
        private Button btnClearDevicePlu;
        private Label lblScaleDataCount;
        private BindingList<ScalePluRecord> _devicePluList = new BindingList<ScalePluRecord>();
        private bool _scaleDataUiInitialized;
        private Label lblLanguage;
        private ComboBox cmbLanguage;
        private bool _languageUiReady;

        public Form1()
        {
            InitializeComponent();
            InitializeLanguageUi();
            InitializeLabelUi();
            InitializeScaleBarcodeUi();
            InitializeSyncUi();
            InitializeCentralUi();
            EnsureScaleDataTab();
        }

        private void InitializeLanguageUi()
        {
            lblLanguage = new Label
            {
                AutoSize = true,
                Location = new Point(20, 340),
                Text = "Dil / Language",
            };
            cmbLanguage = UiLang.CreateLanguageCombo();
            cmbLanguage.Location = new Point(20, 360);
            cmbLanguage.Size = new Size(200, 23);
            cmbLanguage.SelectedIndexChanged += cmbLanguage_SelectedIndexChanged;
            panelSettings.Controls.Add(lblLanguage);
            panelSettings.Controls.Add(cmbLanguage);
            UiTheme.StyleComboBox(cmbLanguage);
            lblLanguage.ForeColor = UiTheme.Muted;
            _languageUiReady = true;
        }

        private void cmbLanguage_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (!_languageUiReady || _config == null) return;
            var code = UiLang.GetSelectedLanguage(cmbLanguage);
            if (string.Equals(code, UiLang.Code, StringComparison.OrdinalIgnoreCase)) return;
            UiLang.SetLanguage(code);
            _config.UiLanguage = code;
            ApplyLocalizedUi();
            try { _config.Save(); } catch { /* dil tercihi kaydi kritik degil */ }
        }

        /// <summary>
        /// WinForms: TabPage.Text, sayfa TabControl koleksiyonunda degilken (IndexOf=-1)
        /// ArgumentOutOfRangeException firlatir. Yalnizca gecerli sayfalarda Text guncelle.
        /// </summary>
        private static void SetTabPageTextSafe(TabControl tabs, TabPage page, string text)
        {
            if (page == null) return;
            text = text ?? string.Empty;
            try
            {
                if (tabs != null)
                {
                    var idx = tabs.TabPages.IndexOf(page);
                    if (idx < 0)
                    {
                        // Koleksiyonda yok — Parent tutarsizsa Text set etme (SetTabPage(-1) crash).
                        if (ReferenceEquals(page.Parent, tabs)) return;
                        page.Text = text;
                        return;
                    }
                }
                else if (page.Parent is TabControl orphanParent
                         && orphanParent.TabPages.IndexOf(page) < 0)
                {
                    return;
                }

                page.Text = text;
            }
            catch (ArgumentOutOfRangeException)
            {
                // RTL / handle recreate sirasinda IndexOf gecici olarak -1 olabilir.
            }
        }

        private void ApplyTabCaptions()
        {
            SetTabPageTextSafe(mainTabs, tabDashboard, UiLang.T("tab.dashboard"));
            SetTabPageTextSafe(mainTabs, tabScales, UiLang.T("tab.scales"));
            SetTabPageTextSafe(mainTabs, tabSync, UiLang.T("tab.sync"));
            SetTabPageTextSafe(mainTabs, tabScale, UiLang.T("tab.scaleOps"));
            SetTabPageTextSafe(mainTabs, tabSettings, UiLang.T("tab.settings"));
            SetTabPageTextSafe(mainTabs, tabLog, UiLang.T("tab.log"));
            SetTabPageTextSafe(mainTabs, tabScaleData, UiLang.T("tab.deviceData"));
            SetTabPageTextSafe(mainTabs, tabCentral, UiLang.T("tab.central"));
            SetTabPageTextSafe(mainTabs, tabTransferLog, UiLang.T("tab.transferLog"));
        }

        private void ApplyLocalizedUi()
        {
            // Once sekmeler, sonra RTL — ApplyFormDirection handle recreate edebilir.
            Text = UiLang.T("app.title");
            lblTitle.Text = UiLang.T("app.title");
            lblSubtitle.Text = UiLang.T("app.subtitle");
            if (statusBadge.Text == "Hazır" || statusBadge.Text == "Ready" || statusBadge.Text == "جاهز" || statusBadge.Text == "Amade")
            {
                statusBadge.Text = UiLang.T("app.ready");
            }
            notifyIcon1.Text = UiLang.T("app.notify");
            if (lblLanguage != null) lblLanguage.Text = UiLang.T("lang.label");

            ApplyTabCaptions();

            lblScalesHint.Text = UiLang.T("scales.hint");
            btnAddScale.Text = UiLang.T("btn.addScale");
            btnRemoveScale.Text = UiLang.T("btn.removeScale");
            colScaleName.HeaderText = UiLang.T("col.scaleName");
            colScaleIp.HeaderText = UiLang.T("col.scaleIp");
            colScaleEnabled.HeaderText = UiLang.T("col.scaleEnabled");
            colScaleLastSync.HeaderText = UiLang.T("col.scaleLastSync");
            colScaleLastStatus.HeaderText = UiLang.T("col.scaleStatus");

            lblAutoInfo.Text = UiLang.T("dash.autoInfo");
            btnInstallService.Text = UiLang.T("btn.installService");
            btnQuickSync.Text = UiLang.T("btn.quickSync");
            btnTestScale.Text = UiLang.T("btn.testScale");

            btnFetchProducts.Text = UiLang.T("btn.fetchProducts");
            btnSendToScale.Text = UiLang.T("btn.sendToScale");
            btnLoadFromDevice.Text = UiLang.T("btn.loadFromDevice");
            ConfigureProductsGrid();

            lblSelectScale.Text = UiLang.T("scale.select");
            btnConnect.Text = UiLang.T("btn.connect");
            btnGetWeight.Text = UiLang.T("btn.getWeight");
            btnClearPlu.Text = UiLang.T("btn.clearPlu");
            btnUploadSales.Text = UiLang.T("btn.uploadSales");
            btnSaleReport.Text = UiLang.T("btn.saleReport");

            lblApiBaseUrl.Text = UiLang.T("set.apiUrl");
            lblTenantCode.Text = UiLang.T("set.tenant");
            lblApiToken.Text = UiLang.T("set.token");
            lblProductsPath.Text = UiLang.T("set.productsPath");
            lblLfCodeBase.Text = UiLang.T("set.lfBase");
            lblSyncInterval.Text = UiLang.T("set.syncInterval");
            lblAuthMode.Text = UiLang.T("set.authMode");
            chkClearBeforeSend.Text = UiLang.T("set.clearBefore");
            chkSendHotkeys.Text = UiLang.T("set.sendHotkeys");
            chkAutoSync.Text = UiLang.T("set.autoSync");
            chkSyncOnStartup.Text = UiLang.T("set.syncOnStartup");
            btnSaveSettings.Text = UiLang.T("btn.saveSettings");
            btnTestApi.Text = UiLang.T("btn.testApi");

            UiLang.ApplyFormDirection(this);

            // RTL handle recreate sonrasi sekme basliklarini guvenli yenile.
            if (IsHandleCreated && mainTabs != null)
            {
                BeginInvoke(new Action(ApplyTabCaptions));
            }
        }

        private void InitializeSyncUi()
        {
            UiTheme.StylePanel(panelSyncToolbar);
        }

        private void InitializeLabelUi()
        {
            var lblRlsHome = new Label { AutoSize = true, Location = new Point(20, 400), Text = "RLS1000 klasoru" };
            txtRlsHome = new TextBox { Location = new Point(20, 420), Size = new Size(420, 23) };

            chkSendLabelOnSync = new CheckBox
            {
                AutoSize = true,
                Location = new Point(460, 422),
                Text = "Senkronda etiket de gonder",
            };

            panelSettings.Controls.Add(lblRlsHome);
            panelSettings.Controls.Add(txtRlsHome);
            panelSettings.Controls.Add(chkSendLabelOnSync);

            var lblLabelScr = new Label { AutoSize = true, Location = new Point(20, 132), Text = "Etiket sablonu (varsayilan: Megal logolu)" };
            txtLabelScr = new TextBox { Location = new Point(20, 152), Size = new Size(420, 23) };
            btnBrowseLabel = new Button { Location = new Point(448, 150), Size = new Size(90, 28), Text = "Sec..." };
            btnBrowseLabel.Click += btnBrowseLabel_Click;

            var lblLabelSlot = new Label { AutoSize = true, Location = new Point(20, 184), Text = "Etiket slotu (D0/D1)" };
            cmbLabelSlot = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Location = new Point(20, 204),
                Size = new Size(120, 23),
            };
            cmbLabelSlot.Items.AddRange(LabelSlotHelper.Slots.Cast<object>().ToArray());

            btnSendLabel = new Button { Location = new Point(160, 200), Size = new Size(170, 36), Text = "Etiketi Teraziye Gonder" };
            btnSendLabel.Click += btnSendLabel_Click;
            btnUseDefaultMegalLabel = new Button
            {
                Location = new Point(340, 200),
                Size = new Size(170, 36),
                Text = "Varsayilan Megal Etiket",
            };
            btnUseDefaultMegalLabel.Click += btnUseDefaultMegalLabel_Click;
            btnOpenLabelEditor = new Button { Location = new Point(520, 200), Size = new Size(150, 36), Text = "Etiket Editoru Ac" };
            btnOpenLabelEditor.Click += btnOpenLabelEditor_Click;

            // Onizleme, butonlarin ALTINA konur (saga binmez)
            lblLabelPreviewHint = new Label
            {
                AutoSize = true,
                Location = new Point(20, 460),
                Text = "Onizleme: Megal logo + MEGAL yazisi",
            };
            picLabelPreview = new PictureBox
            {
                Location = new Point(20, 480),
                Size = new Size(320, 200),
                BorderStyle = BorderStyle.FixedSingle,
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.White,
            };

            panelScale.Controls.Add(lblLabelScr);
            panelScale.Controls.Add(txtLabelScr);
            panelScale.Controls.Add(btnBrowseLabel);
            panelScale.Controls.Add(lblLabelSlot);
            panelScale.Controls.Add(cmbLabelSlot);
            panelScale.Controls.Add(btnSendLabel);
            panelScale.Controls.Add(btnUseDefaultMegalLabel);
            panelScale.Controls.Add(btnOpenLabelEditor);
            panelScale.Controls.Add(lblLabelPreviewHint);
            panelScale.Controls.Add(picLabelPreview);

            UiTheme.StyleTextBox(txtRlsHome);
            UiTheme.StyleTextBox(txtLabelScr);
            UiTheme.StyleComboBox(cmbLabelSlot);
            UiTheme.StyleCheckBox(chkSendLabelOnSync);
            UiTheme.StylePrimaryButton(btnSendLabel);
            UiTheme.StyleSecondaryButton(btnUseDefaultMegalLabel);
            UiTheme.StyleSecondaryButton(btnOpenLabelEditor);
            UiTheme.StyleSecondaryButton(btnBrowseLabel);
            lblRlsHome.ForeColor = UiTheme.Muted;
            lblLabelScr.ForeColor = UiTheme.Muted;
            lblLabelSlot.ForeColor = UiTheme.Muted;
            lblLabelPreviewHint.ForeColor = UiTheme.Muted;
        }

        private void InitializeScaleBarcodeUi()
        {
            lblBarcodeSettings = new Label
            {
                AutoSize = true,
                Location = new Point(20, 248),
                Text = "Kasap barkod ayarlari (tip 99) — 10 kg uzeri barkod icin paket limiti yok (PackageWeight=0)",
            };

            lblBarcodeType = new Label { AutoSize = true, Location = new Point(20, 272), Text = "Barkod tipi" };
            numBarcodeType = new NumericUpDown
            {
                Location = new Point(20, 292),
                Size = new Size(72, 23),
                Minimum = 0,
                Maximum = 99,
                Value = 99,
            };

            lblDepartment = new Label { AutoSize = true, Location = new Point(108, 272), Text = "Departman" };
            numDepartment = new NumericUpDown
            {
                Location = new Point(108, 292),
                Size = new Size(72, 23),
                Minimum = 0,
                Maximum = 99,
                Value = 21,
            };

            lblBarcode99Format = new Label { AutoSize = true, Location = new Point(196, 272), Text = "Format 99" };
            txtBarcode99Format = new TextBox
            {
                Location = new Point(196, 292),
                Size = new Size(180, 23),
                Text = "IIIIIIWWWWW",
            };

            lblWeightDecimals99 = new Label { AutoSize = true, Location = new Point(392, 272), Text = "Agirlik ondalik" };
            numWeightDecimals99 = new NumericUpDown
            {
                Location = new Point(392, 292),
                Size = new Size(72, 23),
                Minimum = 0,
                Maximum = 5,
                Value = 3,
            };

            chkSendFunctionSetOnSync = new CheckBox
            {
                AutoSize = true,
                Location = new Point(480, 294),
                Text = "Senkronda genel ayarlari da gonder",
            };

            btnSendFunctionSet = new Button
            {
                Location = new Point(20, 328),
                Size = new Size(220, 36),
                Text = "Genel Ayarlari Teraziye Gonder",
            };
            btnSendFunctionSet.Click += btnSendFunctionSet_Click;

            btnOpenDeviceData = new Button
            {
                Location = new Point(252, 328),
                Size = new Size(200, 36),
                Text = "Cihaz PLU / Veri Al",
            };
            btnOpenDeviceData.Click += btnOpenDeviceData_Click;
            panelScale.Controls.Add(btnOpenDeviceData);
            UiTheme.StylePrimaryButton(btnOpenDeviceData);

            panelScale.Controls.Add(lblBarcodeSettings);
            panelScale.Controls.Add(lblBarcodeType);
            panelScale.Controls.Add(numBarcodeType);
            panelScale.Controls.Add(lblDepartment);
            panelScale.Controls.Add(numDepartment);
            panelScale.Controls.Add(lblBarcode99Format);
            panelScale.Controls.Add(txtBarcode99Format);
            panelScale.Controls.Add(lblWeightDecimals99);
            panelScale.Controls.Add(numWeightDecimals99);
            panelScale.Controls.Add(chkSendFunctionSetOnSync);
            panelScale.Controls.Add(btnSendFunctionSet);
            // Onizleme en altta — butonlarin uzerine binmez
            panelScale.Controls.Add(lblLabelPreviewHint);
            panelScale.Controls.Add(picLabelPreview);

            UiTheme.StyleNumeric(numBarcodeType);
            UiTheme.StyleNumeric(numDepartment);
            UiTheme.StyleNumeric(numWeightDecimals99);
            UiTheme.StyleTextBox(txtBarcode99Format);
            UiTheme.StyleCheckBox(chkSendFunctionSetOnSync);
            UiTheme.StylePrimaryButton(btnSendFunctionSet);
            UiTheme.StylePrimaryButton(btnOpenDeviceData);
            lblBarcodeSettings.ForeColor = UiTheme.Text;
            lblBarcodeType.ForeColor = UiTheme.Muted;
            lblDepartment.ForeColor = UiTheme.Muted;
            lblBarcode99Format.ForeColor = UiTheme.Muted;
            lblWeightDecimals99.ForeColor = UiTheme.Muted;
        }

        private bool EnsureScaleDataTab()
        {
            try
            {
                if (!_scaleDataUiInitialized || tabScaleData == null || gridScalePlu == null)
                {
                    InitializeScaleDataUi();
                }
                else if (!mainTabs.TabPages.Contains(tabScaleData))
                {
                    InsertScaleDataTab();
                }

                return tabScaleData != null && mainTabs.TabPages.Contains(tabScaleData);
            }
            catch (Exception ex)
            {
                AppendLog("Cihaz Verileri sekmesi hatasi: " + ex.Message);
                MessageBox.Show(
                    "Cihaz Verileri sekmesi olusturulamadi:\n" + ex.Message,
                    "Cihaz Verileri",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return false;
            }
        }

        private void InsertScaleDataTab()
        {
            if (tabScaleData == null || mainTabs.TabPages.Contains(tabScaleData))
            {
                return;
            }

            var scalesIdx = mainTabs.TabPages.IndexOf(tabScales);
            var insertIndex = scalesIdx >= 0 ? scalesIdx + 1 : Math.Min(2, mainTabs.TabPages.Count);
            mainTabs.TabPages.Insert(insertIndex, tabScaleData);
        }

        private void InitializeScaleDataUi()
        {
            if (_scaleDataUiInitialized && tabScaleData != null && gridScalePlu != null)
            {
                InsertScaleDataTab();
                return;
            }

            tabScaleData = new TabPage
            {
                Text = "Cihaz Verileri",
                Padding = new Padding(12),
                BackColor = UiTheme.Background,
                UseVisualStyleBackColor = false,
            };
            panelScaleData = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(16),
                BackColor = UiTheme.Background,
                MinimumSize = new Size(400, 300),
            };

            lblScaleDataHint = new Label
            {
                AutoSize = false,
                Dock = DockStyle.Top,
                Height = 40,
                Text = "Terazideki PLU kayitlarini okuyun, duzenleyin ve teraziye geri yazin. Sira ve PLU No RLS1000 ile ayni kalir.",
            };

            var toolbar = new Panel { Dock = DockStyle.Top, Height = 88 };

            var lblScalePick = new Label { AutoSize = true, Location = new Point(0, 8), Text = "Terazi" };
            cmbScaleData = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Location = new Point(0, 28),
                Size = new Size(220, 23),
            };

            btnLoadScalePlu = new Button { Location = new Point(236, 24), Size = new Size(150, 36), Text = "Teraziden Oku" };
            btnSaveScalePlu = new Button { Location = new Point(394, 24), Size = new Size(150, 36), Text = "Teraziye Kaydet" };
            btnAddScalePluRow = new Button { Location = new Point(552, 24), Size = new Size(100, 36), Text = "Satir Ekle" };
            btnDeleteScalePluRow = new Button { Location = new Point(660, 24), Size = new Size(100, 36), Text = "Satir Sil" };
            btnExportScalePlu = new Button { Location = new Point(768, 24), Size = new Size(120, 36), Text = "Dosyaya Kaydet" };
            btnImportScalePlu = new Button { Location = new Point(236, 56), Size = new Size(150, 36), Text = "Dosyadan Yukle" };

            btnClearDevicePlu = new Button
            {
                Location = new Point(394, 56),
                Size = new Size(190, 36),
                Text = "Cihaz Verilerini Bosalt",
            };
            btnClearDevicePlu.Click += btnClearDevicePlu_Click;

            chkClearBeforePluSave = new CheckBox
            {
                AutoSize = true,
                Location = new Point(592, 64),
                Text = "Kaydetmeden once cihazdaki urun (PLU) verilerini temizle",
            };

            lblScaleDataCount = new Label
            {
                AutoSize = true,
                Location = new Point(660, 66),
                Text = "Kayit: 0",
            };

            btnLoadScalePlu.Click += btnLoadScalePlu_Click;
            btnSaveScalePlu.Click += btnSaveScalePlu_Click;
            btnAddScalePluRow.Click += btnAddScalePluRow_Click;
            btnDeleteScalePluRow.Click += btnDeleteScalePluRow_Click;
            btnExportScalePlu.Click += btnExportScalePlu_Click;
            btnImportScalePlu.Click += btnImportScalePlu_Click;

            toolbar.Controls.Add(lblScalePick);
            toolbar.Controls.Add(cmbScaleData);
            toolbar.Controls.Add(btnLoadScalePlu);
            toolbar.Controls.Add(btnSaveScalePlu);
            toolbar.Controls.Add(btnAddScalePluRow);
            toolbar.Controls.Add(btnDeleteScalePluRow);
            toolbar.Controls.Add(btnExportScalePlu);
            toolbar.Controls.Add(btnImportScalePlu);
            toolbar.Controls.Add(btnClearDevicePlu);
            toolbar.Controls.Add(chkClearBeforePluSave);
            toolbar.Controls.Add(lblScaleDataCount);

            gridScalePlu = new DataGridView
            {
                Dock = DockStyle.Fill,
                AllowUserToAddRows = false,
                AllowUserToDeleteRows = false,
                AutoGenerateColumns = false,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                ReadOnly = false,
                EditMode = DataGridViewEditMode.EditOnEnter,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            };

            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "PluRowNumber", HeaderText = "Sira", Width = 50, ReadOnly = true });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "LfCode", HeaderText = "PLU No", Width = 80 });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "HotKey", HeaderText = "Hotkey", Width = 60 });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "PluName", HeaderText = "Urun Adi", FillWeight = 180 });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "Code", HeaderText = "Barkod/Code", FillWeight = 100 });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "BarCode", HeaderText = "Barkod Tipi", Width = 80 });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "Price",
                HeaderText = "Fiyat",
                Width = 80,
                ValueType = typeof(int),
                DefaultCellStyle = new DataGridViewCellStyle
                {
                    Format = "0",
                    FormatProvider = CultureInfo.InvariantCulture,
                    Alignment = DataGridViewContentAlignment.MiddleRight,
                },
            });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "WeightUnit", HeaderText = "Birim Kod", Width = 70 });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "Department", HeaderText = "Departman", Width = 70 });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "ShelfDays", HeaderText = "Raf Omru", Width = 70 });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "LabelId", HeaderText = "Etiket", Width = 60 });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn
            {
                DataPropertyName = "PackageWeight",
                HeaderText = "Paket/Limit kg",
                Width = 90,
                DefaultCellStyle = new DataGridViewCellStyle { Format = "N3" },
            });
            gridScalePlu.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "PackageType", HeaderText = "Paket Tip", Width = 70 });

            gridScalePlu.DataSource = _devicePluList;
            gridScalePlu.Visible = true;

            // WinForms dock: Fill en once eklenir (en dusuk z-order); Top kontroller sonra eklenir.
            panelScaleData.Controls.Add(gridScalePlu);
            panelScaleData.Controls.Add(toolbar);
            panelScaleData.Controls.Add(lblScaleDataHint);
            tabScaleData.Controls.Add(panelScaleData);

            InsertScaleDataTab();
            panelScaleData.PerformLayout();

            UiTheme.StylePanel(panelScaleData);
            UiTheme.StylePanel(toolbar, card: false);
            UiTheme.StyleComboBox(cmbScaleData);
            UiTheme.StyleGrid(gridScalePlu);
            UiTheme.StylePrimaryButton(btnLoadScalePlu);
            UiTheme.StylePrimaryButton(btnSaveScalePlu);
            UiTheme.StyleSecondaryButton(btnAddScalePluRow);
            UiTheme.StyleSecondaryButton(btnDeleteScalePluRow);
            UiTheme.StyleSecondaryButton(btnExportScalePlu);
            UiTheme.StyleSecondaryButton(btnImportScalePlu);
            UiTheme.StyleSecondaryButton(btnClearDevicePlu);
            UiTheme.StyleCheckBox(chkClearBeforePluSave);
            lblScaleDataHint.ForeColor = UiTheme.Muted;
            lblScalePick.ForeColor = UiTheme.Muted;
            lblScaleDataCount.ForeColor = UiTheme.Muted;
            _scaleDataUiInitialized = true;
        }

        private void ShowDevicePluTab()
        {
            if (tabScaleData == null || !mainTabs.TabPages.Contains(tabScaleData))
            {
                return;
            }

            mainTabs.SelectedTab = tabScaleData;
            panelScaleData?.PerformLayout();
            if (gridScalePlu != null)
            {
                if (gridScalePlu.DataSource != _devicePluList)
                {
                    gridScalePlu.DataSource = _devicePluList;
                }

                gridScalePlu.Refresh();
                gridScalePlu.Invalidate();
            }
        }

        private void SyncScaleDataComboSelection()
        {
            RefreshScaleDataCombo();
            var scale = GetSelectedScale() ?? GetSelectedScaleForData();
            if (scale == null || cmbScaleData == null)
            {
                return;
            }

            for (var i = 0; i < cmbScaleData.Items.Count; i++)
            {
                if ((cmbScaleData.Items[i] as ScaleDeviceConfig)?.Id == scale.Id)
                {
                    cmbScaleData.SelectedIndex = i;
                    break;
                }
            }
        }

        private void InitializeCentralUi()
        {
            var lblFirm = new Label { AutoSize = true, Location = new Point(20, 456), Text = "Firma" };
            cmbFirm = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Location = new Point(20, 476),
                Size = new Size(180, 23),
            };
            cmbFirm.SelectedIndexChanged += cmbFirm_SelectedIndexChanged;

            var lblPeriod = new Label { AutoSize = true, Location = new Point(220, 456), Text = "Donem" };
            cmbPeriod = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Location = new Point(220, 476),
                Size = new Size(180, 23),
            };
            cmbPeriod.SelectedIndexChanged += cmbPeriod_SelectedIndexChanged;

            var lblStore = new Label { AutoSize = true, Location = new Point(420, 456), Text = "Magaza (merkez DB)" };
            cmbStore = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Location = new Point(420, 476),
                Size = new Size(240, 23),
            };
            cmbStore.SelectedIndexChanged += cmbStore_SelectedIndexChanged;

            var lblSyncMode = new Label { AutoSize = true, Location = new Point(20, 508), Text = "Senkron modu" };
            cmbSyncMode = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Location = new Point(20, 528),
                Size = new Size(220, 23),
            };
            cmbSyncMode.Items.AddRange(new object[]
            {
                "local_auto",
                "central_command",
                "hybrid",
            });

            chkIncrementalSync = new CheckBox
            {
                AutoSize = true,
                Location = new Point(260, 530),
                Text = "Sadece degisen urunleri gonder (otomatik)",
                Checked = true,
            };

            panelSettings.Controls.Add(chkIncrementalSync);
            panelSettings.Controls.Add(lblFirm);
            panelSettings.Controls.Add(cmbFirm);
            panelSettings.Controls.Add(lblPeriod);
            panelSettings.Controls.Add(cmbPeriod);
            panelSettings.Controls.Add(lblStore);
            panelSettings.Controls.Add(cmbStore);
            panelSettings.Controls.Add(lblSyncMode);
            panelSettings.Controls.Add(cmbSyncMode);

            UiTheme.StyleComboBox(cmbFirm);
            UiTheme.StyleComboBox(cmbPeriod);
            UiTheme.StyleComboBox(cmbStore);
            UiTheme.StyleComboBox(cmbSyncMode);
            UiTheme.StyleCheckBox(chkIncrementalSync);
            lblFirm.ForeColor = UiTheme.Muted;
            lblPeriod.ForeColor = UiTheme.Muted;
            lblStore.ForeColor = UiTheme.Muted;
            lblSyncMode.ForeColor = UiTheme.Muted;

            tabCentral = new TabPage { Text = "Merkez Durum", Padding = new Padding(12) };
            panelCentral = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };
            lblCentralHint = new Label
            {
                AutoSize = false,
                Dock = DockStyle.Top,
                Height = 48,
                Text = "Cihaz özeti: son transfer, watermark ve bekleyen değişiklikler. Detaylı transfer kayıtları «İşlem Günlüğü» sekmesinde (son 7 gün).",
            };

            btnRefreshCentral = new Button { Text = "Merkezden Yenile", Width = 150, Height = 36, Location = new Point(0, 56) };
            btnRegisterScales = new Button { Text = "Terazileri Merkeze Kaydet", Width = 190, Height = 36, Location = new Point(160, 56) };
            btnCreateCentralCommand = new Button { Text = "Degisenleri Gonder Emri", Width = 190, Height = 36, Location = new Point(360, 56) };
            btnCreateCentralFullCommand = new Button { Text = "Tumunu Gonder Emri", Width = 170, Height = 36, Location = new Point(560, 56) };
            btnPollCentralCommands = new Button { Text = "Merkez Emirlerini Al", Width = 170, Height = 36, Location = new Point(740, 56) };

            btnRefreshCentral.Click += btnRefreshCentral_Click;
            btnRegisterScales.Click += btnRegisterScales_Click;
            btnCreateCentralCommand.Click += btnCreateCentralCommand_Click;
            btnCreateCentralFullCommand.Click += btnCreateCentralFullCommand_Click;
            btnPollCentralCommands.Click += btnPollCentralCommands_Click;

            gridCentralStatus = new DataGridView
            {
                Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
                Location = new Point(0, 104),
                Size = new Size(920, 320),
                ReadOnly = true,
                AllowUserToAddRows = false,
                RowHeadersVisible = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            };
            gridCentralStatus.Columns.Add("colWhen", "Son Transfer");
            gridCentralStatus.Columns.Add("colScale", "Terazi");
            gridCentralStatus.Columns.Add("colStatus", "Durum");
            gridCentralStatus.Columns.Add("colMessage", "Özet");

            panelCentral.Controls.Add(gridCentralStatus);
            panelCentral.Controls.Add(btnPollCentralCommands);
            panelCentral.Controls.Add(btnCreateCentralFullCommand);
            panelCentral.Controls.Add(btnCreateCentralCommand);
            panelCentral.Controls.Add(btnRegisterScales);
            panelCentral.Controls.Add(btnRefreshCentral);
            panelCentral.Controls.Add(lblCentralHint);
            tabCentral.Controls.Add(panelCentral);
            var syncIndex = mainTabs.TabPages.IndexOf(tabSync);
            var centralInsert = syncIndex >= 0 ? syncIndex + 1 : mainTabs.TabPages.Count;
            mainTabs.TabPages.Insert(centralInsert, tabCentral);

            // İşlem günlüğü: Merkez Durum'dan ayrıldı; 7 gün kuralı yalnızca WinForm'da
            tabTransferLog = new TabPage { Text = "İşlem Günlüğü", Padding = new Padding(12) };
            panelTransferLog = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };
            lblTransferLogHint = new Label
            {
                AutoSize = false,
                Dock = DockStyle.Top,
                Height = 40,
                Text = "device_sync_transfer_log — yalnızca son " + TransferLogMaxAgeDays
                    + " gün. Daha eski kayıtlar bu ekranda gösterilmez (WinForm kuralı).",
            };
            btnRefreshTransferLog = new Button
            {
                Text = "Günlüğü Yenile",
                Width = 150,
                Height = 36,
                Location = new Point(0, 48),
            };
            btnRefreshTransferLog.Click += async (s, e) =>
            {
                SaveSettingsFromUi();
                await RefreshTransferLogAsync().ConfigureAwait(true);
            };

            gridTransferLog = new DataGridView
            {
                Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
                Location = new Point(0, 96),
                Size = new Size(920, 330),
                ReadOnly = true,
                AllowUserToAddRows = false,
                RowHeadersVisible = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            };
            gridTransferLog.Columns.Add("colLogWhen", "Zaman");
            gridTransferLog.Columns.Add("colLogScale", "Terazi");
            gridTransferLog.Columns.Add("colLogProduct", "Ürün");
            gridTransferLog.Columns.Add("colLogBarcode", "Barkod");
            gridTransferLog.Columns.Add("colLogUnit", "Birim");
            gridTransferLog.Columns.Add("colLogStatus", "Durum");
            gridTransferLog.Columns.Add("colLogMessage", "Mesaj");

            panelTransferLog.Controls.Add(gridTransferLog);
            panelTransferLog.Controls.Add(btnRefreshTransferLog);
            panelTransferLog.Controls.Add(lblTransferLogHint);
            tabTransferLog.Controls.Add(panelTransferLog);
            mainTabs.TabPages.Insert(centralInsert + 1, tabTransferLog);

            UiTheme.StylePanel(panelCentral);
            UiTheme.StylePanel(panelTransferLog);
            UiTheme.StyleGrid(gridCentralStatus);
            UiTheme.StyleGrid(gridTransferLog);
            UiTheme.StylePrimaryButton(btnCreateCentralCommand);
            UiTheme.StylePrimaryButton(btnCreateCentralFullCommand);
            UiTheme.StylePrimaryButton(btnPollCentralCommands);
            UiTheme.StyleSecondaryButton(btnRefreshCentral);
            UiTheme.StyleSecondaryButton(btnRegisterScales);
            UiTheme.StyleSecondaryButton(btnRefreshTransferLog);
            lblCentralHint.ForeColor = UiTheme.Muted;
            lblTransferLogHint.ForeColor = UiTheme.Muted;
        }

        private void Form1_Load(object sender, EventArgs e)
        {
            ApplyApplicationIcon();
            ApplyTheme();
            EnsureScaleDataTab();
            try
            {
                RongtaPaths.EnsureWritableAssets();
            }
            catch (Exception ex)
            {
                // ProgramData yazilamazsa yine de UI acilsin
                AppendLog("Rongta dosya senkronu: " + ex.Message);
            }

            LoadSettingsToUi();
            // Load sirasinda TabControl henuz kararli degilse (IndexOf=-1) HandleCreated/BeginInvoke ile uygula.
            void applyUi()
            {
                try { ApplyLocalizedUi(); }
                catch (Exception ex) { AppendLog("UI dil uygulanamadi: " + ex.Message); }
            }
            if (mainTabs != null && mainTabs.IsHandleCreated)
            {
                applyUi();
            }
            else if (mainTabs != null)
            {
                EventHandler onTabsReady = null;
                onTabsReady = (s, ev) =>
                {
                    mainTabs.HandleCreated -= onTabsReady;
                    applyUi();
                };
                mainTabs.HandleCreated += onTabsReady;
            }
            else
            {
                applyUi();
            }
            _syncEngine.Log += AppendLog;
            UpdateDashboard();

            AppendLog("RetailEX Terazi Yoneticisi — Varsayilan etiket: Megal (retailex_logoluetiket.scr).");
            statusLabel.Text = "Config: " + AppConfig.DefaultConfigPath;

            if (_config.AutoSyncEnabled && _config.ShouldRunAutoTimerSync())
            {
                syncTimer.Interval = Math.Max(1, _config.SyncIntervalMinutes) * 60 * 1000;
                syncTimer.Start();
            }
            else if (_config.AutoSyncEnabled && _config.UsesCentralCommands())
            {
                syncTimer.Interval = Math.Max(15, _config.CommandPollIntervalSeconds) * 1000;
                syncTimer.Start();
            }

            if (!_config.IsReadyForAutoSync())
            {
                AppendLog("Yapilandirma eksik: Kiracı kodu + terazi listesi (Teraziler sekmesi). Token yoksa AuthMode=none kullanin.");
                statusBadge.Text = UiLang.T("msg.configNeeded");
                statusBadge.ForeColor = UiTheme.Warning;
                mainTabs.SelectedTab = tabScales;
                return;
            }

            if (_config.SyncOnStartup && _config.AutoSyncEnabled)
            {
                AppendLog("Acilis senkronu baslatiliyor...");
                BeginInvoke(new Action(async () => await RunSyncUiAsync(silent: true, trigger: "auto")));
            }

            BeginInvoke(new Action(async () => await LoadMasterDataAsync()));
        }

        private void ApplyApplicationIcon()
        {
            try
            {
                var icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (icon == null)
                {
                    return;
                }

                Icon = icon;
                notifyIcon1.Icon = icon;
            }
            catch
            {
                // Icon is optional at runtime; exe still carries ApplicationIcon from build.
            }
        }

        private void ApplyTheme()
        {
            UiTheme.ApplyForm(this);
            UiTheme.StylePanel(headerPanel, false);
            UiTheme.StylePanel(panelDashboard);
            UiTheme.StylePanel(panelScales);
            UiTheme.StylePanel(panelSync);
            if (panelSyncToolbar != null) UiTheme.StylePanel(panelSyncToolbar);
            panelScale.AutoScroll = true;
            UiTheme.StylePanel(panelScale);
            if (panelScaleData != null)
            {
                UiTheme.StylePanel(panelScaleData);
                panelScaleData.BackColor = UiTheme.Background;
            }
            if (tabScaleData != null)
            {
                tabScaleData.BackColor = UiTheme.Background;
                tabScaleData.UseVisualStyleBackColor = false;
            }
            UiTheme.StylePanel(panelSettings);
            UiTheme.StylePanel(panelCentral);
            if (panelTransferLog != null) UiTheme.StylePanel(panelTransferLog);
            UiTheme.StyleTabControl(mainTabs);
            UiTheme.StyleGrid(gridProducts);
            UiTheme.StyleGrid(gridScales);
            if (gridScalePlu != null) UiTheme.StyleGrid(gridScalePlu);
            if (gridCentralStatus != null) UiTheme.StyleGrid(gridCentralStatus);
            if (gridTransferLog != null) UiTheme.StyleGrid(gridTransferLog);
            ConfigureProductsGrid();

            lblTitle.ForeColor = UiTheme.Text;
            lblSubtitle.ForeColor = UiTheme.Muted;
            statusBadge.ForeColor = UiTheme.Success;
            statusBadge.BackColor = UiTheme.Panel;
            statusStrip.BackColor = UiTheme.Panel;
            statusStrip.ForeColor = UiTheme.Muted;
            txtLog.BackColor = UiTheme.InputBg;
            txtLog.ForeColor = UiTheme.Text;

            foreach (Control c in GetAllControls(this))
            {
                if (c is Label lbl && lbl != lblTitle && lbl != statusBadge)
                {
                    if (lbl.ForeColor == SystemColors.ControlText || lbl.ForeColor == Color.Black)
                    {
                        lbl.ForeColor = UiTheme.Muted;
                    }
                }
            }

            StyleButtons();
        }

        private void ConfigureProductsGrid()
        {
            gridProducts.Dock = DockStyle.Fill;
            gridProducts.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            gridProducts.ScrollBars = ScrollBars.Both;

            var leftAlign = new DataGridViewCellStyle
            {
                Alignment = DataGridViewContentAlignment.MiddleLeft,
            };
            var rightAlign = new DataGridViewCellStyle
            {
                Alignment = DataGridViewContentAlignment.MiddleRight,
            };
            colPlu.DisplayIndex = 0;
            colPlu.HeaderText = UiLang.T("col.plu");
            colPlu.MinimumWidth = 72;
            colPlu.FillWeight = 70;
            colPlu.Visible = true;
            colPlu.DefaultCellStyle = leftAlign;

            colName.DisplayIndex = 1;
            colName.HeaderText = UiLang.T("col.productName");
            colName.MinimumWidth = 120;
            colName.FillWeight = 200;
            colName.Visible = true;
            colName.DefaultCellStyle = leftAlign;

            colBarcode.DisplayIndex = 2;
            colBarcode.HeaderText = UiLang.T("col.barcode");
            colBarcode.MinimumWidth = 90;
            colBarcode.FillWeight = 110;
            colBarcode.Visible = true;
            colBarcode.DefaultCellStyle = leftAlign;

            colPrice.DisplayIndex = 3;
            colPrice.HeaderText = UiLang.T("col.price");
            colPrice.MinimumWidth = 90;
            colPrice.FillWeight = 90;
            colPrice.Visible = true;
            colPrice.ValueType = typeof(int);
            colPrice.DefaultCellStyle = new DataGridViewCellStyle
            {
                Format = "0",
                FormatProvider = CultureInfo.InvariantCulture,
                Alignment = DataGridViewContentAlignment.MiddleRight,
                NullValue = "0",
            };
            colPrice.HeaderCell.Style.Alignment = DataGridViewContentAlignment.MiddleRight;

            colUnit.DisplayIndex = 4;
            colUnit.HeaderText = UiLang.T("col.unit");
            colUnit.MinimumWidth = 55;
            colUnit.FillWeight = 55;
            colUnit.Visible = true;
            colUnit.DefaultCellStyle = new DataGridViewCellStyle
            {
                Alignment = DataGridViewContentAlignment.MiddleCenter,
            };

            colShelfLife.DisplayIndex = 5;
            colShelfLife.HeaderText = UiLang.T("col.shelfLife");
            colShelfLife.MinimumWidth = 70;
            colShelfLife.FillWeight = 70;
            colShelfLife.Visible = true;
            colShelfLife.ValueType = typeof(int);
            colShelfLife.DefaultCellStyle = new DataGridViewCellStyle
            {
                Alignment = DataGridViewContentAlignment.MiddleCenter,
                Format = "0",
                FormatProvider = CultureInfo.InvariantCulture,
                NullValue = "0",
            };
        }

        private void StyleButtons()
        {
            UiTheme.StylePrimaryButton(btnQuickSync);
            UiTheme.StylePrimaryButton(btnFetchProducts);
            UiTheme.StylePrimaryButton(btnSendToScale);
            if (btnLoadFromDevice != null) UiTheme.StylePrimaryButton(btnLoadFromDevice);
            UiTheme.StylePrimaryButton(btnSaveSettings);
            UiTheme.StylePrimaryButton(btnInstallService);
            UiTheme.StylePrimaryButton(btnAddScale);
            UiTheme.StyleSecondaryButton(btnRemoveScale);
            UiTheme.StyleSecondaryButton(btnTestScale);
            UiTheme.StyleSecondaryButton(btnTestApi);
            UiTheme.StyleSecondaryButton(btnConnect);
            UiTheme.StyleSecondaryButton(btnGetWeight);
            UiTheme.StyleSecondaryButton(btnClearPlu);
            if (btnClearDevicePlu != null) UiTheme.StyleSecondaryButton(btnClearDevicePlu);
            UiTheme.StyleSecondaryButton(btnUploadSales);
            UiTheme.StylePrimaryButton(btnSaleReport);
            UiTheme.StylePrimaryButton(btnLoadScalePlu);
            UiTheme.StylePrimaryButton(btnSaveScalePlu);
            UiTheme.StyleSecondaryButton(btnAddScalePluRow);
            UiTheme.StyleSecondaryButton(btnDeleteScalePluRow);
            UiTheme.StyleSecondaryButton(btnExportScalePlu);
            UiTheme.StyleSecondaryButton(btnImportScalePlu);
            if (chkClearBeforePluSave != null) UiTheme.StyleCheckBox(chkClearBeforePluSave);

            UiTheme.StyleTextBox(txtApiBaseUrl);
            UiTheme.StyleTextBox(txtTenantCode);
            UiTheme.StyleTextBox(txtApiToken);
            UiTheme.StyleTextBox(txtProductsPath);
            UiTheme.StyleComboBox(cmbScale);
            UiTheme.StyleComboBox(cmbAuthMode);
            UiTheme.StyleComboBox(cmbFirm);
            UiTheme.StyleComboBox(cmbPeriod);
            UiTheme.StyleComboBox(cmbStore);
            UiTheme.StyleComboBox(cmbSyncMode);
            UiTheme.StyleNumeric(numLfCodeBase);
            UiTheme.StyleNumeric(numSyncInterval);
            UiTheme.StyleCheckBox(chkSyncOnStartup);
            UiTheme.StyleCheckBox(chkAutoSync);
            UiTheme.StyleCheckBox(chkSendHotkeys);
            UiTheme.StyleCheckBox(chkClearBeforeSend);
            if (chkIncrementalSync != null) UiTheme.StyleCheckBox(chkIncrementalSync);
            UiTheme.StyleSecondaryButton(btnSendFunctionSet);
            UiTheme.StyleNumeric(numBarcodeType);
            UiTheme.StyleNumeric(numDepartment);
            UiTheme.StyleNumeric(numWeightDecimals99);
            if (chkSendFunctionSetOnSync != null) UiTheme.StyleCheckBox(chkSendFunctionSetOnSync);
        }

        private IEnumerable<Control> GetAllControls(Control root)
        {
            foreach (Control c in root.Controls)
            {
                yield return c;
                foreach (var child in GetAllControls(c)) yield return child;
            }
        }

        private void LoadSettingsToUi()
        {
            _config = AppConfig.Load();
            _syncEngine.ReloadConfig();
            txtApiBaseUrl.Text = _config.ApiBaseUrl;
            txtTenantCode.Text = _config.TenantCode;
            txtApiToken.Text = _config.ApiToken;
            txtProductsPath.Text = _config.ProductsPath;
            numLfCodeBase.Value = Math.Max(0, Math.Min(numLfCodeBase.Maximum, _config.LfCodeBase));
            numSyncInterval.Value = Math.Max(numSyncInterval.Minimum, Math.Min(numSyncInterval.Maximum, _config.SyncIntervalMinutes));
            chkClearBeforeSend.Checked = _config.ClearBeforeSend;
            chkSendHotkeys.Checked = _config.SendHotkeys;
            chkAutoSync.Checked = _config.AutoSyncEnabled;
            chkSyncOnStartup.Checked = _config.SyncOnStartup;
            txtRlsHome.Text = _config.RlsHomePath;
            txtLabelScr.Text = _config.ResolveLabelScrPath();
            chkSendLabelOnSync.Checked = _config.SendLabelOnSync;
            RefreshLabelPreview();
            chkIncrementalSync.Checked = _config.IncrementalSyncEnabled;
            numBarcodeType.Value = Math.Max(numBarcodeType.Minimum, Math.Min(numBarcodeType.Maximum, _config.DefaultBarcodeType));
            numDepartment.Value = Math.Max(numDepartment.Minimum, Math.Min(numDepartment.Maximum, _config.DefaultDepartment));
            txtBarcode99Format.Text = string.IsNullOrWhiteSpace(_config.Barcode99Format) ? "IIIIIIWWWWW" : _config.Barcode99Format;
            numWeightDecimals99.Value = Math.Max(numWeightDecimals99.Minimum, Math.Min(numWeightDecimals99.Maximum, _config.Barcode99WeightDecimals));
            chkSendFunctionSetOnSync.Checked = _config.SendFunctionSetOnSync;
            _scaleService.RlsHomePath = _config.RlsHomePath;
            _scaleService.SyncConfig = _config;

            var slot = (_config.LabelSlot ?? "D0").Trim().ToUpperInvariant();
            if (cmbLabelSlot.Items.Contains(slot)) cmbLabelSlot.SelectedItem = slot;
            else if (cmbLabelSlot.Items.Count > 0) cmbLabelSlot.SelectedIndex = 0;

            var authMode = (_config.AuthMode ?? "none").Trim().ToLowerInvariant();
            if (cmbAuthMode.Items.Contains(authMode))
            {
                cmbAuthMode.SelectedItem = authMode;
            }
            else
            {
                cmbAuthMode.SelectedItem = "none";
            }

            var syncMode = (_config.SyncMode ?? "local_auto").Trim().ToLowerInvariant();
            if (cmbSyncMode.Items.Contains(syncMode))
            {
                cmbSyncMode.SelectedItem = syncMode;
            }
            else
            {
                cmbSyncMode.SelectedItem = "local_auto";
            }

            BindMasterSelections();
            LoadScalesToGrid();
            RefreshScaleDataCombo();
            TryApplyBarcodeSettings();

            _languageUiReady = false;
            UiLang.SetLanguage(_config.UiLanguage ?? UiLang.Tr);
            UiLang.SelectLanguageCombo(cmbLanguage, UiLang.Code);
            _languageUiReady = true;
        }

        private void TryApplyBarcodeSettings()
        {
            try
            {
                ScaleService.ApplyBarcodeSettings(_config);
            }
            catch (IOException ex)
            {
                AppendLog("UYARI: " + ex.Message);
            }
        }

        private void BindMasterSelections()
        {
            BindCombo(cmbFirm, _firms, "DisplayText", f => f.FirmNr, _config.FirmNr);
            BindCombo(cmbPeriod, _periods, "DisplayText", p => p.Nr.ToString("00"), _config.PeriodNr);
            BindCombo(cmbStore, _stores, "DisplayText", s => s.Id, _config.StoreId);
        }

        private static void BindCombo<T>(
            ComboBox combo,
            IList<T> items,
            string displayMember,
            Func<T, string> valueSelector,
            string selectedValue)
        {
            combo.DisplayMember = displayMember;
            combo.ValueMember = null;
            combo.Items.Clear();
            foreach (var item in items ?? new List<T>())
            {
                combo.Items.Add(item);
            }

            if (items == null || items.Count == 0) return;

            for (var i = 0; i < combo.Items.Count; i++)
            {
                var item = (T)combo.Items[i];
                if (string.Equals(valueSelector(item), selectedValue, StringComparison.OrdinalIgnoreCase))
                {
                    combo.SelectedIndex = i;
                    return;
                }
            }

            combo.SelectedIndex = 0;
        }

        private async Task LoadMasterDataAsync()
        {
            try
            {
                _firms = await _centralService.FetchFirmsAsync(_config).ConfigureAwait(true);
                var selectedFirm = _firms.FirstOrDefault(f =>
                    string.Equals(f.FirmNr, _config.FirmNr, StringComparison.OrdinalIgnoreCase))
                    ?? _firms.FirstOrDefault();

                if (selectedFirm != null)
                {
                    _config.FirmNr = selectedFirm.FirmNr;
                    _config.FirmId = selectedFirm.Id;
                    _periods = await _centralService.FetchPeriodsAsync(_config, selectedFirm.Id).ConfigureAwait(true);
                    _stores = await _centralService.FetchStoresAsync(_config, selectedFirm.FirmNr).ConfigureAwait(true);
                }

                BindMasterSelections();
            }
            catch (Exception ex)
            {
                AppendLog("Merkez master veri uyarisi: " + ex.Message);
            }
        }

        private async void cmbFirm_SelectedIndexChanged(object sender, EventArgs e)
        {
            var firm = cmbFirm.SelectedItem as FirmDto;
            if (firm == null) return;

            _config.FirmNr = firm.FirmNr;
            _config.FirmId = firm.Id;
            _config.RefreshProductsPathFromSelection();
            txtProductsPath.Text = _config.ProductsPath;

            try
            {
                _periods = await _centralService.FetchPeriodsAsync(_config, firm.Id).ConfigureAwait(true);
                _stores = await _centralService.FetchStoresAsync(_config, firm.FirmNr).ConfigureAwait(true);
                BindMasterSelections();
            }
            catch (Exception ex)
            {
                AppendLog("Donem/magaza yukleme hatasi: " + ex.Message);
            }
        }

        private void cmbPeriod_SelectedIndexChanged(object sender, EventArgs e)
        {
            var period = cmbPeriod.SelectedItem as PeriodDto;
            if (period == null) return;
            _config.PeriodNr = period.Nr.ToString("00");
        }

        private void cmbStore_SelectedIndexChanged(object sender, EventArgs e)
        {
            var store = cmbStore.SelectedItem as StoreDto;
            if (store == null) return;
            _config.StoreId = store.Id;
            _config.StoreCode = store.FirmNr;
            _config.StoreName = store.Name;
        }

        private void LoadScalesToGrid()
        {
            gridScales.Rows.Clear();
            _config.EnsureDefaultScale();
            foreach (var scale in _config.Scales)
            {
                if (scale == null) continue;
                var rowIndex = gridScales.Rows.Add(
                    scale.Name,
                    scale.IpAddress,
                    scale.Enabled,
                    string.IsNullOrWhiteSpace(scale.LastSync) ? "—" : scale.LastSync,
                    string.IsNullOrWhiteSpace(scale.LastStatus) ? "—" : scale.LastStatus);
                gridScales.Rows[rowIndex].Tag = scale;
            }
            RefreshScaleCombo();
        }

        private void SaveScalesFromGrid()
        {
            var scales = new List<ScaleDeviceConfig>();
            foreach (DataGridViewRow row in gridScales.Rows)
            {
                if (row.IsNewRow) continue;

                var existing = row.Tag as ScaleDeviceConfig;
                var scale = new ScaleDeviceConfig
                {
                    Id = existing?.Id ?? Guid.NewGuid().ToString("N"),
                    Name = Convert.ToString(row.Cells[colScaleName.Index].Value ?? "").Trim(),
                    IpAddress = Convert.ToString(row.Cells[colScaleIp.Index].Value ?? "").Trim(),
                    Enabled = row.Cells[colScaleEnabled.Index].Value is bool enabled && enabled,
                    LastSync = existing?.LastSync,
                    LastProductCount = existing?.LastProductCount ?? 0,
                    LastFailedCount = existing?.LastFailedCount ?? 0,
                    LastStatus = existing?.LastStatus,
                    CentralDeviceId = existing?.CentralDeviceId,
                    StoreDeviceRecordId = existing?.StoreDeviceRecordId,
                    LabelScrPath = existing?.LabelScrPath,
                    LabelSlot = existing?.LabelSlot,
                };

                if (string.IsNullOrWhiteSpace(scale.Name))
                {
                    scale.Name = "Terazi " + (scales.Count + 1);
                }

                scales.Add(scale);
                row.Tag = scale;
            }

            _config.Scales = scales;
            if (_config.Scales.Count > 0)
            {
                _config.ScaleIp = _config.Scales[0].IpAddress;
            }
            RefreshScaleCombo();
        }

        private void RefreshScaleCombo()
        {
            var previous = cmbScale.SelectedItem as ScaleDeviceConfig;
            cmbScale.Items.Clear();
            foreach (var scale in _config.Scales ?? new List<ScaleDeviceConfig>())
            {
                if (scale == null) continue;
                cmbScale.Items.Add(scale);
            }

            cmbScale.DisplayMember = "Name";
            if (previous != null)
            {
                var match = _config.Scales.FirstOrDefault(s => s != null && s.Id == previous.Id);
                if (match != null)
                {
                    cmbScale.SelectedItem = match;
                }
            }

            if (cmbScale.SelectedIndex < 0 && cmbScale.Items.Count > 0)
            {
                cmbScale.SelectedIndex = 0;
            }

            RefreshScaleDataCombo();
        }

        private void RefreshScaleDataCombo()
        {
            if (cmbScaleData == null) return;

            var previous = cmbScaleData.SelectedItem as ScaleDeviceConfig;
            cmbScaleData.Items.Clear();
            foreach (var scale in _config.Scales ?? new List<ScaleDeviceConfig>())
            {
                if (scale == null) continue;
                cmbScaleData.Items.Add(scale);
            }

            cmbScaleData.DisplayMember = "Name";
            if (previous != null)
            {
                var match = _config.Scales.FirstOrDefault(s => s != null && s.Id == previous.Id);
                if (match != null)
                {
                    cmbScaleData.SelectedItem = match;
                }
            }

            if (cmbScaleData.SelectedIndex < 0 && cmbScaleData.Items.Count > 0)
            {
                cmbScaleData.SelectedIndex = 0;
            }
        }

        private ScaleDeviceConfig GetSelectedScaleForData()
        {
            return cmbScaleData?.SelectedItem as ScaleDeviceConfig ?? GetSelectedScale();
        }

        private void BindDevicePluList(IList<ScalePluRecord> records)
        {
            _devicePluList.RaiseListChangedEvents = false;
            _devicePluList.Clear();
            var order = 0;
            foreach (var record in records ?? new List<ScalePluRecord>())
            {
                record.PluOrder = order;
                _devicePluList.Add(record);
                order++;
            }

            _devicePluList.RaiseListChangedEvents = true;
            _devicePluList.ResetBindings();
            if (lblScaleDataCount != null)
            {
                lblScaleDataCount.Text = "Kayit: " + _devicePluList.Count;
            }

            if (gridScalePlu != null && gridScalePlu.DataSource != _devicePluList)
            {
                gridScalePlu.DataSource = _devicePluList;
            }
        }

        private async void btnLoadScalePlu_Click(object sender, EventArgs e)
        {
            await LoadDevicePluFromScaleAsync(showSuccessMessage: true, switchToDeviceTab: true);
        }

        private async Task LoadDevicePluFromScaleAsync(bool showSuccessMessage, bool switchToDeviceTab)
        {
            if (_busy) return;
            if (!EnsureScaleDataTab())
            {
                return;
            }

            SyncScaleDataComboSelection();
            var scale = GetSelectedScaleForData();
            if (scale == null || string.IsNullOrWhiteSpace(scale.IpAddress))
            {
                MessageBox.Show("Terazi secin.", "Cihaz Verileri", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            _busy = true;
            SetBusy(true);
            try
            {
                SaveSettingsFromUi();
                var ip = scale.IpAddress;
                var records = await Task.Run(() =>
                {
                    string msg;
                    var list = _scaleService.FetchPluRecords(ip, out msg);
                    return new { list, msg };
                }).ConfigureAwait(true);

                BindDevicePluList(records.list);
                if (switchToDeviceTab)
                {
                    ShowDevicePluTab();
                }

                AppendLog(records.msg);
                if (showSuccessMessage)
                {
                    MessageBox.Show(records.msg, "Terazi PLU", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            catch (Exception ex)
            {
                AppendLog("PLU okuma hatasi: " + ex.Message);
                MessageBox.Show(ex.Message, "Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                _busy = false;
                SetBusy(false);
            }
        }

        private async void btnSaveScalePlu_Click(object sender, EventArgs e)
        {
            if (_busy) return;
            var scale = GetSelectedScaleForData();
            if (scale == null || string.IsNullOrWhiteSpace(scale.IpAddress))
            {
                MessageBox.Show("Terazi secin.", "Cihaz Verileri", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            if (_devicePluList.Count == 0)
            {
                MessageBox.Show("Kaydedilecek PLU yok. Once teraziden okuyun veya satir ekleyin.", "Cihaz Verileri",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            gridScalePlu.EndEdit();

            var duplicates = _devicePluList
                .GroupBy(r => r.LfCode)
                .Where(g => g.Key > 0 && g.Count() > 1)
                .Select(g => g.Key)
                .ToList();
            if (duplicates.Count > 0)
            {
                MessageBox.Show("Ayni LF kodu birden fazla satirda var: " + string.Join(", ", duplicates),
                    "Cihaz Verileri", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var barcodeConflicts = PluJsonMapper.FindBarcodeNameConflicts(_devicePluList);
            if (barcodeConflicts.Count > 0)
            {
                var conflictText = string.Join(Environment.NewLine, barcodeConflicts.Take(15));
                if (barcodeConflicts.Count > 15)
                {
                    conflictText += Environment.NewLine + "... ve " + (barcodeConflicts.Count - 15) + " uyumsuzluk daha";
                }

                var proceed = MessageBox.Show(
                    "Ayni barkod numarasi farkli urun adlariyla kullaniliyor:" + Environment.NewLine + Environment.NewLine
                    + conflictText + Environment.NewLine + Environment.NewLine + "Yine de kaydetmek istiyor musunuz?",
                    "Barkod Uyumsuzlugu",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning);
                if (proceed != DialogResult.Yes) return;
            }

            _busy = true;
            SetBusy(true);
            try
            {
                SaveSettingsFromUi();
                var ip = scale.IpAddress;
                var records = _devicePluList.ToList();
                var clearFirst = chkClearBeforePluSave != null && chkClearBeforePluSave.Checked;
                var result = await Task.Run(() => _scaleService.SendPluRecords(ip, records, clearFirst)).ConfigureAwait(true);
                AppendLog(result.Message);
                MessageBox.Show(
                    result.Message,
                    result.Success ? "Teraziye Kaydedildi" : "Kayit Uyarisi",
                    MessageBoxButtons.OK,
                    result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
            }
            catch (Exception ex)
            {
                AppendLog("PLU kayit hatasi: " + ex.Message);
                MessageBox.Show(ex.Message, "Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                _busy = false;
                SetBusy(false);
            }
        }

        private void btnAddScalePluRow_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            var nextLf = 1;
            if (_devicePluList.Count > 0)
            {
                nextLf = Math.Max(1, _devicePluList.Max(r => r.LfCode) + 1);
            }

            var raw = PluJsonMapper.CreateEmptyPluRecord(nextLf, _config.GetPluDefaults());
            raw["HotKey"] = nextLf;
            var record = PluJsonMapper.FromJObject(raw, _devicePluList.Count);
            _devicePluList.Add(record);
            if (lblScaleDataCount != null)
            {
                lblScaleDataCount.Text = "Kayit: " + _devicePluList.Count;
            }
        }

        private void btnDeleteScalePluRow_Click(object sender, EventArgs e)
        {
            if (gridScalePlu.CurrentRow == null)
            {
                MessageBox.Show("Silmek icin bir satir secin.", "Cihaz Verileri", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var index = gridScalePlu.CurrentRow.Index;
            if (index >= 0 && index < _devicePluList.Count)
            {
                _devicePluList.RemoveAt(index);
                if (lblScaleDataCount != null)
                {
                    lblScaleDataCount.Text = "Kayit: " + _devicePluList.Count;
                }
            }
        }

        private void btnExportScalePlu_Click(object sender, EventArgs e)
        {
            if (_devicePluList.Count == 0)
            {
                MessageBox.Show("Disa aktarilacak veri yok.", "Cihaz Verileri", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            using (var dialog = new SaveFileDialog())
            {
                dialog.Filter = "JSON (*.json)|*.json";
                dialog.FileName = "terazi-plu-" + DateTime.Now.ToString("yyyyMMdd-HHmm") + ".json";
                if (dialog.ShowDialog() != DialogResult.OK) return;

                var payload = new Newtonsoft.Json.Linq.JArray();
                foreach (var record in _devicePluList)
                {
                    payload.Add(PluJsonMapper.ToJObject(record));
                }

                File.WriteAllText(dialog.FileName, payload.ToString(Newtonsoft.Json.Formatting.Indented));
                AppendLog("PLU listesi dosyaya kaydedildi: " + dialog.FileName);
                MessageBox.Show("Dosya kaydedildi:\n" + dialog.FileName, "Disa Aktar", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void btnImportScalePlu_Click(object sender, EventArgs e)
        {
            using (var dialog = new OpenFileDialog())
            {
                dialog.Filter = "JSON (*.json)|*.json|Tum dosyalar (*.*)|*.*";
                if (dialog.ShowDialog() != DialogResult.OK) return;

                try
                {
                    var text = File.ReadAllText(dialog.FileName);
                    var token = Newtonsoft.Json.Linq.JToken.Parse(text);
                    var records = new List<ScalePluRecord>();

                    if (token is Newtonsoft.Json.Linq.JArray arr)
                    {
                        foreach (var item in arr.OfType<Newtonsoft.Json.Linq.JObject>())
                        {
                            records.Add(PluJsonMapper.FromJObject(item));
                        }
                    }
                    else if (token is Newtonsoft.Json.Linq.JObject obj)
                    {
                        records.Add(PluJsonMapper.FromJObject(obj));
                    }

                    BindDevicePluList(records);
                    AppendLog(records.Count + " PLU dosyadan yuklendi: " + dialog.FileName);
                    MessageBox.Show(records.Count + " kayit yuklendi. Teraziye Kaydet ile cihaza yazabilirsiniz.",
                        "Dosyadan Yukle", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("JSON okunamadi: " + ex.Message, "Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private ScaleDeviceConfig GetSelectedScale()
        {
            return cmbScale.SelectedItem as ScaleDeviceConfig ?? _config.GetActiveScales().FirstOrDefault();
        }

        private string GetSelectedScaleIp()
        {
            var scale = GetSelectedScale();
            return scale?.IpAddress ?? _config.ScaleIp ?? "";
        }

        private void SaveSettingsFromUi()
        {
            SaveScalesFromGrid();
            _config.ApiBaseUrl = txtApiBaseUrl.Text.Trim();
            _config.TenantCode = txtTenantCode.Text.Trim();
            _config.ApiToken = txtApiToken.Text.Trim();
            _config.AuthMode = (cmbAuthMode.SelectedItem ?? "none").ToString();
            _config.SyncMode = (cmbSyncMode.SelectedItem ?? "local_auto").ToString();
            if (cmbFirm.SelectedItem is FirmDto firm)
            {
                _config.FirmNr = firm.FirmNr;
                _config.FirmId = firm.Id;
            }
            if (cmbPeriod.SelectedItem is PeriodDto period)
            {
                _config.PeriodNr = period.Nr.ToString("00");
            }
            if (cmbStore.SelectedItem is StoreDto store)
            {
                _config.StoreId = store.Id;
                _config.StoreName = store.Name;
            }
            _config.RefreshProductsPathFromSelection();
            _config.ProductsPath = txtProductsPath.Text.Trim();
            _config.LfCodeBase = (int)numLfCodeBase.Value;
            _config.SyncIntervalMinutes = (int)numSyncInterval.Value;
            _config.ClearBeforeSend = chkClearBeforeSend.Checked;
            _config.SendHotkeys = chkSendHotkeys.Checked;
            _config.AutoSyncEnabled = chkAutoSync.Checked;
            _config.SyncOnStartup = chkSyncOnStartup.Checked;
            _config.RlsHomePath = txtRlsHome.Text.Trim();
            if (RongtaPaths.ShouldUseWritableHome(_config.RlsHomePath))
            {
                _config.RlsHomePath = RongtaPaths.WritableRongtaDir;
                txtRlsHome.Text = _config.RlsHomePath;
            }
            _config.DefaultLabelScr = txtLabelScr.Text.Trim();
            _config.LabelSlot = (cmbLabelSlot.SelectedItem ?? "D0").ToString();
            _config.SendLabelOnSync = chkSendLabelOnSync.Checked;
            _config.IncrementalSyncEnabled = chkIncrementalSync.Checked;
            _config.DefaultBarcodeType = (int)numBarcodeType.Value;
            _config.DefaultDepartment = (int)numDepartment.Value;
            _config.Barcode99Format = txtBarcode99Format.Text.Trim();
            _config.Barcode99WeightDecimals = (int)numWeightDecimals99.Value;
            _config.SendFunctionSetOnSync = chkSendFunctionSetOnSync.Checked;
            if (cmbLanguage != null)
            {
                _config.UiLanguage = UiLang.GetSelectedLanguage(cmbLanguage);
                UiLang.SetLanguage(_config.UiLanguage);
            }
            _scaleService.RlsHomePath = _config.RlsHomePath;
            _scaleService.SyncConfig = _config;

            TryApplyBarcodeSettings();

            _config.Save();
            _syncEngine.ReloadConfig();

            syncTimer.Stop();
            if (_config.AutoSyncEnabled && _config.ShouldRunAutoTimerSync())
            {
                syncTimer.Interval = Math.Max(1, _config.SyncIntervalMinutes) * 60 * 1000;
                syncTimer.Start();
            }
            else if (_config.AutoSyncEnabled && _config.UsesCentralCommands())
            {
                syncTimer.Interval = Math.Max(15, _config.CommandPollIntervalSeconds) * 1000;
                syncTimer.Start();
            }

            AppendLog("Ayarlar kaydedildi: " + AppConfig.DefaultConfigPath);
            statusLabel.Text = "Config: " + AppConfig.DefaultConfigPath;
            ApplyLocalizedUi();
        }

        private async void btnQuickSync_Click(object sender, EventArgs e)
        {
            await RunSyncUiAsync();
        }

        private async void syncTimer_Tick(object sender, EventArgs e)
        {
            if (!_config.AutoSyncEnabled || _busy) return;
            await RunSyncUiAsync(silent: true, fullSync: false, trigger: "auto");
        }

        private async Task RunSyncUiAsync(bool silent = false, bool fullSync = false, string trigger = null)
        {
            if (_busy) return;
            _busy = true;
            SetBusy(true);
            try
            {
                SaveSettingsFromUi();
                var syncTrigger = trigger ?? (fullSync ? "full" : "manual");
                var command = fullSync ? "push_all" : null;
                var result = await Task.Run(() => _syncEngine.RunSync(syncTrigger, command)).ConfigureAwait(true);
                UpdateDashboard(result);
                LoadScalesToGrid();
                await RefreshProductGridAsync().ConfigureAwait(true);
                await RefreshCentralStatusAsync().ConfigureAwait(true);
                if (!silent)
                {
                    var message = result.Message;
                    if (result.Warnings != null && result.Warnings.Count > 0)
                    {
                        var warningText = string.Join(Environment.NewLine, result.Warnings.Take(10));
                        if (result.Warnings.Count > 10)
                        {
                            warningText += Environment.NewLine + "... ve " + (result.Warnings.Count - 10) + " uyari daha";
                        }

                        message += Environment.NewLine + Environment.NewLine + "Uyarılar:" + Environment.NewLine + warningText;
                    }

                    MessageBox.Show(
                        message,
                        result.Success ? UiLang.T("msg.syncOk") : UiLang.T("msg.syncWarn"),
                        MessageBoxButtons.OK,
                        result.Success && (result.Warnings == null || result.Warnings.Count == 0)
                            ? MessageBoxIcon.Information
                            : MessageBoxIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                AppendLog("HATA: " + ex.Message);
                if (!silent) MessageBox.Show(ex.Message, "Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                _busy = false;
                SetBusy(false);
            }
        }

        private async void btnFetchProducts_Click(object sender, EventArgs e)
        {
            if (_busy) return;
            _busy = true;
            SetBusy(true);
            try
            {
                SaveSettingsFromUi();
                _cachedProducts = await _apiClient.FetchScaleProductsAsync(_config).ConfigureAwait(true);
                BindProducts(_cachedProducts);
                lblProductCount.Text = "Ürün: " + _cachedProducts.Count;
                AppendLog(_cachedProducts.Count + " ürün API'den alındı.");
            }
            catch (Exception ex)
            {
                AppendLog("API hatasi: " + ex.Message);
                MessageBox.Show(ex.Message, "RetailEX API", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                _busy = false;
                SetBusy(false);
            }
        }

        private async void btnSendToScale_Click(object sender, EventArgs e)
        {
            await RunSyncUiAsync(silent: false, fullSync: true);
        }

        private void btnTestScale_Click(object sender, EventArgs e)
        {
            TestScaleConnection();
        }

        private void btnConnect_Click(object sender, EventArgs e)
        {
            TestScaleConnection();
        }

        private void TestScaleConnection()
        {
            SaveSettingsFromUi();
            var scale = GetSelectedScale();
            if (scale == null || string.IsNullOrWhiteSpace(scale.IpAddress))
            {
                MessageBox.Show("Terazi secin veya Teraziler sekmesinden IP girin.", "Terazi", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            double? weight;
            string message;
            var ok = _scaleService.TestConnection(scale.IpAddress, out weight, out message);
            lblScaleStatus.Text = ok ? "Terazi: Bağlı (" + scale.Name + ")" : "Terazi: Bağlantı hatası";
            lblScaleStatus.ForeColor = ok ? UiTheme.Success : UiTheme.Danger;
            statusBadge.Text = ok ? "Terazi OK" : "Terazi Hata";
            AppendLog(message);
            MessageBox.Show(message, "Terazi", MessageBoxButtons.OK, ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        private void btnGetWeight_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            var ip = GetSelectedScaleIp();
            if (string.IsNullOrWhiteSpace(ip))
            {
                MessageBox.Show("Terazi secin.", "Agirlik", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            btnGetWeight.Enabled = false;
            Cursor = Cursors.WaitCursor;
            try
            {
                var result = _scaleService.ReadLiveWeight(ip);
                AppendLog(result.Detail);
                var culture = System.Globalization.CultureInfo.GetCultureInfo("tr-TR");
                string text;
                if (result.WeightKg.HasValue && result.WeightKg.Value > 0)
                {
                    text = result.WeightKg.Value.ToString("F3", culture) + " kg";
                }
                else
                {
                    text = result.Detail;
                }

                MessageBox.Show(text, "Agirlik", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            finally
            {
                Cursor = Cursors.Default;
                btnGetWeight.Enabled = true;
            }
        }

        private void btnClearPlu_Click(object sender, EventArgs e)
        {
            ClearDevicePluData(showDeviceGridTab: false);
        }

        private void btnClearDevicePlu_Click(object sender, EventArgs e)
        {
            ClearDevicePluData(showDeviceGridTab: true);
        }

        private void ClearDevicePluData(bool showDeviceGridTab)
        {
            SaveSettingsFromUi();
            var ip = showDeviceGridTab
                ? GetSelectedScaleForData()?.IpAddress?.Trim()
                : GetSelectedScaleIp();
            if (string.IsNullOrWhiteSpace(ip))
            {
                MessageBox.Show("Lutfen once bir terazi secin.", "Terazi Secimi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var confirm = MessageBox.Show(
                "Secili terazideki tum urun (PLU) bilgileri silinecek.\n\nBu islem geri alinamaz. Devam etmek istiyor musunuz?",
                "Cihaz Verilerini Bosalt",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            if (confirm != DialogResult.Yes) return;

            string error;
            if (!_scaleService.Connect(ip, out error))
            {
                MessageBox.Show(error, "Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            string message;
            var ok = _scaleService.ClearPlu(out message);
            _scaleService.Disconnect();
            AppendLog(message);

            if (ok && showDeviceGridTab)
            {
                _devicePluList.Clear();
                if (lblScaleDataCount != null)
                {
                    lblScaleDataCount.Text = "Kayit: 0";
                }
            }

            MessageBox.Show(message, ok ? "Tamam" : "Hata", MessageBoxButtons.OK,
                ok ? MessageBoxIcon.Information : MessageBoxIcon.Error);
        }

        private void btnUploadSales_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            var ip = GetSelectedScaleIp();
            string message;
            var records = _scaleService.UploadSales(ip, false, out message);
            AppendLog(message);
            if (records.Count > 0)
            {
                foreach (var r in records.Take(20))
                {
                    AppendLog(string.Format("{0} | {1} | {2:F2} kg | {3:F2} TL",
                        r.SaleTime, r.PluName, r.Weight, r.TotalPrice));
                }
            }
            MessageBox.Show(message, "Satış Verisi");
        }

        private void btnSaleReport_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            var scale = GetSelectedScale();
            if (scale == null || string.IsNullOrWhiteSpace(scale.IpAddress))
            {
                MessageBox.Show("Terazi secin veya Teraziler sekmesinden IP girin.", "Etiket Raporu",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            using (var form = new UI.SaleReportForm(_scaleService, scale.IpAddress.Trim(), scale.Name))
            {
                form.ShowDialog(this);
            }
        }

        private async void btnOpenDeviceData_Click(object sender, EventArgs e)
        {
            await LoadDevicePluFromScaleAsync(showSuccessMessage: true, switchToDeviceTab: true);
        }

        private async void btnLoadFromDevice_Click(object sender, EventArgs e)
        {
            await LoadDevicePluFromScaleAsync(showSuccessMessage: true, switchToDeviceTab: true);
        }

        private void btnSendFunctionSet_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            var scale = GetSelectedScale();
            if (scale == null || string.IsNullOrWhiteSpace(scale.IpAddress))
            {
                MessageBox.Show("Terazi secin veya Teraziler sekmesinden IP girin.", "Terazi Ayarlari", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var result = _scaleService.SendFunctionSet(scale.IpAddress, _config);
            AppendLog(result.Message);
            foreach (var err in result.Errors ?? new List<string>())
            {
                AppendLog("  HATA: " + err);
            }

            var title = result.Success ? "Terazi Ayarlari" : "Terazi Ayarlari Uyarisi";
            var body = result.Message;
            if (!result.Success && _config.CompensateDevicePriceDecimal && _config.DevicePriceDecimalPosition > 0)
            {
                body += Environment.NewLine + Environment.NewLine
                    + "Not: Function-set gonderilemese de PLU senkronunda fiyat x"
                    + (int)Math.Pow(10, _config.DevicePriceDecimalPosition)
                    + " carpani uygulanir (7500 -> terazide 7500).";
            }

            MessageBox.Show(body, title, MessageBoxButtons.OK,
                result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        private void btnSendLabel_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            var scale = GetSelectedScale();
            if (scale == null || string.IsNullOrWhiteSpace(scale.IpAddress))
            {
                MessageBox.Show("Terazi secin veya Teraziler sekmesinden IP girin.", "Etiket", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            RongtaPaths.EnsureWritableAssets(_config);
            var scrPath = _config.ResolveLabelScrPath(txtLabelScr.Text.Trim());
            if (string.IsNullOrWhiteSpace(scrPath) || !File.Exists(scrPath))
            {
                // Son carpma: varsayilan Megal etiketine dus
                scrPath = _config.ResolveLabelScrPath(RlsResourceResolver.DefaultMegalLabelFileName);
            }

            if (!File.Exists(scrPath))
            {
                MessageBox.Show(
                    "Megal etiket dosyasi bulunamadi.\nBeklenen: retailex_logoluetiket.scr",
                    "Etiket",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            txtLabelScr.Text = scrPath;
            RefreshLabelPreview();
            AppendLog("Etiket gonderiliyor: " + scrPath);
            var result = _scaleService.SendLabelTemplate(scale.IpAddress, scrPath);
            AppendLog(result.Message);
            MessageBox.Show(result.Message, result.Success ? "Etiket" : "Etiket Hatasi",
                MessageBoxButtons.OK, result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        private void btnUseDefaultMegalLabel_Click(object sender, EventArgs e)
        {
            RongtaPaths.EnsureWritableAssets(_config);
            _config.DefaultLabelScr = RlsResourceResolver.DefaultMegalLabelFileName;
            var path = _config.ResolveLabelScrPath(RlsResourceResolver.DefaultMegalLabelFileName);
            txtLabelScr.Text = path;
            RefreshLabelPreview();
            AppendLog("Varsayilan Megal etiket secildi: " + path);
            if (!File.Exists(path))
            {
                MessageBox.Show(
                    "retailex_logoluetiket.scr bulunamadi. Uygulamayi yeniden kurun veya Resources\\Rongta klasorunu kontrol edin.",
                    "Etiket",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }

        private void RefreshLabelPreview()
        {
            if (picLabelPreview == null) return;

            try
            {
                var png = RlsResourceResolver.ResolveLabelPreviewPngPath();
                if (string.IsNullOrEmpty(png) || !File.Exists(png))
                {
                    picLabelPreview.Image = null;
                    if (lblLabelPreviewHint != null)
                    {
                        lblLabelPreviewHint.Text = "Onizleme bulunamadi (retailex_logoluetiket_onizleme.png)";
                    }
                    return;
                }

                // Dosya kilitlenmesin diye kopyadan yukle
                using (var fs = new FileStream(png, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (var img = Image.FromStream(fs))
                {
                    var old = picLabelPreview.Image;
                    picLabelPreview.Image = new Bitmap(img);
                    old?.Dispose();
                }

                if (lblLabelPreviewHint != null)
                {
                    lblLabelPreviewHint.Text = "Onizleme: Megal logo + MEGAL yazisi";
                }
            }
            catch (Exception ex)
            {
                AppendLog("Etiket onizleme yuklenemedi: " + ex.Message);
            }
        }

        private void btnOpenLabelEditor_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            string message;
            var ok = ScaleService.TryLaunchLabelEditor(_config.RlsHomePath, out message);
            AppendLog(message);
            if (!ok)
            {
                MessageBox.Show(message, "Etiket Editoru", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void btnBrowseLabel_Click(object sender, EventArgs e)
        {
            using (var dialog = new OpenFileDialog())
            {
                dialog.Filter = "Rongta etiket (*.scr)|*.scr|Tum dosyalar (*.*)|*.*";
                dialog.InitialDirectory = RlsResourceResolver.ResolveRlsHome(txtRlsHome.Text.Trim());
                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    txtLabelScr.Text = dialog.FileName;
                    RefreshLabelPreview();
                }
            }
        }

        private async void btnTestApi_Click(object sender, EventArgs e)
        {
            if (_busy) return;
            _busy = true;
            SetBusy(true);
            try
            {
                SaveSettingsFromUi();
                var products = await _apiClient.FetchScaleProductsAsync(_config).ConfigureAwait(true);
                MessageBox.Show(
                    products.Count + " tartılabilir ürün bulundu.\n\nAPI: " + _config.ResolvedApiUrl(),
                    "RetailEX API",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "RetailEX API", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                _busy = false;
                SetBusy(false);
            }
        }

        private void btnSaveSettings_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            MessageBox.Show("Ayarlar kaydedildi.\n\n" + AppConfig.DefaultConfigPath, "Kaydedildi", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void btnAddScale_Click(object sender, EventArgs e)
        {
            SaveScalesFromGrid();
            var scale = new ScaleDeviceConfig
            {
                Id = Guid.NewGuid().ToString("N"),
                Name = "Terazi " + (_config.Scales.Count + 1),
                IpAddress = "192.168.1." + (100 + _config.Scales.Count),
                Enabled = true,
            };
            _config.Scales.Add(scale);
            LoadScalesToGrid();
            foreach (DataGridViewRow row in gridScales.Rows)
            {
                if ((row.Tag as ScaleDeviceConfig)?.Id == scale.Id)
                {
                    row.Selected = true;
                    gridScales.CurrentCell = row.Cells[colScaleIp.Index];
                    break;
                }
            }
        }

        private void btnRemoveScale_Click(object sender, EventArgs e)
        {
            if (gridScales.SelectedRows.Count == 0)
            {
                MessageBox.Show("Silmek icin bir terazi secin.", "Teraziler", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            SaveScalesFromGrid();
            var selected = gridScales.SelectedRows[0].Tag as ScaleDeviceConfig;
            if (selected != null)
            {
                _config.Scales.RemoveAll(s => s.Id == selected.Id);
            }
            LoadScalesToGrid();
            SaveSettingsFromUi();
        }

        private void BindProducts(IList<ScaleProductDto> products)
        {
            gridProducts.Rows.Clear();
            foreach (var p in products ?? new List<ScaleProductDto>())
            {
                gridProducts.Rows.Add(
                    FormatProductPluNo(p),
                    p.Name,
                    p.Barcode ?? p.PluCode ?? "",
                    FormatProductPrice(p.Price),
                    p.Unit,
                    Math.Max(0, p.ShelfLifeDays));
            }
        }

        private static int FormatProductPrice(double price)
        {
            return ScalePriceHelper.ToUnitPrice(price);
        }

        private async Task RefreshProductGridAsync()
        {
            try
            {
                _cachedProducts = await _apiClient.FetchScaleProductsAsync(_config).ConfigureAwait(true);
                BindProducts(_cachedProducts);
                lblProductCount.Text = "Ürün: " + _cachedProducts.Count;
            }
            catch (Exception ex)
            {
                AppendLog("Urun listesi guncellenemedi: " + ex.Message);
            }
        }

        private static string FormatProductPluNo(ScaleProductDto product)
        {
            if (product == null) return "";
            if (product.LfCode > 0) return product.LfCode.ToString();
            if (!string.IsNullOrWhiteSpace(product.PluCode)) return product.PluCode.Trim();
            return "";
        }

        private void UpdateDashboard(SyncResult result = null)
        {
            if (result != null)
            {
                lblLastSync.Text = "Son senkron: " + result.Timestamp.ToString("dd.MM.yyyy HH:mm:ss");
                lblProductCount.Text = "Ürün: " + result.ProductCount + " · Gönderilen: " + result.SentCount;
                statusBadge.Text = result.Success ? "Senkron OK" : "Senkron Uyarı";
                statusBadge.ForeColor = result.Success ? UiTheme.Success : UiTheme.Warning;
            }
        }

        private void AppendLog(string message)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(AppendLog), message);
                return;
            }

            txtLog.AppendText(string.Format("[{0:HH:mm:ss}] {1}{2}", DateTime.Now, message, Environment.NewLine));
        }

        private void SetBusy(bool busy)
        {
            UseWaitCursor = busy;
            statusLabel.Text = busy ? "İşlem devam ediyor..." : "RetailEX Terazi · otomatik senkron · " + AppConfig.DefaultConfigPath;
        }

        private void btnInstallService_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();

            // Kurulum/portable: script exe yaninda; gelistirme: repo kok / installer
            var exeDir = System.IO.Path.GetDirectoryName(Application.ExecutablePath) ?? "";
            var baseDir = AppDomain.CurrentDomain.BaseDirectory ?? "";
            var candidates = new[]
            {
                System.IO.Path.Combine(exeDir, "install-service.ps1"),
                System.IO.Path.Combine(baseDir, "install-service.ps1"),
                System.IO.Path.Combine(exeDir, "..", "..", "..", "install-service.ps1"),
                System.IO.Path.Combine(baseDir, "..", "..", "install-service.ps1"),
                System.IO.Path.Combine(exeDir, "..", "..", "..", "installer", "install-service.ps1"),
            };

            string script = null;
            foreach (var candidate in candidates)
            {
                try
                {
                    var full = System.IO.Path.GetFullPath(candidate);
                    if (System.IO.File.Exists(full))
                    {
                        script = full;
                        break;
                    }
                }
                catch
                {
                    // gecersiz yol — sonraki adaya gec
                }
            }

            if (script == null)
            {
                var expected = System.IO.Path.Combine(exeDir, "install-service.ps1");
                MessageBox.Show(
                    "install-service.ps1 bulunamadı.\n\nBeklenen konum:\n" + expected +
                    "\n\nYönetici PowerShell:\n" +
                    "powershell -ExecutionPolicy Bypass -File \"" + expected + "\"",
                    "Servis Kurulumu",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"",
                    Verb = "runas",
                    UseShellExecute = true,
                });
                AppendLog("Servis kurulum scripti baslatildi (yonetici onayi gerekebilir).");
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "Servis kurulumu", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async Task RefreshCentralStatusAsync()
        {
            if (string.IsNullOrWhiteSpace(_config.StoreId)) return;

            try
            {
                gridCentralStatus.Rows.Clear();
                var deviceStatuses = await _incrementalService.FetchDeviceStatusesAsync(_config).ConfigureAwait(true);
                foreach (var device in deviceStatuses)
                {
                    gridCentralStatus.Rows.Add(
                        device.LastTransferAt?.ToString("yyyy-MM-dd HH:mm") ?? "—",
                        device.DeviceName + " [" + device.IpAddress + "]",
                        device.LastTransferStatus ?? "—",
                        "Son OK: " + (device.LastSuccessAt?.ToString("yyyy-MM-dd HH:mm") ?? "—")
                        + " | Watermark: " + (device.LastWatermarkAt?.ToString("yyyy-MM-dd HH:mm") ?? "—")
                        + " | Bekleyen: " + device.PendingChangeCount);
                }

                // Transfer satırları «İşlem Günlüğü» sekmesinde (son 7 gün)
                await RefreshTransferLogAsync().ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                AppendLog("Merkez durum okuma hatasi: " + ex.Message);
            }
        }

        private async Task RefreshTransferLogAsync()
        {
            if (gridTransferLog == null) return;
            if (string.IsNullOrWhiteSpace(_config.StoreId))
            {
                gridTransferLog.Rows.Clear();
                return;
            }

            try
            {
                gridTransferLog.Rows.Clear();
                var logs = await _centralService.FetchRecentSyncLogsAsync(
                    _config,
                    limit: 200,
                    maxAgeDays: TransferLogMaxAgeDays).ConfigureAwait(true);

                foreach (var log in logs)
                {
                    var createdAt = log["created_at"]?.ToString();
                    var terminal = log["terminal_name"]?.ToString();
                    var status = log["status"]?.ToString();
                    var message = log["message"]?.ToString();
                    var detailText = log["detail"]?.ToString();
                    if (string.IsNullOrWhiteSpace(detailText))
                    {
                        gridTransferLog.Rows.Add(createdAt, terminal, "—", "—", "—", status, message);
                        continue;
                    }

                    try
                    {
                        var detail = Newtonsoft.Json.Linq.JObject.Parse(detailText);
                        var products = detail["products"] as Newtonsoft.Json.Linq.JArray;
                        if (products == null || products.Count == 0)
                        {
                            gridTransferLog.Rows.Add(createdAt, terminal, "—", "—", "—", status, message);
                            continue;
                        }

                        foreach (var product in products.OfType<Newtonsoft.Json.Linq.JObject>())
                        {
                            gridTransferLog.Rows.Add(
                                createdAt,
                                terminal,
                                product["name"]?.ToString(),
                                product["barcode"]?.ToString() ?? product["code"]?.ToString(),
                                product["unit"]?.ToString(),
                                product["status"]?.ToString(),
                                message);
                        }
                    }
                    catch
                    {
                        gridTransferLog.Rows.Add(createdAt, terminal, "—", "—", "—", status, message);
                    }
                }

                if (lblTransferLogHint != null)
                {
                    lblTransferLogHint.Text = "Son " + TransferLogMaxAgeDays + " gün — "
                        + gridTransferLog.Rows.Count + " satır (device_sync_transfer_log). WinForm kuralı.";
                }
            }
            catch (Exception ex)
            {
                AppendLog("İşlem günlüğü okuma hatası: " + ex.Message);
            }
        }

        private async void btnRefreshCentral_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            await RefreshCentralStatusAsync().ConfigureAwait(true);
        }

        private async void btnRegisterScales_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            if (string.IsNullOrWhiteSpace(_config.StoreId))
            {
                MessageBox.Show("Once magaza secin.", "Merkez", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            try
            {
                await _centralService.RegisterAllScalesAsync(_config).ConfigureAwait(true);
                _config.Save();
                AppendLog("Teraziler merkez DB'ye kaydedildi (store_devices).");
                MessageBox.Show("Teraziler merkeze kaydedildi.", "Merkez", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "Merkez", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async void btnCreateCentralCommand_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            try
            {
                var recordId = await _centralService.CreatePushCommandAsync(
                    _config, null, "manual", "push_changed").ConfigureAwait(true);
                AppendLog("Degisen urunler icin merkez emri olusturuldu: " + recordId);
                MessageBox.Show(
                    "Degisen urunler icin merkez emri olusturuldu.\n\n"
                    + "Magaza PC (hybrid/central_command) bu emri alip sadece degisen PLU'lari gonderir.",
                    "Merkez Emri",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "Merkez Emri", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async void btnCreateCentralFullCommand_Click(object sender, EventArgs e)
        {
            SaveSettingsFromUi();
            try
            {
                var recordId = await _centralService.CreatePushCommandAsync(
                    _config, null, "manual", "push_all").ConfigureAwait(true);
                AppendLog("Tum urunler icin merkez emri olusturuldu: " + recordId);
                MessageBox.Show(
                    "Tum tartilabilir urunler icin merkez emri olusturuldu.",
                    "Merkez Emri",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "Merkez Emri", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async void btnPollCentralCommands_Click(object sender, EventArgs e)
        {
            if (_busy) return;
            _busy = true;
            SetBusy(true);
            try
            {
                SaveSettingsFromUi();
                var result = await Task.Run(() => _syncEngine.RunCentralCommandPollAsync()).ConfigureAwait(true);
                UpdateDashboard(result);
                LoadScalesToGrid();
                await RefreshCentralStatusAsync().ConfigureAwait(true);
                MessageBox.Show(result.Message, "Merkez Emirleri", MessageBoxButtons.OK,
                    result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
            }
            finally
            {
                _busy = false;
                SetBusy(false);
            }
        }
    }
}
