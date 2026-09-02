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
/// FastReport designer + preview control sarmalayıcısı.
/// Lisanlı DLL'ler lib/ klasöründe tutulur; runtime'da <see cref="Assembly.LoadFrom"/> ile yüklenir.
/// </summary>
internal sealed class FastReportDesignerHost : IDisposable
{
    private readonly Panel _hostPanel;
    private readonly Label _messageLabel;
    private readonly List<Assembly> _loadedAssemblies = new();
    private readonly string? _libDirectory;

    private object? _report;
    private Control? _designerControl;

    public FastReportDesignerHost(Panel hostPanel, string? libDirectory = null)
    {
        _hostPanel = hostPanel;
        _messageLabel = CreateMessageLabel();
        _libDirectory = ResolveLibDirectory(libDirectory);
        Initialize();
    }

    public bool IsAvailable => _report is not null && _designerControl is not null;
    public string StatusMessage { get; private set; } = "FastReport yüklenmedi.";
    public string? LibDirectory => _libDirectory;

    /// <summary>Boş bir FastReport raporu oluşturur.</summary>
    public void NewReport()
    {
        EnsureFastReportAvailable();
        _report = CreateReport();
        AttachReportToDesigner();
    }

    /// <summary>Bir .frx dosyasını yükler.</summary>
    public void LoadFromFile(string path)
    {
        EnsureFastReportAvailable();
        _report ??= CreateReport();
        InvokeReportMethod("Load", path);
        AttachReportToDesigner();
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
        _report ??= CreateReport();

        var reportType = _report.GetType();
        var streamSave = reportType.GetMethods()
            .FirstOrDefault(m => m.Name == "Save"
                && m.GetParameters().Length == 1
                && typeof(Stream).IsAssignableFrom(m.GetParameters()[0].ParameterType));

        if (streamSave is not null)
        {
            using var stream = new MemoryStream();
            streamSave.Invoke(_report, new object[] { stream });
            return stream.ToArray();
        }

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
    }

    /// <summary>FastReport preview penceresini açar.</summary>
    public void Preview()
    {
        EnsureFastReportAvailable();
        _report ??= CreateReport();

        if (TryInvokeReportMethod("Show")) return;
        if (TryInvokeReportMethod("Prepare") && TryInvokeReportMethod("ShowPrepared")) return;
        throw new InvalidOperationException("FastReport önizleme metodu bulunamadı.");
    }

    /// <summary>FastReport tasarım penceresini ayrı bir dialog olarak açar.</summary>
    public void OpenDesignerWindow()
    {
        EnsureFastReportAvailable();
        _report ??= CreateReport();
        if (TryInvokeReportMethod("Design")) return;
        throw new InvalidOperationException("FastReport Design metodu bulunamadı.");
    }

    /// <summary>
    /// Report nesnesini alıp designer'a RegisterData ile tablo bağlar; böylece
    /// önizlemede gerçek veri görünür.
    /// </summary>
    public void RegisterDataTable(string name, DataTable table)
    {
        EnsureFastReportAvailable();
        if (_report is null) _report = CreateReport();

        // FastReport API'si reflection ile çağrılır; RegisterData(DataTable, string)
        var method = _report.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public)
            .FirstOrDefault(m => m.Name == "RegisterData"
                && m.GetParameters().Length == 2
                && typeof(DataSet).IsAssignableFrom(m.GetParameters()[0].ParameterType) == false
                && m.GetParameters()[0].ParameterType.IsAssignableFrom(typeof(DataTable))
                && m.GetParameters()[1].ParameterType == typeof(string));

        if (method is null)
        {
            DesignerLog.Warn("FastReport.RegisterData(DataTable, string) bulunamadı; preview boş kalabilir.");
            return;
        }

        method.Invoke(_report, new object[] { table, name });
    }

    private void Initialize()
    {
        if (_libDirectory is null || !File.Exists(Path.Combine(_libDirectory, "FastReport.dll")))
        {
            ShowMessage("FastReport DLL'lerini lib/ klasörüne koyun",
                "FastReport.dll bulunamadı.\n\nBeklenen konum:\n" + (_libDirectory ?? "(yok)"));
            StatusMessage = "FastReport DLL yok.";
            return;
        }

        try
        {
            AppDomain.CurrentDomain.AssemblyResolve += ResolveFromLibDirectory;
            LoadFastReportAssemblies(_libDirectory);
            _report = CreateReport();
            _designerControl = CreateDesignerControl();

            if (_designerControl is null)
            {
                ShowMessage("FastReport yüklendi, designer control bulunamadı",
                    "Toolbar'daki harici Design penceresi veya Preview kullanılabilir.\n" +
                    "DLL sürümünüzde DesignerControl yoksa yine de önizleme yapabilirsiniz.");
                StatusMessage = "FastReport yüklendi; designer control bulunamadı.";
                return;
            }

            _hostPanel.Controls.Clear();
            _designerControl.Dock = DockStyle.Fill;
            _hostPanel.Controls.Add(_designerControl);
            AttachReportToDesigner();
            StatusMessage = "FastReport designer hazır.";
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

    private void LoadFastReportAssemblies(string libDirectory)
    {
        foreach (var dll in Directory.EnumerateFiles(libDirectory, "*.dll").OrderBy(PrioritizeFastReportDll))
        {
            try
            {
                _loadedAssemblies.Add(Assembly.LoadFrom(dll));
            }
            catch (Exception ex)
            {
                DesignerLog.Warn($"Assembly yüklenemedi: {Path.GetFileName(dll)}", ex);
            }
        }

        if (_loadedAssemblies.All(a => !string.Equals(a.GetName().Name, "FastReport", StringComparison.OrdinalIgnoreCase)))
        {
            throw new FileNotFoundException("FastReport.dll bulunamadı.", Path.Combine(libDirectory, "FastReport.dll"));
        }
    }

    private object CreateReport()
    {
        var reportType = FindType("FastReport.Report")
            ?? throw new InvalidOperationException("FastReport.Report tipi bulunamadı.");
        return Activator.CreateInstance(reportType)
            ?? throw new InvalidOperationException("FastReport.Report oluşturulamadı.");
    }

    private Control? CreateDesignerControl()
    {
        var designerType = FindType("FastReport.Design.StandardDesigner.DesignerControl")
            ?? FindType("FastReport.Design.DesignerControl")
            ?? _loadedAssemblies
                .SelectMany(SafeGetTypes)
                .FirstOrDefault(t => typeof(Control).IsAssignableFrom(t)
                    && t.Name.Contains("DesignerControl", StringComparison.OrdinalIgnoreCase));

        return designerType is null ? null : Activator.CreateInstance(designerType) as Control;
    }

    private void AttachReportToDesigner()
    {
        if (_designerControl is null || _report is null) return;
        var designerType = _designerControl.GetType();
        var reportProperty = designerType.GetProperty("Report", BindingFlags.Instance | BindingFlags.Public);
        if (reportProperty is not null && reportProperty.CanWrite)
        {
            reportProperty.SetValue(_designerControl, _report);
            return;
        }
        var reportMethod = designerType.GetMethods(BindingFlags.Instance | BindingFlags.Public)
            .FirstOrDefault(m => m.Name is "SetReport" or "SetReportObject"
                && m.GetParameters().Length == 1
                && m.GetParameters()[0].ParameterType.IsAssignableFrom(_report.GetType()));
        reportMethod?.Invoke(_designerControl, new object[] { _report });
    }

    private Type? FindType(string fullName)
    {
        foreach (var asm in _loadedAssemblies)
        {
            var t = asm.GetType(fullName, throwOnError: false, ignoreCase: false);
            if (t is not null) return t;
        }
        return Type.GetType(fullName, throwOnError: false, ignoreCase: false);
    }

    private void InvokeReportMethod(string methodName, params object[] args)
    {
        if (!TryInvokeReportMethod(methodName, args))
            throw new MissingMethodException(_report?.GetType().FullName, methodName);
    }

    private bool TryInvokeReportMethod(string methodName, params object[] args)
    {
        if (_report is null) return false;
        var method = _report.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public)
            .FirstOrDefault(m => m.Name == methodName
                && m.GetParameters().Length == args.Length
                && m.GetParameters().Zip(args, (pi, a) => pi.ParameterType.IsInstanceOfType(a)
                    || (a is string && pi.ParameterType == typeof(string))).All(x => x));
        if (method is null) return false;
        method.Invoke(_report, args);
        return true;
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
        _hostPanel.Controls.Add(_messageLabel);
    }

    private static Label CreateMessageLabel()
    {
        return new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 14F, FontStyle.Bold),
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

    private static IEnumerable<Type> SafeGetTypes(Assembly assembly)
    {
        try { return assembly.GetTypes(); }
        catch (ReflectionTypeLoadException ex) { return ex.Types.Where(t => t is not null).Cast<Type>(); }
    }

    private static int PrioritizeFastReportDll(string path)
    {
        return Path.GetFileName(path) switch
        {
            "FastReport.dll" => 0,
            "FastReport.Bars.dll" => 1,
            "FastReport.Editor.dll" => 2,
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
