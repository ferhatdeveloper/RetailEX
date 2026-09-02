# RetailEX PrintServer

**RetailEX PrintServer**, RetailEX bulut altyapısından (PostgREST) gelen yazdırma işlerini
Windows makinesinde yüklü yazıcılara ve **FastReport** şablonlarına yönlendiren bir
**.NET 8 Windows Servisi**'dir.

- **POS fişleri** — ağ / Bluetooth ESC/POS yazıcılar
- **Satış / alış faturaları** — sistem yazıcısı (HTML → PDF → yazıcı) veya FastReport
- **Mutfak fişleri** — direkt ağ ESC/POS
- **Etiketler** — TSPL / ZPL etiket yazıcıları
- **FastReport** — `*.frx` şablonlarıyla özelleştirilmiş çıktılar

---

## Mimari

```
┌─────────────────────────┐    HTTPS/JSON    ┌────────────────────────────┐
│ RetailEX Cloud          │ ───────────────▶ │ PostgREST (/rest/v1/...)   │
│   firm/period tabanlı   │ ◀─────────────── │ rex_NNN_NN_print_jobs       │
└─────────────────────────┘                  └─────────────┬──────────────┘
                                                           │
                              ┌────────────────────────────┴──────────────┐
                              ▼                                            │
                  ┌─────────────────────────┐                              │
                  │ RetailEX_PrintServer     │  (Windows Service / Console) │
                  │  ┌─────────────────────┐ │                              │
                  │  │ PrintQueueConsumer   │ │   ← claim & dispatch loop    │
                  │  │  ┌───────────────┐  │ │                              │
                  │  │  │ Dispatcher    │  │ │                              │
                  │  │  └─┬───┬───┬───┬┘  │ │                              │
                  │  │    │   │   │   │    │ │                              │
                  │  │  FR  ESC BL HTML LBL│ │                              │
                  │  └─────────────────────┘ │                              │
                  │  ┌─────────────────────┐ │                              │
                  │  │ PrinterDiscovery    │ │   ← yazıcı tarama (5 dk)      │
                  │  └─────────────────────┘ │                              │
                  │  ┌─────────────────────┐ │                              │
                  │  │ TenantDiscovery     │ │   ← pg_tables → (firm,period)│
                  │  └─────────────────────┘ │                              │
                  └────────┬────┬────┬───────┘                              │
                           │    │    │                                      │
                           ▼    ▼    ▼                                      │
                  ┌──────────┐ ┌──────────┐ ┌──────────────┐                │
                  │ FastReport│ │ ESC/POS  │ │ Sistem       │                │
                  │ *.frx     │ │ Ağ/BT    │ │ Yazıcı       │                │
                  └──────────┘ └──────────┘ └──────────────┘                │
```

---

## Bileşenler

| Klasör | Amaç |
|--------|------|
| `PrintServer.Core/` | Kütüphane: konfig, PostgREST istemcisi, queue consumer, dispatcher, renderers, discovery |
| `PrintServer.Service/` | **Windows servisi** ana projesi (`RetailEX_PrintServer.exe`), CLI argümanları, kurulum |
| `installer/` | Inno Setup 6 paketi, `install-service.ps1`, payload üretimi |
| `releases/` | CI artifact'ları (Inno Setup çıktıları) |

---

## Kurulum

### 1. Inno Setup ile (önerilen)

```powershell
cd PrintServer\installer
.\build-installer.ps1 -Version 1.0.0
# Çıktı: installer\output\RetailEX.PrintManager-Setup-1.0.0.exe
```

EXE'yi **yönetici** olarak çalıştır → kurulum sonunda servis kurulur ve başlatılır.

### 2. Manuel (geliştirme)

```powershell
dotnet build -c Release PrintServer\PrintServer.sln

# Konsol modunda test
PrintServer\PrintServer.Service\bin\Release\net8.0-windows\RetailEX_PrintServer.exe --console

# Servis olarak kur (admin)
.\PrintServer\installer\install-service.ps1 -Install

# Servis durumu
Get-Service RetailEX_PrintServer

# Kaldır
.\PrintServer\installer\install-service.ps1 -Uninstall
```

---

## Konfigürasyon

**Konum:** `C:\ProgramData\RetailEX\print-server.json`

```json
{
  "PostgRest": {
    "BaseUrl": "https://api.retailex.app",
    "TenantCode": "kasap",
    "ApiToken": "...",
    "AuthMode": "apikey"
  },
  "PollIntervalMs": 2500,
  "ClaimLimit": 10,
  "TcpTimeoutMs": 8000,
  "MaxAttempts": 5,
  "DefaultLocale": "tr",
  "SumatraPdfPath": "",
  "PrintBrowserPath": "",
  "FastReportCliPath": "",
  "LogLevel": "info",
  "EnableMultiTenant": true,
  "PinnedTenants": ["001_01", "002_01"],
  "Tenants": []
}
```

| Alan | Açıklama |
|------|----------|
| `PostgRest.BaseUrl` | PostgREST kök URL |
| `PostgRest.TenantCode` | Tek kiracı modu için tenant kodu |
| `PostgRest.ApiToken` | Bearer/apikey değeri |
| `PostgRest.AuthMode` | `none` / `bearer` / `apikey` |
| `PollIntervalMs` | İş çekme aralığı (ms). 500–60000 |
| `ClaimLimit` | Bir polling'de alınacak iş sayısı. 1–50 |
| `MaxAttempts` | Başarısız iş için maks deneme. 1–20 |
| `EnableMultiTenant` | `true` → tüm `rex_NNN_NN_print_jobs` tabloları taranır |
| `PinnedTenants` | Sadece bu `firmNr_periodNr` çiftleri |
| `Tenants` | Kiracı bazlı override (Enabled false → atlanır) |

Dosya değiştiğinde servis otomatik olarak yeniden yükler (`ReloadOnChangeConfigMonitor`).

---

## Çalıştırma Modları

### Windows Servisi (üretim)

```
sc query RetailEX_PrintServer
sc start RetailEX_PrintServer
sc stop RetailEX_PrintServer
Restart-Service RetailEX_PrintServer
```

Servis logları:
- **Event Log:** `Application` / Source: `RetailEX_PrintServer`
- **Dosya:** `C:\ProgramData\RetailEX\print-server.log` (UTF-8 BOM'suz)

### Konsol (geliştirme / debug)

```powershell
.\RetailEX_PrintServer.exe --console
```

`--console` argümanı + `Environment.UserInteractive` true → WindowsService yok,
Generic Host olarak çalışır. Hata ayıklama için idealdir.

Diğer CLI:
- `--install` → `sc create` + `sc description` + `sc start`
- `--uninstall` → `sc stop` + `sc delete`
- `--status` → `sc query`
- `--help` → kullanım

---

## Tenant Keşfi

`TenantDiscovery` her poll'da aktif tenant listesini günceller:

1. `firms` tablosu → `code` listesi
2. `periods` tablosu → `(firmNr, code, isOpen)`
3. `pg_tables` → `rest.rex_NNN_NN_print_jobs` (regex ile parse)
4. `PinnedTenants` / `Tenants` override'ları uygulanır
5. Tek tenant modu (`EnableMultiTenant=false`) → sadece `PostgRest.TenantCode`

Sonuç: her tenant için **ayrı consumer task** çalışır (`StartTenantLoopIfNotRunning`).

---

## Yönlendirme Kuralları

`PrintJobDispatcher` `PrintJob.Connection` / `JobType` / `PrinterProfile.Kind` alanlarına göre seçim yapar:

| Sıra | Tetikleyici | Renderer |
|-----|------------|----------|
| 1 | `connection=fastreport` veya `jobType ∈ {fastreport_frx, fastreport_template}` veya `profile.kind=fastreport` | `FastReportRenderer` |
| 2 | `connection=label` veya `profile.kind=label` veya `jobType=product_label` | `LabelRenderer` |
| 3 | `connection=bluetooth` veya `profile.kind=bluetooth` | `BluetoothEscPosRenderer` |
| 4 | `connection=network` veya `profile.kind=network` | `EscPosNetworkRenderer` |
| 5 | (default) | `HtmlSystemRenderer` |

`RoutingResolver` her iş için `PrinterProfile`'ı çözer (firma/period'a göre).

---

## FastReport Entegrasyonu

`FastReportCliPath` ayarı **boş** ise sistem tarafında `FastReport.Cli.exe` aranır.
Şablonlar `*.frx` formatında olup `payload`'a gömülmez; PostgREST üzerinden (`payload.template_url`) çekilir.

Çıktı:
- **PDF** → SumatraPDF veya belirtilen tarayıcı ile yazıcıya gönderilir
- **ESC/POS** → doğrudan ağ yazıcısına

---

## Troubleshooting

| Sorun | Çözüm |
|-------|-------|
| Servis başlamıyor | `eventvwr.msc` → Windows Logs → Application → Source=`RetailEX_PrintServer` |
| PostgREST bağlantı hatası | `print-server.json` → `BaseUrl` / `ApiToken` / `AuthMode` kontrolü |
| Hiç tenant bulunamıyor | `EnableMultiTenant=true`, `PinnedTenants` boş, `pg_tables` view erişilebilir mi? |
| Yazıcı bulunamıyor | PowerShell: `Get-Printer` çalışıyor mu? Servis hesabı yazıcı listeleyebiliyor mu? |
| FastReport çıktısı boş | `FastReportCliPath` doğru mu? Şablon URL erişilebilir mi? |
| Config değişikliği yansımıyor | Dosya UTF-8 BOM'suz olmalı; debounce 500 ms |
| Log yazılamıyor | `C:\ProgramData\RetailEX\` yazma yetkisi |

---

## Lisans / Marka

RetailEX PrintServer © RetailEX. Tüm hakları saklıdır.
AsinERP markasıyla karıştırılmamalıdır.