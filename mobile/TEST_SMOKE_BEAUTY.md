# TEST SMOKE — Güzellik

**Modül:** Güzellik — randevu / hizmet / uzman / satış  
**Ekran:** `BeautyScreen` (+ `BeautySalesPanel`)  
**API:** `mobile/src/api/beautyApi.ts`  
**Tablolar:** `beauty_appointments`, `beauty_services`, `beauty_specialists`, sales*

## Önkoşul

- Bridge; beauty şeması (firma prefix’li tablolar)

## API birim smoke (bridge)

| # | Kontrol | Eşdeğer | Not |
|---|---------|---------|-----|
| 1 | Hizmetler | `beauty_services` aktif | yoksa ATLANDI |
| 2 | Uzmanlar | `beauty_specialists` | yoksa ATLANDI |
| 3 | Randevular | `beauty_appointments` | yoksa ATLANDI |
| 4 | Dosyalar | `BeautyScreen.tsx`, `beautyApi.ts` | zorunlu |

## Manuel UI checklist

| # | Adım | Geçti / Kaldı |
|---|------|---------------|
| 1 | Randevu listesi | |
| 2 | Hizmet / uzman sekmeleri | |
| 3 | Yeni randevu / durum güncelle | |
| 4 | Güzellik satışı (panel) | |

## Geçti / Kaldı

- **GEÇTİ:** mevcut tablolarda SELECT OK + UI açılır  
- **ATLANDI:** beauty tabloları yok  
- **KALDI:** tablo varken kolon/join hatası
