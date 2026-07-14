# TEST SMOKE — Faturalar

**Modül:** Faturalar (satış / alış / iade listesi + detay)  
**Ekran:** `InvoicesScreen`, `InvoiceDetailScreen`, `InvoiceFormScreen`  
**API:** `mobile/src/api/invoicesApi.ts`  
**Menü id:** `salesinvoice` / satın alma eşlemeleri

## Önkoşul

- Bridge + firma/dönem
- `rex_{firm}_{period}_sales` (+ `sale_items`) mevcut

## API birim smoke (bridge)

`node scripts/test/mobile-module-api-smoke.mjs`

| # | Kontrol | Eşdeğer | Beklenen |
|---|---------|---------|----------|
| 1 | `fetchInvoices` | `SELECT fiche_no, customer_name, net… FROM sales` | 200 |
| 2 | Kalemler | `SELECT COUNT(*) FROM sale_items` | 200 |
| 3 | Dosyalar | `InvoicesScreen.tsx`, `invoicesApi.ts` | var |

## Manuel UI checklist

| # | Adım | Geçti / Kaldı |
|---|------|---------------|
| 1 | Faturalar listesi dolar / boş durumda net mesaj | |
| 2 | Satır → detay + kalemler | |
| 3 | Filtre (satış/alış/iade) anlamlı | |
| 4 | Yeni fatura formu (varsa) zorunlu alanlar | |

## Geçti / Kaldı

- **GEÇTİ:** liste sorgusu hatasız; detay kalemleri yüklenir
- **KALDI:** tablo/kolon hatası veya boş ekranda crash
