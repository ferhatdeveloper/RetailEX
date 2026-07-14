# TEST SMOKE — Raporlar

**Modül:** Rapor hub + günlük satış / kritik stok / cari / malzeme  
**Ekran:** `ReportsScreen`, `ReportScreens.tsx`  
**API:** `mobile/src/api/reportsApi.ts`

## Önkoşul

- Bridge; sales + products (rapora göre ek tablolar)

## API birim smoke (bridge)

| # | Kontrol | Eşdeğer | Beklenen |
|---|---------|---------|----------|
| 1 | `fetchSalesByDay` | 14 günlük gruplama `sales` | 200 |
| 2 | `fetchCriticalStock` | stock &lt; min_stock | 200 (0 satır OK) |
| 3 | Dosyalar | `ReportsScreen.tsx`, `reportsApi.ts` | var |

İsteğe: `fetchTopProducts`, `fetchCariBalances`, `fetchMaterialValue`.

## Manuel UI checklist

| # | Adım | Geçti / Kaldı |
|---|------|---------------|
| 1 | Raporlar hub kartları | |
| 2 | Günlük satış / kritik stok ekranı | |
| 3 | Menüden malzeme rapor kısayolları | |

## Geçti / Kaldı

- **GEÇTİ:** günlük satış + kritik stok SELECT OK  
- **KALDI:** aggregation SQL hatası veya ekran crash
