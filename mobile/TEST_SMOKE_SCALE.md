# TEST SMOKE — Terazi

**Modül:** Terazi yönetimi (Rongta) + tartılı satış  
**Ekran:** `ScaleManagementScreen`, `ScaleSaleScreen`  
**API:** `scaleProductsApi.ts`, `services/scale/rongtaBridge.ts`, `scaleTransport.ts`  
**Menü:** `scale-management`, `cashier-scale`

## Önkoşul

- Bridge (PLU/TCP için `/api/scale/rongta/*`)
- Ürünlerde `is_scale_product` / `plu_code` (opsiyonel veri)
- Fiziksel terazi LAN’da (TCP test için); Expo Go’da native BT yok

## API birim smoke (bridge)

| # | Kontrol | Eşdeğer | Beklenen |
|---|---------|---------|----------|
| 1 | Tartı ürünleri | `products WHERE is_scale_product` | 200 (0 satır OK) |
| 2 | Bridge route | `POST /api/scale/rongta/test` | ≠ 404 |
| 3 | Dosyalar | `ScaleManagementScreen.tsx`, `scaleProductsApi.ts` | var |

## Manuel UI checklist

| # | Adım | Geçti / Kaldı |
|---|------|---------------|
| 1 | Terazi Yönetimi → IP/port kaydet | |
| 2 | Bağlantı testi (TCP) | |
| 3 | PLU senkron (ürün listesi) | |
| 4 | Tartılı satış: ürün + simüle tartım | |

## Geçti / Kaldı

- **GEÇTİ:** scale products SQL + rongta route mevcut; UI açılır  
- **KALDI:** route 404 veya products kolon (`is_scale_product`) yok  
- Cihaz yanıt vermemesi tek başına KALDI değildir (HTTP timeout/4xx beklenir)

### 2026-07-14 koşusu (lovan)

| Kontrol | Sonuç |
|---------|--------|
| `fetchScaleProducts` SQL | **GEÇTİ** (0 satır) |
| Ekran / API dosyası | **GEÇTİ** |
| `POST /api/scale/rongta/test` | **KALDI** — HTTP 404 (çalışan bridge; kaynak `pg_bridge.ts`’te route var → bridge restart) |
