using System;
using System.ComponentModel;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using RetailEX.PrintServer.Core.Config;
using RetailEX.PrintServer.Core.Models;

namespace RetailEX.PrintServer.Core.Rendering.EscPos;

/// <summary>
/// Bluetooth ESC/POS yazici renderer (Windows 10+ Rfcomm API).
/// Bu sinif gercek bir BT yazici bulunmadiginda <see cref="NotSupportedException"/> firlatir;
/// gercek implementasyon icin Windows.Devices.Bluetooth.Rfcomm baglamasi gerekir.
/// </summary>
public sealed class BluetoothEscPosRenderer
{
    private readonly PrintServerConfig _cfg;
    private readonly ILogger _log;

    public BluetoothEscPosRenderer(PrintServerConfig cfg, ILogger log)
    {
        _cfg = cfg ?? throw new ArgumentNullException(nameof(cfg));
        _log = log ?? throw new ArgumentNullException(nameof(log));
    }

    public async Task RenderAsync(PrintJob job, PrinterProfile profile, CancellationToken ct)
    {
        if (job == null) throw new ArgumentNullException(nameof(job));
        if (profile == null) throw new ArgumentNullException(nameof(profile));

        _log.LogInformation("BluetoothEscPos: {Device} uzerinden yazma denemesi (job={JobId}).", profile.BluetoothDeviceName ?? profile.Name, job.Id);

        await Task.Yield();

        if (!OperatingSystem.IsWindows())
        {
            throw new NotSupportedException("BluetoothEscPos yalnizca Windows 10+ uzerinde desteklenir.");
        }

        // Burada Windows.Devices.Bluetooth.Rfcomm cagirilmasi gerekir.
        // Hedef cihaz profile.BluetoothDeviceName veya profile.SystemName ile eslenir;
        // DeviceInformation.FindAllAsync(RfcommDeviceService.GetDeviceSelector(...))
        // sonrasinda StreamSocket uzerinden EscPosNetworkRenderer gibi yazilir.
        // Mevcut build ortaminda WinRT API baglamasi yok; bu yuzden acik bir NotSupportedException firlatilir.
        throw new NotSupportedException(
            "BluetoothEscPosRenderer henuz aktif degil. Cihaz esleme + Rfcomm servis acma icin Windows.Devices.Bluetooth entegrasyonu gerekir; " +
            "saglayici implementasyonu profile.BluetoothDeviceName uzerinden DeviceInformation.FindAllAsync ile cagirip " +
            "StreamSocket.OutputStream uzerinden ESC/POS byte yazmali.");
    }

    internal void EnsureWin32OrThrow()
    {
        try
        {
            var _ = Environment.OSVersion;
        }
        catch (Win32Exception ex)
        {
            _log.LogWarning(ex, "BluetoothEscPos: Win32 bilgisi okunamadi.");
        }
    }
}
