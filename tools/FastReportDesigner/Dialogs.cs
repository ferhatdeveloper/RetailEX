namespace RetailEX.FastReportDesigner;

internal static class Dialogs
{
    public static string? Prompt(string title, string label, string defaultValue = "")
    {
        using var form = new Form
        {
            Text = title,
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MinimizeBox = false,
            MaximizeBox = false,
            Width = 460,
            Height = 165
        };

        var labelControl = new Label
        {
            Text = label,
            Dock = DockStyle.Top,
            Height = 32,
            Padding = new Padding(12, 10, 12, 0)
        };

        var textBox = new TextBox
        {
            Text = defaultValue,
            Dock = DockStyle.Top,
            Margin = new Padding(12)
        };

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.RightToLeft,
            Height = 48,
            Padding = new Padding(8)
        };

        var okButton = new Button { Text = "Tamam", DialogResult = DialogResult.OK, Width = 90 };
        var cancelButton = new Button { Text = "İptal", DialogResult = DialogResult.Cancel, Width = 90 };
        buttons.Controls.Add(okButton);
        buttons.Controls.Add(cancelButton);

        form.Controls.Add(buttons);
        form.Controls.Add(textBox);
        form.Controls.Add(labelControl);
        form.AcceptButton = okButton;
        form.CancelButton = cancelButton;

        return form.ShowDialog() == DialogResult.OK ? textBox.Text.Trim() : null;
    }

    public static ReportTemplateRecord? SelectTemplate(IReadOnlyList<ReportTemplateRecord> templates)
    {
        using var form = new Form
        {
            Text = "Veritabanından Aç",
            StartPosition = FormStartPosition.CenterParent,
            Width = 620,
            Height = 420,
            MinimumSize = new Size(500, 300)
        };

        var listBox = new ListBox
        {
            Dock = DockStyle.Fill,
            IntegralHeight = false
        };

        foreach (var template in templates)
        {
            listBox.Items.Add(template);
        }

        var infoLabel = new Label
        {
            Text = "Açılacak FastReport .frx tasarımını seçin.",
            Dock = DockStyle.Top,
            Height = 38,
            Padding = new Padding(12, 10, 12, 0)
        };

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.RightToLeft,
            Height = 52,
            Padding = new Padding(8)
        };

        var openButton = new Button { Text = "Aç", DialogResult = DialogResult.OK, Width = 90 };
        var cancelButton = new Button { Text = "İptal", DialogResult = DialogResult.Cancel, Width = 90 };
        buttons.Controls.Add(openButton);
        buttons.Controls.Add(cancelButton);

        listBox.DoubleClick += (_, _) =>
        {
            if (listBox.SelectedItem is not null)
            {
                form.DialogResult = DialogResult.OK;
                form.Close();
            }
        };

        form.Controls.Add(listBox);
        form.Controls.Add(infoLabel);
        form.Controls.Add(buttons);
        form.AcceptButton = openButton;
        form.CancelButton = cancelButton;

        if (templates.Count > 0)
        {
            listBox.SelectedIndex = 0;
        }

        return form.ShowDialog() == DialogResult.OK
            ? listBox.SelectedItem as ReportTemplateRecord
            : null;
    }
}
