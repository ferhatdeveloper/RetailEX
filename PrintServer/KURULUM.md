# RetailEX Printer kurulumu

## Hazır exe

1. `PrintServer/releases/RetailEX.Printer` klasörünün tamamını kopyalayın.
2. `RetailEX.QrPrint.exe` çalıştırın.
3. Ayarlar: API `https://api.retailex.app`, tenant kodu, firma/dönem, mutfak yazıcısı.
4. Uygulamayı tepside bırakın (X = gizle, Çıkış = kapat).

Tek dosyayı ayırıp taşımayın. FastReport DLL’leri, `Reports` ve runtime aynı klasörde durmalıdır.

## Windows servisi

Yönetici PowerShell:

```powershell
cd PrintServer
.\install-service.ps1
```

Arayüz/tepsi açıkken servis yazdırmaz; kullanıcı oturumundaki ajan basar.

Kaldırma: `.\uninstall-service.ps1`
