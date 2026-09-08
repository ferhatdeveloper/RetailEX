# RetailEX Printer

Mutfak, hesap ve QR siparişlerini RetailEX API’den okuyup **80mm FastReport** şablonlarıyla yazdıran Windows ajanı.

Bu klasör eski `PrintServer` (print_jobs / printer_profiles) yerine geçer. Yazdırma bu uygulamanın kendi şablonlarıyla yapılır.

## Ne içerir

- **RetailEX.QrPrint.exe** — tepsi (tray) WinForms paneli, sipariş listesi, şablon tasarımcısı
- **RetailEX_Printer_Service.exe** — Windows servisi (`RetailEX_Printer`); arayüz açıkken basmaz
- FastReport şablonları: `Reports/{tr,en,ar,ku,uz}/Kitchen80.frx` ve `Account80.frx`

## Çalıştırma

1. `releases/RetailEX.Printer/RetailEX.QrPrint.exe` dosyasını açın (önerilen: tepside kalsın).
2. Tenant, firma, dönem ve mutfak yazıcısını kaydedin.
3. **Sipariş alma** ve **Otomatik mutfak yazdırma** açık olsun.
4. X ile kapatınca tepside taramaya devam eder. Tam çıkış: tepsi → sağ tık → **Çıkış**.

Servis kurulumu (yönetici PowerShell):

```powershell
.\install-service.ps1
```

## Kaynak derleme

.NET 9 Windows SDK gerekir.

```powershell
dotnet publish QrPrintDesktop.App\QrPrintDesktop.App.csproj -c Release -r win-x64 --self-contained true -o releases\RetailEX.Printer
```

## Ayarlar

`C:\ProgramData\RetailEX\QrPrint\settings.json`
