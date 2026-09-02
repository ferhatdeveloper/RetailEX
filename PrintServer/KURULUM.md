# RetailEX PrintServer — Adım Adım Kurulum

Bu doküman **geliştirici / admin** için **üretim makinesinde** ilk kurulumu adım adım anlatır.

## 1) Önkoşullar

- **Windows 10/11 veya Windows Server 2019+** (64-bit)
- **.NET 8 SDK** (geliştirme makinesi) — [https://dotnet.microsoft.com/download/dotnet/8.0](https://dotnet.microsoft.com/download/dotnet/8.0)
- **Inno Setup 6** (sadece kurulum paketi üretmek için) — `choco install innosetup -y`
- **Yönetici** PowerShell / CMD
- **PostgREST** erişimi (RetailEX bulut veya kendi sunucunuz)
- **Windows yazıcı(lar)** kurulu ve bir test sayfası yazdırılabilir

## 2) Derleme (geliştirme makinesi)

```powershell
# Repo kokunden
dotnet build -c Release PrintServer\PrintServer.sln
```

Çıktılar:
- `PrintServer\PrintServer.Service\bin\Release\net8.0-windows\RetailEX_PrintServer.exe`
- `PrintServer\PrintServer.Service\bin\Release\net8.0-windows\RetailEX.PrintServer.Core.dll`

## 3) Inno Setup paketi (geliştirme makinesi)

```powershell
cd PrintServer\installer
.\build-installer.ps1 -Version 1.0.0
```

Çıktı: `installer\output\RetailEX.PrintManager-Setup-1.0.0.exe`

## 4) Üretim makinesinde kurulum

`RetailEX.PrintManager-Setup-1.0.0.exe` dosyasını üretim makinesine kopyalayın ve **yönetici olarak** çalıştırın.

Kurulum sihirbazında:
- **Kurulum dizini:** varsayılan `{autopf}\RetailEX\PrintServer` (örn. `C:\Program Files\RetailEX\PrintServer`)
- **Görev:** `Windows yazıcı servisini kur (RetailEX_PrintServer)` — **işaretli olmalı**
- **Masaüstü kısayolu** — isteğe bağlı

Kurulum sonunda:
- Servis **kurulur** ve **başlatılır**
- `C:\ProgramData\RetailEX\print-server.json` (örnek config) otomatik oluşturulur

## 5) Yapılandırma

`C:\ProgramData\RetailEX\print-server.json` dosyasını açın ve düzenleyin:

```json
{
  "PostgRest": {
    "BaseUrl": "https://api.retailex.app",
    "TenantCode": "kasap",
    "ApiToken": "BURAYA_APIKEY",
    "AuthMode": "apikey"
  },
  "PollIntervalMs": 2500,
  "ClaimLimit": 10,
  "EnableMultiTenant": true
}
```

> **Not:** Config dosyası değiştirildiğinde servis otomatik olarak yeniden yükler (500 ms debounce). Servisi yeniden başlatmaya gerek yok.

## 6) Servisi Yeniden Başlatma (gerekirse)

```powershell
Restart-Service RetailEX_PrintServer
```

veya

```powershell
Stop-Service RetailEX_PrintServer
Start-Service RetailEX_PrintServer
```

## 7) Doğrulama

**Servis durumu:**

```powershell
Get-Service RetailEX_PrintServer
# veya
sc query RetailEX_PrintServer
```

**Log dosyası:**

```powershell
Get-Content C:\ProgramData\RetailEX\print-server.log -Tail 50 -Wait
```

**Event Log (uygulama):**

```powershell
Get-EventLog -LogName Application -Source RetailEX_PrintServer -Newest 20
```

**Yapılandırma dosyası geçerli mi?**

```powershell
Test-Path C:\ProgramData\RetailEX\print-server.json
```

## 8) Yazıcı Testi

Bir RetailEX kiracısından bir **POS satış** veya **fatura** oluşturun. Birkaç saniye içinde:

- **Event Log**'da `Job basariyla basildi` mesajı görünmeli
- Log dosyasında ilgili `firm/period` için `Tenant loop basladi` / `Job basariyla basildi` satırları olmalı
- Yazıcıdan çıktı alınmalı

## 9) Güncelleme

Yeni sürüm kurulum EXE'sini çalıştırın; eski sürüm algılanır ve **üzerine yazılır** (servis otomatik olarak yeniden başlatılır).

Veya:

```powershell
# Eski sürümü kaldır
.\install-service.ps1 -Uninstall

# Yeni sürüm EXE'sini kur (servis yeniden kurulur)
RetailEX.PrintManager-Setup-1.0.1.exe
```

## 10) Kaldırma

**Denetim Masası → Programlar → RetailEX Print Server → Kaldır** veya:

```powershell
# Kaldırma sihirbazı (servis otomatik durur + silinir)
# veya manuel:
.\install-service.ps1 -Uninstall
```

Ardından `C:\Program Files\RetailEX\PrintServer` ve `C:\ProgramData\RetailEX\PrintServer` klasörleri silinir (opsiyonel).

## 11) CI / Tag

Tag formatı: `print-v{version}` (ör. `print-v1.0.0`).

```bash
git tag -a print-v1.0.0 -m "RetailEX Print Server 1.0.0"
git push origin print-v1.0.0
# → .github/workflows/print-server-release.yml tetiklenir
```

Release adı: `RetailEX Print Server 1.0.0`
Asset: `RetailEX.PrintManager-Setup-1.0.0.exe`