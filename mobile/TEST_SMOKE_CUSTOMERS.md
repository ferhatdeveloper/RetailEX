# TEST SMOKE — Cari

**Modül:** Cariler (müşteri kartı)  
**Ekran:** `CustomersScreen`, `CustomerDetailScreen`, `CustomerFormScreen`  
**API:** `mobile/src/api/customersApi.ts` (+ bakiye `accountBalance.ts`)  
**Menü:** `suppliers` / cariler hızlı erişim

## Önkoşul

- Bridge; `rex_{firm}_customers`
- Hybrid: offline snapshot; online politika cache’siz

## API birim smoke (bridge)

| # | Kontrol | Eşdeğer | Beklenen |
|---|---------|---------|----------|
| 1 | `fetchCustomers` | aktif cariler LIMIT 10 | 200 |
| 2 | Dosyalar | `CustomersScreen.tsx`, `customersApi.ts` | var |

İsteğe: `fetchCustomerById` — listedeki ilk `id` ile detay SELECT.

## Manuel UI checklist

| # | Adım | Geçti / Kaldı |
|---|------|---------------|
| 1 | Cari listesi + arama | |
| 2 | Detay: bakiye / iletişim | |
| 3 | Son faturalar (varsa) | |
| 4 | Yeni/düzenle (hybrid kuyruk) | |

## Geçti / Kaldı

- **GEÇTİ:** liste SQL OK; detay açılır
- **KALDI:** customers tablosu / kolon uyumsuzluğu
