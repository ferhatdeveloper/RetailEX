# RetailEX TeraziManager (Rongta)

Windows masaustu uygulamasi ve opsiyonel senkron servisi ile RetailEX urunlerini Rongta terazilere gonderir.

## Hizli kurulum (onerilen)

1. **[RetailEX.TeraziManager-Setup-1.0.1.exe indir](https://github.com/ferhatdeveloper/RetailEX/raw/main/TeraziRongta/releases/RetailEX.TeraziManager-Setup-1.0.1.exe)** (~3.7 MB)
2. Kurulum sihirbazini **Yonetici** olarak calistirin.
3. Kurulum sonrasi `C:\ProgramData\RetailEX\terazi-sync.json` dosyasinda **TenantCode** ve **ApiToken** alanlarini doldurun (ornek: `terazi-sync.example.json`).
4. Baslat menusunden **RetailEX TeraziManager** uygulamasini acin.

Varsayilan kurulum dizini: `C:\Program Files\RetailEX\TeraziManager\`

### Kurulum paketi neleri yapar?

- Uygulama, DLL ve Rongta dosyalarini Program Files altina kopyalar
- `%ProgramData%\RetailEX\` klasorunu olusturur; yoksa `terazi-sync.json` sablonunu yazar
- Baslat menusu kisayolu olusturur (istege bagli masaustu kisayolu)
- Windows **Program Ekle/Kaldir** listesine kayit acar
- Isteg bagli: **RetailEX_Terazi_Sync** Windows servisini kurar

### Windows servisi (manuel)

Kurulumda secmediyseniz, **Yonetici PowerShell** ile:

```powershell
cd "C:\Program Files\RetailEX\TeraziManager"
powershell -ExecutionPolicy Bypass -File .\install-service.ps1
```

## Gelistirici: kurulum paketi uretme

```powershell
# Release | x86 derleme
msbuild WindowsFormsApplication1.sln /t:Rebuild /p:Configuration=Release /p:Platform=x86

# Inno Setup 6 gerekli (ISCC.exe)
.\installer\build-installer.ps1
```

Cikti: `installer\output\RetailEX.TeraziManager-Setup-1.0.1.exe` (ayni dosya `releases\` altina da kopyalanir).

## Manuel / gelistirici kurulum

`KURULUM.bat` yalnizca kaynak kodu klasorunden calisir; son kullanicilar icin **Setup.exe** kullanin.

## Guvenlik

- Gercek API tokenlarini repoya veya kurulum paketine koymayin.
- Canli ayarlar: `C:\ProgramData\RetailEX\terazi-sync.json` (gitignore).

