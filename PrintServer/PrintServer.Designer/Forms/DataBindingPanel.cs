using System;
using System.Collections.Generic;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using RetailEX.PrintServer.Designer.Config;
using RetailEX.PrintServer.Designer.DataBinding;
using RetailEX.PrintServer.Designer.Logging;

namespace RetailEX.PrintServer.Designer.Forms;

/// <summary>
/// Kiracıya göre DB tablo/alan ağacı + önizleme verisi çekme butonu.
/// Çift tık: alan yolunu panoya kopyalar. Sürükle: designer içine metin olarak bırakır.
/// "Önizleme Verisi" çift tıklandığında ilgili tabloyu çekip <see cref="DataBindingService"/>
/// üzerinden DataTable'a çevirir; <see cref="PreviewRequested"/> event'i tetiklenir.
/// </summary>
internal sealed class DataBindingPanel : UserControl
{
    private readonly TreeView _tableTree = new();
    private readonly Label _statusLabel = new();
    private readonly TextBox _resourceBox = new();
    private readonly Button _previewButton = new();

    private DataBindingService? _binding;

    public event EventHandler<string>? FieldPathCopied;
    public event EventHandler<DataTablePreviewRequest>? PreviewRequested;

    public DataBindingPanel()
    {
        Dock = DockStyle.Fill;
        BuildUi();
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public DataBindingService? BindingService
    {
        get => _binding;
        set => _binding = value;
    }

    public void SetStatus(string message)
    {
        if (InvokeRequired) Invoke(() => _statusLabel.Text = message);
        else _statusLabel.Text = message;
    }

    private void BuildUi()
    {
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));

        var title = new Label
        {
            Text = "Tablolar (DB alanları)",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 10F, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft
        };
        layout.Controls.Add(title, 0, 0);

        _tableTree.Dock = DockStyle.Fill;
        _tableTree.HideSelection = false;
        _tableTree.ShowNodeToolTips = true;
        _tableTree.NodeMouseDoubleClick += (_, e) => HandleDoubleClick(e.Node);
        var menu = new ContextMenuStrip();
        menu.Items.Add("Alan yolunu kopyala", null, (_, _) => CopyFieldPath(_tableTree.SelectedNode));
        menu.Items.Add("Önizleme verisini çek", null, async (_, _) => await RequestPreviewAsync(_tableTree.SelectedNode));
        _tableTree.ContextMenuStrip = menu;
        _tableTree.ItemDrag += (_, e) =>
        {
            if (e.Item is TreeNode n && n.Tag is string path)
            {
                _tableTree.DoDragDrop(path, DragDropEffects.Copy);
            }
        };
        layout.Controls.Add(_tableTree, 0, 1);

        var bottom = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3
        };
        bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 70));
        bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 15));
        bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 15));
        _resourceBox.Dock = DockStyle.Fill;
        _previewButton.Text = "Önizle";
        _previewButton.Dock = DockStyle.Fill;
        _previewButton.Click += async (_, _) => await RequestPreviewAsync(_tableTree.SelectedNode);
        bottom.Controls.Add(_resourceBox, 0, 0);
        bottom.Controls.Add(_previewButton, 1, 0);
        bottom.Controls.Add(_statusLabel, 2, 0);
        layout.Controls.Add(bottom, 0, 2);

        Controls.Add(layout);
    }

    /// <summary>Kiracıya göre yaygın tabloları yükler (products, customers, vb.).</summary>
    public void PopulateSuggestedTables()
    {
        _tableTree.BeginUpdate();
        _tableTree.Nodes.Clear();

        var groups = new (string Caption, string[] Resources)[]
        {
            ("Firma tabloları", new[]
            {
                "products?select=id,code,name,unit_price,is_active",
                "customers?select=id,code,name,phone,balance",
                "suppliers?select=id,code,name,phone,balance",
                "stores?select=id,code,name",
                "cash_registers?select=id,name"
            }),
            ("Dönem tabloları", new[]
            {
                "sales?select=id,fiche_no,date,grand_total",
                "sale_items?select=id,product_name,qty,unit_price,line_total",
                "cash_lines?select=id,date,amount,description",
                "bank_lines?select=id,date,amount,description",
                "stock_movements?select=id,product_code,qty,date"
            }),
            ("Restoran tabloları", new[]
            {
                "rest_orders?select=id,table_no,waiter,status,total",
                "rest_order_items?select=id,product_name,qty,line_total",
                "rest_kitchen_orders?select=id,table_no,waiter,status",
                "rest_kitchen_order_items?select=id,product_name,qty,note"
            })
        };

        foreach (var (caption, resources) in groups)
        {
            var group = new TreeNode(caption);
            foreach (var res in resources)
            {
                var tableName = res.Split('?', 2)[0];
                var node = new TreeNode(tableName) { Tag = res, ToolTipText = res };
                var columns = ExtractColumns(res);
                foreach (var col in columns)
                {
                    node.Nodes.Add(new TreeNode(col) { Tag = $"{tableName}.{col}" });
                }
                group.Nodes.Add(node);
            }
            _tableTree.Nodes.Add(group);
        }
        _tableTree.ExpandAll();
        _tableTree.EndUpdate();
    }

    private static IEnumerable<string> ExtractColumns(string resource)
    {
        var idx = resource.IndexOf("select=", StringComparison.OrdinalIgnoreCase);
        if (idx < 0) yield break;
        var after = resource[(idx + "select=".Length)..];
        var end = after.IndexOf('&');
        if (end >= 0) after = after[..end];
        foreach (var col in after.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            yield return col.Trim();
        }
    }

    private void HandleDoubleClick(TreeNode? node)
    {
        if (node?.Tag is not string path) return;
        if (path.Contains('?'))
        {
            // Tablo düğümü: önizleme isteği tetikle
            _ = RequestPreviewAsync(node);
            return;
        }
        CopyFieldPath(node);
    }

    private void CopyFieldPath(TreeNode? node)
    {
        if (node?.Tag is string path && !path.Contains('?'))
        {
            Clipboard.SetText(path);
            FieldPathCopied?.Invoke(this, path);
            SetStatus($"Kopyalandı: {path}");
        }
    }

    private async Task RequestPreviewAsync(TreeNode? node)
    {
        if (_binding is null) { SetStatus("Önce bağlantıyı kurun."); return; }
        var resource = node?.Tag as string ?? _resourceBox.Text;
        if (string.IsNullOrWhiteSpace(resource)) { SetStatus("Tablo seçili değil."); return; }

        try
        {
            UseWaitCursor = true;
            SetStatus($"Önizleme verisi çekiliyor: {resource}");
            var dt = await _binding.FetchAsync(resource);
            SetStatus($"{dt.Rows.Count} satır, {dt.Columns.Count} kolon yüklendi.");
            PreviewRequested?.Invoke(this, new DataTablePreviewRequest(resource, dt));
        }
        catch (Exception ex)
        {
            DesignerLog.Error("Önizleme veri çekme hatası", ex);
            SetStatus($"Önizleme alınamadı: {ex.Message}");
        }
        finally
        {
            UseWaitCursor = false;
        }
    }
}

internal sealed record DataTablePreviewRequest(string ResourcePath, DataTable Data);
