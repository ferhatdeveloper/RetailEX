using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using QrPrintDesktop.Core.Printing;
using QrPrintDesktop.Core.Windows;
using QrPrintDesktop.Service;

Directory.SetCurrentDirectory(AppContext.BaseDirectory);
try
{
    FastReportThemeFix.Install();
}
catch
{
    // Session 0'da tema yaması olmasa da servis yazdırmaya devam eder
}

var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory
});
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = WindowsServiceHelper.ServiceName;
});
builder.Services.AddHostedService<PrintAgentWorker>();

if (args.Any(a => string.Equals(a, "--console", StringComparison.OrdinalIgnoreCase)))
{
    Console.Title = WindowsServiceHelper.DisplayName;
    Console.WriteLine("Konsol modu — Ctrl+C ile çıkış.");
}

await builder.Build().RunAsync();
