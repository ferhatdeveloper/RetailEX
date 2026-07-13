using System;
using System.Windows.Forms;

namespace WindowsFormsApplication1
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (_, e) => ShowFatal(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            {
                ShowFatal(e.ExceptionObject as Exception ?? new Exception(Convert.ToString(e.ExceptionObject)));
            };

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                Application.Run(new Form1());
            }
            catch (Exception ex)
            {
                ShowFatal(ex);
            }
        }

        static void ShowFatal(Exception ex)
        {
            try
            {
                var msg = ex == null ? "Bilinmeyen hata" : (ex.InnerException ?? ex).ToString();
                MessageBox.Show(
                    "RetailEX Terazi Yönetici başlatılamadı:\n\n" + msg,
                    "RetailEX Terazi Yönetici",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            catch
            {
                // UI yoksa sessizce cik
            }
        }
    }
}
