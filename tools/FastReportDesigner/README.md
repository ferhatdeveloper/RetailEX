# RetailEX FastReport Designer

RetailEX için FastReport `.frx` tasarımlarını hazırlamak ve `public.report_templates` tablosuna kaydetmek için bağımsız WinForms araç iskeleti.

## Gereksinimler

- Windows üzerinde .NET 8 SDK
- PostgreSQL erişimi
- FastReport lisansınızdan gelen DLL dosyaları

## FastReport DLL ekleme

`tools/FastReportDesigner/lib/` klasörüne şu dosyaları kopyalayın:

- `FastReport.dll`
- `FastReport.Bars.dll`
- `FastReport.Editor.dll`
- Gerekirse `FastReport.Data.*.dll`, `FastReport.Web.dll` ve paketin istediği diğer DLL'ler

DLL dosyaları lisanslı/proprietary olduğu için depoya commit edilmez. Proje FastReport'a compile-time referans vermez; çalışma anında `Assembly.LoadFrom` ile yükler. DLL yoksa orta panelde `FastReport DLL'lerini lib/ klasörüne koyun` mesajı görünür.

## Build / çalıştırma

```powershell
cd tools\FastReportDesigner
dotnet restore .\RetailEX.FastReportDesigner.sln
dotnet run --project .\RetailEX.FastReportDesigner.csproj
```

## Bağlantı

Üst panelden PostgreSQL bağlantı bilgilerini girin:

- Host, Port, Database, User, Password
- FirmNr varsayılan `001`
- PeriodNr varsayılan `01`

Uygulama başlangıçta `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `RETAILEX_FIRM_NR`, `RETAILEX_PERIOD_NR` env değişkenlerini okuyabilir. İsterseniz aynı klasöre `designer.config.json` koyabilirsiniz; bu dosya secret içerebileceği için `.gitignore` kapsamındadır.

Örnek `designer.config.json`:

```json
{
  "host": "127.0.0.1",
  "port": 5432,
  "database": "retailex_local",
  "user": "postgres",
  "password": "postgres",
  "firmNr": "001",
  "periodNr": "01"
}
```

## DB alanları nasıl listelenir?

`Bağlan` butonu, `information_schema.columns` üzerinden firma/dönem tablolarını okur ve soldaki **DB alanları** ağacına gruplar.

Örnek aranan tablo adları:

- Firma tabloları: `products`, `customers`, `suppliers`, `stores`, `cash_registers`, `rex_001_products`
- Dönem tabloları: `sales`, `sale_items`, `cash_lines`, `bank_lines`, `stock_movements`, `rex_001_01_sales`
- Restoran tabloları: `orders`, `order_items`, `kitchen_orders`, `kitchen_order_items` ve `rest` şeması varyantları

Alan üzerine çift tıklayınca pano yolu kopyalanır: `sales.fiche_no`, `sale_items.product_name` gibi. Alanlar ayrıca designer alanına sürüklenebilir.

## Tasarım kaydetme / açma

Toolbar:

- **Yeni**: yeni FastReport raporu oluşturur.
- **Aç (.frx)**: lokal `.frx` açar.
- **Kaydet (.frx lokal)**: lokal `.frx` kaydeder.
- **Veritabanına Kaydet**: `.frx` içeriğini `public.report_templates` tablosuna kaydeder.
- **Veritabanından Aç**: mevcut FastReport tasarımlarını listeler ve açar.
- **Önizleme**: FastReport DLL sürümü destekliyorsa raporu önizler.

DB kayıt formatı:

- `category = 'fastreport_frx'`
- `template_type = 'fastreport_frx'`
- `firm_nr`, `period_nr`
- `content` JSONB:

```json
{
  "version": 1,
  "format": "frx",
  "engine": "fastreport",
  "frxBase64": "...",
  "dataSources": ["sales", "sale_items"],
  "updatedAt": "..."
}
```

## DeskApp Yazdırma Seçenekleri bağlantısı

Bu araç `.frx` tasarımını üretip `public.report_templates` içine kaydeder. DeskApp tarafındaki [Yazdırma Seçenekleri ekranı](../../src/components/system/PrintOptionsSettings.tsx), bu `fastreport_frx` kayıtlarını belge türüne göre seçtirir; kullanıcı lokal dosya taşımadan `.frx` tasarımlarını firmaya göre kullanabilir.
