# RetailEX TeraziManager — Android

Windows **RetailEX.TeraziManager** (TeraziRongta) uygulamasının Android karşılığıdır. Rongta etiket terazileri ile RetailEX REST API arasında PLU senkronizasyonu yapar.

## Proje yapısı

```
android/
├── README.md                 ← bu dosya
├── PluExample/               ← Rongta resmi PLU SDK örneği (referans)
└── TeraziManager/            ← RetailEX Android uygulaması (ana proje)
    ├── app/
    └── gradlew.bat
```

**Paket adı:** `com.retailex.terazimanager`  
**Min SDK:** 24 (USB OTG destekli cihazlar)  
**UI:** Jetpack Compose + Material 3

## Derleme ve çalıştırma

### Gereksinimler

- Android Studio Hedgehog veya üzeri
- Android SDK 34
- JDK 17
- `android/PluExample/app/libs/lib_plu_2.0.3.jar` (Rongta PLU SDK — repoda mevcut)

### Komut satırı

```powershell
cd android\TeraziManager
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
```

APK (debug): `app/build/outputs/apk/debug/app-debug.apk`  
APK (release): `app/build/outputs/apk/release/app-release-unsigned.apk` (imza gerektirir; yüklemek için debug APK kullanın)

### Android Studio

1. **File → Open** → `android/TeraziManager`
2. Gradle sync tamamlansın
3. Fiziksel cihaz veya emülatörde **Run**

> Emülatörde terazi TCP bağlantısı için bilgisayarınızın LAN IP’sine yönlendirme gerekebilir. Gerçek terazi testi için fiziksel Android cihaz + aynı Wi‑Fi ağı önerilir.

## Mimari

```
┌─────────────────────────────────────────────────────────┐
│  UI (Compose): Senkron | Cihazlar | Terazi | Ayarlar   │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  SyncEngine · TeraziViewModel                           │
└──────┬───────────────────────────────┬──────────────────┘
       │                               │
┌──────▼──────────┐            ┌───────▼──────────────────┐
│ RetailExApiClient│            │ ScaleTransport           │
│ (OkHttp)         │            │  ├─ NetworkScaleTransport│
└──────────────────┘            │  └─ UsbSerialTransport  │
                                └───────┬──────────────────┘
                                        │
                                ┌───────▼──────────────────┐
                                │ RongtaScaleClient          │
                                │ (lib_plu / PluManage)      │
                                └────────────────────────────┘
```

### Katmanlar

| Katman | C# karşılığı | Android |
|--------|--------------|---------|
| Yapılandırma | `AppConfig` | `config/AppConfig.kt` |
| Fiyat | `ScalePriceHelper` | `domain/helpers/ScalePriceHelper.kt` |
| PLU JSON | `PluJsonMapper` | `domain/helpers/PluJsonMapper.kt` |
| API | `RetailExApiClient` | `data/api/RetailExApiClient.kt` |
| Senkron | `SyncEngine` | `service/SyncEngine.kt` |
| Terazi DLL | `rtslabelscale.dll` | `lib_plu_2.0.3.jar` (PluManage) |

### Terazi protokolü

- **Ağ (TCP):** Varsayılan port **5001**, protokol **Rongta2** (PluExample ile aynı)
- **Paket formatı:** Rongta TCP — 4 byte uzunluk + 4 byte komut + veri (RLS1000 dokümantasyonu)
- **PLU gönderimi:** JSON alanları (`PluName`, `LFCode`, `Code`, `BarCode`, `UnitPrice`, …), paket boyutu 4 (C# `UploadPluJsonList` ile uyumlu mantık SDK içinde)
- **RLS1000 gerekmez** — Android tarafında `lib_plu` JAR kullanılır

## Özellikler ve C# paritesi

### Tam uygulanan (MVP)

| Özellik | Durum |
|---------|--------|
| Yapılandırma (API URL, kiracı, token, firma, terazi IP/port) | ✅ |
| RetailEX API’den tartılı ürün çekme (`rex_*_products`) | ✅ |
| Çoklu terazi listesi | ✅ |
| LAN terazi taraması (TCP 5001, 9100, 4001) | ✅ |
| TCP ile terazi bağlantı testi | ✅ |
| PLU okuma (`getPluInfoList`) | ✅ |
| PLU yazma / senkron (`writePluInfo`) | ✅ |
| PLU temizleme | ✅ |
| Fiyat telafisi (`CompensateDevicePriceDecimal` ×10^position) | ✅ |
| Barkod 99 / departman 21 varsayılanları | ✅ |
| Log ekranı | ✅ |
| `terazi-sync.json` benzeri yerel config | ✅ (`files/terazi-sync.json`) |

### Kısmen / bekleyen

| Özellik | Durum | Not |
|---------|--------|-----|
| USB-C → RS232 (OTG) | ✅ | `SerialOverUsbClient` + `Rt2Protocol`, FTDI/CH340/CP2102/Prolific |
| Canlı ağırlık okuma | ⏳ | Windows `rtscaleGetPluWeight` — Android SDK'da API yok |
| Satış raporu (sale report) | ✅ | `getPluSales` + `SaleReportHelper`, Terazi sekmesi |
| Hotkey gönderimi | ⏳ | `writeHotkey` SDK'da mevcut, UI/senkron entegrasyonu yok |
| Function-set / SYSTEM.CFG / RLS dosya gönderimi | ❌ | Windows’a özgü `rtscaleDownLoadData`, RLS1000 |
| Etiket şablonu (.scr) gönderimi | ❌ | RLS1000 / Windows DLL |
| Merkez komutları (`RetailExCentralService`) | ❌ | `scale_plu_sync`, store_devices |
| Artımlı senkron (`ScaleIncrementalSyncService`) | ❌ | Tam liste senkronu MVP’de |
| Otomatik arka plan servisi | ❌ | Windows Service karşılığı planlanmadı |
| UDP broadcast keşif | ⏳ | SDK `UDPClient` var; şu an TCP subnet taraması kullanılıyor |

## Ağ ve USB kurulumu

### LAN terazi

1. Terazi ve telefon **aynı Wi‑Fi** ağında olmalı
2. Terazi IP örneği: `192.168.1.12`, port: `5001`
3. Uygulama → **Cihazlar** → **LAN Terazi Tara**
4. Bulunan cihazı **Ekle**, **Ayarlar**’dan API bilgilerini girin

### USB-C / RS232

1. **Donanım:** USB-C OTG adaptör + RS232 dönüştürücü (FTDI, CH340, CP2102 veya Prolific) + terazi RS232 kablosu
2. Telefon/tablet **USB host (OTG)** desteklemeli (minSdk 24)
3. Adaptörü takın; Android **USB izni** isteyecek — **İzin ver** deyin
4. Uygulama → **Cihazlar** → **USB Seri Cihazları Tara**
5. Listelenen adaptörü **Ekle** (terazi listesine USB modunda eklenir)
6. **Ayarlar** → **USB Baud** genelde **9600** (terazi manualine göre 115200 olabilir)
7. **Terazi** sekmesinden **Bağlantıyı Test Et**, ardından PLU okuma/yazma veya **Senkron**

**Notlar:**
- PluManage SDK doğrudan seri port açmaz; uygulama `SerialOverUsbClient` ile Rt2 protokolünü RS232 hattına taşır
- USB terazi ve LAN terazi aynı listede birlikte kullanılabilir; her cihazın bağlantı modu (TCP/USB) ayrı kaydedilir
- Bağlantı hatası: baud hızı, kablo (TX/RX), terazi güç durumu ve OTG adaptörünü kontrol edin

### APK yükleme (telefona)

```powershell
# USB hata ayıklama açıkken
adb install -r android\TeraziManager\app\build\outputs\apk\debug\app-debug.apk
```

Veya APK dosyasını telefona kopyalayıp dosya yöneticisinden açın (**Bilinmeyen kaynaklara izin** gerekebilir).

### İzinler

- `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`
- USB: `android.hardware.usb.host` (isteğe bağlı özellik)

## Yapılandırma örneği

Windows `%ProgramData%\RetailEX\terazi-sync.json` ile aynı alanlar desteklenir. Android’de dosya:

`/data/data/com.retailex.terazimanager/files/terazi-sync.json`

Örnek (proje kökündeki `terazi-sync.example.json` ile uyumlu):

```json
{
  "apiBaseUrl": "https://api.retailex.app",
  "tenantCode": "kasap",
  "authMode": "none",
  "firmNr": "001",
  "scaleIp": "192.168.1.12",
  "defaultScalePort": 5001,
  "compensateDevicePriceDecimal": true,
  "devicePriceDecimalPosition": 2,
  "defaultBarcodeType": 99,
  "defaultDepartment": 21
}
```

## Sorun giderme

| Sorun | Çözüm |
|-------|--------|
| Bağlantı başarısız | IP/port (5001), protokol (Rongta2), firewall |
| Fiyat terazide /100 | `compensateDevicePriceDecimal=true` veya function-set (Windows) |
| API 401/404 | `authMode`, `tenantCode`, `productsPath` kontrol |
| USB cihaz görünmüyor | OTG adaptör, RS232 dönüştürücü sürücüsü (FTDI/CH340), USB izni |
| USB handshake başarısız | Baud (9600/115200), kablo, terazi açık mı |

## Referanslar

- C# kaynak: `TeraziRongta.Core`, `WindowsFormsApplication1`
- Rongta PLU SDK: `android/PluExample` + `lib_plu_2.0.3.jar`
- TCP protokol: RLS1000 “Based on TCP/IP Protocol Interface Specification” (paket: uzunluk + komut + veri)
