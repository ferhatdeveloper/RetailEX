using System.Collections.Generic;

namespace RetailEX.PrintServer.Core.Models;

/// <summary>
/// Bir yaziciya ait tum baglanti/yapilandirma bilgisi.
/// app_settings.restaurant_printer_config.routes[*].PrinterProfileId uzerinden cagrilir.
/// </summary>
public sealed class PrinterProfile
{
    /// <summary>Benzersiz profil kimligi (tenant icinde).</summary>
    public string Id = "";

    /// <summary>Insan-okur adi (ornek: "Mutfak - Termal 80mm").</summary>
    public string Name = "";

    /// <summary>Baglanti tipi: network | bluetooth | system | fastreport | label.</summary>
    public string Kind = "system";

    /// <summary>Network: IP/host. Label/Network ESC/POS icin kullanilir.</summary>
    public string? Address;

    /// <summary>Network: TCP port (varsayilan 9100).</summary>
    public int Port = 9100;

    /// <summary>Sistem yazici adi (Windows printer queue).</summary>
    public string? SystemName;

    /// <summary>Bluetooth cihaz adı/ID (Windows Rfcomm).</summary>
    public string? BluetoothDeviceName;

    /// <summary>USB device URI (opsiyonel).</summary>
    public string? UsbDeviceUri;

    /// <summary>Karakter seti (ornek: PC857, WPC1252, UTF-8).</summary>
    public string Charset = "PC857";

    /// <summary>Yazici genisligi (mm): 58 | 80 | 100 ...</summary>
    public int PaperWidthMm = 80;

    /// <summary>Kagit uzunlugu (mm, A4=210x297, A5=148x210, vs.).</summary>
    public int PaperHeightMm = 0;

    /// <summary>Profil seviyesinde opsiyonlar.</summary>
    public Dictionary<string, object?> Options = new();

    /// <summary>Profil aktif mi.</summary>
    public bool Enabled = true;
}
