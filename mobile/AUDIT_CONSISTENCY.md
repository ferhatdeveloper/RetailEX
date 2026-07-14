# RetailEX Mobile — Tutarlılık Denetimi

Tarih: 2026-07-14 · Kapsam: `mobile/` RN/Expo · Commit yok

## Özet

Menü → `LIVE_MAP` → stack navigasyonu hizalandı (kritik ölü/yanlış bağlar düzeltildi). Typecheck **geçiyor** (`npm run typecheck`). Offline kuyruk cari + POS ile uyumlu; ürün/fatura/WMS yazmaları canlı zorunlu. `storeId` oturumda tutuluyor, çoğu API yalnızca `firmNr`/`periodNr` ile tablo seçiyor.

| Alan | Durum |
|------|--------|
| LIVE_MAP vs menü (125 screen) | ~92 canlı / ~33 `Module` yer tutucu |
| Stack ↔ `LiveRoute` ↔ `navigateToModule` | Hizalı (Finance, Communications, WmsTransfer, CashCollection, Campaigns, …) |
| firmNr / periodNr | ERP tablolarında tutarlı (`erpTables`) |
| store | Oturumda var; filtreleme seyrek (`dashboardApi` vb.) |
| i18n tr | Auth/settings/dashboard anahtarları tam; menü etiketleri hâlâ hardcoded TR |
| Offline | policy ↔ müşteri/ürün okuma ↔ `pos.sale` kuyruk OK; diğer yazmalar kuyruksuz |
| Typecheck | **0 hata** (`tsc --noEmit`) |

## 1. LIVE_MAP / menü / stack

**Düzeltilen kritikler (bu tur):**

- `customer-in-out-totals` yazım hatası → `report-in-out-totals` (önceden hep `Module`)
- Çakışan `kasalar` / `cash-slips` (Finance vs ReportCash) temizlendi
- `PrinterSettings`, `Communications`, `Finance`, `CashCollection`, `WmsTransfer`, `Campaigns` route bağları + `MainStackParamList` / navigator / `navigateToModule` tamamlandı
- Beauty satış tipleri (`BeautySale` …) eklendi; WMS sayım `number`/`string` karşılaştırma düzeltildi

**Kalan (bilinçli yer tutucu):** ~33 menü screen → `Module` (ör. e-dönüşüm, excel, butcher, marka, entegrasyon, `Siparişler`/`Teklifler` Türkçe id). `dashboard` özel-cased `Tabs`.

**Semantik gevşeklik (kabul edilebilir / teknik borç):**

- `financereports` → `ReportMizan` (genel cari rapor ≠ mizan)
- AI/BI menüleri → `ReportSales` / `ReportProductSales`
- `cashier-scale` → `POS` (terazi UI yok)

## 2. firmNr / periodNr / store

- Tek kaynak: `authStore` → `erpTables.firmNr()` / `periodNr()` / `storeId()`
- Hareket tabloları: `rex_{firm}_{period}_*`; kartlar: `rex_{firm}_*`
- **Boşluk:** Mağaza filtresi çoğu listede yok; WMS sayım `store_id` ile yazar, POS satışta mağaza kolonu yok

## 3. i18n (tr)

- `tr.json` ↔ `en.json` anahtar sayısı hizalı (~102+)
- Göze çarpan: `MENU_SECTIONS` / `QUICK_ACCESS` etiketleri i18n değil (dil değişince menü Türkçe kalır)
- Ekran içi birçok kullanıcı mesajı hardcode (`Alert`, form hataları)

## 4. Offline policy vs write path

| Yol | Offline/Hybrid |
|-----|----------------|
| Ürün / cari liste | Snapshot OK |
| Cari CRUD | Kuyruk → flush |
| POS satış | `pos.sale` kuyruk + cache stok |
| Ürün CRUD | Canlı zorunlu (hata) |
| Fatura / WMS / Beauty sale / Finance yazma | Canlı zorunlu veya net kontrolü yok / kuyruksuz |

`HYBRID_POLICY.md` POS kuyruğunu tanımlıyor; fatura/WMS bilinçli sonraki faz.

## 5. Typecheck

```
npm run typecheck  →  exit 0
```

## Bu turda yapılan düzeltmeler (minimal)

- `menuConfig` LIVE_MAP / LiveRoute
- `navigation/types` + `MainStackNavigator` + `navigateToModule`
- `beautyApi` tip + helpers
- `wmsStockCountApi` sayım karşılaştırma
- Tema (`red600`/`amber600`), `absoluteFill`, PrimaryButton `ghost`
- `ReportScreens` mode Record tipi

## Önerilen sonraki adımlar

1. `Module` kalan ~33 öğeyi öncelik sırasıyla LIVE’a almak veya menüden ayıklamak  
2. `storeId` filtre politikasını ürün/satış/rapor API’lerine tutarlı yazmak  
3. Menü etiketlerini i18n anahtarlarına taşımak  
4. Fatura / WMS / Beauty yazmalarını kuyruğa almak veya UI’da net “çevrimiçi gerekli”  
