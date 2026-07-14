# Menü route denetimi (web ↔ mobil)

**Tarih:** 2026-07-14  
**Kaynaklar:** `src/config/staticMenuConfig.ts` + ManagementModule · `mobile/src/config/menuConfig.ts` (`LIVE_MAP` + `navigateToModule`)  
**Commit:** yok · Senkron: `AUDIT_CONSISTENCY.md` / `TODO_RN_MIGRATION.md` (P2)

## Özet

Web yaprak `screen` id’leri mobil menüde korunuyor. Navigasyon `resolveLiveRoute` → `navigateToModule` ile stack’e düşüyor. Yaprakların çoğu canlı; `Module` kalanlar grup kabuğu veya `dashboard` (Tabs).

---

## Hâlâ `Module` (grup kabuğu / özel)

| Screen | Not |
|--------|-----|
| `dashboard` | LIVE_MAP yok → Tabs/`Dashboard` (`navigateToModule` özel) |
| `store-management-group` | Alt menü host |
| `material-movements` | Alt menü host |
| `inventory-count-ops` | Alt menü host |
| `finance-movements` / `finance-reports` | Alt menü host |
| `analytics-dashboard-group` | Alt menü host |
| `waybill` / `Siparişler` | Alt menü host (yapraklar `Invoices`) |

---

## Canlı eşleme — sık kullanılan id’ler

| Screen | LiveRoute |
|--------|-----------|
| `store-management` / `multistore` / `regional` | `StoreManagement` |
| `interstore-transfer` / `waybill-transfer` | `WmsTransfer` |
| `hybrid-sync` | `System` |
| `storeconfig` | `Organization` |
| `databroadcast` / `integrations` | `Communications` |
| `material-classes` / brands / unit-sets / categories / variants / special-codes / group-codes | `MaterialDefinitions` |
| `service-cards` | `Products` |
| `etransform` | `ETransform` |
| `cashier-scale` | `ScaleSale` |
| `scale-management` / `scale` | `ScaleManagement` |
| `wave-picking` | `WmsWavePicking` |
| `cari-devir` | `CariDevir` |
| `excel` / `smart-material-add` | `ExcelOps` |
| `production` / `butcher-production` | `ProductionOps` |
| `multicurrency` | `MultiCurrency` |
| `invoice-label-designer` / `virtual-pbx-caller-id` | `SystemExtras` |
| `financereports` | `Reports` |
| `mizan` | `ReportMizan` |
| Faturalar / irsaliye / sipariş yaprakları | `Invoices` |

---

## Bilinçli semantik gevşeklik

- AI/BI / kategori kar → `ReportProductSales` / `ReportSales`
- `service-cards` → Products
- `report-in-out-totals` / `report-slip-list` → ReportStock (özel mode UI sınırlı)
- Mobil “mizan” = cari bakiye — `AUDIT_ACCOUNTING.md`

---

## Doğrulama

```bash
cd mobile && npm run typecheck
```
