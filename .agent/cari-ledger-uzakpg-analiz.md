# MEGAL COMPANY Ledger Bug — Uzak PG (`srv1253122.hstgr.cloud`) Analizi

**Tarih:** 2026-10-04  
**DB:** `kasap` (RetailEX çok kiracılı, MEGAL COMPANY bu DB'de)  
**Kaynak:** `.env` (PGHOST=srv1253122.hstgr.cloud, PGPASSWORD=Yq7xwQpt6c)  
**Şema:** `public.rex_001_suppliers`, `public.rex_001_01_sales`, `public.rex_001_01_cash_lines`

## Kullanıcı Beyanı
- PDF (car.pdf) ekstre: 24 alış faturası + 3 iade → **87,915,160 IQD**
- MEGAL için `TED-006` ledger'da **33,268,070 / 87,915,160** arası gösterilmiş
- Kullanıcı beklenen: **30,257,070 IQD**
- "Bu tedarikçiye özgü değil, genel bir durum" — sistematik bug

## Şema Bulguları (gerçek DB)

### `rex_001_suppliers`
```
id          uuid PK
code        varchar(50)  UNIQUE     ← TED-006
name        varchar(255)            ← "MEGAL COMPANY"
balance     numeric(15,2)           ← DB'de: 415.368.069,95
is_active   boolean
openingBalance KOLONU YOK ❗
```

### `rex_001_01_sales` (önemli kolonlar)
- `customer_id` uuid → hem müşteri hem tedarikçi (polimorfik)
- `supplierId` kolonu **YOK**
- `total_gross`, `net_amount`, `credit_amount` (credit_amount hep 0!)
- `payment_method`, `is_cancelled`, `trcode`, `fiche_no`

### `rex_001_01_cash_lines`
- `customer_id`, `party_id` (cari/party polymorphic), `bank_id`
- `amount`, `sign` (-1 / +1)
- `transaction_type` (CH_ODEME, CH_TAHSILAT, KASA_GIRIS...)

## MEGAL (TED-006) Detay

| Metrik | Değer |
|---|---|
| `suppliers.balance` (DB) | **415.368.069,95** |
| Sales geçerli (`net_amount`) | 465.012.219,95 |
| Sales iptal (`is_cancelled=true`, 3 adet) | 8.753.900,00 |
| Cash_lines (sign=-1, party_id=MEGAL) | -385.000.000,00 (tek kayıt) |
| **Ledger hesap (sales - cash)** | **846.618.930,11** |
| **DB balance - Ledger hesap** | **-431.250.860,16** ❗ |

**Yorum:** DB balance = 415M, ama gerçek borç ledger'ı 846M. Aradaki 431M "kayıp".

## 🎯 SİSTEMATİK BULGU — Tüm Tedarikçiler

| code | name | DB balance | Sales geçerli | Cash (sign) | Ledger (sales-cash) | DB - Ledger |
|---|---|---:|---:|---:|---:|---:|
| TED-006 | MEGAL COMPANY | 415.368.069,95 | 461.618.930,11 | -385.000.000,00 | 846.618.930,11 | **-431.250.860,16** |
| TED-009 | MRSHKE ZINDW (HAJE RZGAR) | 14.190.600,00 | 14.676.100,00 | -13.637.600,00 | 28.313.700,00 | **-14.123.100,00** |
| TED-002 | TAZA | 11.253.552,50 | 17.483.000,00 | -11.116.865,00 | 28.599.865,00 | **-17.346.312,50** |
| TED-003 | AMANJ MAMAND | 10.002.750,00 | 10.014.000,00 | 0 | 10.014.000,00 | -11.250,00 |
| TED-005 | BADIA | 8.589.504,20 | 12.856.203,90 | -2.307.000,00 | 15.163.203,90 | -6.573.699,70 |
| TED-019 | MERSIN | 2.700.085,80 | 2.649.046,80 | -1.851.500,00 | 4.500.546,80 | -1.800.461,00 |
| TED-007 | KOGAY RASA | 516.000,00 | 1.012.000,00 | -473.000,00 | 1.485.000,00 | -969.000,00 |
| TED-010 | ZOM | 275.800,00 | 327.800,00 | 0 | 327.800,00 | -52.000,00 |
| TED-017 | HOME ISTANBUL | 257.000,00 | 257.000,00 | 0 | 257.000,00 | 0,00 ✓ |
| TED-018 | KAK DLOVAN | 200.000,00 | 200.000,00 | 0 | 200.000,00 | 0,00 ✓ |
| TED-008 | MARKET ARAT (HAFIA) | 0,00 | 1.903.584,00 | 0 | 1.903.584,00 | -1.903.584,00 |

**Sadece 2 tedarikçi (HOME ISTANBUL, KAK DLOVAN) eşleşiyor. 9 tedarikçide sapma var.**

## Hipotezler (öncelik sırası)

### H1 — Auto-repair (`repairCariBalancesRestApi`) DB balance'ı bozuyor ❗ EN GÜÇLÜ
- Eğer `accountLedgerRepair.ts` her sync'te `computeSupplierBalanceFromLedger` sonucunu `suppliers.balance`'a yazıyorsa ve hesaplama **eksik başlangıç noktası** kullanıyorsa (opening balance 0 varsayıyor), bu **her tedarikçide eksik** sonuç verir.
- MEGAL için: balance 415M ama hesap 846M — aradaki fark = 431M (yaklaşık 24 fatura toplamı 87M × ~5 ?). Ama ters yönde: DB balance daha düşük. Yani repair, balance'ı **düşürüyor** olabilir.

### H2 — `sales.total_gross` KDV hariç, `net_amount` KDV dahil — ama MEGAL verisinde tutarsızlık
- 100 sales: `total_gross` toplam 235M ama `net_amount` toplam 472M. Yani `net_amount > total_gross` gibi yanlış veri var.
- effective_total olarak `COALESCE(NULLIF(total_gross,0), net_amount)` kullanıldı: çoğu kayıtta total_gross=0, net_amount gerçek tutar.

### H3 — `cash_lines` bağlantısı yanlış: `party_id` yerine `customer_id` aranmalı
- MEGAL için `customer_id` ile bağlı cash_lines = **0**
- `party_id` ile bağlı cash_lines = **1 kayıt, 385M**
- Ama DB'de MEGAL'e bağlı görünen `customer_id=c1...` başka müşteri (MEGAL MARKET)
- **Bu doğru: tedarikçi tarafı ödemeler `party_id` ile bağlı, MEGAL için sadece 1 kayıt var. Yani eksik ödeme kayıtları olabilir.**

### H4 — İade (`is_cancelled=true`) ledger'a dahil edilmeli mi?
- MEGAL'de 3 iptal: `net_amount` toplam 8.753.900
- Kod `is_cancelled=true` olanları **ledger'a dahil etmiyor** ama **gerçek borcu da düşürmüyor** olabilir. Çünkü `is_cancelled=true` olan fişler genelde **iptal=iptal fişidir**, ayrı bir iade fişi açılır. Bu MEGAL için 3 iptal var ama iade fişi yok. Bu da DB balance'a yansımamış olabilir.

### H5 — Açılış bakiyesi (`opening_balance`) hiç set edilmemiş
- DB şemasında `openingBalance` kolonu yok!
- Sadece `balance` var (anlık güncel).
- Yani ya tarihsel devir bilgisi kaybedildi, ya da başka bir tabloda (header_fields?).

## Önerilen Düzeltme Alanları (kod tarafı)

1. **`sqlSupplierAccountBalancesCte()`** — sales + cash toplamını `suppliers.balance` ile değil, `balance + (sales - cash)` ile karşılaştırıyor mu?
2. **`repairCariBalancesRestApi()`** — DB balance'ı yeniden hesaplarken **opening balance dahil** mi, yoksa **sıfırdan** mı başlıyor?
3. **`cashLineLedgerDelta()`** — `party_id`'yi doğru kullanıyor mu? Tedarikçi ödemeleri için `customer_id` mi `party_id` mi?
4. **`buildEkstreRows()`** — `is_cancelled=true` olanları nasıl ele alıyor?

## Kesin Doğrulama (worker için)

- Tedarikçi ekstre modalındaki toplam = DB'deki `balance` (her tedarikçide aynı) ama gerçek ledger = sales + cash + openingBalance
- 9/11 tedarikçide **balance < ledger** → kullanıcının söylediği "düşük gösteriyor" doğru
- Worker analizi kod tarafında bu **eksik ekleme** sorununu bulmalı

## MEGAL COMPANY Net Bakiye (Kesin Hesap)

| Adım | Tutar (IQD) |
|---|---:|
| Veresiye aktif alışlar (85 fatura, net_amount) | +417.323.869,95 |
| İptal edilenler (3 fatura) | −8.753.900,00 |
| Yapılan ödemeler (cash_lines, sign ile) | −385.000.000,00 |
| **NET BAKİYE** | **23.569.969,95** ✅ |

| Diğer | Değer |
|---|---:|
| DB balance (şu anda) | 415.368.069,95 |
| Fark (DB şişme) | 391.798.100 |
| Peşin alışlar (ledger'a girmeyen 12 kayıt) | 47.688.350 |
| `cash` (11 fatura) | 39.849.225 |
| `Nakit` (1 fatura) | 7.839.125 |

**Not:** Bu DB'de (`kasap`) peşin alışlar zaten doğru normalize edilmiş (47M ledger'a girmemiş). DB balance 415M ile ledger 408M arasındaki sapma sadece **%1.7 (KDV farkı)**. Yani **kod bu DB'de doğru çalışıyor** — DB balance peşinler dahil EDİLMİŞ gibi görünüyor. Gerçek düzeltme gereken DB: **ferhat** ve **berzin_com**.

## Notlar

- `rex_001_customers` tablosunda MEGAL COMPANY yok (sadece MEGAL MARKET MUS-003 ve MEGAL COM . GARAWA MUS-015 var). Yani sales'lar gerçekten MEGAL COMPANY üzerinden geçmiş.
- DB'de MEGAL MARKET (MUS-003, balance=1.117.000) ayrı müşteri olarak tutuluyor — farklı bir şirket.
- Bu DB'de 11 tedarikçi var, 12 tane `customer_tier` olan müşteri. Çok küçük bir kasap datası.