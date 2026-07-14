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
| Cari bakiye listesi / özet | Kart `balance` **veya** ledger CTE (`accountBalance.ts`) | Dönem ledger CTE + `cardBalance`; UI: **Cari Bakiye Özeti** | Uyumlu (P1 R2/R11; P2 R4 etiket) |
| Cari ekstre | `sales` + `cash_lines` (web) / `account_movements` | `account_movements` → yoksa `sales` **UNION** `cash_lines` (CH_*) | Uyumlu (P1 R3) |
| Genel muhasebe mizanı (hesap planı) | GL / journal (kısmen legacy) | Yok — menü açıkça cari özet | Ad netleştirildi (R4) |
| Satış / alış yönü | `fiche_type` + Logo `trcode` | Liste/filtre iyi; yazma sınırlı | İyileştirildi (*) |
| POS: stok + ciro | Stok − / `sales` / kasa / (veresiye) cari | Stok − / `sales` / **KASA_GIRIS** / veresiye ✓ | Uyumlu (P0) |
| Peşin alış → kasa | (genelde manuel / opsiyonel) | **KASA_CIKIS** (nakit/kart) | Uyumlu (P2 R5) |
| Dönem (`periodNr`) | Hareket tabloları dönemli | Login seed: son org / sunucu son dönem | Uyumlu (P2 R12) |
| Yaşlandırma | `erpReports.getCariAging` | `ReportAging` / `fetchCariAging` (basit) | Uyumlu (P2) |

(*) Önceki: P0 stok/kasa/cari; P1 ekstre+ciro+ledger. Bu tur (P2): R4 etiket, R7 tip sözlüğü, R12 seed, peşin alış KASA_CIKIS, yaşlandırma. Commit yok.

---

## 2. Mimari karşılaştırma

### Web — iki katman

1. **Operasyonel ERP (canlı):** `sales` + `sale_items` + `cash_lines` + `products.stock` + kart `balance` yan etki.  
   Kaynak: `src/services/api/invoices.ts`, `sales.ts`, `accountBalance.ts`, `kasa.ts`.
2. **Yasal / GL mizan:** `gl_transactions` / Supabase journal — hesap planı mizanı; cari bakiyeden ayrı dünya.

### Mobil — operasyonel alt küme

- Okuma: cari kart, ekstre, **cari bakiye özeti**, yaşlandırma, kasa/banka hareketleri, fatura listesi, satış raporları.
- Yazma: POS satış, satış/alış/iade fatura, **hizmet/irsaliye/sipariş/teklif belge**, kasa/banka (`KASA_*`), cari tahsilat/ödeme (`CH_*`).
- **Yok:** otomatik yevmiye, hesap planı mizanı, cari devir fişi, virman (UI kısmen), header `total_vat` / POS KDV.

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
| Liste bakiyesi | Tercihen **ledger CTE** | **Dönem ledger CTE** (`accountBalance.ts` → `fetchCariBalances`); kart kolonu `cardBalance` |
| Fatura anında | `UPDATE … balance` + ledger senkron | Satış/alış create: veresiye → kart ✓ |
| Tahsilat | `CH_TAHSILAT` → bakiyeyi düşürür | `cashApi.createCariCashSlip` ✓ |

**Risk R1 (P0) — düzeltildi:** Veresiye satış/POS → `customers.balance +=`.

**Risk R2 (P1) — düzeltildi:** Dönem ledger CTE + ReportMizan dönem/kart ayrımı.

**Risk R3 (P1) — düzeltildi:** Ekstre `sales` UNION `cash_lines` (CH_*).

**Risk R4 (P2) — düzeltildi (2026-07-14):** Menü / rapor / ekran etiketi **«Cari Bakiye Özeti»**; alt yazıda “yasal GL mizanı değil”. Route adı `ReportMizan` geriye uyumluluk için kaldı.

### 3.2 Ekstre düzeltmeleri

- Müşteri fallback: `sales_invoice` / `sales` / `retail` / trcode 7–8.
- İade/alış işareti: `return_invoice` / `purchase_invoice` / trcode 1,2,3,6 → `sign = -1`.
- Fallback’e `cash_lines` UNION (`CH_*`, `sign = -1`).

---

## 4. Satış vs alış — borç / alacak ve stok

### 4.1 Web matrisi (özet)

| İşlem | Müşteri bakiye | Tedarikçi bakiye | Stok | Kasa |
|-------|----------------|------------------|------|------|
| Veresiye satış | + | — | − | — |
| Nakit/kart satış | 0 | — | − | KASA_GIRIS |
| Alış (peşin değil) | — | + | + | — |
| Peşin alış | — | 0 | + | KASA_CIKIS (mobil) |
| Satış iade (trcode 3) | − | — | + | (iade nakit → CIKIS web POS) |
| Alış iade (trcode 6) | — | − | − | — |
| CH_TAHSILAT / CH_ODEME | −ABS | −ABS | — | ± |

### 4.2 Mobil yazma

| Akış | `fiche_type` / `trcode` | Stok | Cari | Kasa |
|------|-------------------------|------|------|------|
| POS | `sales_invoice` / **7** | − | ✓ veresiye | ✓ `KASA_GIRIS` |
| Satış faturası | `sales_invoice` / **8** | − | ✓ veresiye | ✓ `KASA_GIRIS` |
| Alış faturası | `purchase_invoice` / 1 | + | ✓ tedarikçi (peşin değil) | ✓ **KASA_CIKIS** (nakit/kart) |
| Cari tahsilat UI | — | — | ✓ kart − | ✓ `CH_*` |

**Risk R5 (P0/P2) — düzeltildi:** Alış veresiye → `suppliers.balance +=`; peşin nakit/kart → borç yok + **`recordKasaCikisForPurchase`**. Havale/EFT hâlâ banka satırı yazmaz.

**Risk R6 (P1) — düzeltildi (2026-07-14):** İade 3/6 + `createDocumentInvoice` (hizmet 9/4, irsaliye 10/11, sipariş 20/21, teklif 30). Stok belge türlerinde 0 (web parity); hizmet veresiye cari + verilen peşin kasa.

**Risk R7 (P2) — düzeltildi (2026-07-14):** Tek tip sözlüğü `cashTransactionTypes.ts` (`KASA_GIRIS` / `KASA_CIKIS` / `CH_*` / banka). `financeApi` artık `TAHSILAT`/`ODEME` yazmıyor; legacy okuma `normalizeCashTransactionType` ile etiketlenir.

---

## 5. POS — stok + ciro tutarlılığı

**Risk R8 (P0) — düzeltildi:** Nakit/kart → `KASA_GIRIS`.

**Risk R9 (P1) — düzeltildi:** İade ciro işareti (−ABS).

**Risk R10 (P2 — kısmen 2026-07-14):** Fatura satır `vatRate` + UI KDV + `sale_items.vat_rate`. Header `total_vat` ve POS hâlâ 0 (web `totalVat: 0`).

---

## 6. Dönem (`periodNr`) ayrımı

| Alan | Davranış |
|------|----------|
| Login | `loadLastOrg()` — aynı firmada son dönem; aksi halde boş seed |
| Organization | Boş/geçersiz seed → sunucu `periods` listesinin **son** (en yüksek nr) aktif dönemi |
| Onay | `saveLastOrg` + `authStore` |
| Hareket yazma | `erpTables.periodNr()` |

**Risk R11 (P1) — kısmen:** Ledger dönemsel; toplu açılış / devir formu yok.

**Risk R12 (P2) — düzeltildi (2026-07-14):** Hardcode `periodNr: '01'` kaldırıldı; son org + sunucu varsayılanı.

---

## 7. Eksik kritik muhasebe ekranları

| Ekran / işlev | Web | Mobil | Öncelik |
|---------------|-----|-------|---------|
| Cari liste + bakiye | ✓ | ✓ | — |
| Cari ekstre | ✓ | ✓ | — |
| Cari bakiye özeti | ✓ | ✓ (`ReportMizan`) | — |
| Cari yaşlandırma | ✓ | ✓ basit (`ReportAging`) | P2 ✓ |
| Cari devir / açılış | ✓ | Form yok | P1 |
| Kasa / tahsilat | ✓ | Finance + CashCollection | — |
| Virman | ✓ | Kısmi (cashApi) | P2 |
| Hizmet / irsaliye / sipariş / teklif | ✓ | `createDocumentInvoice` + form | P1 ✓ |
| Hesap planı / yasal mizan | Kısmi | Yok | P3 |
| Gelir tablosu / bilanço | ✓ UI | Yok | P3 |

Menü: `financereports-bank` → Finance banka; `cari-devir` → ekstre yönlendirme (devir fişi değil).

---

## 8. Risk kaydı ve öncelik

### P0 — düzeltildi

| ID | Durum |
|----|--------|
| R8 | POS `KASA_GIRIS` |
| R1 | Veresiye cari bakiye |
| R5 | Alış tedarikçi bakiye + (P2) peşin `KASA_CIKIS` |

### P1 — düzeltildi / kısmi

| ID | Durum |
|----|--------|
| R3 | Ekstre CH_* |
| R9 | İade ciro işareti |
| R2 / R11 | Dönem ledger (açılış formu açık) |
| R6 | ~~İade + belge create~~ hizmet/irsaliye/sipariş/teklif |

### P2 — bu tur

| ID | Risk | Durum |
|----|------|--------|
| R4 | Mizan adı | **düzeltildi** — Cari Bakiye Özeti |
| R7 | Tip çeşitliliği | **düzeltildi** — `cashTransactionTypes` |
| R12 | Varsayılan dönem | **düzeltildi** — lastOrg + son aktif dönem |
| — | Yaşlandırma | **basit ekran** `ReportAging` |
| R10 | KDV satır başlangıç (header/POS hâlâ 0) | kısmi |
| — | Virman UI / banka peşin | kısmi / açık |

### P3 — ürün kararı

- Yasal defter / hesap planı mizanı.
- Bilanço, gelir tablosu, mutabakat dashboard.

---

## 9. Uygulanan düzeltmeler

Commit yapılmadı.

### P0 / P1 (önceki turlar)

bkz. önceki tablolar: `posApi`, `invoicesApi`, `cashApi`, `reportsApi`, `accountBalance.ts`, dashboard iade işareti.

### P2 (bu tur)

| Dosya | Değişiklik |
|-------|------------|
| `menuConfig` / `ReportsScreen` / `ReportScreens` / `ModuleScreen` | Etiket **Cari Bakiye Özeti**; yaşlandırma menü + LIVE_MAP |
| `cashTransactionTypes.ts` | Kanonik kasa/banka tip sözlüğü + legacy normalize |
| `financeApi.ts` / `cashApi.ts` | Yazım `KASA_GIRIS`/`KASA_CIKIS`; etiket sözlükten |
| `cashApi.recordKasaCikisForPurchase` | Peşin alış kasa çıkışı |
| `invoicesApi.createPurchaseInvoiceLive` | `paymentMethodImpliesCashOutKasa` → KASA_CIKIS |
| `paymentMethodUtils` | `paymentMethodImpliesCashOutKasa` |
| `lastOrgPrefs.ts` + Login / Organization | R12 dönem/mağaza seed |
| `reportsApi.fetchCariAging` + `ReportAgingScreen` | Basit yaşlandırma |
| navigasyon / types | `ReportAging` stack |

### P1 belge create + KDV satır (bu tur)

| Dosya | Değişiklik |
|-------|------------|
| `invoicesApi.createDocumentInvoice` | TR 9/4/10/11/20/21/30; stok yok; hizmet cari/kasa |
| `InvoiceFormScreen` / `InvoicesScreen` | Belge kinds + liste `+` + satır KDV % |
| `productsApi` | `vat_rate` okuma |
| `mutationQueue` / `syncEngine` | `invoice.document.create` |

**Yapılmadı (bilinçli):** peşin havale → banka satırı, POS KDV / header `total_vat`, ekstre toplu açılış, virman tam UI, GL mizan.

---

## 10. Doğrulama önerisi (manuel)

1. Aynı kiracıda web + mobil aynı `firmNr`/`periodNr`.  
2. Menüde «Cari Bakiye Özeti» — GL mizanı sanılmamalı.  
3. Mobil POS nakit → kasa bakiyesi artmalı.  
4. Mobil peşin alış (nakit/kart) → stok +, tedarikçi bakiye 0, kasa bakiyesi **azalmalı**.  
5. Veresiye alış → tedarikçi bakiye +, kasa değişmez.  
6. Logout → login → Organization: önceki dönem seçili gelmeli (veya sunucu son dönem).  
7. Yaşlandırma: veresiye satış fişi listede; vade aralık KPI’ları dolu.  
8. Finance basit kasa giriş: `transaction_type = KASA_GIRIS` (TAHSILAT değil).

---

## 11. Dosya haritası (mobil)

```
mobile/src/api/
  reportsApi.ts            # bakiye özeti, ekstre, ciro, kasa, yaşlandırma
  accountBalance.ts        # dönem ledger CTE
  cashTransactionTypes.ts  # tip sözlüğü (R7)
  cashApi.ts               # KASA_* / CH_* / peşin alış CIKIS
  financeApi.ts            # basit hareket (aynı tip sözlüğü)
  invoicesApi.ts           # satış/alış create + kasa yan etki
  lastOrgPrefs.ts          # R12 son org
  paymentMethodUtils.ts
  erpTables.ts

mobile/src/screens/
  ReportScreens.tsx        # ReportMizan (=cari özet), ReportAging, …
  ReportsScreen.tsx
  LoginScreen / OrganizationScreen
  FinanceScreen, CashCollectionScreen, …
```

Web referans: `src/services/api/accountBalance.ts`, `invoices.ts`, `sales.ts`, `kasa.ts`, `erpReports.ts` (`getCariAging`).
