# RetailEX Terazi Yoneticisi — Kurulum

Rongta etiketli terazileri RetailEX API ile senkronize eden Windows uygulamasi.

## Hizli kurulum (onerilen)

1. [GitHub Releases — terazi-v1.0.0](https://github.com/ferhatdeveloper/RetailEX/releases/tag/terazi-v1.0.0) sayfasini acin
2. `RetailEX.TeraziManager-Setup-1.0.0.exe` dosyasini indirin
3. Kurulumu **yonetici olarak** calistirin
4. `C:\ProgramData\RetailEX\terazi-sync.json` dosyasini duzenleyin:
   - `ApiToken` — RetailEX API anahtariniz
   - `TenantCode` — kiraci kodu
   - `ScaleIp` / `Scales` — terazi IP adresi

Kurulum su dosyalari yerlestirir:

| Konum | Icerik |
|-------|--------|
| `C:\Program Files\RetailEX\TeraziManager\` | `RetailEX.TeraziManager.exe`, DLL'ler, Rongta klasoru |
| `C:\Program Files\RetailEX\TeraziManager\Service\` | `RetailEX_Terazi_Sync.exe` (istege bagli bilesen) |
| `C:\ProgramData\RetailEX\` | `terazi-sync.json`, log dosyalari |
| Baslat menusu | RetailEX → Terazi Yoneticisi kisayolu |

## Manuel kurulum (gelistirici)

Visual Studio ile `Release | x86` derleyin, ardindan:

```bat
KURULUM.bat
```

Windows servisi icin (yonetici PowerShell):

```powershell
.\install-service.ps1
```

## Yerel kurulum paketi olusturma

```powershell
# 1. Derleme
msbuild WindowsFormsApplication1.sln /p:Configuration=Release /p:Platform=x86

# 2. Staging
.\setup\stage-release.ps1

# 3. Inno Setup (yuklu olmali)
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" setup\TeraziManager.iss /DAppVersion=1.0.0
```

Cikti: `setup\output\RetailEX.TeraziManager-Setup.exe`

## GitHub Actions ile otomatik derleme

Workflow dosyasi: `.github/workflows/terazi-build.yml` (repo kokunde)

### Ne zaman calisir?

| Tetikleyici | Sonuc |
|-------------|-------|
| `main` branch'e `TeraziRongta/**` degisikligi | Artifact yuklenir (30 gun saklanir) |
| `terazi-v*` tag push | GitHub Release + kurulum dosyalari |
| Manuel (workflow_dispatch) | Artifact; `create_release=true` ise Release |

### Ilk release olusturma

```bash
git tag terazi-v1.0.0
git push origin terazi-v1.0.0
```

veya GitHub → **Actions** → **Terazi Manager Build** → **Run workflow** → `create_release` isaretli.

### CI adimlari

1. MSBuild ile `Release|x86` derleme
2. `setup/stage-release.ps1` ile dosya hazirlama
3. Inno Setup ile `RetailEX.TeraziManager-Setup.exe` olusturma
4. Tasinabilir zip paketi
5. Artifact veya GitHub Release yukleme

## Guvenlik

- Gercek API token'larini **commit etmeyin** — yalnizca `terazi-sync.example.json` repoda
- Uretim config: `C:\ProgramData\RetailEX\terazi-sync.json` (git disi)
- `.pfx` imza dosyalari `.gitignore` ile haric tutulur

## Sorun giderme

| Sorun | Cozum |
|-------|-------|
| Terazi baglanmiyor | IP, ag ve `rtslabelscale.dll` varligini kontrol edin |
| API hatasi | `terazi-sync.json` icinde token ve `ApiBaseUrl` |
| Servis baslamiyor | `services.msc` → RetailEX Terazi Senkron Servisi; log: `C:\ProgramData\RetailEX\terazi-service.log` |
| .NET hatasi | [.NET Framework 4.8](https://dotnet.microsoft.com/download/dotnet-framework/net48) yukleyin |
