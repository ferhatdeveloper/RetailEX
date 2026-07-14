# RetailEX Mobile — Muhasebe Denetimi V2

**Rol:** Uzman muhasebeci — ikinci tur derin inceleme  
**Tarih:** 2026-07-14  
**Önceki:** `AUDIT_ACCOUNTING.md` (P0 R1/R5/R8, P1 R2/R3/R9/R11 kapatılmıştı)  
**Kapsam:** POS / fatura / kasa / ekstre / mizan / iade tutarlılığı (kod + web karşılaştırma)  
**Commit:** yok  

---

## 1. Yönetici özeti

Birinci tur sonrasında stok+ciro+veresiye/kasa yazma zinciri genel olarak tutarlıydı. Bu turda **üç mutabakat kırığı** bulundu ve düzeltildi:

| ID | Önem | Konu | Sonuç |
|----|------|------|--------|
| **V2-R13** | P0 | Tedarikçi ekstresinde alış fişleri `sign=-1` → kapanış bakiyesi **ters** | Düzeltildi |
| **V2-R15** | P0 | Alış iade (trcode **6**, `fiche_type=purchase_invoice`) ledger’da **+borç** sayılıyordu | Düzeltildi |
| **V2-R14** | P0 | Peşin iade her zaman cari bakiyeyi düşürüyordu; peşin satış iadesinde kasa çıkışı yoktu | Düzeltildi |

Önceki tur kapanışları (R1–R3, R5, R8–R9, R11) kodda doğrulandı; regresyon yok.

---

## 2. Matris — POS / fatura / kasa / ekstre / mizan / iade

| İşlem | Stok | Cari kart | Dönem ledger (mizan) | Ekstre işareti | Kasa |
|-------|------|-----------|----------------------|----------------|------|
| POS nakit/kart | − | 0 | 0 (peşin) | + satış | `KASA_GIRIS` ✓ |
| POS / satış veresiye | − | + | + | + | — |
| Satış faturası peşin | − | 0 | 0 | + | `KASA_GIRIS` ✓ |
| Alış açık hesap | + | tedarikçi + | + | **+** (V2-R13) | — |
| Alış peşin nakit/kart | + | 0 | 0 | + | `KASA_CIKIS` ✓ (önceki tur sonrası) |
| Satış iade veresiye (3) | + | − | − (`return_invoice`) | − | — |
| Satış iade peşin (3) | + | **0** (V2-R14) | − / ekstre − | − | **`KASA_CIKIS`** ✓ |
| Alış iade açık (6) | − | − | **−** (V2-R15) | − | — |
| Alış iade peşin (6) | − | **0** (V2-R14) | − (trcode 6 her zaman) | − | **`KASA_GIRIS`** / havale **`BANKA_GIRIS`** ✓ (V2-R16) |
| CH_TAHSILAT / CH_ODEME | — | −ABS | −ABS | − | kasa ± |

**Mizan notu:** Menü “Mizan” = dönemsel **cari** bakiye (ledger CTE); yasal GL mizan yok (R4 / P2).

---

## 3. P0 — kritik (doğruluk)

### V2-R13 — Tedarikçi ekstre işareti (düzeltildi)

**Bulgu:** `fetchCariExtract` fallback CASE’i müşteri/tedarikçi ayırmadan  
`purchase_invoice` ve trcode `1,6` için `sign = -1` uyguluyordu.  
`mapRunningExtract` borcu `sign>0`, alacağı `sign<0` saydığı için **alış tutarı bakiyeyi düşürüyordu**. Web `buildEkstreRows` ise alışta `+delta` kullanır; dönem ledger da alışta `+net`. Ekstre ≠ mizan.

**Düzeltme:** `reportsApi.ts` — kart tipine göre ayrı CASE:
- Müşteri: yalnız `return_invoice` / trcode 2–3 → −1  
- Tedarikçi: yalnız trcode **6** / `return_invoice` → −1; alış → +1  

### V2-R15 — Alış iade ledger (düzeltildi)

**Bulgu:** Mobil/web yazım: trcode 6 → `fiche_type='purchase_invoice'`.  
Supplier CTE tüm `purchase_invoice` satırlarını `+net` sayıyordu. Veresiye alış iadesi mizan/ledger’da borcu **arttırıyordu** (kartta ise − yazılıyordu).

**Düzeltme:** `accountBalance.ts` — `COALESCE(trcode,0)=6` → `-ABS(net)`; trcode 6 her zaman CTE’ye dahil (ödeme peşin olsa bile).

### V2-R14 — Peşin iade cari / kasa (düzeltildi)

**Bulgu:** `createReturnInvoiceLive` her iadede `accountId` varsa bakiyeyi düşürüyordu. Form varsayılanı **Nakit**; peşin satışta borç oluşmamışken negatif bakiye / mizan sapması. Kasa iade çıkışı yoktu.

**Düzeltme:** `invoicesApi.ts` + `cashApi.recordKasaCikisForReturn`:
- Satış iade + veresiye → müşteri −  
- Satış iade + peşin → `KASA_CIKIS` (cari yok)  
- Alış iade + açık hesap → tedarikçi −  
- Alış iade + peşin → cari yok; kasa/banka V2-R16 ile tamamlandı  

### V2-R16 — Peşin alış iade kasa/banka (düzeltildi)

**Bulgu:** Peşin alışta `KASA_CIKIS` yazılıyordu; peşin alış iadesinde (trcode 6) simetrik `KASA_GIRIS` yoktu — kasa fazla düşük kalıyordu. Havale iadesinde banka girişi de yoktu.

**Düzeltme:** `cashApi.recordKasaGirisForPurchaseReturn` + `recordBankaGirisForPurchaseReturn`; `createReturnInvoiceLive`:
- Alış iade + nakit/kart → `KASA_GIRIS`  
- Alış iade + havale/EFT → `BANKA_GIRIS` (varsayılan banka hesabı varsa)  

---

## 4. P1 — kısa vade (açık / kısmi)

| ID | Risk | Durum / öneri |
|----|------|----------------|
| V2-R16 | Peşin alış iadesinde tedarikçiden nakit dönüşün kasa/banka kaydı yok | **Düzeltildi** (`KASA_GIRIS` / `BANKA_GIRIS`) |
| V2-R17 | Web `erpReports.getCariExtract` hâlâ alışta `sign=-1` (mobil düzeltildi, web sapması kalır) | Web’e aynı CASE portu |
| R6 | Hizmet / irsaliye create | Liste/filter var; create hâlâ sınırlı |
| R11 | Ekstre açılış satırı otomatiği | `CariDevirScreen` + `opening_balance` var; ekstre UI’da ayrı “açılış” satırı yok |
| — | POS UI’da veresiye müşteri seçici zayıf | API hazır |

---

## 5. P2 — orta vade

| ID | Risk | Not |
|----|------|-----|
| R4 | “Mizan” etiketi yanıltıcı | Cari bakiye özeti; GL yok |
| R7 | Tip sözlüğü | `cashTransactionTypes` + `financeApi` `KASA_*` — eski TAHSILAT satırları okumada normalize |
| R10 | POS/fatura KDV=0 | Rapor sapması riski |
| R12 | Login `periodNr: '01'` | Organization seçilmezse yanlış dönem |
| — | Yaşlandırma, virman (tam), gelir/bilanço | Ürün kararı |

Menü (V1’den kalan, kısmen düzelmiş):
- `financereports-bank` → `Finance` (banka ekranı; kasa raporu değil) ✓ iyileşti  
- `cari-devir` → `CariDevir` (gerçek form) ✓  

---

## 6. Bu turda düzeltilen dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `mobile/src/api/reportsApi.ts` | Ekstre `saleSignSql` müşteri/tedarikçi ayrımı (V2-R13) |
| `mobile/src/api/accountBalance.ts` | Supplier CTE trcode 6 → −borç (V2-R15) |
| `mobile/src/api/cashApi.ts` | `recordKasaCikisForReturn`; `recordKasaGirisForPurchaseReturn` / `recordBankaGirisForPurchaseReturn` (V2-R16) |
| `mobile/src/api/invoicesApi.ts` | İade yan etkileri peşin/veresiye (V2-R14); peşin alış iade kasa/banka (V2-R16) |
| `mobile/src/api/paymentMethodUtils.ts` | `paymentMethodImpliesBankTransfer` (V2-R16) |
| `mobile/AUDIT_ACCOUNTING_V2.md` | Bu rapor |

**Commit yapılmadı.**

---

## 7. Önceki tur (doğrulandı — dokunulmadı)

- POS / satış: stok −, peşin `KASA_GIRIS`, veresiye cari +  
- Alış: stok +, açık hesap tedarikçi +, peşin `KASA_CIKIS`  
- Ciro/dashboard: iade negatif (`sqlSalesRevenueSign`)  
- Mizan: dönem ledger CTE + `cardBalance` ayrımı  
- Ekstre: `account_movements` → `sales` UNION `CH_*`  

---

## 8. Manuel doğrulama kontrol listesi

1. Aynı `firmNr` / `periodNr` ile web + mobil.  
2. **Tedarikçi:** açık hesap alış 1000 → ekstre kapanış **+1000**; mizan dönem bakiyesi **+1000** (V2-R13).  
3. **Alış iade 6** (açık hesap) 300 → mizan/ledger **−300** (kart da −); ekstre alacak satırı (V2-R15).  
4. **Satış iade peşin:** kasa bakiyesi düşer; müşteri kartı değişmez (V2-R14).  
5. **Satış iade veresiye:** müşteri bakiyesi düşer; kasa değişmez.  
6. **Alış iade peşin nakit/kart:** kasa `KASA_GIRIS`; tedarikçi kartı değişmez (V2-R16).  
7. **Alış iade havale:** varsayılan banka varsa `BANKA_GIRIS` (V2-R16).  
8. POS nakit → kasa +; günlük ciro +.  
9. Dönem değiştir → mizan dönem tutarları değişir; kart satırı firma birikimi kalabilir.

---

## 9. Risk kaydı (V2 birleşik)

### P0

| ID | Risk | Durum |
|----|------|--------|
| V2-R13 | Tedarikçi ekstre alış işareti | **Düzeltildi** |
| V2-R15 | Alış iade ledger +borç | **Düzeltildi** |
| V2-R14 | Peşin iade cari / kasa | **Düzeltildi** |
| R1/R5/R8 | Önceki tur P0 | Kapalı |

### P1

| ID | Risk | Durum |
|----|------|--------|
| V2-R16 | Peşin alış iade nakit dönüş | **Düzeltildi** |
| V2-R17 | Web ekstre aynı bug | Açık (web) |
| R6 | Hizmet create | Açık |
| R3/R9/R2/R11 | Önceki P1 | Kapalı / kısmi |

### P2

R4, R7, R10, R12, yaşlandırma / GL mizan — ürün kararı.

---

## 10. Üçüncü tur — V2-R16 / R11 / virman–havale (2026-07-14)

**Commit:** yok  
**Kapsam:** Kod doğrulama + web karşılaştırma; önceki V2 düzeltmelerine (R13–R15) regresyon kontrolü.

### 10.1 V2-R16 — Peşin alış iadesi kasa (düzeltildi)

| Katman | Peşin alış (trcode 1) | Peşin alış iade (trcode 6) |
|--------|----------------------|----------------------------|
| Stok | + | − ✓ |
| Tedarikçi kart | 0 | 0 ✓ (`paymentMethodImpliesPaidNow`) |
| Dönem ledger | 0 | − (trcode 6 CTE) ✓ |
| Kasa | `KASA_CIKIS` ✓ | **`KASA_GIRIS`** ✓ (nakit/kart) |
| Banka | — (R5 peşin alış havale hâlâ açık) | **`BANKA_GIRIS`** ✓ (havale; varsayılan hesap) |

**Kod:** `createReturnInvoiceLive` — peşin alış iade dalı:
- `paymentMethodImpliesCashOutKasa` → `recordKasaGirisForPurchaseReturn`
- `paymentMethodImpliesBankTransfer` → `recordBankaGirisForPurchaseReturn` → `BANKA_GIRIS`

**Web:** `applyInvoiceLedgerSideEffects` hâlâ alış iade için kasa yazmıyor — mobil web’den ileride; web portu ayrı takip.

**Durum:** **Düzeltildi** (mobil).

---

### 10.2 R11 — Ekstre açılış satırı

| Özellik | Mizan (ledger CTE) | Cari devir fişi | Ekstre UI |
|---------|-------------------|-----------------|-----------|
| `opening_balance` dahil | ✓ `accountBalance.ts` | ✓ `CariDevirScreen` + `cariDevirApi.ts` | Kısmi |
| Dönem öncesi devir satırı | — | — | **Yok** (web de yok) |
| `opening_balance` etiketi | — | trcode 99 | ✓ `Devir` (`fetchCariExtract`) |
| İşaret (alacak devir) | ✓ işaretli `net_amount` | ✓ `signedNetAmount` | ✓ `saleSignSql` net işareti |

**Ledger (R11 kapanış kısmı):** Dönemsel bakiye CTE’si `opening_balance` satırlarını işaretli `net_amount` ile toplar — **mizan ile uyumlu**.

**Ekstre (R11a kapandı 2026-07-14):**

1. **Sentetik açılış satırı yok (R11b / P2):** Tarih aralığı öncesi toplam “Devir bakiyesi” satırı yok. Web `buildEkstreRows` da aynı — Logo tarzı “devreden” ürün kararı.
2. **Etiket:** Web `ficheTypeToInfo` → `Devir`; mobil fallback SQL `opening_balance` → `Devir`.
3. **İşaret:** `saleSignSql` içinde `opening_balance` → `net_amount < 0 ? -1 : 1` (web `buildEkstreRows` `isOpening` / `amount > 0` borç ile uyumlu).

**Durum:** **R11a kapalı** — etiket + işaret web ile hizalı. R11b (dönem öncesi satır) açık / P2.

---

### 10.3 Virman / havale derinlik

#### API katmanı (`cashApi.ts`)

| İşlem | Mobil | Web (`kasa.ts` / `banka.ts`) |
|-------|-------|------------------------------|
| Kasa ↔ kasa VIRMAN (çift satır + bakiye) | ✓ `createCashVirman` | ✓ |
| Kasa → banka / banka → kasa | ✓ `createCashBankBridge` | ✓ `BANKA_YATIRILAN` / `BANKADAN_CEKILEN` |
| Kasa giriş/çıkış | ✓ `createSimpleCashMovement` | ✓ |
| Banka giriş/çıkış | ✓ `createSimpleBankMovement` | ✓ |
| Cari tahsilat/ödeme (CH_*) | ✓ `createCariCashSlip` | ✓ |
| Banka ↔ banka VIRMAN | **Yok** | ✓ `BankaIslemModal` → `HAVALE` / `EFT` / `VIRMAN` |
| Banka tarafı CH_TAHSILAT/CH_ODEME | **Yok** | ✓ `banka.ts` |
| Fatura peşin havale → banka | Alış iade ✓ (V2-R16); satış/alış oluşturma **Yok** (R5 P2) | **Yok** (aynı) |
| VIRMAN iptal / karşı satır silme | **Yok** | ✓ `kasa.ts` cleanup |

#### UI katmanı

| Ekran | Kapsam |
|-------|--------|
| `FinanceScreen` | Kasa: Giriş, Çıkış, **Virman**, Bankaya, Bankadan. Banka: yalnız Giriş/Çıkış. |
| `CashCollectionScreen` | CH_TAHSILAT / CH_ODEME; API tedarikçi fallback var, UI **yalnız müşteri** listesi. |
| Menü `menuConfig.ts` | `kasalar`, `cashbank`, `cash-slips`, `cari-devir` var; **ayrı “Virman” menü girişi yok** (`navigateToModule` `virman` id’si tanımlı ama menüde yok). |
| `navigateToModule` | `virman` → Finance `formMode: 'virman'` ✓ |

#### Havale özeti

- **POS / satış / alış create:** `paymentMethodUtils` havaleyi peşin sayar ama kasa/banka satırı **yazmaz** (nakit/kart kasaya; havale operasyonel — R5).
- **Alış iade (trcode 6) havale:** `BANKA_GIRIS` ✓ (V2-R16; varsayılan banka hesabı).
- **Güzellik:** `beautyApi` transfer → kasa girişi yok (web ile uyumlu kısıt).
- **Banka ekranı:** Havale/EFT işlem tipi seçimi **yok**; yalnızca genel giriş/çıkış.

**Durum:** Virman **kasa düzeyinde tam** (API+UI); havale ve banka virmanı **kısmi** (P2 ürün kararı).

---

### 10.4 Regresyon (V2-R13 / R14 / R15)

Kod taraması — önceki tur düzeltmeleri yerinde:

- `reportsApi.ts` `saleSignSql` müşteri/tedarikçi ayrımı ✓
- `accountBalance.ts` trcode 6 → `−ABS(net)` ✓
- `invoicesApi.ts` peşin satış iade → `recordKasaCikisForReturn`; peşin alış iade → `KASA_GIRIS` / havale `BANKA_GIRIS` (V2-R16) ✓

---

### 10.5 Güncellenmiş risk özeti (bu tur)

| ID | Konu | Önem | Durum |
|----|------|------|--------|
| V2-R16 | Peşin alış iade → `KASA_GIRIS` / havale → banka | P1 | **Düzeltildi** |
| R11a | Ekstre devir etiketi + negatif açılış işareti | P1 | **Kapalı** (`reportsApi.fetchCariExtract`) |
| R11b | Dönem öncesi “devreden” satırı | P2 | **Açık** (web de yok) |
| V2-VIR | Banka↔banka virman, HAVALE/EFT tipi | P2 | **Açık** |
| V2-MENU | Menüde Virman kısayolu | P2 | **Açık** |
