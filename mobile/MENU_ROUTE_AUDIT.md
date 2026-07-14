# Menü route denetimi (web ↔ mobil)

**Tarih:** 2026-07-14  
**Kaynaklar:** `src/config/staticMenuConfig.ts` + ManagementModule · `mobile/src/config/menuConfig.ts` (`LIVE_MAP` + `navigateToModule`)  
**Commit:** yok

## Özet

Web yaprak `screen` id’leri mobil menüde korunuyor. Navigasyon `resolveLiveRoute` → `navigateToModule` ile stack’e düşüyor. Kritik yanlış hedefler (özellikle `financereports→mizan`) bu turda düzeltildi.

---

## Bu turda düzeltilen kritikler

| Screen id | Eski hedef | Yeni hedef | Gerekçe (web) |
|-----------|------------|------------|----------------|
| `financereports` | `ReportMizan` | **`Reports`** | ManagementModule → `ReportsModule` hub; `mizan` ayrı |
| `cari-devir` | `ReportCariExtract` | **`Module`** | Web: `CariDevirFisiModule` (fiş); ekstre değil |
| `cash-slips` | `CashCollection` | **`Finance`** | Web: `CashRegisterManagement`; tahsilat değil |
| `financereports-bank` | `ReportCash` | **`Finance`** (bank) | Banka ≠ kasa raporu |
| `report-in-out-totals` | `ReportSales` | **`ReportStock`** | `MaterialAdvancedReports` |
| `report-slip-list` | `ReportSales` | **`ReportStock`** | malzeme fiş listesi |

Ek: `financeRouteParams` → `cash-slips` / `financereports-bank` / `financereports-cash` sekme parametreleri.  
`ReportsScreen`: “Cari Hesap Raporları → ReportMizan” yinelenen yanıltıcı kısayol kaldırıldı.

---

## Hâlâ `Module` (yer tutucu)

| Screen | Menü |
|--------|------|
| `cari-devir` | Cari Devir Fişi *(yanlış ekstre bağından alındı)* |
| `butcher-production` | Kasap Üretim |
| `excel` | Excel İşlemleri |
| `group-codes` | Grup Kodları |
| `invoice-label-designer` | Fatura Etiket Tasarımı |
| `multicurrency` | Çoklu Para Birimi |
| `production` | Üretim Reçeteleri |
| `scale` / `scale-management` | Terazi |
| `smart-material-add` | Akıllı malzeme ekleme |
| `special-codes` | Özel Kodlar |
| `variants` | Varyantlar |
| `virtual-pbx-caller-id` | Sanal santral |

**Özel:** `dashboard` LIVE_MAP’te yok → `resolveLiveRoute` = `Module`; `navigateToModule` önce Tabs/`Dashboard` (doğru).

---

## Canlı eşleme — kritik id’ler

| Screen | LiveRoute | Web karşılığı |
|--------|-----------|----------------|
| `financereports` | `Reports` | `ReportsModule` |
| `financereports-cash` | `ReportCash` | kasa hareket raporu |
| `financereports-bank` | `Finance` | banka kart/hareket |
| `mizan` | `ReportMizan` | cari bakiye özeti (mobil) |
| `customer-extract` | `ReportCariExtract` | cari ekstre |
| `cashbank` / `kasalar` / `cash-slips` | `Finance` | kasa |
| `collectionpayment` | `CashCollection` | tahsilat/ödeme |
| `material-classes` / `brand-definitions` / `unit-sets` / `product-categories` | `MaterialDefinitions` | ana kayıt tanımları |
| `store-management` / `multistore` / `regional` | `StoreManagement` | mağaza paneli |
| `etransform` | `ETransform` | e-belge kuyruğu |
| Faturalar / irsaliye / sipariş | `Invoices` | filtreli liste |
| Malzeme `report-*` | `ReportStock` | malzeme raporları |
| `wave-picking` | `WmsWavePicking` | WMS dalga |

---

## Bilinçli semantik gevşeklik

- `cashier-scale` → POS (terazi UI yok)
- AI/BI / kategori kar → `ReportProductSales` / `ReportSales`
- `service-cards` → Products
- `databroadcast` / `integrations` → Communications
- `storeconfig` → Organization
- `report-in-out-totals` / `report-slip-list` → ReportStock (özel mode UI yok)
- Mobil “mizan” = cari bakiye; web bazen GL — `AUDIT_ACCOUNTING.md`

---

## Doğrulama

```bash
cd mobile && npm run typecheck
```
