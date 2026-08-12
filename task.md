# RestaurantModule — Yapılacaklar Listesi

## 🟠 YÜKSEK — Kalan

### Kitchen Display (KDS)
- [ ] WebSocket entegrasyonu → başka terminalden gelen siparişler anlık görünsün
- [ ] "Tümünü Çağır" butonu → implement et (şu an sadece görsel)
- [ ] KDS durum makinesine `cooking` ve `cancelled` state'leri ekle

---

## 🟡 ORTA — Kalan

### Delivery Management
- [ ] Mock data kaldır → gerçek sipariş tablosuna bağla
- [ ] Kurye atama dropdown'u implement et
- [ ] Arama input'u implement et

### Takeaway Management
- [ ] Mock data kaldır → gerçek sipariş tablosuna bağla
- [ ] Durum geçişleri state machine: `pending → preparing → ready → picked_up`
- [ ] Arama input'u implement et

### Printer Settings
- [ ] Gerçek yazıcı algılama (şu an her zaman `'online'`)
- [ ] Test yazdır butonu ekle
- [ ] Kategori→yazıcı routing'ini gerçek print job'larına uygula
- [ ] Printer profilleri → DB'ye persist et (`rest.printer_profiles` var, store'a bağla)

### KrokiView
- [ ] Save race condition: DB save başarısız olursa kullanıcıyı uyar (şu an sessizce localStorage'a düşüyor)
- [ ] Hardcoded PIN `'1234'` → ayarlardan okunabilir hale getir

### Recipe Management
- [ ] `product.cost` alanı yok → `price` kullan veya schema'ya `cost` ekle
- [ ] `materialType === 'raw_material'` filtresi → Product type'ta bu alan yok, düzelt (ya kaldır ya da ekle)

---

## 🟢 DÜŞÜK — Kalan

### Temizlik
- [ ] `RestaurantModule` (index.tsx) — dashboard istatistikleri statik (75 kullanıcı), gerçek veriye bağla
- [ ] Kullanılmayan Lucide import'larını temizle (`Monitor`, `Printer`, `Clock`, `User`, `CalendarDays`)
- [ ] `RestEXProps` interface — kullanılmayan `campaigns: Campaign[]` ve `currentUser: UserType` proplarını kaldır
- [ ] TableTimer — her 60s polling yerine event-driven güncelleme
- [ ] Tüm modüllerde rol bazlı yetkilendirme (manager vs kasiyer)
- [ ] RestaurantModule index.tsx — tab değişiminde loading state ve hata boundary

---

## Tamamlanan ✅

### Veritabanı / Altyapı
- [x] `database/migrations/053_restaurant_schema.sql` — `rest` schema (rest.floors, rest.kroki_layouts, rest.printer_profiles, rest.printer_routes, INIT_RESTAURANT_PERIOD_TABLES, INIT_RESTAURANT_FIRM_TABLES)
- [x] `SetupWizard.tsx` — "Restoran / Kafe" seçeneği + DB init fonksiyon çağrıları

### Servis Katmanı
- [x] `restaurant.ts` — tam yeniden yazım, tüm metodlar: createOrder, closeOrder, getOrderHistory, addOrderItem, updateOrderItem, removeOrderItem, cancelOrder, createKitchenOrder, updateKitchenOrderStatus, getActiveKitchenOrders, getRecipes, saveRecipe, deleteRecipe, getPrinterProfiles, savePrinterProfile, getPrinterRoutes, savePrinterRoute, saveFloor, addTable — tümü `rest.*` schema kullanıyor

### Zustand Store
- [x] `useRestaurantStore.ts` — 64 mock masa + 14 mock menü + 4 mock bölge kaldırıldı
- [x] `loadTables / loadMenu / loadRegions / loadRecipes / loadKitchenOrders` eklendi
- [x] `sendToKitchen()` → DB order + kitchen order persist ediyor
- [x] `closeBill()` → DB order kapatıyor + sale + stok düşüyor
- [x] `persist()` sadece printer config saklıyor (tablo/menü DB'den yükleniyor)

### Komponent Bağlantıları
- [x] `KitchenDisplay.tsx` — DB'den yükleme + gerçek zamanlı elapsed time
- [x] `TicketHistory.tsx` — mock data → `getOrderHistory()`; arama + tarih filtresi çalışıyor
- [x] `RecipeManagement.tsx` — `loadRecipes()` + updateRecipe → DB persist
- [x] `KrokiView.tsx` — `storeId: null` → `getStoreId()` (localStorage)
- [x] `restaurant/index.tsx` — mount'ta loadTables/loadMenu/loadRegions/loadRecipes

### RestEX (POS) Düzeltmeler
- [x] `POSParkedReceiptsModal` → inline custom modal
- [x] Mutfağa Gönder confirm modal
- [x] Kart görünümünde per-item ikram/indirim/not aksiyonları
- [x] Kullanılmayan state'ler temizlendi
- [x] `POSSalesHistoryModal` / `POSReturnModal` / `POSCustomerModal` / `POSStaffModal` props düzeltildi
- [x] `restaurant/index.tsx` — `h-screen` → `h-full` footer fix
- [x] `RestPOS.tsx` — `handlePaymentComplete()` → `closeBill()` ile `rest_orders` persist + fallback doğrudan DB
- [x] `RestPOS.tsx` — Parked orders → `sessionStorage` persist (sayfa yenilenmesine dayanıklı)
- [x] `RestPOS.tsx` — `POSSalesHistoryModal` + `POSReturnModal` → `getOrderHistory()` ile gerçek veri

### Floor Plan
- [x] `RestaurantFloorPlan.tsx` — arama input'u state'e bağlandı (`searchTerm` filtresi çalışıyor)
- [x] `RestaurantFloorPlan.tsx` — `addTable()` → store üzerinden DB persist (async)
- [x] `RestaurantFloorPlan.tsx` — `addRegion()` → `RestaurantService.saveFloor()` DB persist + fallback
- [x] `RestaurantFloorPlan.tsx` — Region ID karşılaştırması düzeltildi (UUID + name + location fallback)
