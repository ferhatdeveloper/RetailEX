# RetailEX PrintServer — Kurulum Paketi (installer/)

Bu dizinde **Inno Setup 6** ile Windows kurulum paketi üretilir.

## Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `setup.iss` | Inno Setup scripti. Çıktı adı: `RetailEX.PrintManager-Setup-{version}.exe` |
| `build-installer.ps1` | `prepare-payload.ps1` → `ISCC.exe` derleme pipeline'ı |
| `prepare-payload.ps1` | `PrintServer.Service\bin\Release\net8.0-windows\*` çıktısını `payload\` altına kopyalar |
| `install-service.ps1` | Kurulum sonunda / kaldırma sırasında çalışan **PowerShell**: `New-Service` + `Start-Service` (Windows servisi) |
| `payload/` | Inno Setup'a gömülecek dosyalar (build sırasında otomatik doluyor) |
| `output/` | Üretilen `*Setup-*.exe` dosyalarının hedefi |

## Hızlı üretim (Windows)

```powershell
cd PrintServer\installer
.\build-installer.ps1 -Version 1.0.0
```

Çıktı: `installer\output\RetailEX.PrintManager-Setup-1.0.0.exe`.

## Hızlı kurulum (Windows)

Kurulum EXE'sini çalıştır (admin). Görev listesinde **"Windows yazıcı servisini kur"** seçili olmalı. Kurulum sonunda `install-service.ps1 -Install` çalışır, servis kurulur ve başlatılır.

Yapılandırma:
- `C:\ProgramData\RetailEX\print-server.json` — örnek config buraya kopyalanır.
- `C:\ProgramData\RetailEX\print-server.log` — günlük log.

## Manuel servis kurulumu

`installer\output` içeriğini hedef makineye kopyalayıp:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-service.ps1 -Install
```

ile servis kurulur. Kaldırmak için `-Uninstall`.

## Tag / Sürüm

- Tag formatı: `print-v{version}` (ör. `print-v1.0.0`)
- Release adı: `RetailEX Print Server {version}`
- Workflow: `.github/workflows/print-server-release.yml`