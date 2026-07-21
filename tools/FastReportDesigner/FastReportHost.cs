using System.Reflection;

namespace RetailEX.FastReportDesigner;

internal sealed class FastReportHost
{
    private readonly Panel _hostPanel;
    private readonly Label _messageLabel;
    private readonly List<Assembly> _loadedAssemblies = [];
    private object? _report;
    private Control? _designerControl;
    private string? _libDirectory;
    private byte[]? _lastFrxBytes;

    public FastReportHost(Panel hostPanel)
    {
        _hostPanel = hostPanel;
        _messageLabel = CreateMessageLabel();
        Initialize();
    }

    public bool IsAvailable => _report is not null;
    public bool HasDesignerControl => _designerControl is not null;
    public string StatusMessage { get; private set; } = string.Empty;

    public void NewReport()
    {
        EnsureFastReportAvailable();
        _report = CreateReport();
        _lastFrxBytes = null;
        AttachReportToDesigner();
    }

    public void LoadFromFile(string path)
    {
        EnsureFastReportAvailable();
        _report ??= CreateReport();
        InvokeReportMethod("Load", path);
        _lastFrxBytes = File.ReadAllBytes(path);
        AttachReportToDesigner();
    }

    public void LoadFromBytes(byte[] frxBytes)
    {
        EnsureFastReportAvailable();
        var tempPath = Path.Combine(Path.GetTempPath(), $"retailex-fastreport-{Guid.NewGuid():N}.frx");
        File.WriteAllBytes(tempPath, frxBytes);
        try
        {
            LoadFromFile(tempPath);
            _lastFrxBytes = frxBytes;
        }
        finally
        {
            TryDelete(tempPath);
        }
    }

    public byte[] SaveToBytes()
    {
        EnsureFastReportAvailable();
        _report ??= CreateReport();

        var reportType = _report.GetType();
        var streamSave = reportType.GetMethods()
            .FirstOrDefault(x => x.Name == "Save"
                && x.GetParameters().Length == 1
                && typeof(Stream).IsAssignableFrom(x.GetParameters()[0].ParameterType));

        if (streamSave is not null)
        {
            using var stream = new MemoryStream();
            streamSave.Invoke(_report, [stream]);
            _lastFrxBytes = stream.ToArray();
            return _lastFrxBytes;
        }

        var tempPath = Path.Combine(Path.GetTempPath(), $"retailex-fastreport-{Guid.NewGuid():N}.frx");
        try
        {
            InvokeReportMethod("Save", tempPath);
            _lastFrxBytes = File.ReadAllBytes(tempPath);
            return _lastFrxBytes;
        }
        finally
        {
            TryDelete(tempPath);
        }
    }

    public void SaveToFile(string path)
    {
        File.WriteAllBytes(path, SaveToBytes());
    }

    public void Preview()
    {
        EnsureFastReportAvailable();
        _report ??= CreateReport();

        if (TryInvokeReportMethod("Show"))
        {
            return;
        }

        TryInvokeReportMethod("Prepare");
        if (TryInvokeReportMethod("ShowPrepared"))
        {
            return;
        }

        if (!TryInvokeReportMethod("Design"))
        {
            throw new InvalidOperationException("FastReport önizleme metodu bulunamadı.");
        }
    }

    public void OpenDesignerWindow()
    {
        EnsureFastReportAvailable();
        _report ??= CreateReport();
        if (!TryInvokeReportMethod("Design"))
        {
            throw new InvalidOperationException("FastReport Design metodu bulunamadı.");
        }
    }

    private void Initialize()
    {
        try
        {
            _libDirectory = FindLibDirectory();
            if (_libDirectory is null)
            {
                ShowMessage("FastReport DLL'lerini lib/ klasörüne koyun", "lib/FastReport.dll bulunamadı.");
                StatusMessage = "FastReport DLL yok.";
                return;
            }

            AppDomain.CurrentDomain.AssemblyResolve += ResolveFromLibDirectory;
            LoadFastReportAssemblies(_libDirectory);
            _report = CreateReport();
            _designerControl = CreateDesignerControl();

            if (_designerControl is null)
            {
                ShowMessage("FastReport yüklendi, designer control bulunamadı", "Toolbar'daki Önizleme veya harici Design penceresi kullanılabilir.");
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
            ShowMessage("FastReport DLL'lerini lib/ klasörüne koyun", ex.Message);
            StatusMessage = $"FastReport yüklenemedi: {ex.Message}";
        }
    }

    private Assembly? ResolveFromLibDirectory(object? sender, ResolveEventArgs args)
    {
        if (string.IsNullOrWhiteSpace(_libDirectory))
        {
            return null;
        }

        var assemblyName = new AssemblyName(args.Name).Name;
        if (string.IsNullOrWhiteSpace(assemblyName))
        {
            return null;
        }

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
            catch
            {
                // FastReport'e ait olmayan yardımcı DLL varsa designer tamamen düşmesin.
            }
        }

        if (_loadedAssemblies.All(x => !string.Equals(x.GetName().Name, "FastReport", StringComparison.OrdinalIgnoreCase)))
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
                .FirstOrDefault(x => typeof(Control).IsAssignableFrom(x)
                    && x.Name.Contains("DesignerControl", StringComparison.OrdinalIgnoreCase));

        if (designerType is null)
        {
            return null;
        }

        return Activator.CreateInstance(designerType) as Control;
    }

    private void AttachReportToDesigner()
    {
        if (_designerControl is null || _report is null)
        {
            return;
        }

        var designerType = _designerControl.GetType();
        var reportProperty = designerType.GetProperty("Report", BindingFlags.Instance | BindingFlags.Public);
        if (reportProperty is not null && reportProperty.CanWrite)
        {
            reportProperty.SetValue(_designerControl, _report);
            return;
        }

        var reportMethod = designerType.GetMethods(BindingFlags.Instance | BindingFlags.Public)
            .FirstOrDefault(x => x.Name is "SetReport" or "SetReportObject"
                && x.GetParameters().Length == 1
                && x.GetParameters()[0].ParameterType.IsAssignableFrom(_report.GetType()));

        reportMethod?.Invoke(_designerControl, [_report]);
    }

    private Type? FindType(string fullName)
    {
        foreach (var assembly in _loadedAssemblies)
        {
            var type = assembly.GetType(fullName, throwOnError: false, ignoreCase: false);
            if (type is not null)
            {
                return type;
            }
        }

        return Type.GetType(fullName, throwOnError: false, ignoreCase: false);
    }

    private void InvokeReportMethod(string methodName, params object[] args)
    {
        if (!TryInvokeReportMethod(methodName, args))
        {
            throw new MissingMethodException(_report?.GetType().FullName, methodName);
        }
    }

    private bool TryInvokeReportMethod(string methodName, params object[] args)
    {
        if (_report is null)
        {
            return false;
        }

        var method = _report.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public)
            .FirstOrDefault(x => x.Name == methodName
                && x.GetParameters().Length == args.Length
                && x.GetParameters().Zip(args).All(pair => pair.First.ParameterType.IsInstanceOfType(pair.Second)
                    || pair.Second is string && pair.First.ParameterType == typeof(string)));

        if (method is null)
        {
            return false;
        }

        method.Invoke(_report, args);
        return true;
    }

    private void EnsureFastReportAvailable()
    {
        if (!IsAvailable)
        {
            throw new InvalidOperationException("FastReport DLL'lerini tools/FastReportDesigner/lib/ klasörüne koyun.");
        }
    }

    private void ShowMessage(string title, string details)
    {
        _hostPanel.Controls.Clear();
        _messageLabel.Text = $"{title}{Environment.NewLine}{Environment.NewLine}{details}";
        _hostPanel.Controls.Add(_messageLabel);
    }

    private static Label CreateMessageLabel()
    {
        return new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 16F, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 64, 175),
            Padding = new Padding(32)
        };
    }

    private static string? FindLibDirectory()
    {
        foreach (var directory in CandidateLibDirectories())
        {
            var fastReportDll = Path.Combine(directory, "FastReport.dll");
            if (File.Exists(fastReportDll))
            {
                return directory;
            }
        }

        return null;
    }

    private static IEnumerable<string> CandidateLibDirectories()
    {
        yield return Path.Combine(AppContext.BaseDirectory, "lib");
        yield return Path.Combine(Environment.CurrentDirectory, "lib");
        yield return Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "lib"));
    }

    private static IEnumerable<Type> SafeGetTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            return ex.Types.Where(x => x is not null).Cast<Type>();
        }
    }

    private static int PrioritizeFastReportDll(string path)
    {
        var name = Path.GetFileName(path);
        return name switch
        {
            "FastReport.dll" => 0,
            "FastReport.Bars.dll" => 1,
            "FastReport.Editor.dll" => 2,
            _ => 10
        };
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // Temp dosya silinemese bile kullanıcı işlemi tamamlanmıştır.
        }
    }
}
