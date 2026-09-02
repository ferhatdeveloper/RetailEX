# RetailEX Windows Print Service — Sözleşme

Bu doküman, mobil uygulamanın (React Native / Expo) yazıcıya yazdırma isteklerini ileteceği **Windows makinede çalışan lokal HTTP servisinin** API sözleşmesini tanımlar.

> Mobil geliştirici için bağlantı noktası; Windows tarafındaki implementasyon bu repoda `print-v0.0.1` tag'i ile yayımlanmıştır.

## 1. Amaç

- Mobil uygulama (telefon/tablet) → aynı LAN'daki Windows bilgisayar → Windows'a tanıtlı yazıcılar.
- **Herhangi bir yazıcı** seçilebilir (thermal, inkjet, lazer, A4, etiket, PDF yazıcı); yazıcı adı kullanıcı tarafından seçilir.
- **ESC/POS** komutu olduğu gibi (raw bytes) iletilir; servis komutu yazıcıya uygun şekilde yazar (raw yazıcılar için RawPrinter API, sürücü yazıcılar için spooler üzerinden).

## 2. İletişim

- **Taşıma:** HTTP / JSON, **LAN only** (varsayılan port `9105`).
- **CORS:** Tüm origin'lere açık (LAN'da zaten izole).
- **Auth:** Opsiyonel `Authorization: Bearer {apiKey}` header'ı. Servis kurulumunda bir API anahtarı üretilir; mobil tarafta `printerSettings.windowsServiceApiKey` alanında saklanır.
- **TLS:** Planlanmıyor (LAN). İleride `https://` ve self-signed cert opsiyonu eklenebilir.
- **Servis versiyonu:** `print-v0.0.1` (bu sürümle uyumlu sözleşme).

## 3. Endpoint'ler

### 3.1 `POST /print` — Yazdırma

**Request:**

```http
POST /print HTTP/1.1
Host: 192.168.1.50:9105
Content-Type: application/json
Authorization: Bearer {apiKey}     # opsiyonel

{
  "printerName": "EPSON TM-T20III",   // Windows yazıcı adı (zorunlu)
  "jobName": "RetailEX Sale 12345",   // Windows spooler job adı
  "dataBase64": "GwoA...",            // ESC/POS byte dizisi (veya herhangi raw data)
  "copies": 1,                        // opsiyonel, varsayılan 1
  "paperSize": "80mm",                // opsiyonel, sadece sürücü yazıcılarda anlamlı
  "timeoutMs": 10000                  // opsiyonel
}
```

**Response (başarı):**

```json
{
  "ok": true,
  "message": "Yazdırıldı",
  "jobId": "spooler-job-uuid"     // opsiyonel
}
```

**Response (hata):**

```json
{
  "ok": false,
  "message": "Yazıcı bulunamadı",
  "code": "printerNotFound"      // aşağıdaki kodlar
}
```

**HTTP durum kodları:**

| HTTP | Anlam | Mobil `code` |
|------|-------|--------------|
| 200 | başarılı | (yok) |
| 400 | body parse / validasyon hatası | `serviceError` |
| 401 | API anahtarı eksik/yanlış | `unauthorized` |
| 403 | yazma yetkisi yok | `unauthorized` |
| 404 | yazıcı adı bulunamadı | `printerNotFound` |
| 500 | Windows API hatası | `serviceError` |
| 503 | yazıcı kapalı/kağıt yok | `serviceError` |
| timeout | 10s aşıldı | `timeout` |

### 3.2 `GET /printers` — Yazıcı listesi

**Request:**

```http
GET /printers HTTP/1.1
Host: 192.168.1.50:9105
Authorization: Bearer {apiKey}     # opsiyonel
```

**Response:**

```json
{
  "printers": [
    {
      "name": "EPSON TM-T20III",
      "isDefault": true,
      "port": "USB001",
      "status": "ready"          // ready | offline | error | unknown
    },
    {
      "name": "Microsoft Print to PDF",
      "isDefault": false,
      "port": null,
      "status": "ready"
    }
  ]
}
```

**Hata durumları:** 401, 500.

### 3.3 `GET /health` — Sağlık kontrolü

**Response:**

```json
{
  "ok": true,
  "version": "0.0.1",
  "printers": 3
}
```

## 4. Veri modeli

`dataBase64` alanı **base64** kodlanmış byte dizisidir. ESC/POS komutlarını olduğu gibi içerir. Servis bu byte'ı ilgili yazıcıya şu şekilde iletir:

| Yazıcı türü | API |
|-------------|-----|
| Raw / Generic / Text-only | `OpenPrinter` → `StartDocPrinter` (raw) → `WritePrinter` → `EndDocPrinter` / `ClosePrinter` (Win32 Spooler API) |
| Sürücü yazıcılar (PDF, lazer) | `System.Drawing.Printing.PrintDocument` veya `XPS` üzerinden spooler; bu durumda raw bytes anlamlı olmayabilir |

## 5. Windows tarafı teknoloji (referans: print-v0.0.1)

- **Dil:** Node.js 20+ (veya Go, Rust, C#).
- **HTTP framework:** Node `http` modülü yeterli; alternatif `express`.
- **Yazıcı erişimi:**
  - **C# (`System.Drawing.Printing`)** — Windows Forms gerektirmez, doğrudan `LocalPrintServer` + `PrintQueue` ile erişim.
  - **C# (Win32 P/Invoke)** — `winspool.drv` üzerinden `OpenPrinter`, `WritePrinter` (raw data için).
  - **Node.js** — `pdf-to-printer` paketi (raw data desteği var) veya `node-printer`.
- **Servis olarak kurulum:**
  - `node-windows` paketi (Windows Service kaydı).
  - `nssm` (Non-Sucking Service Manager) ile sarıcı.
  - PM2 + Windows Task Scheduler.
- **Yapılandırma:** `C:\RetailEX\printer-service\config.json`:
  ```json
  {
    "port": 9105,
    "apiKey": "<rastgele-üretilmiş>",
    "logPath": "C:\\RetailEX\\logs\\printer-service.log",
    "allowedNetworks": ["192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12"]
  }
  ```

## 6. Mobil tarafı bağlantı ayarları

`printerSettings.windowsServiceUrl`: ör. `http://192.168.1.50:9105`
`printerSettings.windowsServiceApiKey`: API anahtarı (opsiyonel)
`printerSettings.windowsPrinterName`: yazıcı adı (ör. `EPSON TM-T20III`)

Bu üç alan `printerSettingsStore` (AsyncStorage `retailex_mobile_printer_settings`) içinde saklanır. Mobil `PrinterSettingsScreen` üzerinden ayarlanır; `/printers` endpoint'i "Yazıcıları Listele" düğmesi ile çekilir.

## 7. Güvenlik notları

- **LAN-only varsayılan.** `allowedNetworks` ile sadece RFC1918 IP aralıklarına izin verilir; public bind varsa `0.0.0.0` yerine LAN interface IP'sine bağlanır.
- **API anahtarı:** 32+ byte rastgele üretilir, müşteriye `installer` veya `README` ile teslim edilir. Mobilde `printerSettings.windowsServiceApiKey` alanında düz metin saklanır (kullanıcı isteğe bağlı şifreleyebilir — ileride `expo-secure-store` entegrasyonu planlanabilir).
- **Sızıntı loglaması:** `dataBase64` loglanmaz; sadece byte sayısı ve yazıcı adı loglanır.

## 8. Kurulum adımları (Windows tarafı operatörü için)

1. **Servisi indir:** RetailEX Print Service `setup.exe` (imzalı) müşteri makinesine kurulur (`print-v0.0.1` release'inden).
2. **API anahtarı:** Kurulum sırasında üretilen anahtarı not al.
3. **Yazıcı kontrolü:** Windows Ayarlar → Yazıcılar'dan yazıcının "Hazır" olduğunu doğrula.
4. **Servisi başlat:** `services.msc` → "RetailEX Print Service" → Sağ tık → Başlat (veya kurulum otomatik başlatır).
5. **Mobil bağlantı:** `PrinterSettingsScreen` → "Windows Servisi" seç → URL = `http://<bilgisayar-ip>:9105` → "Yazıcıları Listele" → listeden yazıcı seç → "Test Yazdır".
6. **Sorun giderme:** `C:\RetailEX\logs\printer-service.log` dosyasını kontrol et.

## 9. Mobil uyumluluk tablosu

| Mobil interface | Ayar | Bu servisle uyumlu mu? |
|-----------------|------|--------------------------|
| `bluetooth` | Bluetooth yazıcı | Hayır (bu servis LAN HTTP) |
| `network` | TCP 9100 ağ yazıcı | Hayır (ayrı yol) |
| `system` | Sistem yazdırma diyaloğu | Hayır (ayrı yol) |
| `windows-service` | **Bu servis** | **Evet** |

Mevcut pg_bridge üzerinden TCP 9100 akışı (`escposTcpTransport`) paralel olarak çalışmaya devam eder; bu servis onun yerine değil, **alternatif** olarak eklenir. Kullanıcı istediği zaman arayüzü değiştirebilir.

## 10. Sürümleme

- Servis sözleşmesi versiyonu: **`v1`** (bu doküman).
- Windows servisi release tag'i: **`print-v0.0.1`** (örnek sürüm).
- Geriye uyumluluk: servis header'da `X-Service-Version: v1` döner; mobil bu değeri kontrol edebilir.
- Yeni alanlar eklenirse: geriye uyumlu (yeni opsiyonel alanlar), breaking change için `v2`.

## 11. Test senaryoları (Windows tarafı)

1. ✅ Servis başlatıldığında `/health` 200 döner.
2. ✅ `/printers` Windows'a tanıtlı tüm yazıcıları listeler.
3. ✅ `POST /print` valid body → 200, spooler job oluşur.
4. ✅ `POST /print` yanlış yazıcı adı → 404, `code: printerNotFound`.
5. ✅ `POST /print` yanlış API anahtarı → 401, `code: unauthorized`.
6. ✅ `POST /print` 10s içinde yanıt vermezse mobil taraf `timeout` hatası alır.
7. ✅ LAN dışından istek (public IP'den) `allowedNetworks` ile reddedilir.

---

Bu sözleşmeye göre Windows tarafı `print-v0.0.1` ile uygulanmıştır; mobil uygulama `windows-service` interface'i seçildiğinde doğrudan bu servise bağlanır ve yazdırma işlemlerini gerçekleştirir.
