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
| V2-VIR | Banka↔banka virman + HAVALE tipi | **Düzeltildi** (`createBankVirman` / `HAVALE`) |
| R11b | Ekstre dönem öncesi “Devir” satırı | **Düzeltildi** (`fetchCariExtract` sentetik satır) |
| V2-R17 | Web `erpReports.getCariExtract` hâlâ alışta `sign=-1` (mobil düzeltildi, web sapması kalır) | Web’e aynı CASE portu |
| R6 | Hizmet / irsaliye create | Liste/filter var; create hâlâ sınırlı |
| — | POS UI’da veresiye müşteri seçici zayıf | API hazır |

---

## 5. P2 — orta vade

| ID | Risk | Not |
|----|------|-----|
| R4 | “Mizan” etiketi yanıltıcı | Cari bakiye özeti; GL yok |
| R7 | Tip sözlüğü | `cashTransactionTypes` + `financeApi` `KASA_*` — eski TAHSILAT satırları okumada normalize |
| R10 | POS/fatura KDV=0 | Rapor sapması riski |
| R12 | Login `periodNr: '01'` | Organization seçilmezse yanlış dönem |
| — | Yaşlandırma, banka CH_*, gelir/bilanço | Ürün kararı |

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
| `opening_balance` dahil | ✓ `accountBalance.ts` | ✓ `CariDevirScreen` + `cariDevirApi.ts` | ✓ |
| Dönem öncesi satır | — | — | **✓ R11b** (`Devreden` sentetik) |
| `opening_balance` etiketi | — | trcode 99 | ✓ `Devir` (`fetchCariExtract`) |
| İşaret (alacak devir) | ✓ işaretli `net_amount` | ✓ `signedNetAmount` | ✓ `saleSignSql` net işareti |

**Ledger (R11 kapanış kısmı):** Dönemsel bakiye CTE’si `opening_balance` satırlarını işaretli `net_amount` ile toplar — **mizan ile uyumlu**.

**Ekstre (R11a kapandı; R11b kapandı 2026-07-14):**

1. **R11b — dönem öncesi Devreden:** `fetchCariExtract` aralık öncesi neti (`account_movements` veya sales+CH_* aynı işaret) toplar; `|net| ≥ 0,005` ise başına `definition=Devreden` satırı ekler (gerçek `opening_balance` fişi **Devir** kalır).
2. **Etiket:** Web `ficheTypeToInfo` → `Devir`; mobil SQL `opening_balance` → `Devir`; BF → `Devreden`.
3. **İşaret:** `saleSignSql` içinde `opening_balance` → `net_amount < 0 ? -1 : 1` (web `buildEkstreRows` `isOpening` ile uyumlu).

**Durum:** **R11a + R11b kapalı** (mobil). Web `buildEkstreRows` hâlâ BF yazmıyor — bilinçli mobil ilerleme.

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
| Banka ↔ banka VIRMAN | ✓ `createBankVirman` (çift satır + bakiye) | ✓ `BankaIslemModal` → `HAVALE` / `EFT` / `VIRMAN` |
| Banka HAVALE / EFT tipi | ✓ `transactionType: 'HAVALE'\|'EFT'` (sign −1) | ✓ |
| Banka tarafı CH_TAHSILAT/CH_ODEME | **Yok** | ✓ `banka.ts` |
| Fatura peşin havale → banka | Alış iade ✓ (V2-R16); satış/alış oluşturma **Yok** (R5 P2) | **Yok** (aynı) |
| VIRMAN iptal / karşı satır silme | **Yok** | ✓ `kasa.ts` cleanup |

#### UI katmanı

| Ekran | Kapsam |
|-------|--------|
| `FinanceScreen` | Kasa: Giriş, Çıkış, **Virman**, Bankaya, Bankadan. Banka: Giriş, Çıkış, **Virman**, **Havale**. |
| `CashCollectionScreen` | CH_TAHSILAT / CH_ODEME; API tedarikçi fallback var, UI **yalnız müşteri** listesi. |
| Menü `menuConfig.ts` | `virman`, `bank-virman`, `bank-havale` (+ kasa fişleri) ✓ |
| `navigateToModule` | `virman` → kasa; `bank-virman` → banka virman; `bank-havale`/`havale` → HAVALE ✓ |

#### Havale özeti

- **POS / satış / alış create:** `paymentMethodUtils` havaleyi peşin sayar ama kasa/banka satırı **yazmaz** (nakit/kart kasaya; havale operasyonel — R5).
- **Alış iade (trcode 6) havale:** `BANKA_GIRIS` ✓ (V2-R16; varsayılan banka hesabı).
- **Güzellik:** `beautyApi` transfer → kasa girişi yok (web ile uyumlu kısıt).
- **Banka ekranı:** Virman (hesap↔hesap) + Havale (dış çıkış, `HAVALE`) ✓.

**Durum:** Virman **kasa + banka** ve banka **HAVALE** tipi kapalı (V2-VIR). Banka CH_* ve fatura peşin havale (R5) hâlâ P2.

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
| R11b | Dönem öncesi “Devreden” satırı | P1 | **Kapalı** (`definition=Devreden`) |
| V2-VIR | Banka↔banka virman, HAVALE tipi | P1 | **Kapalı** (`createBankVirman` + Finance UI) |
| V2-MENU | Menüde Virman / Havale kısayolu | P1 | **Kapalı** (wave A) |

---

## 11. Dördüncü tur — V2-VIR / R11b (2026-07-14)

**Commit:** yok  
**Önkoşul:** V2-R16 (peşin alış iadesi) kapalıydı → kalan P1: banka virman+HAVALE, ekstre dönem-öncesi Devir.

### 11.1 V2-VIR — Banka virman + HAVALE

| Katman | Değişiklik |
|--------|------------|
| `cashTransactionTypes.ts` | `HAVALE` / `EFT` kanonik tipler + etiket |
| `cashApi.createBankVirman` | Kaynak −1 / hedef +1 `VIRMAN`; bakiyeler simetrik |
| `cashApi.createSimpleBankMovement` | `transactionType: HAVALE\|EFT` (sign −1) |
| `FinanceScreen` | Banka sekmesi: Giriş / Çıkış / Virman / Havale |
| Navigasyon | `bank-virman`, `havale` → banka form |

**Muhasebe:** Banka↔banka virman toplam banka bakiyesini değiştirmez; dış havale kaynak hesabı düşürür.

### 11.2 R11b — Ekstre Devreden satırı

`fetchCariExtract` → `fetchCariExtractOpeningNet`: aralık öncesi net; başa `definition=Devreden` (fiş no boş); running balance bu net ile başlar. Gerçek `opening_balance` fişi hâlâ **Devir**. Kaynak seçimi dönem sorgusu ile aynı (movements veya sales+CH_*).

### 11.3 Dosya haritası

| Dosya | Değişiklik |
|-------|------------|
| `mobile/src/api/cashApi.ts` | `createBankVirman`; HAVALE yazımı |
| `mobile/src/api/cashTransactionTypes.ts` | HAVALE / EFT |
| `mobile/src/screens/FinanceScreen.tsx` | Banka Virman/Havale UI |
| `mobile/src/api/reportsApi.ts` | R11b Devreden |
| `mobile/src/navigation/types.ts` | `formMode: 'havale'` |
| `mobile/src/config/menuConfig.ts` | virman / bank-virman / bank-havale |
| `mobile/src/screens/PosScreen.tsx` + `posUi` i18n | POS başlık/UI |
| `mobile/RONGTA_LAN.md` | LAN canlı kg sınırı |
| `mobile/AUDIT_ACCOUNTING_V2.md` | Bu bölüm |
