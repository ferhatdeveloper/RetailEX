# RetailEX FastReport Designer (PrintServer.Designer)

`PrintServer` ile birlikte gelen **bağımsız WinForms tasarımcısı**. Windows yüklü
bir bilgisayarda FastReport lisanslı DLL'lerle `.frx` tasarımı yapıp doğrudan
PostgREST üzerinden `public.report_templates` tablosuna kaydeder. Birden çok
kiracı (firm/period) için ayrı ayrı tasarım üretebilir; tasarımlar PrintServer
servisi tarafından otomatik olarak çekilip restoran/market yazdırma işlerinde
kullanılır.

## Hızlı Bakış

```
┌──────────────────┬──────────────────────────────────────────┐
│  TenantPanel     │  DataBindingPanel                        │
│  ─────────────   │  ─────────────────                       │
│  PostgREST URL   │  ▸ products                              │
│  Auth (Bearer)   │    ├ id                                   │
│  ▸ Bağlan        │    ├ code                                 │
│  ▸ Firma [001 ▾] │    ├ name                                 │
│  ▸ Dönem [01 ▾]  │    └ unit_price                           │
│  ▸ Kiracılar     │  ▸ sales                                  │
│                  │  ▸ rest_orders                            │
├──────────────────┼──────────────────────────────────────────┤
│                  │                                          │
│                  │        FastReport Designer                │
│                  │  (lib/FastReport.dll yüklü ise)          │
│                  │                                          │
├──────────────────┴──────────────────────────────────────────┤
│  Bu kiracı için FRX tasarımları                              │
│  ───────────────────────────────────────────────────────     │
│  Ad                         Kiracı       Güncellendi          │
│  ▸ Hesap Fişi v1           001/01       2026-09-02 14:23     │
│  ▸ Mutfak Fişi v2          001/01       2026-09-01 19:11     │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│  Önizleme Verisi (DataGridView)                              │
└──────────────────────────────────────────────────────────────┘
```

## Kurulum

1. **Windows 10/11** + **.NET 8 Desktop Runtime** (https://dot.net)
2. **RetailEX.PrintManager-Setup-X.Y.Z.exe** kurulum sihirbazında
   **"Tasarım aracını kur (RetailEX FastReport Designer)"** görevini işaretleyin.
3. Kurulum sonrası:
   * Servis tarafı: `C:\Program Files\RetailEX\PrintServer\`
   * Designer tarafı: `C:\Program Files\RetailEX\PrintServer\Designer\`
   * Designer lisans dosyaları: `…\Designer\lib\FastReport*.dll`
     (lisanslı DLL'leriniz buraya kopyalanır; git'e dahil değildir).

## İlk Yapılandırma

`%LocalAppData%\RetailEX\designer.config.json` (uygulama ilk açılışta
örnekten kopyalanır):

```json
{
  "postgrest": {
    "baseUrl": "http://127.0.0.1:3001",
    "authMode": "bearer",
    "bearerToken": "PASTE_JWT_OR_API_TOKEN_HERE"
  },
  "tenants": {
    "active": { "firmNr": "001", "periodNr": "01" }
  }
}
```

| Alan | Açıklama |
|---|---|
| `postgrest.baseUrl` | PostgREST kök URL. Genelde `http://<server>:3001`. |
| `postgrest.authMode` | `none`, `bearer` (JWT) veya `apikey` (PostgREST `apikey` header). |
| `postgrest.bearerToken` | PostgREST'in doğruladığı JWT token. `print_designer` rolü ile imzalanmış olmalı (migration 127). |
| `tenants.active` | Tasarım açıldığında otomatik seçilen kiracı. |

Env değişkenleri ile de override edilebilir:
`RETAILEX_DESIGNER_POSTGREST_URL`, `RETAILEX_DESIGNER_BEARER`,
`RETAILEX_FIRM_NR`, `RETAILEX_PERIOD_NR`.

## Kullanım

1. **PostgREST bağlantısı** — "Bağlantıyı Test Et" ile doğrula.
2. **Kiracı seçimi** — Firm + Dönem combobox'ları veya "Yenile" ile listeyi çek.
3. **Tasarım** — "Yeni" ile yeni rapor veya "DB'den Aç" / "Aç (.frx)" ile mevcut tasarımı aç.
4. **Veri önizleme** — Sol panelde tabloya çift tık → PostgREST'ten gerçek kayıtlar çekilir,
   alt gridde gösterilir.
5. **Veriyi Bağla** — Önizleme verisini FastReport'a `RegisterData` ile bağlar; Designer
   içinde `[TableName.Field]` sürüklenebilir olur.
6. **Önizleme** — FastReport preview penceresinde bağlı veriyle canlı render.
7. **DB'ye Kaydet** — `.frx` içeriği `public.report_templates.content` JSONB içinde
   `{ frxBase64, format, dataSources }` olarak saklanır.

## Tasarım Kayıt Formatı

`public.report_templates` tablosunda:

| Alan | Değer |
|---|---|
| `category` | `fastreport_frx` |
| `template_type` | `fastreport_frx` |
| `firm_nr` | Tasarımcıda seçilen kiracı (ör. `001`) |
| `period_nr` | Tasarımcıda seçilen dönem (ör. `01`) |
| `content` (JSONB) | `{ "version":1, "format":"frx", "engine":"fastreport", "frxBase64":"...", "dataSources":[...], "updatedAt":"..." }` |
| `name` | Kullanıcının girdiği tasarım adı (örn. *Hesap Fişi v1*) |

PrintServer servisi, yazdırma işlerinde `print_design_bindings.design_id` ile bu
satıra ulaşır; `content.frxBase64`'ü decode edip FastReport ile render eder.

## PrintServer ile İlişki

| Sorumluluk | PrintServer (Windows Service) | Designer (WinForms) |
|---|---|---|
| Çalışma modu | Arka plan, sessiz | Etkileşimli |
| Bağlantı | PostgREST (service config) | PostgREST (designer config) |
| Veri okuma | `print_jobs`, `report_templates` | `firms`, `periods`, `report_templates` |
| Veri yazma | `print_jobs.status = done` | `report_templates` INSERT/UPDATE |
| FastReport | Render only | Design + Preview |

İkisi **aynı PostgREST'i** ve **aynı `report_templates` tablosunu** kullanır; bu
sayede bir tasarım bir kez tasarlanır, tüm kiracı terminallerinde yazdırma için
kullanılır.

## PostgREST Yetkilendirme

Designer INSERT/UPDATE yapabilmesi için `print_designer` rolü veya en azından
`anon` üzerinde `SELECT, INSERT, UPDATE` yetkisi gerekir. Migration
`127_print_designer_postgrest_grants.sql` bunu sağlar. Üretim ortamında
önerilen, Designer için ayrı bir JWT imzalama anahtarı + `print_designer`
claim'ine sahip token'dır.

## Sorun Giderme

| Sorun | Çözüm |
|---|---|
| "FastReport DLL'lerini lib/ klasörüne koyun" | Lisanlı DLL'leri `Designer\lib\` altına kopyala: `FastReport.dll`, `FastReport.Bars.dll`, `FastReport.Editor.dll`. |
| Bağlantı başarısız | PostgREST ayakta mı? `http://<host>:3001/` browser'da açılıyor mu? JWT doğru mu? |
| DB'ye Kaydet 401/403 | `print_designer` rolü veya anon INSERT grant'i yok; migration 127 çalıştır. |
| "Bilinen kiracılar" boş | public.firms ve public.periods tablolarında `is_active=true` kayıt var mı? |
| Designer iki kez açılıyor | Tek instance mutex var; ikinci açılış "zaten çalışıyor" der. Task Manager'dan RetailEX.FastReportDesigner.exe kapatılabilir. |
