using System;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using TeraziRongta.Core.Helpers;
using TeraziRongta.Core.Models;
using TeraziRongta.Core.Services;
using WindowsFormsApplication1.I18n;



namespace WindowsFormsApplication1.UI

{

    public class SaleReportForm : Form

    {

        private readonly ScaleService _scaleService;

        private readonly string _scaleIp;

        private readonly string _scaleName;



        private DateTimePicker dtpFrom;

        private DateTimePicker dtpTo;

        private Button btnFetch;

        private Button btnToday;

        private Button btnAllRecords;

        private CheckBox chkIncludeUnknown;

        private Label lblSummary;

        private Label lblStatus;

        private TabControl tabViews;

        private DataGridView gridDaily;

        private DataGridView gridProducts;



        private bool _showAllDates;



        public SaleReportForm(ScaleService scaleService, string scaleIp, string scaleName)

        {

            _scaleService = scaleService;

            _scaleIp = scaleIp;

            _scaleName = scaleName ?? scaleIp;

            InitializeUi();

        }



        private void InitializeUi()

        {

            Text = UiLang.T("report.title", _scaleName);

            Size = new Size(980, 640);

            StartPosition = FormStartPosition.CenterParent;

            MinimumSize = new Size(800, 500);

            UiTheme.ApplyForm(this);
            UiLang.ApplyFormDirection(this);



            var panelTop = new Panel

            {

                Dock = DockStyle.Top,

                Height = 118,

                Padding = new Padding(12)

            };

            UiTheme.StylePanel(panelTop);



            var lblFrom = new Label { AutoSize = true, Location = new Point(12, 14), Text = UiLang.T("report.from") };

            lblFrom.ForeColor = UiTheme.Muted;

            dtpFrom = new DateTimePicker

            {

                Location = new Point(12, 34),

                Size = new Size(140, 23),

                Format = DateTimePickerFormat.Short,

                Value = DateTime.Today.AddMonths(-2)

            };



            var lblTo = new Label { AutoSize = true, Location = new Point(164, 14), Text = UiLang.T("report.to") };

            lblTo.ForeColor = UiTheme.Muted;

            dtpTo = new DateTimePicker

            {

                Location = new Point(164, 34),

                Size = new Size(140, 23),

                Format = DateTimePickerFormat.Short,

                Value = DateTime.Today

            };



            btnToday = new Button { Location = new Point(316, 30), Size = new Size(90, 36), Text = UiLang.T("report.today") };

            btnToday.Click += (s, e) =>

            {

                _showAllDates = false;

                dtpFrom.Value = DateTime.Today;

                dtpTo.Value = DateTime.Today;

            };

            UiTheme.StyleSecondaryButton(btnToday);



            btnAllRecords = new Button { Location = new Point(412, 30), Size = new Size(110, 36), Text = UiLang.T("report.all") };

            btnAllRecords.Click += (s, e) =>

            {

                _showAllDates = true;

                BtnFetch_Click(s, e);

            };

            UiTheme.StyleSecondaryButton(btnAllRecords);



            btnFetch = new Button { Location = new Point(530, 30), Size = new Size(160, 36), Text = UiLang.T("report.fetch") };

            btnFetch.Click += BtnFetch_Click;

            UiTheme.StylePrimaryButton(btnFetch);



            chkIncludeUnknown = new CheckBox

            {

                AutoSize = true,

                Location = new Point(700, 38),

                Text = UiLang.T("report.includeUnknown"),

                Checked = true

            };

            chkIncludeUnknown.ForeColor = UiTheme.Muted;



            lblSummary = new Label

            {

                AutoSize = false,

                Location = new Point(12, 68),

                Size = new Size(920, 22),

                Text = UiLang.T("report.hint")

            };

            lblSummary.ForeColor = UiTheme.Text;



            var lblHint = new Label

            {

                AutoSize = false,

                Location = new Point(12, 92),

                Size = new Size(920, 18),

                Text = "Ipucu: Terazi SaleTime degerini yyyyMMddHHmmss formatinda gonderebilir."

            };

            lblHint.ForeColor = UiTheme.Muted;

            lblHint.Name = "lblHint";



            panelTop.Controls.Add(lblFrom);

            panelTop.Controls.Add(dtpFrom);

            panelTop.Controls.Add(lblTo);

            panelTop.Controls.Add(dtpTo);

            panelTop.Controls.Add(btnToday);

            panelTop.Controls.Add(btnAllRecords);

            panelTop.Controls.Add(btnFetch);

            panelTop.Controls.Add(chkIncludeUnknown);

            panelTop.Controls.Add(lblSummary);

            panelTop.Controls.Add(lblHint);



            lblStatus = new Label

            {

                Dock = DockStyle.Bottom,

                Height = 28,

                Padding = new Padding(12, 6, 12, 0),

                Text = "Her satis kaydi = 1 etiket (adetli urunlerde Quantity kullanilir)."

            };

            lblStatus.ForeColor = UiTheme.Muted;



            tabViews = new TabControl { Dock = DockStyle.Fill };

            UiTheme.StyleTabControl(tabViews);



            var tabDaily = new TabPage("Gunluk Ozet");

            gridDaily = CreateGrid();

            gridDaily.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "DateDisplay", HeaderText = "Tarih", Width = 130 });

            gridDaily.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "LabelCount", HeaderText = "Etiket", Width = 80 });

            gridDaily.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "TotalWeight", HeaderText = "Toplam Kg", Width = 110, DefaultCellStyle = new DataGridViewCellStyle { Format = "N3" } });

            gridDaily.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "TotalAmount", HeaderText = "Toplam TL", Width = 110, DefaultCellStyle = new DataGridViewCellStyle { Format = "N2" } });

            tabDaily.Controls.Add(gridDaily);



            var tabProducts = new TabPage("Urun Detay");

            gridProducts = CreateGrid();

            gridProducts.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "DateDisplay", HeaderText = "Tarih", Width = 130 });

            gridProducts.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "PluName", HeaderText = "Urun", Width = 220 });

            gridProducts.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "LfCode", HeaderText = "LF", Width = 70 });

            gridProducts.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "LabelCount", HeaderText = "Etiket", Width = 70 });

            gridProducts.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "TotalWeight", HeaderText = "Kg", Width = 90, DefaultCellStyle = new DataGridViewCellStyle { Format = "N3" } });

            gridProducts.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = "TotalAmount", HeaderText = "TL", Width = 90, DefaultCellStyle = new DataGridViewCellStyle { Format = "N2" } });

            tabProducts.Controls.Add(gridProducts);



            tabViews.TabPages.Add(tabDaily);

            tabViews.TabPages.Add(tabProducts);



            Controls.Add(tabViews);

            Controls.Add(lblStatus);

            Controls.Add(panelTop);

        }



        private static DataGridView CreateGrid()

        {

            var grid = new DataGridView

            {

                Dock = DockStyle.Fill,

                AllowUserToAddRows = false,

                AllowUserToDeleteRows = false,

                ReadOnly = true,

                AutoGenerateColumns = false,

                SelectionMode = DataGridViewSelectionMode.FullRowSelect

            };

            UiTheme.StyleGrid(grid);

            return grid;

        }



        private void BtnFetch_Click(object sender, EventArgs e)

        {

            if (sender != btnAllRecords)

                _showAllDates = false;



            btnFetch.Enabled = false;

            btnAllRecords.Enabled = false;

            lblStatus.Text = "Teraziye baglaniliyor...";

            lblStatus.ForeColor = UiTheme.Muted;

            try

            {

                string message;

                var allRecords = _scaleService.UploadSales(_scaleIp, false, out message);

                var from = dtpFrom.Value.Date;

                var to = dtpTo.Value.Date;

                if (!_showAllDates && from > to)

                {

                    MessageBox.Show("Baslangic tarihi bitisten buyuk olamaz.", "Tarih", MessageBoxButtons.OK, MessageBoxIcon.Warning);

                    return;

                }



                var dateRange = SaleReportHelper.GetKnownDateRange(allRecords);

                UpdateDateHint(dateRange, allRecords);



                var filtered = SaleReportHelper.FilterByDateRange(

                    allRecords,

                    from,

                    to,

                    includeAllDates: _showAllDates,

                    includeUnknownDates: chkIncludeUnknown.Checked);



                var autoAdjusted = false;

                if (!_showAllDates && filtered.Count == 0 && allRecords.Count > 0 && dateRange.HasKnownDates)

                {

                    from = dateRange.MinDate.Value;

                    to = dateRange.MaxDate.Value;

                    dtpFrom.Value = from;

                    dtpTo.Value = to;

                    filtered = SaleReportHelper.FilterByDateRange(

                        allRecords,

                        from,

                        to,

                        includeAllDates: false,

                        includeUnknownDates: chkIncludeUnknown.Checked);

                    autoAdjusted = filtered.Count > 0;

                }



                var daily = SaleReportHelper.AggregateByDay(filtered);

                var products = SaleReportHelper.AggregateByDayAndProduct(filtered);



                gridDaily.DataSource = daily.ToList();

                gridProducts.DataSource = products.ToList();



                var totalLabels = daily.Sum(d => d.LabelCount);

                var totalWeight = daily.Sum(d => d.TotalWeight);

                var totalAmount = daily.Sum(d => d.TotalAmount);



                if (_showAllDates)

                {

                    lblSummary.Text = string.Format(

                        "Tum kayitlar: {0} etiket | {1:F3} kg | {2:F2} TL  (terazide toplam {3} kayit)",

                        totalLabels, totalWeight, totalAmount, allRecords.Count);

                }

                else if (from == to && from == DateTime.Today)

                {

                    lblSummary.Text = string.Format(

                        "Bugun: {0} etiket | {1:F3} kg | {2:F2} TL  (terazide toplam {3} kayit)",

                        totalLabels, totalWeight, totalAmount, allRecords.Count);

                }

                else

                {

                    lblSummary.Text = string.Format(

                        "{0:dd.MM.yyyy} - {1:dd.MM.yyyy}: {2} etiket | {3:F3} kg | {4:F2} TL  (terazide toplam {5} kayit)",

                        from, to, totalLabels, totalWeight, totalAmount, allRecords.Count);

                }



                lblStatus.Text = message;

                lblStatus.ForeColor = allRecords.Count > 0 ? UiTheme.Success : UiTheme.Warning;



                if (autoAdjusted)

                {

                    lblStatus.Text += string.Format(

                        " Tarih araligi otomatik {0:dd.MM.yyyy}-{1:dd.MM.yyyy} olarak ayarlandi.",

                        from, to);

                }

                else if (filtered.Count == 0 && allRecords.Count > 0)

                {

                    lblStatus.Text += " Secilen tarih araliginda kayit yok.";

                    if (dateRange.HasKnownDates)

                    {

                        lblStatus.Text += string.Format(

                            " Veri araligi: {0:dd.MM.yyyy} - {1:dd.MM.yyyy}.",

                            dateRange.MinDate.Value, dateRange.MaxDate.Value);

                    }

                    if (dateRange.UnknownCount > 0)

                    {

                        lblStatus.Text += " " + dateRange.UnknownCount + " kayitta tarih cozulemedi.";

                    }

                }

            }

            catch (Exception ex)

            {

                lblStatus.Text = "Hata: " + ex.Message;

                lblStatus.ForeColor = UiTheme.Danger;

                MessageBox.Show(ex.Message, "Rapor Hatasi", MessageBoxButtons.OK, MessageBoxIcon.Error);

            }

            finally

            {

                btnFetch.Enabled = true;

                btnAllRecords.Enabled = true;

            }

        }



        private void UpdateDateHint(DateRangeSummary dateRange, System.Collections.Generic.IList<ScaleAccountData> allRecords)

        {

            var hint = Controls.Find("lblHint", true).FirstOrDefault() as Label;

            if (hint == null) return;



            if (allRecords == null || allRecords.Count == 0)

            {

                hint.Text = "Ipucu: Teraziden henuz kayit alinmadi.";

                return;

            }



            var sampleTimes = allRecords

                .Select(r => r.SaleTime)

                .Where(s => !string.IsNullOrWhiteSpace(s))

                .Take(3)

                .ToList();



            var sampleText = sampleTimes.Count > 0

                ? " Ornek SaleTime: " + string.Join(", ", sampleTimes) + "."

                : string.Empty;



            if (dateRange.HasKnownDates)

            {

                hint.Text = string.Format(

                    "Terazi veri araligi: {0:dd.MM.yyyy} - {1:dd.MM.yyyy} ({2} tarihli, {3} bilinmeyen).{4}",

                    dateRange.MinDate.Value,

                    dateRange.MaxDate.Value,

                    dateRange.KnownCount,

                    dateRange.UnknownCount,

                    sampleText);

            }

            else

            {

                hint.Text = string.Format(

                    "Terazide {0} kayit var ancak tarih cozulemedi.{1}",

                    allRecords.Count,

                    sampleText);

            }

        }

    }

}


