# TEST SMOKE — Restoran

**Modül:** Restoran masalar + açık adisyon  
**Ekran:** `RestaurantScreen`  
**API:** `mobile/src/api/restaurantApi.ts`  
**Tablolar:** `rex_{f}_rest_tables`, `rex_{f}_{p}_rest_orders` (+ items)

## Önkoşul

- Bridge
- Restoran şeması kiracıda yüklü olmalı; yoksa API boş dizi döner (`tryQueries`)

## API birim smoke (bridge)

| # | Kontrol | Eşdeğer | Not |
|---|---------|---------|-----|
| 1 | Masalar | `SELECT … FROM rest_tables` | Tablo yok → **ATLANDI** (şema) |
| 2 | Açık adisyon | `rest_orders` status ≠ closed | Aynı |
| 3 | Dosyalar | `RestaurantScreen.tsx`, `restaurantApi.ts` | zorunlu **GEÇTİ** |

## Manuel UI checklist

| # | Adım | Geçti / Kaldı |
|---|------|---------------|
| 1 | Restoran ekranı açılır (boş/veri) | |
| 2 | Masa seç → adisyon | |
| 3 | Kalem ekle / kapat / ödeme (varsa) | |

## Geçti / Kaldı

- **GEÇTİ (şema var):** masa + sipariş SELECT OK  
- **ATLANDI:** relation does not exist (kiracıda rest yok) — ekran dosyası yine GEÇTİ sayılır  
- **KALDI:** şema varken SQL/syntax hatası veya ekran crash
