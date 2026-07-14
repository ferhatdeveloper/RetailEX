# RetailEX — React Native Migrasyon Todo

> Kaynak: web `src/config/staticMenuConfig.ts` + ManagementModule (POS / WMS / Restoran / Güzellik)  
> Hedef: `mobile/` (Expo RN, native ekranlar — WebView yasak)  
> Son güncelleme: 2026-07-14 (Belge tara → fatura · DocumentScan · OCR/manuel sihirbaz)

## Durum özeti

| Sembol | Anlam |
|--------|--------|
| `[x]` | Canlı (API + anlamlı UI) |
| `[~]` | Kısmi (liste / host / okuma; CRUD veya tam form yok) |
| `[ ]` | Henüz yok / yalnızca iskelet hedefi |

**Menü yapısı (RN `menuConfig`):** 11 grup · ~131 öğe · ~115 yaprak · yaprak `LIVE_MAP` çoğunlukla canlı (~9 `Module` = grup kabuğu / `dashboard` Tabs özel)

**Durum sayımı (yaprak / özellik bazlı, yaklaşık):**  
- **`[x]` / `[~]` canlı route** — ürün/cari/fatura, POS, terazi, mağaza, malzeme tanımları, E-Dönüşüm, WMS sayım+transfer+dalga, finans/cari devir, raporlar, sistem, iletişim…  
- **`Module` yer tutucu** — grup kabukları (`store-management-group`, `waybill`, `Siparişler` …) + `dashboard`  
- **`[ ]` bekleyen** — EAS ilk preview/production **build** (`eas init` + hesap); diğer ekran-içi TR i18n (POS `posUi` ✅); Rongta LAN canlı kg donanım sınırı ([`RONGTA_LAN.md`](./RONGTA_LAN.md))

---

## Fazlar (öncelik)

### Faz 1 — Çekirdek (oturum + ana listeler) ✅ yapı
- Auth, config, firma/dönem, dashboard menü %100
- Ürün / cari / fatura listeleri + **detay okuma**
- POS sepet + **fiş kaydı (header + kalem)**
- Rapor: satış özeti + kritik stok + **cari ekstre** + **mizan (cari bakiye)**

### Faz 2 — Ticaret / finans formları
- Fatura oluşturma/düzenleme; ~~irsaliye, sipariş, teklif~~ ✅ create (liste +)
- ~~Hizmet verilen/alınan create~~ ✅ (`service-given` / `service-received`)
- Cari hareket, kasa fişleri, ödeme planları
- KDV: satır `vat_rate` + UI özeti (header `total_vat` web gibi 0)

### Faz 3 — WMS / Restoran / Güzellik işlemleri
- ~~Sayım fişi yazma~~ ✅ mobil (`WmsCount` / `WmsCountSlip`)
- ~~Sayım mutabakat + stoka uygula~~ ✅ (`applyStockCount` — web `wmsStockCount` ile aynı TRCODE 26/50)
- ~~Dalga toplama~~ ✅ (`WmsWavePicking` / `WmsWavePickingExecute` — liste + yürütme)
- ~~Adisyon aç + kalem ekle~~ ✅ (`RestaurantScreen` + `restaurantApi`)
- ~~Randevu oluştur + filtre~~ ✅ (`BeautyScreen` + `beautyApi`)
- ~~Restoran ödeme / kapatma~~ ✅ (`completeTablePayment`)
- ~~Randevu düzenleme~~ ✅ (`updateBeautyAppointment`)
- ~~Güzellik satış POS~~ ✅ (`BeautySalesPanel` + `createBeautySale` ERP/kasa)

### Faz 4 — Raporlar / sistem derinliği
- Tüm malzeme/finans raporları, BI, yedekleme yazma, RBAC düzenleme UI
- ~~Sistem menü yaprakları (okuma)~~ ✅ `SystemScreen`

---

## Ana Menü (`main-menu`)

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Dashboard | `dashboard` → DashboardModule | `DashboardScreen` (Tabs) | `[x]` |
| Mağaza Paneli | `store-management` | `StoreManagement` | `[~]` liste (`public.stores`) |
| Şube Veri Senkronu | `hybrid-sync` | `System` | `[~]` okuma host |
| Mağaza Transferi | `interstore-transfer` | `WmsTransfer` | `[x]` liste + oluştur + kalem + tamamla |
| Çoklu Mağaza | `multistore` | `StoreManagement` | `[~]` aynı mağaza paneli |
| Bölgesel Bayilik | `regional` | `StoreManagement` (`groupByRegion`) | `[~]` bölgesel gruplama |
| Mağaza Yapılandırma | `storeconfig` | `Organization` | `[~]` firma/dönem/mağaza kapsam |
| Bilgi Gönder/Al | `databroadcast` | `Communications` | `[~]` iletişim kuyruk okuma |
| Entegrasyonlar | `integrations` | `Communications` | `[~]` iletişim host |

---

## Perakende / POS (`retail` + Management POS)

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Satış (POS) | MarketPOS / MobilePOS | `PosScreen` | `[x]` sepet + fiş kaydı + offline kuyruk/senkron + kamera barkod (`expo-camera`) |
| Terazi & Tartılı Satış | `cashier-scale` | `ScaleSale` | `[x]` simüle + **BLE canlı kg** (dev build); LAN Rongta canlı kg yok |
| Terazi Yönetimi | `scale-management` | `ScaleManagement` | `[x]` TCP/PLU + **BLE tara/bağlan** (`react-native-ble-plx`); Expo Go’da BT native yok |
| Fiyat & Kampanya | `pricing` | `PricingScreen` + `Campaigns` + `CampaignForm` | `[~]` fiyat listeleri canlı; kampanya CRUD + POS basit motor |

---

## Malzeme Yönetimi (`material-management`)

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Malzemeler | `products` / ProductModule | `Products` + `ProductDetail` + `ProductForm` | `[x]` liste+detay+ oluştur/düzenle + kamera barkod arama |
| Malzeme Sınıfları | `material-classes` | `MaterialDefinitions` | `[~]` liste + basit ekleme |
| Birim Setleri | `unit-sets` | `MaterialDefinitions` | `[~]` liste + basit ekleme |
| Varyantlar | `variants` | `MaterialDefinitions` | `[~]` liste + create |
| Özel Kodlar | `special-codes` | `MaterialDefinitions` | `[~]` liste + create |
| Marka Tanımları | `brand-definitions` | `MaterialDefinitions` | `[~]` liste + basit ekleme |
| Terazi Tanımları | `scale` | `ScaleManagement` | `[x]` aynı Terazi Yönetimi ekranı |
| Grup Kodları | `group-codes` | `MaterialDefinitions` | `[~]` liste + create |
| Ürün Kategorileri | `product-categories` | `MaterialDefinitions` | `[~]` liste |
| Hizmet Kartları | `service-cards` | `Products` | `[~]` ürün listesi (hizmet kartı filtre/web derinliği yok) |
| Malzeme Yönetim Fişleri | `stockmovements` | `StockMovements` | `[~]` liste SQL (fiş + fatura) |
| Stok Devir Fişi | `stok-devir` | `StockMovements` | `[~]` liste SQL |
| Stok Fiyat Değişim | `stock-price-change-slips` | `StockMovements` | `[~]` liste SQL |
| Mobil Sayım | `mobile-inventory-count` | `WmsCount` | `[x]` fiş + satır + mutabakat + stoka uygula |
| Sayım Eksiği / Fazlası | `stockmovements-*` | `StockMovements` (filtre) | `[~]` liste SQL |
| Malzeme raporları (10) | `report-*` / `inventory` / `cost` | `ReportStock` (mode) | `[~]` kritik + min/max + değer + ambar + ekstre canlı |
| Excel / Akıllı ekleme | `excel` / `smart-material-add` | `ExcelOps` | `[~]` CSV paylaşım + ProductForm |
| Üretim / Kasap | `production` / `butcher-production` | `ProductionOps` | `[~]` reçete liste + basit create |

---

## Faturalar (`invoices`)

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Satış faturaları (tüm türler) | UniversalInvoice* | `Invoices` + `InvoiceDetail` + `InvoiceForm` | `[~]` create+header parity (tarih/döviz/depo/vade/kasa); edit=header; **draft kalem edit** |
| Alış faturası (standart) | purchase-invoice-standard | `Invoices` (purchase) + `InvoiceForm` (`kind: purchase`) | `[~]` tedarikçi seçimi (`suppliersApi`), kalem+özet+KDV satır, stok + / veresiye borç |
| Satış / alış iade | UniversalInvoice trcode 3/6 | `InvoiceForm` (`sales-return` / `purchase-return`) + liste `+` | `[~]` yazma: stok yönü web ile aynı; kasiyer (3 zorunlu) |
| Hizmet / irsaliye / sipariş / teklif | aynı | `Invoices` + `InvoiceForm` + `createDocumentInvoice` | `[~]` hizmet **kart picker** (`servicesApi`, item_type=Hizmet) + TR 9/4 create; stok yok |
| E-Dönüşüm | `etransform` | `ETransform` | `[x]` kuyruk + yeniden dene / durum / toplu mock gönder |
| Belge Tara → Fatura | `document-scan` | `DocumentScan` | `[x]` ImagePicker (kamera/galeri) + `expo-text-extractor` OCR (yoksa manuel) → cari/tutar/kalem onay → `createSalesInvoice` / `createPurchaseInvoice` / `createDocumentInvoice` |
| İrsaliyeler | `waybill-*` | `Invoices` + `InvoiceForm` | `[~]` liste + create (10/11; 12/13 trcode override) |
| Siparişler | `salesorder` / `purchase` | `Invoices` + `InvoiceForm` | `[~]` liste + create (20/21, status draft) |
| Teslimat Yönetimi | `logistics` | `DeliveryScreen` | `[x]` liste + canlı konum (`expo-location`) + durum + PG `courier_locations` |
| Teklifler | `Teklifler` | `Invoices` + `InvoiceForm` | `[~]` liste + create (TR 30) |

---

## Finans Yönetimi (`finance-management`)

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Cari Hesaplar | `suppliers` / Customers | `Customers` + `CustomerDetail` + `CustomerForm` | `[x]` liste+detay+ oluştur/düzenle |
| Ödeme Planları / Masraf Merkezi | `payment-plans` / `cost-centers` | `FinanceDefinitions` | `[~]` okuma listesi (`financeDefinitionsApi`) |
| Müşteri Arama Planı | `customer-call-plan` | `FinanceDefinitions` | `[~]` haftalık arşiv + cari plan okuma |
| Kasa Kartları | `cashbank` | `Finance` | `[x]` kart listesi + hareket + basit KASA_GIRIS/CIKIS (`financeApi`) |
| Cari Devir | `cari-devir` | `CariDevir` | `[x]` toplu açılış bakiyesi + kayıtlı fiş düzenle/iptal |
| Kasa / Kasa Fişleri | `kasalar` / `cash-slips` | `Finance` / `CashCollection` | `[x]` hareket listesi + basit giriş |
| Banka (kart/hareket) | `banks` / `bank-vouchers` | `Finance` | `[x]` banka sekmesi + BANKA_GIRIS/CIKIS (menüde yorumlu; ekranda canlı) |
| Cari / Kasa / Banka raporları | `financereports*` | `ReportMizan` / `ReportCash` | `[x]` cari bakiye + **kasa hareket** |
| Cari Ekstre / Mizan | `customer-extract` / `mizan` | `ReportCariExtract` / `ReportMizan` | `[x]` |
| Gider / Çoklu PB | `revenueexpense` / `multicurrency` | `FinanceDefinitions` / `MultiCurrency` | `[~]` gider okuma; PB+kur okuma/ekleme |

---

## WMS / Depo

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| WMS Ana Panel | wms modules | `WmsScreen` | `[x]` özet+liste+sayım+transfer kısayolu |
| Stok Sayım | `stockcounting` | `WmsCount` | `[x]` fiş listesi + satır + mutabakat + `applyStockCount` |
| Depo / Ambar Transferi | `interstore-transfer` / `waybill-transfer` | `WmsTransfer` | `[x]` liste + oluştur + kalem + tamamla |
| Dalga Toplama | `wave-picking` | `WmsWavePicking` + `WmsWavePickingExecute` | `[~]` dalga liste + yürütme (`wmsPickingApi`) |
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
| Güzellik satış POS | BeautyPOS / createSale | `BeautySalesPanel` + `createBeautySale` | `[x]` beauty_sales + ERP/kasa (nakit) |

---

## İletişim & Bildirimler

| Öğe | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| WhatsApp / Mesaj / Bildirim / SMS / E-posta | MesajBildirimModule, messagingService | `CommunicationsScreen` | `[x]` müşteri gönderim + kuyruk işle/yeniden dene + sağlayıcı/fatura bildirimi yazma (SMS Atak masaüstü) |

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
| Fatura etiket tasarımı | `invoice-label-designer` | `SystemExtras` | `[~]` barkod şablon liste + create |
| Sanal santral Caller ID | `virtual-pbx-caller-id` | `SystemExtras` + `CallerIdHost` | `[x]` AsyncStorage config · HTTP poll `/api/caller_id/*` · gelen arama banner (restoran/güzellik/cari/POS) · LAN bridge discover · EAS native CallStateReceiver (`CALLER_ID.md`); Expo Go’da native push yok (companion `android-callerid-bridge`) |

---

## Teknik altyapı

| Öğe | Durum |
|-----|--------|
| `pgClient` + connStr / dbMode | `[x]` |
| Login PostgREST-first (web `loginVerify`) | `[x]` `apiMode` postgrest/hybrid → RPC `verify_login` → SQL → users; firms REST→SQL |
| Online/Offline/Hybrid (`networkPolicy` + NetInfo + cache/kuyruk) | `[x]` `HYBRID_POLICY.md` · ürün/cari snapshot · cari + POS mutation queue |
| `menuConfig` ≡ staticMenuConfig + POS/WMS/rest/beauty | `[x]` |
| Stack + bottom tabs navigasyon | `[x]` |
| `LIVE_MAP` → `navigateToModule` / `ModuleScreen.replace` | `[x]` Report* / StockMovements / Restaurant / Beauty / Delivery / Finance / FinanceDefinitions / MaterialDefinitions / StoreManagement / ETransform / WmsWavePicking / Scale* / CariDevir / ProductionOps / ExcelOps / MultiCurrency / SystemExtras / … |
| i18n tr/en/ar/ku + RTL (`ar`/`ku`) | `[x]` AsyncStorage `retailex_mobile_language` · **menü** `menu.*` (sections/items/quick) |
| Dark mode | `[x]` AsyncStorage `retailex_mobile_theme` + `colors` |
| Menü görünümü `menuViewMode` (cards / list) | `[x]` AsyncStorage — mobil-only |
| EAS Build / store yayın | `[x]` yapılandırma (`eas.json`, scriptler, `EAS_CHECKLIST.md`); `[ ]` `eas init` + ilk preview/production build |
| Kamera barkod (`expo-camera` CameraView) | `[x]` `BarcodeScannerModal` → POS / WMS sayım / ürün arama |
| Belge tara + fatura (`expo-image-picker` + `expo-text-extractor`) | `[x]` `DocumentScan` → OCR/manuel sihirbaz → fatura create API |
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
- [~] Satış/alış/hizmet fatura formu P1 R6: hizmet kartı, tarih/döviz/kur/depo/vade/özel kod/satış elemanı/kasa; edit header + draft kalem
- [~] İade yazma formu (trcode 3/6) + iade listelerinde `+` → `InvoiceForm`; `createReturnInvoice` + offline kuyruk/senkron
- [~] Alış formu tedarikçi listesi (`suppliersApi`)
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
- [x] **Ajan 10/10:** `cari-devir` → `CariDevir` (fiş formu); `stok-devir` / `stock-price-change-slips` → `StockMovements`
- [x] **Ajan 10/10:** `financeApi` kasa/banka hareket API geri yüklendi; `navigateToModule` fatura filtresi + `Campaigns` case
- [~] Stok hareketleri liste SQL (`StockMovements` + `stockMovementApi`) — fiş + fatura birleşik; CRUD yok
- [~] Malzeme raporları liste SQL (`ReportStock` mode: min-max, değer, ambar, ekstre) — kritik stok zaten `[x]`
- [x] Fiyat listesi görüntüleme (`PricingScreen` + `pricingApi` → products price_list_* kolonları)
- [x] Kampanya listesi + detay okuma (`CampaignsScreen` / `CampaignDetailScreen` + `campaignsApi`; `campaigns_mgmt` → LIVE_MAP)
- [x] Kampanya create/edit (`CampaignFormScreen` + `createCampaign` / `updateCampaign`) + POS basit motor (`campaignEngine` + `PosScreen`)
- [x] POS fiş offline kuyruk + senkron (`pos.sale` · `mutationQueue` · `syncEngine` · cache stok düşümü)
- [x] **Ürün satış raporu** (`ReportProductSales` + `fetchProductSales` — sale_items, 30 gün)
- [x] **Kasa raporu** (`ReportCash` + `fetchCashMovements` — cash_lines + kasa kartı, 30 gün)
- [x] İletişim — müşteri WhatsApp gönderim + kuyruk işle/yeniden dene + sağlayıcı/fatura bildirimi yazma (`CommunicationsScreen` + `communicationsApi`)
- [x] E-Dönüşüm kuyruk aksiyonları — yeniden dene / durum / toplu mock gönder (`ETransformScreen` + `eTransformApi`)
- [x] Bildirim merkezi — kritik stok + vadesi geçmiş açık cari (`NotificationsScreen` + `notificationsApi`; menü `notifications`)
- [x] WMS sayım mutabakat + stoka uygula (`wmsStockCountApi.applyStockCount` — web `wmsStockCount` ile aynı TRCODE 26/50; `WmsCountSlipScreen` mutabakat özeti + stok güncelleme)
- [x] Yazıcı / fiş ayarları (`PrinterSettingsScreen` + `printerSettingsStore` AsyncStorage; **ağ ESC/POS TCP** pg_bridge `/api/printer/escpos-tcp` + isteğe bağlı `react-native-tcp-socket`; BT/sistem Faz 2+)
- [x] **Terazi (Android TeraziManager → RN):** `ScaleManagement` + `ScaleSale` — doğrudan TCP (`react-native-tcp-socket` varsa) + pg_bridge yedek; LAN tarama; `clearPlu` (operate=D); hotkey/etiket yardımcıları + dürüst DLL sınırı; BLE + Classic SPP iskeleti; USB-OTG native probe; `scaleUi` i18n tr/en/ar/ku; simüle tartım
- [x] **P1 Module yaprakları LIVE:** varyant/özel/grup kod (`MaterialDefinitions`); üretim/kasap (`ProductionOps`); çoklu PB (`MultiCurrency`); excel/akıllı ekleme (`ExcelOps`); etiket+Caller ID (`SystemExtras`)
- [x] **P2 menü i18n:** `menu.sections|items|quick` tr/en/ar/ku · Dashboard / Module / More
- [x] **P2 `storeId` kritik listeler:** `appendStoreIdFilter` — dashboard satış, fatura listeleri/özet, satış günü/ürün raporları, WMS sayım, stok hareket, bildirim vade
- [x] **EAS production hazırlığı:** `eas.json`, `EAS_CHECKLIST.md`, `eas-mobile-*.mjs`, kök `mobile:eas:*` scriptleri, `app.json` `retailexEasNotes`
- [x] **Belge tara → fatura:** `DocumentScan` + `expo-image-picker` + `expo-text-extractor` OCR (fallback manuel) + fatura create API; menü `document-scan` + fatura listesi tarama ikonu
- [x] **P1 wave A:** banka virman/HAVALE + menü; ekstre R11b `Devreden`; POS `posUi` i18n; [`RONGTA_LAN.md`](./RONGTA_LAN.md)

## Sonraki (Faz 2+)

1. ~~Fatura / cari oluşturma formları~~ (cari tamam; satış/alış/iade + **hizmet/irsaliye/sipariş/teklif create** `[~]`; KDV satır başlangıç)
2. ~~Kasa/banka virman + banka HAVALE~~ ✅ · kalan: tahsilat/ödeme derinliği, banka CH_*, fatura peşin havale (R5)
3. ~~WMS sayım fişi yazma~~ ✅  
3. ~~WMS sayım mutabakat / applyStockCount~~ ✅  
4. ~~Restoran adisyon ödeme / kapatma~~ ✅  
5. ~~Güzellik randevu düzenleme~~ ✅ · ~~güzellik satış POS (`beauty_sales` + ERP)~~ ✅  

6. ~~Cari ekstre + mizan canlı SQL~~ ✅  
7. EAS Build — `[x]` repo hazırlığı · `[ ]` `npm run mobile:eas:init` + ilk build → [`EAS_CHECKLIST.md`](./EAS_CHECKLIST.md)  
8. ~~Menü etiketleri i18n (tr/en/ar/ku)~~ ✅ · ~~POS ekran `posUi`~~ ✅ · kalan: diğer ekran `Alert` / form hataları — `[~]` `formValidation` + `printerSettings` + cari/ürün/kampanya/malzeme formları  
9. Teslimat: harita SDK / POD foto — opsiyonel derinlik  
10. ~~Ürün oluştur/düzenle~~ ✅ · ~~Sistem menü yaprakları (okuma)~~ ✅  
11. Offline kuyruk genişletme: ~~POS~~ ✅ · ~~fatura satış/alış/iade/belge~~ ✅ · ~~WMS sayım~~ ✅ (`wms.counting.*` · coalesce · cache sync · applyStock idempotent)  
12. ~~`storeId` kritik listelerde~~ ✅ — kasa satırı mağaza kolonu seyrek; ürün stok hâlâ firma geneli  
13. ~~Terazi BT BLE~~ ✅ · Classic SPP port (`sppBluetoothScale` + `react-native-bluetooth-classic` opsiyonel) · USB-OTG native probe (`usbSerialScale`; Rt2 köprü [~] config plugin)  
14. ~~Rongta LAN canlı kg~~ bilinçli yok — [`RONGTA_LAN.md`](./RONGTA_LAN.md); doğrudan TCP + LAN tarama + clearPlu ✅; hotkey/.scr gönderimi Windows DLL/Android JAR sınırı (dürüst UI)  

15. Yazıcı BT / sistem — `[~]` iskelet: `escposBluetoothTransport` + `systemPrintTransport` + `printerTransportStatus`; SDK: `react-native-bluetooth-escpos-printer`, `expo-print` (ağ ESC/POS TCP `[x]`)  
16. KDV derinliği: header `total_vat` yazma + POS satır KDV (web `totalVat: 0` parity kaldırılınca)
