# AsinERP Printer Service (unified)

`AsinERP_Printer`, AsinERP yazdırma işlerini Windows hizmeti olarak arka planda çalıştıran birleşik servistir. EXE adı ve worker dosyası kurulum uyumluluğu için değişmedi: servis `AsinERP_Printer`, script `kitchen-print-service.mjs`.

## Etkinleştirme

1. Uygulamada Windows servisinden yazdırma seçeneğini etkinleştirin. Restoran mutfak fişleri için mevcut `printViaWindowsService` bayrağı kullanılmaya devam eder.
2. Termal ESC/POS için yazıcı profilinde **Ağ (IP)**, adres ve port girin. Varsayılan port `9100`.
3. HTML, fatura, rapor, ürün etiketi ve Design Center şablonları için Windows üzerinde yüklü bir **sistem yazıcısı** kullanın. İş satırında `printer_name` / `system_name` yoksa `app_settings` içinde `key='printer_service'` ayarındaki varsayılan sistem yazıcısı kullanılır.
4. Kurulumdan sonra servisleri yönetici olarak kurun:
   - `install-services-manual.cmd`
   - veya kurulum sihirbazının otomatik servis adımı

Örnek `app_settings` değeri:

```json
{
  "defaultSystemPrinterName": "Microsoft Print to PDF",
  "browserPath": "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "sumatraPath": "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe"
}
```

## Poll davranışı

Servis `config.db` içinden `local_db`, `remote_db`, `db_mode`, `erp_firm_nr` ve `erp_period_nr` okur.

- Local PG yapılandırılmışsa her zaman denenir.
- Remote PG yalnızca `db_mode=online` veya `db_mode=hybrid` ise denenir.
- Her hedefte önce unified tablo, sonra legacy backlog poll edilir:
  - `rest.rex_{firm}_{period}_print_jobs`
  - `rest.rex_{firm}_{period}_kitchen_print_jobs`
- Tablo yoksa hata sayılmaz, loga “atlandı” yazılır.
- Claim işlemi `FOR UPDATE SKIP LOCKED` ile yapılır; desteklenmezse sınırlı fallback claim kullanılır.
- Legacy `kitchen_print_jobs` satırları `kitchen_ticket` olarak işlenir.

## Desteklenen job tipleri

| Job tipi | Beklenen payload | Yazdırma yolu |
|---|---|---|
| `kitchen_ticket` | Mutfak fişi alanları veya `payload.kind='kitchen_ticket'` | Network ESC/POS TCP |
| `escpos_raw` | `payload.escposBase64` | Network ESC/POS TCP |
| `html_document` | `payload.html` | Windows sistem yazıcısı |
| `pos_receipt_80` | `payload.html` | Windows sistem yazıcısı |
| `account_receipt` | `payload.html` | Windows sistem yazıcısı |
| `invoice_a4` | `payload.html` | Windows sistem yazıcısı |
| `report_html` | `payload.html` | Windows sistem yazıcısı |
| `product_label` | `payload.html` | Windows sistem yazıcısı |
| `fastreport_template` | `templateId`, `data` | Design Center JSON -> HTML -> sistem yazıcısı |
| `test_page` | İsteğe bağlı hedef bilgileri | Network ESC/POS veya sistem HTML test |

`connection=network` olan HTML işleri raw ESC/POS portuna HTML göndermez. HTML yazdırma için işte `printer_name` / `system_name` veya `printer_service.defaultSystemPrinterName` bulunmalıdır.

## FastReport-like şablonlar

Bu servis `.frx` dosyası çalıştırmaz. AsinERP Design Center içindeki JSON şablon kataloglarını kullanır:

- Kaynak tablo: `public.report_templates`
- Filtre: `category='template_catalog'`, `template_type='template_designer_v2'`
- Firma önceliği: önce işin firması, sonra `firm_nr IS NULL`
- Katalog biçimi: `{ "templates": [...] }`

`fastreport_template` payload örneği:

```json
{
  "kind": "fastreport_template",
  "templateId": "default-80mm",
  "templateType": "invoice",
  "engine": "fastreport-like",
  "data": {
    "storeName": "AsinERP Market",
    "receiptNumber": "POS-0001",
    "date": "20.07.2026",
    "time": "19:16",
    "items": [
      { "name": "Ürün A", "quantity": 2, "unitPrice": "50", "total": "100" }
    ],
    "total": "100"
  }
}
```

Renderer Node içinde React kullanmadan HTML üretir. `text`, `box`, `line`, `image`, `barcode`, `qr` ve `table` elementleri desteklenir. `{{a.b}}` tokenları `payload.data` içinden okunur; eksik token boş string olur. Barkod/QR için ilk sürümde metin fallback üretilir.

## HTML / sistem yazıcı yolu

HTML işleri Windows servis host üzerinde çalışır:

1. HTML geçici dosyaya yazılır.
2. Edge veya Chrome headless ile PDF üretilir.
3. SumatraPDF bulunursa `-print-to "PrinterName" -silent` ile hedef yazıcıya sessiz gönderilir.
4. Sumatra yoksa HTML için `Start-Process -Verb Print` best-effort fallback denenir veya iş açık hata mesajıyla `failed` olur.

Sessiz ve hedef yazıcıya doğru çıktı için Windows servis makinesinde Edge/Chrome ve SumatraPDF kurulması önerilir.

## Ortam değişkenleri

- `CONFIG_DB`: `config.db` yolu
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`: env PG hedefi / override
- `PRINT_FIRM_NR`: firma numarası override
- `PRINT_PERIOD_NR`: dönem numarası override
- `PRINT_POLL_MS`: poll aralığı
- `PRINT_CLAIM_LIMIT`: tek turda claim edilecek iş sayısı
- `PRINT_TCP_TIMEOUT_MS`: network ESC/POS timeout
- `PRINT_BROWSER`: Edge/Chrome yolu override
- `SUMATRA_PDF`: SumatraPDF yolu override

## Komutlar

```powershell
npm run printer:service
npm run printer:service:once
node kitchen-print-service.mjs --help
```

## Log

- Servis adı: `AsinERP_Printer`
- Worker: `kitchen-print-service.mjs`
- Log: `C:\ProgramData\AsinERP\printer_service.log`
- Poll aralığı: varsayılan 2500 ms
