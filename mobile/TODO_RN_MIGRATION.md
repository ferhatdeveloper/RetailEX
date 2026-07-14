# RetailEX — React Native Migrasyon Todo

> Kaynak: web `src/config/staticMenuConfig.ts` + ManagementModule (POS / WMS / Restoran / Güzellik)  
> Hedef: `mobile/` (Expo RN, native ekranlar — WebView yasak)  
> Son güncelleme: 2026-07-14 (ajan 3/10 — WMS mutabakat / applyStockCount)

## Durum özeti

| Sembol | Anlam |
|--------|--------|
| `[x]` | Canlı (API + anlamlı UI) |
| `[~]` | Kısmi (liste / host / okuma; CRUD veya tam form yok) |
| `[ ]` | Henüz yok / yalnızca iskelet hedefi |

**Menü yapısı (RN `menuConfig`):** 11 grup · 131 öğe · 115 yaprak  

**Durum sayımı (yaprak / özellik bazlı, yaklaşık):**  
- **`[x]` canlı ~29** — auth, dashboard, ürün CRUD basit, cari/fatura, POS, raporlar (satış özeti, kritik stok, mizan, ekstre, **ürün satış, kasa**), WMS sayım+mutabakat, **WMS depo transferi**, restoran adisyon+ödeme, güzellik randevu oluştur/düzenle, teslimat konum, sistem kullanıcı/rol/log, **iletişim müşteri+kuyruk okuma**
- **`[~]` kısmi ~83+** — Module host veya canlı route’a yönlendirme (güzellik POS fiş / tam yedekleme yazma yok)  
- **`[ ]` bekleyen ~8+** — dalga toplama, güzellik satış POS, EAS…

---

## Fazlar (öncelik)

### Faz 1 — Çekirdek (oturum + ana listeler) ✅ yapı
- Auth, config, firma/dönem, dashboard menü %100
- Ürün / cari / fatura listeleri + **detay okuma**
- POS sepet + **fiş kaydı (header + kalem)**
- Rapor: satış özeti + kritik stok + **cari ekstre** + **mizan (cari bakiye)**

### Faz 2 — Ticaret / finans formları
- Fatura oluşturma/düzenleme, irsaliye, sipariş, teklif
- Cari hareket, kasa fişleri, ödeme planları

### Faz 3 — WMS / Restoran / Güzellik işlemleri
- ~~Sayım fişi yazma~~ ✅ mobil (`WmsCount` / `WmsCountSlip`)
- ~~Sayım mutabakat + stoka uygula~~ ✅ (`applyStockCount` — web `wmsStockCount` ile aynı TRCODE 26/50)
- Dalga toplama
- ~~Adisyon aç + kalem ekle~~ ✅ (`RestaurantScreen` + `restaurantApi`)
- ~~Randevu oluştur + filtre~~ ✅ (`BeautyScreen` + `beautyApi`)
- ~~Restoran ödeme / kapatma~~ ✅ (`completeTablePayment`)
- ~~Randevu düzenleme~~ ✅ (`updateBeautyAppointment`); güzellik satış POS fişi hâlâ kısmi

### Faz 4 — Raporlar / sistem derinliği
- Tüm malzeme/finans raporları, BI, yedekleme yazma, RBAC düzenleme UI
- ~~Sistem menü yaprakları (okuma)~~ ✅ `SystemScreen`

---

## Ana Menü (`main-menu`)

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Dashboard | `dashboard` → DashboardModule | `DashboardScreen` | `[x]` |
| Mağaza Paneli | `store-management` | `Module` host | `[~]` |
| Şube Veri Senkronu | `hybrid-sync` | `Module` | `[~]` |
| Mağaza Transferi | `interstore-transfer` | `Module` | `[~]` |
| Çoklu Mağaza | `multistore` | `Module` | `[~]` |
| Bölgesel Bayilik | `regional` | `Module` | `[~]` |
| Mağaza Yapılandırma | `storeconfig` | `Module` | `[~]` |
| Bilgi Gönder/Al | `databroadcast` | `Module` | `[~]` |
| Entegrasyonlar | `integrations` | `Module` | `[~]` |

---

## Perakende / POS (`retail` + Management POS)

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Satış (POS) | MarketPOS / MobilePOS | `PosScreen` | `[x]` sepet + fiş kaydı + offline kuyruk/senkron + kamera barkod (`expo-camera`) |
| Terazi & Tartılı Satış | `cashier-scale` | `PosScreen` (aynı) | `[~]` tartı donanım yok |
| Terazi Yönetimi | `scale-management` | `Module` | `[~]` |
| Fiyat & Kampanya | `pricing` | `PricingScreen` + `Campaigns` | `[~]` fiyat listeleri canlı (price_list_*); kampanya liste+detay okuma |

---

## Malzeme Yönetimi (`material-management`)

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Malzemeler | `products` / ProductModule | `Products` + `ProductDetail` + `ProductForm` | `[x]` liste+detay+ oluştur/düzenle + kamera barkod arama |
| Malzeme Sınıfları | `material-classes` | `Module` | `[~]` |
| Birim Setleri | `unit-sets` | `Module` | `[~]` |
| Varyantlar | `variants` | `Module` | `[~]` |
| Özel Kodlar | `special-codes` | `Module` | `[~]` |
| Marka Tanımları | `brand-definitions` | `Module` | `[~]` |
| Terazi Tanımları | `scale` | `Module` | `[~]` |
| Grup Kodları | `group-codes` | `Module` | `[~]` |
| Ürün Kategorileri | `product-categories` | `Module` | `[~]` |
| Hizmet Kartları | `service-cards` | `Module` | `[~]` |
| Malzeme Yönetim Fişleri | `stockmovements` | `StockMovements` | `[~]` liste SQL (fiş + fatura) |
| Stok Devir Fişi | `stok-devir` | `StockMovements` | `[~]` liste SQL |
| Stok Fiyat Değişim | `stock-price-change-slips` | `StockMovements` | `[~]` liste SQL |
| Mobil Sayım | `mobile-inventory-count` | `WmsCount` | `[x]` fiş + satır + mutabakat + stoka uygula |
| Sayım Eksiği / Fazlası | `stockmovements-*` | `StockMovements` (filtre) | `[~]` liste SQL |
| Malzeme raporları (10) | `report-*` / `inventory` / `cost` | `ReportStock` (mode) | `[~]` kritik + min/max + değer + ambar + ekstre canlı |
| Excel / Akıllı ekleme | `excel` / `smart-material-add` | `Module` | `[~]` |
| Üretim / Kasap | `production` / `butcher-production` | `Module` | `[~]` |

---

## Faturalar (`invoices`)

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Satış faturaları (tüm türler) | UniversalInvoice* | `Invoices` + `InvoiceDetail` + `InvoiceForm` | `[~]` liste+detay+ basit satış faturası yazma / not-durum düzenleme |
| Alış faturası (standart) | purchase-invoice-standard | `Invoices` (purchase filtresi) + `InvoiceForm` (`kind: purchase`) | `[~]` liste+detay+ basit alış yazma (`createPurchaseInvoice`, stok +) |
| Alış / hizmet / iade (diğer) | aynı | `Invoices` (`invoiceFilters` trcode) | `[~]` iade/hizmet filtreli liste; tam form web |
| E-Dönüşüm | `etransform` | `Module` | `[~]` |
| İrsaliyeler | `waybill-*` | `Invoices` (`invoiceFilters` trcode 10–13) | `[~]` filtreli liste canlı |
| Siparişler | `salesorder` / `purchase` | `Invoices` (trcode 20/21) | `[~]` filtreli liste canlı |
| Teslimat Yönetimi | `logistics` | `DeliveryScreen` | `[x]` liste + canlı konum (`expo-location`) + durum + PG `courier_locations` |
| Teklifler | `Teklifler` | `Invoices` (trcode 30/31) | `[~]` filtreli liste canlı |

---

## Finans Yönetimi (`finance-management`)

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Cari Hesaplar | `suppliers` / Customers | `Customers` + `CustomerDetail` + `CustomerForm` | `[x]` liste+detay+ oluştur/düzenle |
| Ödeme Planları / Masraf Merkezi | `payment-plans` / `cost-centers` | `FinanceDefinitions` | `[~]` okuma listesi (`financeDefinitionsApi`) |
| Müşteri Arama Planı | `customer-call-plan` | `FinanceDefinitions` | `[~]` haftalık arşiv + cari plan okuma |
| Kasa Kartları | `cashbank` | `Finance` | `[x]` kart listesi + hareket + basit KASA_GIRIS/CIKIS (`financeApi`) |
| Cari Devir | `cari-devir` | `ReportCariExtract` | `[~]` ekstre ekranına yönlendirme |
| Kasa / Kasa Fişleri | `kasalar` / `cash-slips` | `Finance` / `CashCollection` | `[x]` hareket listesi + basit giriş |
| Banka (kart/hareket) | `banks` / `bank-vouchers` | `Finance` | `[x]` banka sekmesi + BANKA_GIRIS/CIKIS (menüde yorumlu; ekranda canlı) |
| Cari / Kasa / Banka raporları | `financereports*` | `ReportMizan` / `ReportCash` | `[x]` cari bakiye + **kasa hareket** |
| Cari Ekstre / Mizan | `customer-extract` / `mizan` | `ReportCariExtract` / `ReportMizan` | `[x]` |
| Gider / Çoklu PB | `revenueexpense` / `multicurrency` | `FinanceDefinitions` / `Module` | `[~]` gider okuma canlı; çoklu PB host |

---

## WMS / Depo

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| WMS Ana Panel | wms modules | `WmsScreen` | `[x]` özet+liste+sayım+transfer kısayolu |
| Stok Sayım | `stockcounting` | `WmsCount` | `[x]` fiş listesi + satır + mutabakat + `applyStockCount` |
| Depo / Ambar Transferi | `interstore-transfer` / `waybill-transfer` | `WmsTransfer` | `[x]` liste + oluştur + kalem + tamamla |
| Dalga Toplama | `wave-picking` | `Wms` | `[~]` |
| Mobil Sayım yazma | GoodsReceipt / InventoryCount | `WmsCount` + `WmsCountSlip` | `[x]` oluştur + barkod satır + mutabakat + stok uygula + kamera (`BarcodeScannerModal`) |

---

## Restoran

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Ana / Masalar / Adisyon | rest schema | `RestaurantScreen` | `[x]` liste + sekme (`initialTab`) |
| Kalem ekleme | Restaurant POS | `RestaurantScreen` modal | `[x]` adisyon aç + kalem ekle (`getOrderDetailById`) |
| Ödeme / kapatma | Restaurant POS | `RestaurantScreen` modal | `[x]` nakit/kart/veresiye → `completeTablePayment` |

---

## Güzellik Merkezi

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Ana / Randevu / Hizmet / Uzman | beautyService | `BeautyScreen` | `[x]` liste + durum filtresi |
| Randevu oluştur | BeautyPOS | `BeautyScreen` modal | `[x]` oluştur (hizmet/uzman seçimi) |
| Randevu düzenle | BeautyPOS | `BeautyScreen` edit modal | `[x]` tarih/saat/durum/hizmet/uzman (`updateBeautyAppointment`) |
| Güzellik satış POS | BeautyPOS / createSale | — | `[ ]` `beauty_sales` henüz yok |

---

## İletişim & Bildirimler

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| WhatsApp / Mesaj / Bildirim / SMS / E-posta | MesajBildirimModule, messagingService | `CommunicationsScreen` | `[~]` telefonlu müşteri + `notification_queue` kuyruk listesi canlı; gönderim/ayar yazma yok |

---

## Raporlar & Analiz

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Genel Rapor hub | `customreports` | `ReportsScreen` | `[x]` hub |
| Günlük Satış Özeti | (analytics) | `ReportSales` | `[x]` |
| Kritik Stok | — | `ReportStock` | `[x]` |
| Min/Max Stok | `report-min-max` | `ReportStock` mode | `[~]` liste SQL |
| Malzeme Değer | `report-material-value` | `ReportStock` mode | `[~]` liste SQL |
| Ambar Durum | `report-warehouse-status` | `ReportStock` mode | `[~]` liste SQL |
| Malzeme Ekstresi | `report-material-extract` | `ReportStock` mode | `[~]` ürün seç + hareket SQL |
| Mizan (cari bakiye) | `mizan` / `financereports` | `ReportMizan` | `[x]` `fetchCariBalances` |
| Cari Ekstre | `customer-extract` | `ReportCariExtract` | `[x]` hareket + satış fallback |
| Ürün Satış Raporu | `product-analytics` / `profit-dashboard` | `ReportProductSales` | `[x]` `fetchProductSales` (30 gün) |
| Kasa Raporu | `financereports-cash` | `ReportCash` | `[x]` `fetchCashMovements` (30 gün) |
| Kasa işlemleri / fişler | `kasalar` / `cash-slips` / `cashbank` | `Finance` | `[x]` operasyon ekranı (liste + yazma) |
| AI / Karlılık / BI | `product-analytics` vb. | `ReportProductSales` / `ReportSales` | `[~]` ürün satış canlı; BI web |
| Kategori grup kar | `category-group-profit-report` | `ReportProductSales` | `[~]` ürün satış verisi |

---

## Sistem Yönetimi

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Firma/Dönem | Organization flow + runtime switch | `OrganizationScreen` (login + oturum içi) · `orgSessionStore` invalidate · More/Dashboard | `[x]` |
| Kullanıcı / Rol / Menü | usermanagement… | `SystemScreen` sekmeler | `[x]` kullanıcı + rol liste (`LIVE_MAP` → System) |
| Yedekleme / Log / Kasa cihazları | backuprestore… | `SystemScreen` | `[x]` log + kasa okuma; yedekleme=şema özeti (yazma DeskApp) |
| Bağlantı ayarları | Login gear | `ConfigScreen` | `[x]` |

---

## Teknik altyapı

| Öğe | Durum |
|-----|--------|
| `pgClient` + connStr / dbMode | `[x]` |
| Online/Offline/Hybrid (`networkPolicy` + NetInfo + cache/kuyruk) | `[x]` `HYBRID_POLICY.md` · ürün/cari snapshot · cari + POS mutation queue |
| `menuConfig` ≡ staticMenuConfig + POS/WMS/rest/beauty | `[x]` |
| Stack + bottom tabs navigasyon | `[x]` |
| `LIVE_MAP` → `navigateToModule` / `ModuleScreen.replace` | `[x]` Report* / StockMovements / Restaurant / Beauty / Delivery / Finance / **FinanceDefinitions** / System / Communications / Organization / Campaigns / Pricing / WmsTransfer |
| i18n tr/en/ar/ku + RTL (`ar`/`ku`) | `[x]` AsyncStorage `retailex_mobile_language` |
| Dark mode | `[x]` AsyncStorage `retailex_mobile_theme` + `colors` |
| Menü görünümü `menuViewMode` (cards / list) | `[x]` AsyncStorage — mobil-only |
| EAS Build / store yayın | `[ ]` |
| Kamera barkod (`expo-camera` CameraView) | `[x]` `BarcodeScannerModal` → POS / WMS sayım / ürün arama |
| Konum (`expo-location`) | `[x]` `DeliveryScreen` → kurye canlı konum + `logistics.courier_locations` |

---

## Bu oturumda tamamlananlar

- [x] Bu dosya (envanter + fazlar) — kod ile senkron
- [x] Ürün / cari / fatura **detay okuma** ekranları
- [x] POS fiş kaydı (`sales` + `sale_items` + stok düşümü denemesi)
- [x] Rapor menü eşlemesi genişletme
- [x] Menü yaprağı → boş ekran yok (Module host + canlı replace)
- [x] README migration linki
- [x] `npm run typecheck` (temiz)
- [x] Cari oluştur/düzenle formu (`CustomerForm`)
- [~] Basit satış faturası oluşturma + not/durum düzenleme (`InvoiceForm`)
- [~] Basit alış faturası oluşturma (`createPurchaseInvoice`, AF-* fiş, stok artışı) + liste filtresi (`invoiceFilters` / menü → purchase)
- [x] Restoran adisyon aç + kalem ekle; adisyon listesinden `getOrderDetailById` ile kalem yükleme
- [x] Güzellik randevu oluştur + liste filtre; `load` dependency düzeltmesi; uzman SQL fallback
- [x] Cari ekstre + mizan SQL (`ReportCariExtract` / `ReportMizan` + `LIVE_MAP`)
- [x] Kamera barkod okuma (`expo-camera` + `BarcodeScannerModal` → `PosScreen`, `WmsCountSlipScreen`, `ProductsScreen`)
- [x] Menü görünümü tercihi (`menuViewMode`: cards | list, varsayılan cards; `preferencesStore` + AsyncStorage; Dashboard / Module grid)
- [x] Oturum açıkken firma/dönem/mağaza değiştirme (`Organization` main stack + `updateOrg` + `orgSessionStore` epoch)
- [x] Dil: tr / en / ar / ku + AsyncStorage persist + RTL (`I18nManager`; ar/ku) — Diğer + Login
- [x] Light/Dark tema toggle persist (Login + Diğer ayarlar)
- [x] Teslimat / kurye canlı konum (`expo-location` + `DeliveryScreen` + `logisticsApi` → PG `courier_locations` / yerel kuyruk)
- [x] Restoran adisyon ödeme / kapatma (`completeTablePayment` + nakit/kart/veresiye)
- [x] Güzellik randevu düzenleme (`updateBeautyAppointment` + durum/hizmet/uzman)
- [x] Ürün oluştur/düzenle formu (`ProductForm` + `createProduct` / `updateProduct`)
- [x] Sistem ayarları menü yaprakları (`SystemScreen` + `systemApi`; kullanıcı/rol/log/kasa/şema)
- [x] Online/Offline/Hybrid (`networkPolicy` + NetInfo + ürün/cari AsyncStorage cache + cari mutation kuyruk)
- [x] **Ajan 10/10:** `FinanceDefinitionsScreen` + `financeDefinitionsApi` — `payment-plans`, `cost-centers`, `customer-call-plan`, `revenueexpense` LIVE_MAP
- [x] **Ajan 10/10:** Fatura yaprakları — `salesorder`, `purchase`, `purchaserequest`, `Teklifler`, `waybill-sales|purchase|fire` → `Invoices` + `invoiceFilters` trcode
- [x] **Ajan 10/10:** `cari-devir` → `ReportCariExtract`; `stok-devir` / `stock-price-change-slips` → `StockMovements`
- [x] **Ajan 10/10:** `financeApi` kasa/banka hareket API geri yüklendi; `navigateToModule` fatura filtresi + `Campaigns` case
- [~] Stok hareketleri liste SQL (`StockMovements` + `stockMovementApi`) — fiş + fatura birleşik; CRUD yok
- [~] Malzeme raporları liste SQL (`ReportStock` mode: min-max, değer, ambar, ekstre) — kritik stok zaten `[x]`
- [x] Fiyat listesi görüntüleme (`PricingScreen` + `pricingApi` → products price_list_* kolonları)
- [x] Kampanya listesi + detay okuma (`CampaignsScreen` / `CampaignDetailScreen` + `campaignsApi`; `campaigns_mgmt` → LIVE_MAP)
- [x] POS fiş offline kuyruk + senkron (`pos.sale` · `mutationQueue` · `syncEngine` · cache stok düşümü)
- [x] **Ürün satış raporu** (`ReportProductSales` + `fetchProductSales` — sale_items, 30 gün)
- [x] **Kasa raporu** (`ReportCash` + `fetchCashMovements` — cash_lines + kasa kartı, 30 gün)
- [x] İletişim menü yaprakları — telefonlu müşteri + bildirim kuyruğu (`CommunicationsScreen` + `communicationsApi`; `LIVE_MAP` → whatsapp / mesaj-bildirim / sms / e-posta)
- [x] Bildirim merkezi — kritik stok + vadesi geçmiş açık cari (`NotificationsScreen` + `notificationsApi`; menü `notifications`)
- [x] WMS sayım mutabakat + stoka uygula (`wmsStockCountApi.applyStockCount` — web `wmsStockCount` ile aynı TRCODE 26/50; `WmsCountSlipScreen` mutabakat özeti + stok güncelleme)
- [x] Yazıcı / fiş ayarları (`PrinterSettingsScreen` + `printerSettingsStore` AsyncStorage + test yazdır stub; POS otomatik yazdır stub)

## Sonraki (Faz 2+)

1. ~~Fatura / cari oluşturma formları~~ (cari tamam; fatura kısmi)
2. Kasa/banka tam form: tahsilat/ödeme, virman, cari entegrasyonu (web `kasa.ts` / `banka.ts`)
3. ~~WMS sayım fişi yazma~~ ✅  
3. ~~WMS sayım mutabakat / applyStockCount~~ ✅  
4. ~~Restoran adisyon ödeme / kapatma~~ ✅  
5. ~~Güzellik randevu düzenleme~~ ✅ · güzellik satış POS (`beauty_sales`) hâlâ açık  
6. ~~Cari ekstre + mizan canlı SQL~~ ✅  
7. EAS Build  
8. Modül ekranlarındaki hardcoded TR stringleri i18n anahtarlarına taşıma  
9. Teslimat: harita SDK / POD foto — opsiyonel derinlik 
10. ~~Ürün oluştur/düzenle~~ ✅ · ~~Sistem menü yaprakları (okuma)~~ ✅ 
11. Offline kuyruk genişletme: ~~POS~~ ✅ · fatura / WMS sayım
