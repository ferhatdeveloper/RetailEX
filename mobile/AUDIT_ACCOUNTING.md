# RetailEX Mobile — Muhasebe / Finans Denetimi

**Rol:** Uzman muhasebeci gözüyle web ERP ↔ mobil karşılaştırma  
**Tarih:** 2026-07-14  
**Kapsam:** Cari bakiye / ekstre / mizan, satış–alış yönleri, POS stok+ciro, dönem ayrımı, kritik ekran boşlukları  
**Yöntem:** Kaynak kod incelemesi (`mobile/src/api/*`, `src/services/api/*`). Canlı kiracı verisi doğrulanmadı.

---

## 1. Yönetici özeti

Mobil muhasebe katmanı web ERP’nin **okuma + sınırlı yazma** alt kümesidir.

| Boyut | Web (canlı kaynak) | Mobil | Tutarlılık |
|-------|--------------------|-------|------------|
| Cari bakiye listesi / “mizan” | Kart `balance` **veya** ledger CTE (`accountBalance.ts`) | Kart `balance` okuma | Kısmi — mobil ledger yeniden hesaplamıyor |
| Cari ekstre | `sales` + `cash_lines` (web) / `account_movements` | `account_movements` → yoksa `sales` fallback | Kısmi — kasa satırları ekstrede yok |
| Genel muhasebe mizanı (hesap planı) | GL / journal (kısmen legacy) | Yok — “mizan” = cari bakiye özeti | Ad yanıltıcı |
| Satış / alış yönü | `fiche_type` + Logo `trcode` | Liste/filtre iyi; yazma sınırlı | İyileştirildi (*) |
| POS: stok + ciro | Stok − / `sales` / kasa / (veresiye) cari | Stok − / `sales` / **KASA_GIRIS** / veresiye `customers.balance` ✓ | Uyumlu (P0 düzeltildi) |
| Dönem (`periodNr`) | Hareket tabloları dönemli | Aynı kalıp (`erpTables`) | Uyumlu |

(*) Bu turda küçük düzeltmeler: POS/fatura `fiche_type` hizalama, ekstre/stok filtreleri, ciroya alış karışması engeli. Geniş rewrite yok; commit yok.

---

## 2. Mimari karşılaştırma

### Web — iki katman

1. **Operasyonel ERP (canlı):** `sales` + `sale_items` + `cash_lines` + `products.stock` + kart `balance` yan etki.  
   Kaynak: `src/services/api/invoices.ts`, `sales.ts`, `accountBalance.ts`, `kasa.ts`.
2. **Yasal / GL mizan:** `gl_transactions` / Supabase journal — menü “Mizan” çoğu zaman buraya bağlı; cari bakiyeden ayrı dünya.

### Mobil — operasyonel alt küme

- Okuma: cari kart, ekstre, kasa/banka hareketleri, fatura listesi, satış raporları.
- Yazma: POS satış, basit satış/alış faturası, kasa/banka giriş-çıkış, cari tahsilat/ödeme (`CH_TAHSILAT` / `CH_ODEME`).
- **Yok:** otomatik yevmiye, hesap planı mizanı, yaşlandırma, cari devir fişi, virman, tam alış/iade form akışları.

Tablo öneki (her iki tarafta aynı fikir):

| Tür | Kalıp |
|-----|--------|
| Kart | `rex_{firmNr}_customers` / `_suppliers` / `_products` |
| Hareket | `rex_{firmNr}_{periodNr}_sales`, `_cash_lines`, `_account_movements`, … |

---

## 3. Cari bakiye / ekstre / mizan tutarlılığı

### 3.1 Bakiye kaynağı

| | Web | Mobil |
|--|-----|-------|
| Liste bakiyesi | Tercihen **ledger CTE** (`sqlCustomerAccountBalancesCte` / tedarikçi eşdeğeri): veresiye `sales` ± `cash_lines` | Doğrudan `customers.balance` / `suppliers.balance` |
| Fatura anında | `UPDATE … balance` + ledger ile senkron beklentisi | Satış/alış create: veresiye → `customers`/`suppliers.balance` ✓ (P0 düzeltildi) |
| Tahsilat | `CH_TAHSILAT` → bakiyeyi düşürür | `cashApi.createCariCashSlip` → kart bakiyesini düşürür ✓ |

**Pozitif bakiye anlamı (web yorumu):** müşteri bize borçlu / tedarikçiye biz borçluyuz. Mobil UI aynı kolonları gösteriyor; etikette B/A ayrımı ekstre ekranında var.

**Risk R1 (P0) — düzeltildi (2026-07-14):** Mobil POS / `createSalesInvoice` veresiye satışında `customers.balance += net`. Peşin (nakit/kart) cariye yazılmaz (web ile aynı).

**Risk R2 (P1):** Mobil “mizan” (`ReportMizan` / `fetchCariBalances`) dönem bağımsız kart bakiyesidir. Dönem değişince hareketler sıfırlansa bile kart bakiyesi firma genelinde kalır → **dönemsel cari mizan ≠ dönem hareket toplamı**. Web liste CTE kullanırsa dönemli hareketlere bağlanır; kart kolonu yine firmaya aittir.

**Risk R3 (P1):** Ekstre önce `account_movements` okur; boşsa `sales` fallback. Web canlı ekstre `sales` **+ `cash_lines` (CH_*)**. Mobil fallback’te tahsilat/ödeme satırları yok → ekstreden kapanış bakiyesi ile kart bakiyesi uyuşmayabilir.

**Risk R4 (P2):** “Mizan” menü etiketi kullanıcıyı genel muhasebe mizanı sanabilir; aslında cari bakiye listesidir. GL mizan mobilde yok.

### 3.2 Bu turda yapılan ekstre düzeltmeleri

- Müşteri `sales` fallback: `sales_invoice` / `sales` / `retail` / trcode 7–8 dahil (eski mobil fişler + web POS).
- İade/alış işareti: `return_invoice` / `purchase_invoice` / trcode 1,3,6 → `sign = -1`.
- Malzeme ekstresi: satış yönlü `fiche_type` ve trcode’lar `out` olarak eşlendi.

---

## 4. Satış vs alış — borç / alacak ve stok

### 4.1 Web matrisi (özet)

| İşlem | Müşteri bakiye | Tedarikçi bakiye | Stok |
|-------|----------------|------------------|------|
| Veresiye satış | + | — | − |
| Nakit/kart satış | 0 | — | − |
| Alış (peşin değil) | — | + | + |
| Peşin alış | — | 0 | + |
| Satış iade (trcode 3) | − | — | + |
| Alış iade (trcode 6) | — | − | − |
| CH_TAHSILAT / CH_ODEME | −ABS | −ABS | — |

### 4.2 Mobil yazma

| Akış | `fiche_type` / `trcode` | Stok | Cari | Kasa |
|------|-------------------------|------|------|------|
| POS | `sales_invoice` / **7** (web MarketPOS ile uyumlu) (*) | − | ✓ veresiye | ✓ `KASA_GIRIS` (nakit/kart) |
| Satış faturası | `sales_invoice` / **8** (*) | − | ✓ veresiye | ✓ `KASA_GIRIS` (nakit/kart) |
| Alış faturası | `purchase_invoice` / 1 | + | ✓ tedarikçi (peşin değil) | — |
| Cari tahsilat UI | — | — | ✓ kart − | ✓ `cash_lines` |

(*) Önceki sapma: POS `retail`/8, satış formu `sales`/0 yazıyordu → ekstre ve web rapor filtrelerinde düşüyordu. Düzeltildi; geçmiş DB satırları için ekstre fallback legacy tipleri de kabul ediyor.

**Risk R5 (P0) — düzeltildi (2026-07-14):** Alış faturası peşin değilse (`paymentMethodImpliesSupplierDebt`) `suppliers.balance +=`. Peşin nakit/kart/havale’de tedarikçi borcu yazılmaz. Peşin alışta kasa çıkışı hâlâ opsiyonel (yapılmadı).

**Risk R6 (P1):** İade oluşturma formu yok; liste filtresi var. Yanlış elle `trcode` ile oluşturulmuş fişlerde stok/bakiye yönü mobil yazma yollarında ele alınmıyor.

**Risk R7 (P2):** `financeApi` basit kasa tipi `TAHSILAT`/`ODEME`; web/POS `KASA_GIRIS` / `KASA_CIKIS`. `cashApi` doğru tipleri kullanıyor. İki API paralel → raporlarda tip çeşitliliği.

---

## 5. POS — stok + ciro tutarlılığı

### Web MarketPOS zinciri

1. `salesAPI.create` → `invoicesAPI.create` (`sales_invoice`, trcode 7)  
2. Stok düşümü (`invoiceLineStockDelta`)  
3. Veresiye → cari borç  
4. Nakit → `KASA_GIRIS` (+ karma ödeme kuralları)

### Mobil POS

1. `sales` + `sale_items` insert  
2. `products.stock -= qty`  
3. Ciro: dashboard / `ReportSales` (`net_amount` toplamı)  
4. Nakit/kart → `cash_lines` **KASA_GIRIS** + kasa `balance` ✓  
5. Veresiye + `customer_id` → `customers.balance +=` ✓ (UI’da müşteri seçimi opsiyonel; API hazır)

**Risk R8 (P0) — düzeltildi (2026-07-14):** POS nakit/kart sonrası varsayılan aktif kasaya `KASA_GIRIS` (`recordKasaGirisForSale`). Kasa yoksa satış yine kaydedilir (web gibi uyarı/sessiz).

**Risk R9 (P1 — bu turda azaltıldı):** Günlük ciro ve top ürünler **alış fişlerini** de toplayabiliyordu. `fetchSalesByDay`, `fetchTopProducts`, dashboard gelir sorgusu satış yönü ile süzülüyor.  
**Kalan:** İade (`return_invoice`) tutarı hâlâ pozitif `SUM` ile ciroya eklenebilir; net ciro için iade işareti (web ile aynı kuralla) ayrıca ele alınmalı.

**Risk R10 (P2):** POS KDV=0 hardcode; web vergi satırları varsa raporlar sapar.

---

## 6. Dönem (`periodNr`) ayrımı

| Alan | Davranış |
|------|----------|
| Login / Organization | `firmNr` + `periodNr` → `authStore`; hareket tabloları buradan |
| Fatura / POS / kasa yazma | Dönem tablosuna insert |
| Cari kart bakiyesi | Firma scoped — **dönem filtresi yok** |
| `orgSessionStore.epoch` | Dönem değişince listeler yenilenir ✓ |

**Risk R11 (P1):** Kullanıcı dönem 02’ye geçince ekstre 02 hareketlerini gösterir; mizan kart bakiyesi hâlâ tüm dönemlerin birikimini (web’in yazdığı kadarıyla) gösterir. Muhasebeci beklentisi: dönemsel açılış + hareket = kapanış. Mobilde açılış bakiyesi satırı yok (`opening_balance` fişleri filtrede var ama topluca açılış eklenmiyor).

**Risk R12 (P2):** Login seed `periodNr: '01'`; Organization seçilmezse yanlış döneme yazım.

---

## 7. Eksik kritik muhasebe ekranları

| Ekran / işlev | Web | Mobil | Öncelik |
|---------------|-----|-------|---------|
| Cari liste + bakiye | ✓ | ✓ okuma | — |
| Cari ekstre | ✓ | ✓ (kasa satırı eksik) | P1 |
| Cari devir / açılış | ✓ | Menü → ekstre yönlendirme / form yok | P1 |
| Kasa işlem / tahsilat | ✓ | Finance + CashCollection | — |
| Banka | ✓ | Finance (basit) | P2 |
| Satış faturası | ✓ | Form (basit) | P1 (bakiye/kasa) |
| Alış faturası | ✓ | API var, UI zayıf | P1 |
| İade / hizmet formları | ✓ | Liste filtresi / Module | P1 |
| POS | ✓ tam zincir | Stok+ciro only | P0 |
| Yaşlandırma | ✓ | Yok | P2 |
| Virman | ✓ | Yok | P2 |
| Hesap planı / yevmiye / yasal mizan | Kısmi | Yok | P3 (ürün kararı) |
| Gelir tablosu / bilanço | ✓ UI | Yok | P3 |
| Mutabakat dashboard | ✓ | Yok | P3 |

Menü yanıltması (P2):

- `financereports-bank` → `ReportCash` (kasa raporu; banka değil).
- `cari-devir` → ekstre ekranı (devir fişi değil).

---

## 8. Risk kaydı ve öncelik

### P0 — hemen (doğruluk / mutabakat)

| ID | Risk | Öneri |
|----|------|-------|
| R8 | ~~POS kasa yazmıyor~~ **düzeltildi** | Nakit/kart → `KASA_GIRIS` + kasa bakiye |
| R1 | ~~Veresiye satış/POS cari bakiyeyi güncellemiyor~~ **düzeltildi** | `customers.balance +=` (veresiye) |
| R5 | ~~Alış faturası tedarikçi bakiyesini güncellemiyor~~ **düzeltildi** | Peşin değilse `suppliers.balance +=` |

### P1 — kısa vadede

| ID | Risk | Öneri |
|----|------|-------|
| R3 | Ekstrede `cash_lines` yok | Fallback’e `UNION ALL` CH_TAHSILAT/CH_ODEME (web `getAccountStatement`) |
| R2 / R11 | Dönemsel mizan ≠ kart bakiyesi | `fetchCariBalances` için web `accountBalance` CTE’yi port et; UI’da “kart bakiyesi (firma)” vs “dönem bakiyesi” ayrımı |
| R9 kalan | İade ciro işareti | Satış raporlarında iade `net_amount` negatif veya ayrı kolon |
| R6 | İade/hizmet yazma | En az satış iade (trcode 3) ve alış iade (6) formları veya mevcut web API proxy |
| — | Menü: kasa/banka/devir yanlış hedef | `LIVE_MAP` düzelt; Module yerine doğru ekran veya “yakında” |

### P2 — orta vade

| ID | Risk | Öneri |
|----|------|-------|
| R4 | “Mizan” adı | Etiketi “Cari bakiye özeti” yap veya GL mizan ekle |
| R7 | Kasa transaction_type çeşitliliği | Tek tip sözlüğü (`KASA_GIRIS` / `CH_*`) |
| R10 | KDV=0 | POS/fatura’da ürün KDV’si |
| R12 | Varsayılan dönem | Login’de son kullanılan / sunucu varsayılanı |
| — | Yaşlandırma, virman | Web `erpReports` yaşlandırma + basit virman |

### P3 — ürün kararı

- Yasal defter / hesap planı mizanı (web’de de kısmen legacy).
- Bilanço, gelir tablosu, mutabakat dashboard.

---

## 9. Bu turda uygulanan küçük düzeltmeler

Commit yapılmadı. Dosyalar:

| Dosya | Değişiklik |
|-------|------------|
| `mobile/src/api/posApi.ts` | `fiche_type='sales_invoice'`, `trcode=7`; nakit/kart → `KASA_GIRIS`; veresiye → `customers.balance` |
| `mobile/src/api/invoicesApi.ts` | Satış formu `sales_invoice` / trcode 8; veresiye bakiye + peşin kasa; alış tedarikçi bakiye |
| `mobile/src/api/cashApi.ts` | `recordKasaGirisForSale`, `adjustCustomerBalance`, `adjustSupplierBalance` |
| `mobile/src/api/paymentMethodUtils.ts` | Web ile uyumlu peşin/veresiye/kasa yardımcıları |
| `mobile/src/api/reportsApi.ts` | Ciro filtreleri; ekstre legacy+trcode; malzeme yönü; top ürün join+filtre |
| `mobile/src/api/dashboardApi.ts` | Günlük cirodan alış fişlerini eleme |
| `mobile/AUDIT_ACCOUNTING.md` | P0 R1/R5/R8 düzeltildi notları |

**Yapılmadı (bilinçli — geniş rewrite):** ekstreye `cash_lines` UNION, ledger CTE portu, peşin alışta `KASA_CIKIS`, POS UI’da veresiye müşteri seçici.

---

## 10. Doğrulama önerisi (manuel)

1. Aynı kiracıda web + mobil aynı `firmNr`/`periodNr`.  
2. Web’den veresiye satış → mobilde mizan/ekstre bakiyesi.  
3. Mobil POS nakit → stok −, ciro +, kasa bakiyesi **artmalı** (R8 düzeltildi).  
4. Mobil alış faturası veresiye + tedarikçi → stok +, `suppliers.balance` **artmalı** (R5 düzeltildi); peşin alışta bakiye 0 kalır.  
5. Dönem değiştir → fatura listesi değişir; kart bakiyeleri aynı kalır (R2).

---

## 11. Dosya haritası (mobil)

```
mobile/src/api/
  reportsApi.ts       # mizan okuma, ekstre, ciro, kasa hareket raporu
  accountBalance      # (yok — web’de var)
  customersApi.ts     # kart balance okuma
  invoicesApi.ts      # liste + satış/alış create
  posApi.ts           # POS yazma
  cashApi.ts          # kasa + CH_TAHSILAT/ODEME
  financeApi.ts       # basit kasa/banka (tip farkı dikkat)
  dashboardApi.ts     # günlük ciro KPI
  erpTables.ts        # firm/period tablo adları

mobile/src/screens/
  ReportScreens.tsx   # ReportMizan, ReportCariExtract, ReportCash, …
  CashCollectionScreen.tsx
  FinanceScreen.tsx
  PosScreen.tsx, InvoicesScreen.tsx, CustomersScreen.tsx
```

Web referans: `src/services/api/accountBalance.ts`, `invoices.ts`, `sales.ts`, `kasa.ts`, `erpReports.ts`, `utils/cariAccountStatement.ts`.
