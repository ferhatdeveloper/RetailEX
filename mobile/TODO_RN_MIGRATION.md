# RetailEX — React Native Migrasyon Todo

> Kaynak: web `src/config/staticMenuConfig.ts` + ManagementModule (POS / WMS / Restoran / Güzellik)  
> Hedef: `mobile/` (Expo RN, native ekranlar — WebView yasak)  
> Son güncelleme: 2026-07-14

## Durum özeti

| Sembol | Anlam |
|--------|--------|
| `[x]` | Canlı (API + anlamlı UI) |
| `[~]` | Kısmi (liste / host / okuma; CRUD veya tam form yok) |
| `[ ]` | Henüz yok / yalnızca iskelet hedefi |

**Menü yapısı (RN `menuConfig`):** 11 grup · 131 öğe · 115 yaprak  

**Durum sayımı (yaprak / özellik bazlı, yaklaşık):**  
- **`[x]` canlı ~18** — auth, dashboard, ürün/cari/fatura liste+detay, POS kayıt, rapor hub + 2 rapor, WMS/rest/beauty listeleri  
- **`[~]` kısmi ~90+** — Module host veya canlı route’a yönlendirme (form CRUD yok)  
- **`[ ]` bekleyen ~15+** — sayım yazma, adisyon kalem, randevu CRUD, mizan SQL, EAS…

---

## Fazlar (öncelik)

### Faz 1 — Çekirdek (oturum + ana listeler) ✅ yapı
- Auth, config, firma/dönem, dashboard menü %100
- Ürün / cari / fatura listeleri + **detay okuma**
- POS sepet + **fiş kaydı (header + kalem)**
- Rapor: satış özeti + kritik stok

### Faz 2 — Ticaret / finans formları
- Fatura oluşturma/düzenleme, irsaliye, sipariş, teklif
- Cari hareket, kasa fişleri, ödeme planları

### Faz 3 — WMS / Restoran / Güzellik işlemleri
- Sayım fişi yazma, dalga toplama
- Adisyon kalem, randevu oluşturma

### Faz 4 — Raporlar / sistem derinliği
- Tüm malzeme/finans raporları, BI, yedekleme, RBAC UI

---

## Ana Menü (`main-menu`)

| Öğе | Web | RN hedef | Durum |
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

| Öğе | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Satış (POS) | MarketPOS / MobilePOS | `PosScreen` | `[x]` sepet + fiş kaydı |
| Terazi & Tartılı Satış | `cashier-scale` | `PosScreen` (aynı) | `[~]` tartı donanım yok |
| Terazi Yönetimi | `scale-management` | `Module` | `[~]` |
| Fiyat & Kampanya | `pricing` | `Module` | `[~]` |

---

## Malzeme Yönetimi (`material-management`)

| Öğе | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Malzemeler | `products` / ProductModule | `Products` + `ProductDetail` | `[x]` liste+detay |
| Malzeme Sınıfları | `material-classes` | `Module` | `[~]` |
| Birim Setleri | `unit-sets` | `Module` | `[~]` |
| Varyantlar | `variants` | `Module` | `[~]` |
| Özel Kodlar | `special-codes` | `Module` | `[~]` |
| Marka Tanımları | `brand-definitions` | `Module` | `[~]` |
| Terazi Tanımları | `scale` | `Module` | `[~]` |
| Grup Kodları | `group-codes` | `Module` | `[~]` |
| Ürün Kategorileri | `product-categories` | `Module` | `[~]` |
| Hizmet Kartları | `service-cards` | `Module` | `[~]` |
| Malzeme Yönetim Fişleri | `stockmovements` | `Module` → Wms kısayol | `[~]` |
| Stok Devir Fişi | `stok-devir` | `Module` | `[~]` |
| Stok Fiyat Değişim | `stock-price-change-slips` | `Module` | `[~]` |
| Mobil Sayım | `mobile-inventory-count` | `Wms` | `[~]` okuma |
| Sayım Eksiği / Fazlası | `stockmovements-*` | `Module` | `[~]` |
| Malzeme raporları (10) | `report-*` / `inventory` / `cost` | `ReportStock` veya `Module` | `[~]` kritik stok canlı |
| Excel / Akıllı ekleme | `excel` / `smart-material-add` | `Module` | `[~]` |
| Üretim / Kasap | `production` / `butcher-production` | `Module` | `[~]` |

---

## Faturalar (`invoices`)

| Öğе | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Satış faturaları (tüm türler) | UniversalInvoice* | `Invoices` + `InvoiceDetail` | `[x]` liste+detay okuma |
| Alış / hizmet / iade | aynı | `Invoices` (filtre genişletme) | `[~]` |
| E-Dönüşüm | `etransform` | `Module` | `[~]` |
| İrsaliyeler | `waybill-*` | `Module` | `[~]` |
| Siparişler | `salesorder` / `purchase` | `Module` | `[~]` |
| Teslimat Yönetimi | `logistics` | `Module` | `[~]` |
| Teklifler | `Teklifler` | `Module` | `[~]` |

---

## Finans Yönetimi (`finance-management`)

| Öğе | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Cari Hesaplar | `suppliers` / Customers | `Customers` + `CustomerDetail` | `[x]` liste+detay |
| Ödeme Planları / Masraf Merkezi | `payment-plans` / `cost-centers` | `Module` | `[~]` |
| Müşteri Arama Planı | `customer-call-plan` | `Module` | `[~]` |
| Kasa Kartları | `cashbank` | `Module` | `[~]` |
| Cari Devir / Kasa / Kasa Fişleri | `cari-devir` / `kasalar` / `cash-slips` | `Module` | `[~]` |
| Cari / Kasa / Banka raporları | `financereports*` | `ReportSales` / `Module` | `[~]` |
| Cari Ekstre / Mizan | `customer-extract` / `mizan` | `Module` | `[ ]` / `[~]` |
| Gider / Çoklu PB | `revenueexpense` / `multicurrency` | `Module` | `[~]` |

---

## WMS / Depo

| Öğе | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| WMS Ana Panel | wms modules | `WmsScreen` | `[x]` özet+liste |
| Stok Sayım | `stockcounting` | `Wms` | `[~]` |
| Dalga Toplama | `wave-picking` | `Wms` | `[~]` |
| Mobil Sayım yazma | GoodsReceipt / InventoryCount | `Wms` | `[ ]` yazma |

---

## Restoran

| Öğе | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Ana / Masalar / Adisyon | rest schema | `RestaurantScreen` | `[x]` liste |
| Kalem ekleme / ödeme | Restaurant POS | — | `[ ]` |

---

## Güzellik Merkezi

| Öğе | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Ana / Randevu / Hizmet / Uzman | beautyService | `BeautyScreen` | `[x]` liste |
| Randevu oluştur / POS | BeautyPOS | — | `[ ]` |

---

## İletişim & Bildirimler

| Öğе | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| WhatsApp / Mesaj / Bildirim / SMS / E-posta | ilgili modüller | `Module` host | `[~]` |

---

## Raporlar & Analiz

| Öğе | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Genel Rapor hub | `customreports` | `ReportsScreen` | `[x]` hub |
| Günlük Satış Özeti | (analytics) | `ReportSales` | `[x]` |
| Kritik Stok | — | `ReportStock` | `[x]` |
| AI / Karlılık / BI | `product-analytics` vb. | `ReportSales` | `[~]` aynı veri seti |
| Kategori grup kar | `category-group-profit-report` | `Module` | `[~]` |

---

## Sistem Yönetimi

| Öğе | Web | RN hedef | Durum |
|-----|-----|----------|-------|
| Firma/Dönem | Organization flow | `OrganizationScreen` + menü | `[x]` / `[~]` |
| Kullanıcı / Rol / Menü | usermanagement… | `Module` | `[~]` |
| Yedekleme / Log / Kasa cihazları | backuprestore… | `Module` | `[~]` |
| Bağlantı ayarları | Login gear | `ConfigScreen` | `[x]` |

---

## Teknik altyapı

| Öğе | Durum |
|-----|--------|
| `pgClient` + connStr / dbMode | `[x]` |
| `menuConfig` ≡ staticMenuConfig + POS/WMS/rest/beauty | `[x]` |
| Stack + bottom tabs navigasyon | `[x]` |
| i18n tr/en | `[x]` |
| Dark mode | `[x]` |
| EAS Build / store yayın | `[ ]` |

---

## Bu oturumda tamamlananlar

- [x] Bu dosya (envanter + fazlar)
- [x] Ürün / cari / fatura **detay okuma** ekranları
- [x] POS fiş kaydı (`sales` + `sale_items` + stok düşümü denemesi)
- [x] Rapor menü eşlemesi genişletme
- [x] Menü yaprağı → boş ekran yok (Module host + canlı replace)
- [x] README migration linki
- [x] `npm run typecheck`

## Sonraki (Faz 2+)

1. Fatura / cari oluşturma formları  
2. WMS sayım fişi yazma  
3. Restoran adisyon kalem  
4. Güzellik randevu CRUD  
5. Cari ekstre + mizan canlı SQL  
6. EAS Build  
