# RetailEX Mobile — Tutarlılık Denetimi

Tarih: 2026-07-14 · Kapsam: `mobile/` RN/Expo · Commit yok  
Tur: **P2** — menü i18n · `storeId` kritik listeler · TODO / bu dosya `LIVE_MAP` senkronu

## Özet

Menü → `LIVE_MAP` → stack navigasyonu hizalı. Yaprakların çoğu canlı; `Module` kalanlar çoğunlukla **grup kabuğu** (`store-management-group`, `waybill`, `Siparişler` …) + `dashboard` (Tabs özel). Typecheck hedeflenir. Offline kuyruk cari + POS (+ fatura) ile uyumlu. Oturum `storeId` kritik satış/WMS/fatura listelerinde filtrelenir.

| Alan | Durum |
|------|--------|
| LIVE_MAP vs menü (~127 screen) | ~118 canlı / ~9 `Module` (grup host + dashboard) |
| Stack ↔ `LiveRoute` ↔ `navigateToModule` | Hizalı (StoreManagement, ETransform, MaterialDefinitions, WmsWavePicking, Scale*, CariDevir, ProductionOps, ExcelOps, MultiCurrency, SystemExtras, …) |
| firmNr / periodNr | ERP tablolarında tutarlı (`erpTables`) |
| store | Oturumda var; **P2:** kritik listelerde `appendStoreIdFilter` |
| i18n tr/en/ar/ku | Auth/settings/dashboard + **menü** `menu.*` (sections/items/quick/badge) |
| Offline | policy ↔ müşteri/ürün okuma ↔ `pos.sale` / fatura / **WMS sayım** kuyruk |
| Typecheck | `npm run typecheck` |

## 1. LIVE_MAP / menü / stack

**Bayat `Module` satırları (düzeltildi — TODO ile senkron):**

| Screen | Eski doküman | Güncel LiveRoute |
|--------|--------------|------------------|
| `store-management` / `multistore` / `regional` | Module | `StoreManagement` |
| `interstore-transfer` | Module | `WmsTransfer` |
| `hybrid-sync` | Module | `System` |
| `storeconfig` | Organization / Module | `Organization` |
| `databroadcast` / `integrations` | Module | `Communications` |
| `material-classes` / `unit-sets` / `product-categories` / brands / variants / … | Module | `MaterialDefinitions` |
| `service-cards` | Module | `Products` |
| `etransform` | Module | `ETransform` |
| `cashier-scale` / `scale-management` / `scale` | POS / Module | `ScaleSale` / `ScaleManagement` |
| `wave-picking` | Wms `[~]` | `WmsWavePicking` |
| `cari-devir` | ReportCariExtract / Module | `CariDevir` |

**Bilinçli `Module` (grup / özel):**  
`dashboard` (Tabs), `store-management-group`, `material-movements`, `inventory-count-ops`, `finance-movements`, `finance-reports`, `analytics-dashboard-group`, `waybill`, `Siparişler`.

**Semantik gevşeklik (kabul / borç):**

- AI/BI menüleri → `ReportSales` / `ReportProductSales`
- `service-cards` → Products (ayrı hizmet kartı UI yok)
- Mobil “mizan” = cari bakiye — `AUDIT_ACCOUNTING.md`

## 2. firmNr / periodNr / store

- Tek kaynak: `authStore` → `erpTables.firmNr()` / `periodNr()` / `storeId()`
- Hareket: `rex_{firm}_{period}_*`; kart: `rex_{firm}_*`
- **P2 `appendStoreIdFilter(column, params)`** — `storeId` yoksa firma geneli (filtre yok)

| API / liste | Filtre kolonu |
|-------------|----------------|
| `dashboardApi.fetchDashboardStats` | `store_id` (önceden vardı) |
| `invoicesApi` liste + özet | `store_id` |
| `reportsApi` satış günü / top ürün / ürün satış | `store_id` / `s.store_id` |
| `wmsStockCountApi.fetchCountingSlips` | `cs.store_id` (+ offline cache) |
| `stockMovementApi` fiş + fatura birleşik | `warehouse_id` / `s.store_id` |
| `notificationsApi` vadesi geçmiş cari | `s.store_id` |

**Kalan boşluk:** ürün kritik stok / stok miktarı firma geneli (mağaza stok kolon modeli yok); kasa `cash_lines` mağaza kolonu seyrek.

## 3. i18n (tr / en / ar / ku)

- Locale dosyaları: `mobile/src/i18n/locales/{tr,en,ar,ku}.json` — `menu.sections|items|quick|badge*|groupsCount|moduleShortcuts`
- Helper: `mobile/src/i18n/menuLabels.ts` (`tMenuItem` / `tMenuSection` / `tMenuQuick` / `tMenuBadge`)
- UI: `DashboardScreen`, `ModuleScreen`, `MoreScreen`
- Üretici: `mobile/scripts/gen-menu-i18n.mjs` (etiket eklenince yeniden çalıştır)
- **Kalan:** ekran içi birçok `Alert` / form mesajı hâlâ TR hardcode

## 4. Offline policy vs write path

| Yol | Offline/Hybrid |
|-----|----------------|
| Ürün / cari liste | Snapshot OK |
| Cari CRUD | Kuyruk → flush |
| POS satış | `pos.sale` kuyruk + cache stok |
| Fatura satış/alış/iade/belge | Kuyruk |
| WMS sayım fiş/satır/mutabakat/stok | `wms.counting.*` kuyruk + `retailex_offline_counting_slips` cache |
| Ürün CRUD | Canlı zorunlu |
| WMS / Beauty sale / Finance yazma | WMS sayım kuyruk ✅; Beauty/Finance canlı zorunlu |

## 5. Typecheck

```
cd mobile && npm run typecheck
```

## Bu turda yapılanlar (P2)

- Menü i18n (4 dil) + ekran bağları
- `appendStoreIdFilter` + kritik liste SQL
- `TODO_RN_MIGRATION.md` bayat Module satırları
- Bu dosya `LIVE_MAP` / store / i18n durumu

## Önerilen sonraki adımlar

1. Kasa/banka satırlarında mağaza kolon modeli netleşince filtre  
2. Ekran içi stringleri i18n’e taşıma  
3. ~~WMS sayım mutation kuyruk~~ ✅  
4. EAS preview / production   — yapılandırma hazır; [`EAS_CHECKLIST.md`](./EAS_CHECKLIST.md) → `eas init` + ilk build  
