# Restoran Modülü — Piyasa Karşılaştırması ve Eksikler

Bu dokümanda RetailEX restoran modülü, sektördeki iyi restoran POS / yönetim sistemleriyle karşılaştırılmakta ve eksikler listelenmektedir.

---

## 1. Piyasadaki İyi Restoran POS Özellikleri (2024–2026)

### Mimari ve altyapı
- **Bulut tabanlı mimari**: Merkezi sunucu, çok lokasyon, rol tabanlı erişim.
- **Veritabanı**: İlişkisel (PostgreSQL/MySQL), güvenli ve ölçeklenebilir.
- **API entegrasyonu**: Muhasebe, envanter, online sipariş, rezervasyon sistemleri.
- **Donanım**: Barkod, yazıcı, ödeme cihazı, kasa çekmecesi entegrasyonu.

### Operasyonel özellikler
- **Kolay arayüz**: Dokunmatik, tutarlı yerleşim, masa başı sipariş (mPOS).
- **Mutfak ekranı (KDS)**: Siparişlerin mutfağa anlık iletilmesi, süre takibi.
- **Çevrimdışı mod**: Bağlantı kesilince bile hizmet verebilme.
- **Masa yönetimi**: Kat planı, masa birleştirme/taşıma, rezervasyonla eşleştirme.

### Finans ve raporlama
- **Ödeme**: Nakit, kart, bölünmüş hesap, hesaba yazma.
- **Anlık raporlar**: Günlük satış, kategori bazlı, personel bazlı.
- **Envanter**: Reçete bazlı otomatik düşüm, stok uyarıları.
- **Çok lokasyon**: Merkezi menü/veri, lokasyon bazlı raporlama.

---

## 2. RetailEX Restoran Modülü — Mevcut Yapı

### Veritabanı (PostgreSQL, `rest` şeması)
- **Kart tabloları (firma bazlı)**: `rest_tables`, `rest_recipes`, `rest_recipe_ingredients`, `rest_staff`.
- **Hareket tabloları (firma+dönem)**: `rest_orders`, `rest_order_items`, `rest_kitchen_orders`, `rest_kitchen_items`, `rest_reservations`.
- **Şema sabit tablolar**: `rest.floors`, `rest.printer_profiles`, `rest.printer_routes`, `rest.kroki_layouts`.
- **Multi-tenant**: `rex_{firmNr}_rest_*`, `rex_{firmNr}_{periodNr}_rest_*`.

### Servis katmanı (`RestaurantService`)
- **Masa**: CRUD, durum (empty/occupied/kitchen/served/billing/cleaning/reserved), kilitleme, pozisyon, birleştirme/taşıma.
- **Sipariş**: Açma, kalem ekleme/güncelleme/silme, iptal (void), ikram, bölme, hesap kapatma, birleştirilmiş masalar.
- **Mutfak**: Mutfak siparişi oluşturma, KDS durumları (new/cooking/ready/served), tahmini süre, yük çarpanı.
- **Reçete**: Reçete listesi/kaydetme/silme, malzeme maliyeti.
- **Personel**: PIN ile giriş, liste, CRUD (soft delete).
- **Rezervasyon**: Tablo yoksa oluşturma, listeleme, CRUD, durum güncelleme.
- **Paket / gel-al**: DLV-*, GEL-* siparişleri, durum takibi.
- **Yazıcı**: Profil ve kategori→yazıcı eşlemesi.
- **Kroki**: Kat layout kaydetme/yükleme.
- **Z raporu**: Ödeme türü, kategori, void/ikram özeti.

### UI (store + bileşenler)
- RestPOS, RestaurantFloorPlan, KrokiView, TicketHistory, TakeawayManagement, DeliveryManagement.
- Zustand store: masa, menü, mutfak kuyruğu, personel, rezervasyon, kasa açılış/kapanış.

---

## 3. Karşılaştırma Özeti

| Özellik | Piyasa beklentisi | RetailEX durumu |
|--------|--------------------|-----------------|
| Masa / kat planı | Var, sürükle-bırak | Var (floors, tables, kroki layout) |
| Sipariş akışı | Masa → mutfak → servis → ödeme | Var (orders, order_items, kitchen_orders, kitchen_items) |
| KDS (mutfak ekranı) | Anlık, süre tahmini | Var (estimated_ready_at, load multiplier) |
| Reçete / maliyet | Reçete bazlı düşüm | Var (rest_recipes, addItemToTable’da stok düşümü) |
| Personel / PIN | Giriş ve yetki | Var (rest_staff, verifyStaffPin) |
| Rezervasyon | Tarih/saat, masa atama | Var (rest_reservations, ensureReservationsTable) |
| Paket / gel-al | Sipariş + durum | Var (GEL-*, takeaway status) |
| Paket / teslimat | Adres, kurye, durum | Var (DLV-*, delivery status) |
| Void / ikram | İptal nedeni, ikram | Var (void_reason, is_complementary) |
| Hesap birleştirme | Birleştirilmiş fatura | Var (linked_order_ids, mergeTables) |
| Z raporu | Gün sonu özeti | Var (getZReportData) |
| Yazıcı yönlendirme | Kategori → yazıcı | Var (printer_profiles, printer_routes) |
| Çok lokasyon | Merkezi + lokasyon | Kısmen (store_id floors/printer’da var; tam merkezi rapor yok) |
| Offline mod | Bağlantı yokken çalışma | Yok (DB/bridge’e bağımlı) |
| API dokümantasyonu | OpenAPI/Swagger | Yok (doğrudan Postgres + servis) |
| Ödeme entegrasyonu | Kart/NFC/hesaba yazma | Kısmen (payment_method alanı var, dış ödeme API yok) |
| Mobil mPOS | Tablette masa başı sipariş | Yok (tek arayüz) |
| Online sipariş entegrasyonu | Web/sipariş uygulaması | Yok |

---

## 4. Tespit Edilen Eksikler (Öncelik sırasıyla)

1. **Çevrimdışı mod**: Bridge/DB erişilemezken sipariş alıp sonra senkronize etme.
2. **Ödeme entegrasyonu**: Gerçek kart okuyucu / ödeme sağlayıcı API (PCI uyumlu).
3. **Mobil mPOS**: Tablette/telefonda sadece sipariş ekranı ve temel işlemler.
4. **API ve dokümantasyon**: REST/OpenAPI ile dış sistemler (online sipariş, rezervasyon siteleri).
5. **Çok lokasyon raporlama**: Tüm mağazalar için merkezi satış ve performans raporu.
6. **Stok uyarıları**: Reçete malzemelerinde minimum stok uyarısı ve “yapılamaz” uyarısı.
7. **Masa kilidi tutarlılığı**: lock/unlock UI’da store’da var; tüm akışlarda kullanımı gözden geçirilmeli.
8. **Rezervasyon tablosu**: `rest_reservations` CARD mı MOVEMENT mi netleştirilmeli; şu an `ensureReservationsTable` ile düz tablo oluşturuluyor, prefix yok.

---

## 5. Kod Tarafında Düzeltilen Nokta

- **Mutfak kalem tablosu**: Serviste yanlışlıkla `rest_kitchen_order_items` kullanılıyordu; şema `rest_kitchen_items`. Düzeltme yapıldı (`restaurant.ts` → `rest_kitchen_items`).

---

## 6. Sonuç

RetailEX restoran modülü, masa/sipariş/mutfak/reçete/personel/rezervasyon/paket/teslimat/Z raporu ve yazıcı yönlendirme açısından piyasa beklentilerinin büyük kısmını karşılıyor. Eksikler özellikle **çevrimdışı çalışma**, **ödeme entegrasyonu**, **mobil mPOS** ve **dış API/dokümantasyon** alanlarında. Öncelik bu dört başlığa verilerek adım adım geliştirme yapılabilir.
