using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;
using RetailEX.PrintServer.Designer.Logging;

namespace RetailEX.PrintServer.Designer.FastReport;

/// <summary>
/// FastReport runtime sarmalayıcısı. qrprint QrPrintDesktop.App projesindeki
/// kanıtlanmış kalıbı kullanır:
///   1) Editor.dll'i ONCE yükle (FastReport.Editor.dll)
///   2) FastReport.dll'i yükle
///   3) "FastReport.Report" tipini reflection ile bul
///   4) Report.Design() / Report.Load / Report.Save / Report.Print / ShowPrepared
///
/// Designer kontrolunu Form'a gommek yerine FastReport'un kendi bagimsiz
/// tasarim/onzleme penceresini aciyoruz. Bu hem daha stabil, hem de FastReport
/// lisansli API'siyle tam uyumlu.
/// </summary>
internal sealed class FastReportDesignerHost : IDisposable
{
    private readonly Panel _hostPanel;
    private readonly Label _messageLabel;
    private readonly string? _libDirectory;

    private Assembly? _fastReportAssembly;
    private Assembly? _editorAssembly;
    private object? _report;
    private readonly List<Assembly> _loadedAssemblies = new();

    public FastReportDesignerHost(Panel hostPanel, string? libDirectory = null)
    {
        _hostPanel = hostPanel;
        _messageLabel = CreateMessageLabel();
        _libDirectory = ResolveLibDirectory(libDirectory);
        Initialize();
    }

    /// <summary>FastReport.Report tipi bulundu mu?</summary>
    public bool IsAvailable => _report is not null && _fastReportAssembly is not null;

    /// <summary>Status mesajı; ana forma yansıtılır.</summary>
    public string StatusMessage { get; private set; } = "FastReport yüklenmedi.";

    /// <summary>Çözümlenen lib dizini (debug için).</summary>
    public string? LibDirectory => _libDirectory;

    /// <summary>Yeni boş bir FastReport raporu oluşturur.</summary>
    public void NewReport()
    {
        EnsureFastReportAvailable();
        _report = CreateReportInstance();
        StatusMessage = "Yeni rapor oluşturuldu.";
        ShowInfoMessage(StatusMessage);
    }

    /// <summary>Bir .frx dosyasını yükler.</summary>
    public void LoadFromFile(string path)
    {
        EnsureFastReportAvailable();
        _report ??= CreateReportInstance();
        InvokeReportMethod("Load", path);
        StatusMessage = $"Rapor yüklendi: {Path.GetFileName(path)}";
        ShowInfoMessage(StatusMessage);
    }

    /// <summary>Byte[] olarak verilen .frx içeriğini yükler.</summary>
    public void LoadFromBytes(byte[] frxBytes)
    {
        var tempPath = Path.Combine(Path.GetTempPath(), $"retailex-designer-{Guid.NewGuid():N}.frx");
        File.WriteAllBytes(tempPath, frxBytes);
        try
        {
            LoadFromFile(tempPath);
        }
        finally
        {
            TryDelete(tempPath);
        }
    }

    /// <summary>Raporu byte[] olarak döner (FRX formatında).</summary>
    public byte[] SaveToBytes()
    {
        EnsureFastReportAvailable();
        if (_report is null) throw new InvalidOperationException("Önce bir rapor yükleyin.");

        var tempPath = Path.Combine(Path.GetTempPath(), $"retailex-designer-{Guid.NewGuid():N}.frx");
        try
        {
            InvokeReportMethod("Save", tempPath);
            return File.ReadAllBytes(tempPath);
        }
        finally
        {
            TryDelete(tempPath);
        }
    }

    /// <summary>Raporu belirtilen dosya yoluna yazar.</summary>
    public void SaveToFile(string path)
    {
        var bytes = SaveToBytes();
        File.WriteAllBytes(path, bytes);
        StatusMessage = $"Rapor kaydedildi: {Path.GetFileName(path)}";
    }

    /// <summary>FastReport önizleme penceresini açar.</summary>
    public void Preview()
    {
        EnsureFastReportAvailable();
        _report ??= CreateReportInstance();

        // Prepare(false) ile veriyi bağla; ShowPrepared ile önizleme penceresini aç.
        InvokeReportMethod("Prepare", false);
        InvokeReportMethod("ShowPrepared");
    }

    /// <summary>FastReport tasarım penceresini ayrı bir pencere olarak açar (qrprint kalıbı).</summary>
    public void OpenDesignerWindow()
    {
        EnsureFastReportAvailable();
        _report ??= CreateReportInstance();

        // qrprint kalıbı: parameterless VEYA bool parameter.
        var reportType = _report.GetType();
        var designMethod = reportType.GetMethod("Design", Type.EmptyTypes)
            ?? reportType.GetMethod("Design", new[] { typeof(bool) });

        if (designMethod is null)
            throw new InvalidOperationException("FastReport Design metodu bulunamadı.");

        object? result = designMethod.GetParameters().Length == 0
            ? designMethod.Invoke(_report, null)
            : designMethod.Invoke(_report, new object[] { true });

        DesignerLog.Info("Design() cagirildi, sonuc tipi: " + (result?.GetType().FullName ?? "null"));
    }

    /// <summary>
    /// Report nesnesine RegisterData ile tablo bağlar; böylece önizlemede gerçek veri görünür.
    /// qrprint kalıbı: RegisterData(DataTable, string).
    /// </summary>
    public void RegisterDataTable(string name, DataTable table)
    {
        EnsureFastReportAvailable();
        _report ??= CreateReportInstance();

        var method = _report.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public)
            .FirstOrDefault(m => m.Name == "RegisterData"
                && m.GetParameters().Length == 2
                && m.GetParameters()[0].ParameterType.IsAssignableFrom(typeof(DataTable))
                && m.GetParameters()[1].ParameterType == typeof(string));

        if (method is null)
        {
            DesignerLog.Warn($"FastReport.RegisterData(DataTable, string) bulunamadı; '{name}' bağlanamadı.");
            return;
        }

        method.Invoke(_report, new object[] { table, name });
    }

    // ----- Private -----

    private void Initialize()
    {
        if (_libDirectory is null || !File.Exists(Path.Combine(_libDirectory, "FastReport.dll")))
        {
            ShowMessage("FastReport DLL'leri eksik",
                "FastReport.dll, FastReport.Bars.dll ve FastReport.Editor.dll dosyalarını\n" +
                (_libDirectory ?? "Designer\\lib") + " klasörüne kopyalayın.");
            StatusMessage = "FastReport DLL yok.";
            return;
        }

        try
        {
            // Editor.dll'i ÖNCE yükle (qrprint kalıbı).
            var editorPath = Path.Combine(_libDirectory, "FastReport.Editor.dll");
            if (File.Exists(editorPath))
            {
                _editorAssembly = Assembly.LoadFrom(editorPath);
                _loadedAssemblies.Add(_editorAssembly);
            }

            // FastReport.dll'i yükle + lib klasöründeki diğer bağımlılıkları.
            AppDomain.CurrentDomain.AssemblyResolve += ResolveFromLibDirectory;
            foreach (var dll in Directory.EnumerateFiles(_libDirectory, "*.dll")
                .OrderBy(PrioritizeFastReportDll))
            {
                try
                {
                    var asm = Assembly.LoadFrom(dll);
                    _loadedAssemblies.Add(asm);
                    if (string.Equals(Path.GetFileName(dll), "FastReport.dll", StringComparison.OrdinalIgnoreCase))
                    {
                        _fastReportAssembly = asm;
                    }
                }
                catch (Exception ex)
                {
                    DesignerLog.Warn($"Assembly yüklenemedi: {Path.GetFileName(dll)}", ex);
                }
            }

            if (_fastReportAssembly is null)
                throw new FileNotFoundException("FastReport.dll yüklenemedi.", Path.Combine(_libDirectory, "FastReport.dll"));

            // Report instance oluşturma testi (yoksa tasarım/önizleme patlar).
            _report = CreateReportInstance();

            if (_report is null)
                throw new InvalidOperationException("FastReport.Report örneği oluşturulamadı.");

            ShowInfoMessage(
                "FastReport yüklendi.\n\n" +
                "• Tasarım için → 'Designer Pencere'\n" +
                "• Önizleme için → 'Önizleme'\n" +
                "• DB'ye Kaydet için → 'DB'ye Kaydet'\n\n" +
                "Lib: " + _libDirectory);
            StatusMessage = "FastReport hazır.";
        }
        catch (Exception ex)
        {
            DesignerLog.Error("FastReport yükleme hatası", ex);
            ShowMessage("FastReport yüklenemedi", ex.Message);
            StatusMessage = $"FastReport yüklenemedi: {ex.Message}";
        }
    }

    private Assembly? ResolveFromLibDirectory(object? sender, ResolveEventArgs args)
    {
        if (string.IsNullOrWhiteSpace(_libDirectory)) return null;
        var assemblyName = new AssemblyName(args.Name).Name;
        if (string.IsNullOrWhiteSpace(assemblyName)) return null;
        var candidate = Path.Combine(_libDirectory, $"{assemblyName}.dll");
        return File.Exists(candidate) ? Assembly.LoadFrom(candidate) : null;
    }

    private object CreateReportInstance()
    {
        if (_fastReportAssembly is null)
            throw new InvalidOperationException("FastReport.dll yüklü değil.");
        var reportType = _fastReportAssembly.GetType("FastReport.Report")
            ?? throw new InvalidOperationException("FastReport.Report tipi bulunamadı.");
        return Activator.CreateInstance(reportType)
            ?? throw new InvalidOperationException("FastReport.Report oluşturulamadı.");
    }

    private void InvokeReportMethod(string methodName, params object[] args)
    {
        if (_report is null) throw new InvalidOperationException("Aktif rapor yok.");
        var method = _report.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public)
            .FirstOrDefault(m => m.Name == methodName && m.GetParameters().Length == args.Length);
        if (method is null)
            throw new MissingMethodException(_report.GetType().FullName, methodName);
        method.Invoke(_report, args);
    }

    private void EnsureFastReportAvailable()
    {
        if (!IsAvailable)
            throw new InvalidOperationException("FastReport DLL'lerini lib/ klasörüne koyun.");
    }

    private void ShowMessage(string title, string details)
    {
        _hostPanel.Controls.Clear();
        _messageLabel.Text = $"{title}\n\n{details}";
        _messageLabel.ForeColor = Color.FromArgb(220, 38, 38); // kırmızı
        _hostPanel.Controls.Add(_messageLabel);
    }

    private void ShowInfoMessage(string text)
    {
        _hostPanel.Controls.Clear();
        _messageLabel.Text = text;
        _messageLabel.ForeColor = Color.FromArgb(30, 64, 175); // mavi
        _hostPanel.Controls.Add(_messageLabel);
    }

    private static Label CreateMessageLabel()
    {
        return new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 11F, FontStyle.Regular),
            ForeColor = Color.FromArgb(30, 64, 175),
            Padding = new Padding(32)
        };
    }

    private static string? ResolveLibDirectory(string? configured)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(configured))
        {
            candidates.Add(Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(AppContext.BaseDirectory, configured));
        }
        candidates.Add(Path.Combine(AppContext.BaseDirectory, "lib"));
        candidates.Add(Path.Combine(Environment.CurrentDirectory, "lib"));

        return candidates.FirstOrDefault(c => File.Exists(Path.Combine(c, "FastReport.dll")));
    }

    private static int PrioritizeFastReportDll(string path)
    {
        return Path.GetFileName(path) switch
        {
            "FastReport.Editor.dll" => -1, // ÖNCE
            "FastReport.dll" => 0,
            "FastReport.Bars.dll" => 1,
            _ => 10
        };
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch { /* silinemezse sessiz geç */ }
    }

    public void Dispose()
    {
        AppDomain.CurrentDomain.AssemblyResolve -= ResolveFromLibDirectory;
        try { (_report as IDisposable)?.Dispose(); } catch { }
    }
}
