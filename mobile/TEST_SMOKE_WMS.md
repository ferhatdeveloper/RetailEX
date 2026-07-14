# TEST SMOKE — WMS

**Modül:** Depo / stok özeti + sayım / transfer / dalga toplama  
**Ekran:** `WmsScreen`, `WmsCountScreen`, `WmsTransferScreen`, `WavePickingScreen`, …  
**API:** `wmsApi.ts`, `wmsStockCountApi.ts`, `wmsTransferApi.ts`, `wmsPickingApi.ts`

## Önkoşul

- Bridge; ürün stok kolonları
- Sayım/transfer için mağaza (`storeId`) oturumda

## API birim smoke (bridge)

| # | Kontrol | Eşdeğer | Beklenen |
|---|---------|---------|----------|
| 1 | `fetchWmsStock` | products stock sıralı LIMIT 10 | 200 |
| 2 | `fetchWmsSummary` | product_count / below_min / zero_stock | 200 |
| 3 | Dosyalar | `WmsScreen.tsx`, `wmsApi.ts` | var |

Derin smoke (manuel): sayım fişi oluştur, barkod satır, tamamla — yazma.

## Manuel UI checklist

| # | Adım | Geçti / Kaldı |
|---|------|---------------|
| 1 | WMS hub KPI / stok listesi | |
| 2 | Mobil sayım akışı (varsa) | |
| 3 | Transfer / wave picking menü bağları | |

## Geçti / Kaldı

- **GEÇTİ:** stok + özet sorguları OK
- **KALDI:** products okunamaz veya özet SQL hata
