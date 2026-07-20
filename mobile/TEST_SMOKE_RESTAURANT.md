# TEST SMOKE — Restoran

**Modül:** Restoran masalar + açık adisyon + mutfak + rezervasyon
**Ekran:** `RestaurantScreen`  
**API:** `mobile/src/api/restaurantApi.ts`  
**Tablolar:** `rex_{f}_rest_tables`, `rex_{f}_{p}_rest_orders` (+ items), `rex_{f}_{p}_rest_kitchen_orders/items`, `rex_{f}_{p}_rest_reservations`

## Önkoşul

- Bridge
- Restoran şeması kiracıda yüklü olmalı; yoksa API boş dizi döner (`tryQueries`)

## API birim smoke (bridge)

| # | Kontrol | Eşdeğer | Not |
|---|---------|---------|-----|
| 1 | Masalar | `SELECT … FROM rest_tables` | Tablo yok → **ATLANDI** (şema) |
| 2 | Açık adisyon | `rest_orders` status ≠ closed | Aynı |
| 3 | Menü | aktif, fiyatlı `rex_{f}_products`; restoran kategorisi varsa öncelik | Ürün yok → manuel kalem hâlâ kullanılabilir |
| 4 | Mutfağa gönder | order item `status='cooking'`; kitchen tabloları varsa fiş oluşturur | Kitchen tablo yok → kalem statüsü yine güncellenir |
| 5 | Mutfak ekranı | aktif kitchen order + item listesi | `Hazırla` item/order status günceller |
| 6 | Rezervasyon | create + status update | Şema yok → UI hata banner gösterir |
| 7 | Dosyalar | `RestaurantScreen.tsx`, `restaurantApi.ts` | zorunlu **GEÇTİ** |

## Manuel UI checklist

| # | Adım | Geçti / Kaldı |
|---|------|---------------|
| 1 | Restoran ekranı açılır (boş/veri) | |
| 2 | Masa seç → adisyon | |
| 3 | Ürün ara → ürün seç → miktar/fiyat dolar → kalem ekle | |
| 4 | Mutfağa gönder → kalem statüsü pişiyor olur, mutfak sekmesinde fiş görünür | |
| 5 | Mutfak sekmesi → kalem hazırla / tümünü hazırla | |
| 6 | Bugünkü akış → hızlı rezervasyon ekle → Onayla/Oturdu/İptal durumları | |
| 7 | Ödeme al / kapat mevcut davranışı korur | |

## Geçti / Kaldı

- **GEÇTİ (şema var):** masa + sipariş + menü + mutfak SELECT OK
- **ATLANDI:** relation does not exist (kiracıda rest yok) — ekran dosyası yine GEÇTİ sayılır  
- **KALDI:** şema varken SQL/syntax hatası veya ekran crash
