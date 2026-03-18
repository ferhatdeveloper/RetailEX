# RetailEX — Next-Gen ERP OS

**v0.1.56** · React 18 + TypeScript + PostgreSQL + Tauri 2 (opsiyonel)

Çok kiracılı (multi-tenant), çok mağazalı perakende/restoran/güzellik merkezi ERP platformu. Web tarayıcısında veya Tauri masaüstü uygulaması olarak çalışır.

---

## Proje Yapısı

```
d:/RetailEX/
├── .cursor/                     # Cursor Rules (roller) — rules/*.mdc, repoda
├── src/                         # Frontend kaynak kodu (React/TS)
│   ├── App.tsx                  # Kök bileşen, startup flow
│   ├── main.tsx                 # Vite giriş noktası
│   ├── components/              # UI modülleri
│   │   ├── system/              # Auth, MainLayout, SetupWizard, DashboardModule
│   │   ├── pos/                 # MarketPOS, MobilePOS, CartTable, CartCards, POSPaymentModal
│   │   ├── inventory/           # Ürünler, Stok, Birim Setleri, Raporlar
│   │   ├── trading/             # Faturalar (UniversalInvoiceForm), Müşteriler, Tedarikçiler, Satın Alma
│   │   ├── accounting/          # Kasa, Banka, Finans, Muhasebe Raporları
│   │   ├── wms/                 # Depo Yönetimi (WMS)
│   │   ├── restaurant/          # Restoran modülü (masa, mutfak, sipariş)
│   │   ├── beauty/              # Güzellik merkezi modülü
│   │   ├── management/          # Kampanya, CRM, Raporlar
│   │   ├── reports/             # Satış trendleri, genel raporlar
│   │   └── shared/              # ErrorBoundary, DevExDataGrid, AppFooter
│   ├── services/
│   │   ├── postgres.ts          # MERKEZ DB SERVİSİ (PostgresConnection singleton)
│   │   ├── pg_bridge.ts         # Web için Hono tabanlı PG proxy sunucusu
│   │   ├── api/                 # Modül bazlı API katmanları (products, sales, invoices…)
│   │   ├── beautyService.ts     # Güzellik modülü tüm CRUD işlemleri
│   │   ├── wmsService.ts        # WMS istatistik, alım, sevkiyat
│   │   ├── wmsStockCount.ts     # Stok sayım (wms.counting_slips/lines)
│   │   └── rbacService.ts       # Rol tabanlı erişim kontrolü
│   ├── contexts/
│   │   ├── AuthContext.tsx       # Oturum yönetimi (kullanıcı, rol, izin)
│   │   ├── LanguageContext.tsx   # i18n (t + tm fonksiyonları)
│   │   ├── ThemeContext.tsx      # Dark/Light mode
│   │   └── FirmaDonemContext.tsx # Aktif firma ve dönem seçimi
│   ├── locales/
│   │   ├── translations.ts       # Ana çeviriler (tr/en/ar/ku)
│   │   └── module-translations.ts # Modül çevirileri (b* prefix = beauty, vb.)
│   ├── store/                    # Zustand global state (products, customers, sales…)
│   ├── hooks/                    # useDatabaseStatus, usePostgresClient, useResponsive…
│   ├── utils/
│   │   ├── env.ts                # IS_TAURI, safeInvoke, getBridgeUrl
│   │   └── moduleManager.ts      # Modül görünürlük kontrolü
│   └── config/
│       └── staticMenuConfig.ts   # Tüm sol menü ağacı (getStaticMenuSections)
├── DeskApp/                     # Tauri 2 masaüstü uygulaması (Rust backend)
│   ├── src/                     # Rust kaynak (main.rs, db.rs, sync.rs, license.rs…)
│   └── tauri.conf.json
├── database/
│   └── migrations/
│       ├── 000_master_schema.sql  # Ana şema (tüm tablolar)
│       └── 001_demo_data.sql      # Demo veri
├── android/                     # Capacitor Android uygulaması
└── package.json
```

---

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| UI Framework | React 18 + TypeScript |
| Build | Vite 6 |
| State | Zustand + React Query (TanStack) |
| UI Bileşenler | Radix UI + shadcn/ui + Ant Design 6 + Lucide Icons |
| Tablolar/Grid | DevExtreme DataGrid (`DevExDataGrid`) |
| Grafikler | Recharts |
| Veritabanı | PostgreSQL 16 |
| DB Client (web) | `pg_bridge.ts` — Hono sunucusu üzerinden REST proxy |
| DB Client (masaüstü) | Tauri `pg_query` / `pg_execute` komutları |
| Masaüstü runtime | Tauri 2 (Rust) |
| Mobil | Capacitor 8 (Android) |
| i18n | i18next + özel `LanguageContext` |
| Raporlama | Stimulsoft Reports JS + jsPDF |
| ORM yok | Ham SQL — `PostgresConnection.query()` |

---

## Veritabanı Mimarisi

### Multi-Tenant Tablo İsimlendirme

Tüm sorgular **düz tablo adı** yazılır — `PostgresConnection.query()` otomatik olarak gerçek adı oluşturur:

```
Kart tabloları    →  rex_{firmNr}_{table}
                     Örn: products  →  rex_009_products

Hareket tabloları →  rex_{firmNr}_{periodNr}_{table}
                     Örn: sales  →  rex_009_01_sales
```

#### Firma ve Dönem Ayarları

```ts
import { ERP_SETTINGS } from '../services/postgres';

ERP_SETTINGS.firmNr   // "001", "009" vb.
ERP_SETTINGS.periodNr // "01", "02" vb.
```

### Şemalar

| Şema | İçerik |
|------|--------|
| `public` | Genel kartlar: products, customers, suppliers, campaigns… |
| `wms` | `counting_slips`, `counting_lines`, `bins`, `transfers` |
| `rest` | Restoran tabloları: `rest.rex_{firm}_rest_tables`, `rest_orders`… |
| `beauty` | Güzellik tabloları: `beauty.rex_{firm}_beauty_specialists`… |

### Bağlantı Modları

```ts
DB_SETTINGS.activeMode: 'online' | 'offline' | 'hybrid'
```

- **online** — Doğrudan uzak PostgreSQL (`26.154.3.237:5432`)
- **offline** — Yerel PostgreSQL (`127.0.0.1:5432/retailex_local`)
- **hybrid** — Yerel birincil, periyodik uzak senkronizasyon

### PG Bridge (Web Ortamı)

Web tarayıcısından PostgreSQL'e doğrudan bağlantı mümkün olmadığından bir Node.js proxy sunucusu çalışır:

```bash
npm run bridge   # pg_bridge.ts  →  http://localhost:3001
```

Tauri masaüstü uygulamasında bridge kullanılmaz; Rust `pg_query` komutu doğrudan bağlanır.

> **KRİTİK:** Tauri'de `DO $$ BEGIN … END $$` PL/pgSQL blokları `client.query()` (extended protocol) ile **gönderilemez** — "PREPARE can't be used with this statement type" hatası verir. Bunun yerine her DDL ifadesini ayrı `ALTER TABLE … ADD COLUMN IF NOT EXISTS` satırı olarak yazın.

---

## Modüller

### 1. POS (Satış Noktası)
- **MarketPOS** — dokunmatik ekran marketi POS, barkod, kampanya, ödeme
- **MobilePOS** — mobil cihaz optimizasyonlu POS
- Bileşenler: `CartTable`, `CartCards`, `POSPaymentModal`, `POSProductCatalogModal`, `Receipt80mm`
- Tip tanımları: `src/components/pos/types.ts`

### 2. Yönetim Backoffice (`ManagementModule`)

Sol menü ağacı `src/config/staticMenuConfig.ts` içinde tanımlanmıştır. Başlıca ekranlar:

| screen key | İçerik |
|------------|--------|
| `dashboard` | KPI dashboard |
| `products` | Ürün yönetimi |
| `customers` | Müşteri modülü |
| `invoices` | Faturalar (UniversalInvoiceForm) |
| `reports` | Satış/stok raporları |
| `cash-management` | Kasa yönetimi |
| `bank-management` | Banka yönetimi |
| `campaigns` | Kampanya tanımları |
| `unit-sets` | Birim seti yönetimi |
| `store-management` | Mağaza paneli |

### 3. WMS (Depo Yönetimi)
- Giriş: `src/components/wms/index.tsx` → `WarehouseManagement`
- İç routing: `currentPage` state + switch/case
- Bileşenler: Dashboard, WMSReceiving, WMSDispatch, StockCountModule
- Fiş numaraları: `MAL-{yıl}-{seq}` (alım), `SEV-{yıl}-{seq}` (sevkiyat), `SAY-{yıl}-{seq}` (sayım)
- WMS Şema: `wms.counting_slips`, `wms.counting_lines`, `wms.bins`

### 4. Restoran
- Giriş: `src/components/restaurant/index.tsx`
- Özellikler: masa yönetimi, mutfak ekranı, sipariş, rezervasyon, reçete
- Store: `src/components/restaurant/store/useRestaurantStore.ts`
- Şema: `rest.*`

### 5. Güzellik Merkezi
- Giriş: `src/components/beauty/index.tsx`
- Özellikler: randevu takvimi, uzman yönetimi, paket satış, cihaz takibi, lead/CRM, geri bildirim, raporlar, AppointmentPOS
- Service: `src/services/beautyService.ts`
- Store: `src/components/beauty/store/useBeautyStore.ts`
- Şema: `beauty.*`
- Statik paylaşımlı tablo: `beauty.body_regions` (firm prefix YOK)
- Çeviri key prefix: `b` (örn. `bAppointments`, `bSpecialists`)

### 6. Muhasebe / Finans
- Kasa, Banka, Döviz yönetimi, Gider, Maliyet merkezi
- Çevirme (virman), Mutabakat, Mizan raporları
- Klasörler: `src/components/accounting/`

---

## i18n (Çok Dil Desteği)

Desteklenen diller: **Türkçe (tr)**, **İngilizce (en)**, **Arapça (ar)**, **Kürtçe (ku)**

Arapça ve Kürtçe için RTL modu otomatik aktifleşir.

### Kullanım

```tsx
import { useLanguage } from '../../../contexts/LanguageContext';

function MyComponent() {
  const { t, tm } = useLanguage();

  return (
    <div>
      <h1>{t.menu.products}</h1>   {/* Ana çeviriler — tip güvenli */}
      <p>{tm('bAppointments')}</p> {/* Modül çevirileri — string indeksli */}
    </div>
  );
}
```

- `t` → `src/locales/translations.ts` (`Translations` arayüzü)
- `tm(key)` → `src/locales/module-translations.ts`
- Modül sabitleri (`STATUS_CFG`, `PAY_LABELS` vb.) `tm()` kullandığı için **bileşen gövdesi içinde** tanımlanmalıdır (hook dışarıda çalışmaz)

---

## Kimlik Doğrulama ve Yetkilendirme

- `AuthContext` — oturum, kullanıcı bilgisi, çoklu rol desteği
- `rbacService` — modül+eylem bazlı izin kontrolü
- `usePermission` hook — `hasPermission(module, action)`, `isAdmin`
- Kullanıcı `firm_nr` ve `period_nr` alanlarına sahiptir (tenant izolasyonu)
- **bayi_seti modu:** `retailex_bayi_seti=true` → yalnızca `retailex_enabled_modules` listesindeki modüller görünür

---

## Masaüstü Uygulama (Tauri 2)

```
DeskApp/
├── src/
│   ├── main.rs               # Ana Tauri entrypoint, komut kayıtları
│   ├── db.rs                 # SQLite (uygulama config kalıcı saklama)
│   ├── db_ops.rs             # PostgreSQL işlemleri (pg_query, pg_execute)
│   ├── sync.rs               # Yerel ↔ Uzak senkronizasyon
│   ├── license.rs            # Lisans doğrulama
│   └── device_fingerprint.rs # Cihaz kimliği
└── tauri.conf.json
```

Tauri komutları TypeScript tarafından `safeInvoke(commandName, args)` ile çağrılır.
Tauri dışında (web modunda) `safeInvoke` güvenli fallback döner.

```bash
npm run tauri:dev    # Geliştirme modu (DeskApp/)
npm run tauri:build  # Production .exe installer
```

---

## Geliştirme Ortamı

### Gereksinimler
- Node.js 20+
- PostgreSQL 16 (`retailex_local` veritabanı, kullanıcı: `postgres`)
- Rust toolchain (yalnızca masaüstü build için)

### Kurulum

```bash
npm install

# PG Bridge başlat (web modu için zorunlu)
npm run bridge        # → http://localhost:3001

# Web geliştirme sunucusu
npm run dev           # → http://localhost:5173
```

### Yapılandırma

İlk çalıştırmada `SetupWizard` açılır. Yapılandırma Tauri'de SQLite, web'de `localStorage` üzerinde saklanır.

| localStorage Anahtarı | Açıklama |
|-----------------------|----------|
| `exretail_pg_config` | PG bağlantı bilgileri (host, user, pass, mode) |
| `exretail_selected_firma_id` | Aktif firma numarası |
| `exretail_selected_donem_id` | Aktif dönem numarası |
| `retailex_bayi_seti` | Bayi kısıtlama modu (`"true"`) |
| `retailex_enabled_modules` | Görünür modül listesi (JSON array) |
| `retailos_language` | Arayüz dili (`tr`/`en`/`ar`/`ku`) |

---

## Kritik Servis Dosyaları

| Dosya | Açıklama |
|-------|----------|
| `src/services/postgres.ts` | `PostgresConnection` singleton, tablo adı çözümleme, tüm SQL |
| `src/services/pg_bridge.ts` | Hono tabanlı Node.js PG proxy (web modu) |
| `src/utils/env.ts` | `IS_TAURI`, `safeInvoke`, `getBridgeUrl` |
| `src/config/staticMenuConfig.ts` | Sol menü ağacı tanımı |
| `src/contexts/AuthContext.tsx` | Oturum ve RBAC |
| `src/contexts/LanguageContext.tsx` | i18n provider |
| `src/services/beautyService.ts` | Güzellik modülü tüm DB işlemleri |
| `src/services/wmsService.ts` | WMS dashboard, alım, sevkiyat |
| `src/services/wmsStockCount.ts` | Stok sayım servisi |
| `src/services/rbacService.ts` | Rol/izin servisi |

---

## Yeni Servis Yazarken Dikkat

```ts
import { postgres, ERP_SETTINGS } from '../services/postgres';

// Düz tablo adı yaz — postgres.ts otomatik rex_{firm}_ prefix ekler
const { rows } = await postgres.query(
  `SELECT * FROM products WHERE is_active = $1`,
  [true]
);

// Schema ile kullanım (beauty, rest, wms) — prefix manuel
const { rows } = await postgres.query(
  `SELECT * FROM beauty.rex_${ERP_SETTINGS.firmNr}_beauty_specialists`
);
```

- Tüm yeni WMS servisleri: `PostgresConnection.getInstance()` + `ERP_SETTINGS` kullan
- Tauri hataları JS'e düz string olarak gelir → `err?.message || String(err)` kullan
- `DO $$ … END $$` blokları KULLANMA → ayrı `ALTER TABLE … ADD COLUMN IF NOT EXISTS` satırları yaz

---

## Veri Modeli (Temel Tipler)

`src/core/types/models.ts` ve `src/core/types/` altında tanımlıdır:

| Tip | Açıklama |
|-----|----------|
| `Product` | Ürün, varyant, barkod, birim, vergi, stok |
| `Customer` | Müşteri, bakiye, adres, segmentasyon |
| `Sale` / `SaleItem` | Satış başlığı ve kalemler |
| `Campaign` | İndirim, koşul, tarih aralığı |
| `User` | Çoklu rol, firma/dönem bağlantısı |

---

## Build ve Deploy

```bash
npm run build          # Web production build → dist/
npm run tauri:build    # Masaüstü .exe installer
npm run deploy         # Vercel'e deploy (retailex.app)
```

- Production host: `https://retailex.app`
- API/Bridge host: `https://api.retailex.app`

---

## Önemli Notlar

- Şema değişiklikleri `database/migrations/` altındaki SQL dosyalarıyla takip edilir
- Android desteği Capacitor 8 ile `android/` klasöründedir
- WMS tasarım referansı: `D:\Developer\App\EXFIN_OPS\ExWhms`
- Güzellik modülü tasarım referansı: `C:\Users\FERHAT\Desktop\Beautycentermanagementsystem-main\src`
- Tüm beauty çevirileri `src/locales/module-translations.ts` içinde `b` prefix ile başlar (satır ~990–1220)

---

## AI Asistan Kuralları ve Skiller

Bu bölüm Claude Code / Cursor AI asistanlarının bu projede nasıl davranacağını tanımlar.

### Genel Kodlama Kuralları

**Kodu okumadan öneri yapma.**
Bir dosyayı değiştirmeden önce mutlaka oku. Mevcut kodu anlamadan yeni kod önerme.

**Aşırı mühendislikten kaçın.**
Yalnızca istenen veya açıkça gerekli olan değişiklikleri yap. Gereksiz refactor, docstring, yorum, hata yönetimi veya "iyileştirme" ekleme.

**Güvenlik açıklarına dikkat et.**
SQL injection, XSS, command injection gibi OWASP Top 10 açıklarını oluşturacak kod yazma. Güvensiz kod fark edersen hemen düzelt.

**Geri dönüşü olmayan işlemlerde onay iste.**
Dosya silme, veritabanı drop, git reset --hard, force push gibi yıkıcı işlemlerde kullanıcıdan onay al.

**Commit'i yalnızca istendiğinde oluştur.**
Kullanıcı açıkça sormadan commit oluşturma, push yapma, PR açma.

---

### Skill: `frontend-design`

**Ne zaman kullanılır:** UI bileşeni, ekran veya sayfa oluştururken — yüksek tasarım kalitesi gerektiren durumlarda.

**Temel İlke:** Üretim kalitesinde, özgün estetik kaliteli arayüzler oluştur. Jenerik, kalıp AI tasarım desenlerinden kaçın.

**Görsel Yön Seç:**
- **Data-Dense** — ERP/kurumsal stil (tablolar, grid, KPI) → RetailEX için tercih edilen
- **Minimalist** — Temiz, odaklı, hassas boşluk
- **Dashboard** — Analitik, grafikler, KPI kartları

**Öncelikli Görsel Unsurlar:**
- **Tipografi:** Belirgin font ağırlıkları, net hiyerarşi (başlık → alt başlık → gövde → açıklama)
- **Renk:** Tutarlı palet — primary, secondary, surface, error; light + dark mode
- **Boşluk:** 8px grid sistemi, tutarlı aralıklar
- **Dark Mode:** `darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'` deseni

**Kaçınılacak Anti-desenler:**
- Amaçsız gradient arka planlar
- Tutarsız boşluklar (8px, 12px, 15px karışımı)
- Tema dışı renkler
- Eksik boş durum (empty state) ve yükleme durumu
- Hata durumu olmayan UI

**RetailEX'e Özel:**
- WMS modülleri → `D:\Developer\App\EXFIN_OPS\ExWhms` referans al
- Güzellik modülü → `C:\Users\FERHAT\Desktop\Beautycentermanagementsystem-main\src` referans al
- KPI kartlar: flat tasarım (sadece border, renkli kare ikon arka planı, kart üstünde gradient yok)
- Barkod UX: `AudioContext` bip (880Hz başarı, 300Hz hata) + `navigator.vibrate(50)`

---

### Skill: `systematic-debugging`

**Ne zaman kullanılır:** Her türlü teknik sorun — test hataları, bug'lar, beklenmeyen davranış, performans sorunları, build hataları.

**Temel İlke:** Kök nedeni bulmadan fix denemesi yapma. Semptom düzeltmesi başarısızdır.

**Dört Faz:**

**Faz 1 — Kök Neden Araştırması** *(fix denemeden ÖNCE)*
1. Hata mesajlarını dikkatlice oku — stack trace'i atlamadan oku
2. Tutarlı şekilde yeniden üret
3. Son değişiklikleri kontrol et (git diff, son commit'ler)
4. Veri akışını izle — hatalı değer nerede üretiliyor? Geriye doğru takip et

**Faz 2 — Desen Analizi**
1. Çalışan örnekler bul — aynı kodtabanında benzer çalışan kodu bul
2. Referans implementasyonla karşılaştır
3. Farkları listele (ne kadar küçük olursa olsun)

**Faz 3 — Hipotez ve Test**
1. Tek hipotez kur: *"X kök neden çünkü Y"*
2. Minimal test et — tek değişken, en küçük değişiklik
3. Eğer bilmiyorsan: *"X'i anlamıyorum"* de, biliyormuş gibi davranma

**Faz 4 — Uygulama**
1. Önce başarısız test oluştur
2. Yalnızca kök nedeni adresleyen tek fix uygula
3. Fix'i doğrula

**Kırmızı Bayraklar — DUR ve Süreci Takip Et:**
- "Şimdilik hızlı fix, sonra araştırırım"
- "Sadece X'i değiştir ve bak çalışıyor mu"
- Veri akışını izlemeden çözüm önermek
- 2+ başarısız fix denemesinden sonra "bir deneme daha"

**RetailEX'e Özel Debugging:**
- Tauri hataları JS'e düz string gelir → `err?.message || String(err)` kullan
- PG Bridge hatalarında önce `http://localhost:3001/api/status` kontrol et
- `DO $$ … END $$` hataları extended protocol sorunudur → DDL'i ayrı satırlara böl
- DB bağlantı sorunlarında `DB_SETTINGS.activeMode` ve `LOCAL_CONFIG.isConfigured` kontrol et

---

### Skill: `test-driven-development`

**Ne zaman kullanılır:** Yeni özellik yazarken, bug düzeltirken veya refactor yaparken.

**Temel İlke:** Önce testi yaz. Başarısız olduğunu izle. Geçmesi için minimal kod yaz.

**RED-GREEN-REFACTOR Döngüsü:**

**RED — Başarısız Test Yaz**
- Olması gereken davranışı gösteren tek minimal test yaz
- Tek davranış, net isim, gerçek kod (mecbur kalmadıkça mock kullanma)

**RED'i Doğrula — Başarısız Olduğunu İzle (ZORUNLU)**
- Testi çalıştır: `npm test` / `npx vitest run`
- Onayla: test başarısız (hata değil), başarısızlık mesajı beklenen
- Test hemen geçiyorsa: mevcut davranışı test ediyorsun — testi düzelt

**GREEN — Minimal Kod**
- Testi geçirecek en basit kodu yaz
- Testin gerektirdiğinin ötesine geçme

**GREEN'i Doğrula — Geçtiğini İzle (ZORUNLU)**
- Testi tekrar çalıştır, geçtiğini onayla
- Diğer testlerin hâlâ geçtiğini onayla

**REFACTOR — Temizle**
- Yalnızca green sonrası: tekrarları kaldır, isimleri iyileştir
- Testleri green tut. Yeni davranış ekleme.

**Kırmızı Bayraklar — DUR ve Baştan Başla:**
- Test olmadan yazılmış kod
- Test hemen geçiyor (implement etmeden)
- "Testleri sonra yazarım"
- "Manuel test ettim zaten"

---

### Skill: `verification-before-completion`

**Ne zaman kullanılır:** Bir işin tamamlandığını, düzeldiğini veya geçtiğini iddia etmeden önce.

**Temel İlke:** Her zaman önce kanıt, sonra iddia.

**Kapı Fonksiyonu — İddia Etmeden Önce:**
1. **BELİRLE** — Bu iddiayı kanıtlayan komut nedir?
2. **ÇALIŞTIR** — Komutu tam ve taze olarak çalıştır
3. **OKU** — Tam çıktıyı oku, exit code'u kontrol et, hataları say
4. **DOĞRULA** — Çıktı iddiayı onaylıyor mu?
5. **ANCAK BUNDAN SONRA** — İddiayı yap

**Yaygın Başarısızlıklar:**

| İddia | Gerekli | Yeterli Değil |
|-------|---------|---------------|
| Testler geçiyor | `npm test`: 0 hata | Önceki çalıştırma, "geçmeli" |
| Build başarılı | `npm run build`: exit 0 | Linter geçti, log iyi görünüyor |
| Bug düzeldi | Orijinal semptom geçiyor | Kod değişti, düzeldiği varsayıldı |

**RetailEX'e Özel Doğrulama:**
```bash
# TypeScript derleme kontrolü
npm run build

# Dev server başlatma testi
npm run dev

# PG Bridge çalışıyor mu
curl http://localhost:3001/api/status
```

**Kırmızı Bayraklar — DUR:**
- "gerektiği gibi", "muhtemelen", "görünüyor ki" kullanmak
- Doğrulama olmadan "Tamam!", "Düzeldi!", "Hazır!" demek
- Test çalıştırmadan commit yapmak
- "Çalıştığından eminim"

---

### Proje Kuralları Özeti

| Kural | Detay |
|-------|-------|
| **Tablo adları** | Düz tablo adı yaz, `postgres.ts` prefix'i otomatik ekler |
| **DO blokları** | `DO $$ … END $$` Tauri'de KULLANILMAZ — ayrı DDL satırları yaz |
| **i18n** | `t` ana çeviriler, `tm('bKey')` modül çevirileri; sabitler bileşen içinde |
| **Dark mode** | `darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'` |
| **Tauri hataları** | `err?.message \|\| String(err)` kullan |
| **Yeni WMS servisi** | `PostgresConnection.getInstance()` + `ERP_SETTINGS` |
| **Commit** | Yalnızca kullanıcı istediğinde |
| **Fix denemesi** | Kök neden olmadan fix önerme |
| **Tamamlandı iddiası** | Doğrulama çıktısı olmadan "düzeldi" deme |
