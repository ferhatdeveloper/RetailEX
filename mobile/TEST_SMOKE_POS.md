# TEST SMOKE — POS

**Modül:** Perakende / Satış (POS)  
**Ekran:** `PosScreen` (`pos`)  
**API:** `mobile/src/api/posApi.ts` (+ ürün listesi `productsApi`)  
**Tarih şablonu:** 2026-07-14

## Önkoşul

- pg_bridge `:3001` çalışıyor
- Login: firma + dönem + mağaza seçili
- `networkPolicy` hybrid/online; canlı yazma için net açık

## API birim smoke (bridge)

Komut (tüm modüller): `node scripts/test/mobile-module-api-smoke.mjs`

| # | Kontrol | SQL / endpoint | Beklenen |
|---|---------|----------------|----------|
| 1 | Ürün listesi | `SELECT … FROM rex_{f}_products WHERE is_active` LIMIT 5 | HTTP 200, hata yok |
| 2 | Satış okuma | `SELECT … FROM rex_{f}_{p}_sales` LIMIT 5 | HTTP 200 |
| 3 | Ekran/API dosyası | `PosScreen.tsx`, `posApi.ts` | Dosya var |

Yazma smoke (manuel / ayrı): `savePosSale` — sepete ≥1 ürün, nakit → `sales` + `sale_items` (+ isteğe kasa).

## Manuel UI checklist

| # | Adım | Geçti / Kaldı |
|---|------|---------------|
| 1 | Menü → Satış (POS) açılır | |
| 2 | Ürün arama / ekle → satır görünür | |
| 3 | Toplam doğru; ödeme yöntemi seç | |
| 4 | Kaydet → başarı / kuyruk mesajı | |
| 5 | Offline hybrid: kuyruk + senkron | |

## Geçti / Kaldı kriteri

- **GEÇTİ:** bridge ürün + sales okuma OK; ekran açılıyor; (isteğe) fiş kaydı hatasız
- **KALDI:** ilişki yok, login/config hatası, veya kayıt exception
