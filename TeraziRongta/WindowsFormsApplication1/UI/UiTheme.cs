using System;
using System.Drawing;
using System.Windows.Forms;

namespace WindowsFormsApplication1.UI
{
    public static class UiTheme
    {
        public static readonly Color Background = Color.FromArgb(15, 23, 42);
        public static readonly Color Panel = Color.FromArgb(30, 41, 59);
        public static readonly Color Border = Color.FromArgb(51, 65, 85);
        public static readonly Color Text = Color.FromArgb(226, 232, 240);
        public static readonly Color Muted = Color.FromArgb(148, 163, 184);
        public static readonly Color Accent = Color.FromArgb(59, 130, 246);
        public static readonly Color AccentHover = Color.FromArgb(37, 99, 235);
        public static readonly Color Success = Color.FromArgb(34, 197, 94);
        public static readonly Color Warning = Color.FromArgb(245, 158, 11);
        public static readonly Color Danger = Color.FromArgb(239, 68, 68);
        public static readonly Color InputBg = Color.FromArgb(15, 23, 42);

        public static void ApplyForm(Form form)
        {
            form.BackColor = Background;
            form.ForeColor = Text;
            form.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
        }

        public static void StylePrimaryButton(Button button)
        {
            StyleButton(button, Accent, Color.White);
        }

        public static void StyleSecondaryButton(Button button)
        {
            StyleButton(button, Border, Text);
        }

        public static void StyleDangerButton(Button button)
        {
            StyleButton(button, Danger, Color.White);
        }

        public static void StyleButton(Button button, Color back, Color fore)
        {
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.BackColor = back;
            button.ForeColor = fore;
            button.Cursor = Cursors.Hand;
            button.Height = 36;
            button.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
        }

        public static void StyleTextBox(TextBox textBox)
        {
            textBox.BackColor = InputBg;
            textBox.ForeColor = Text;
            textBox.BorderStyle = BorderStyle.FixedSingle;
        }

        public static void StyleNumeric(NumericUpDown numeric)
        {
            numeric.BackColor = InputBg;
            numeric.ForeColor = Text;
            numeric.BorderStyle = BorderStyle.FixedSingle;
        }

        public static void StyleCheckBox(CheckBox checkBox)
        {
            checkBox.ForeColor = Text;
            checkBox.BackColor = Color.Transparent;
        }

        public static void StyleComboBox(ComboBox comboBox)
        {
            comboBox.BackColor = InputBg;
            comboBox.ForeColor = Text;
            comboBox.FlatStyle = FlatStyle.Flat;
        }

        public static void StylePanel(Panel panel, bool card = true)
        {
            panel.BackColor = card ? Panel : Background;
            panel.ForeColor = Text;
        }

        public static void StyleTabControl(TabControl tabs)
        {
            tabs.DrawMode = TabDrawMode.OwnerDrawFixed;
            tabs.SizeMode = TabSizeMode.Fixed;
            tabs.ItemSize = new Size(108, 36);
            tabs.Padding = new Point(12, 6);
            tabs.Multiline = false;
            tabs.DrawItem += (sender, e) =>
            {
                var tab = tabs.TabPages[e.Index];
                var selected = e.Index == tabs.SelectedIndex;
                var back = selected ? Accent : Panel;
                var fore = selected ? Color.White : Muted;
                using (var brush = new SolidBrush(back))
                {
                    e.Graphics.FillRectangle(brush, e.Bounds);
                }

                var textRect = new Rectangle(e.Bounds.X + 4, e.Bounds.Y + 8, e.Bounds.Width - 8, e.Bounds.Height - 8);
                TextRenderer.DrawText(
                    e.Graphics,
                    tab.Text,
                    new Font("Segoe UI Semibold", 9F, FontStyle.Bold),
                    textRect,
                    fore,
                    TextFormatFlags.HorizontalCenter);
            };
        }

        public static void StyleGrid(DataGridView grid)
        {
            grid.BackgroundColor = Panel;
            grid.BorderStyle = BorderStyle.None;
            grid.EnableHeadersVisualStyles = false;
            grid.ColumnHeadersDefaultCellStyle.BackColor = Background;
            grid.ColumnHeadersDefaultCellStyle.ForeColor = Muted;
            grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
            grid.DefaultCellStyle.BackColor = Panel;
            grid.DefaultCellStyle.ForeColor = Text;
            grid.DefaultCellStyle.SelectionBackColor = Accent;
            grid.DefaultCellStyle.SelectionForeColor = Color.White;
            grid.GridColor = Border;
            grid.RowHeadersVisible = false;
            grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        }

        public static Label CreateTitle(string text)
        {
            return new Label
            {
                Text = text,
                ForeColor = Text,
                Font = new Font("Segoe UI Semibold", 11F, FontStyle.Bold),
                AutoSize = true,
            };
        }

        public static Label CreateSubtitle(string text)
        {
            return new Label
            {
                Text = text,
                ForeColor = Muted,
                Font = new Font("Segoe UI", 8.5F),
                AutoSize = true,
            };
        }
    }
}
