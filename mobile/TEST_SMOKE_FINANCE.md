# TEST SMOKE — Finans

**Modül:** Kasa / banka hareketleri + tanımlar  
**Ekran:** `FinanceScreen`, `FinanceDefinitionsScreen`, `CashCollectionScreen`  
**API:** `cashApi.ts` / `financeApi.ts` / `financeDefinitionsApi.ts`

## Önkoşul

- Bridge  
- `rex_{f}_cash_registers`, `rex_{f}_{p}_cash_lines` (banka opsiyonel)

## API birim smoke (bridge)

| # | Kontrol | Eşdeğer | Beklenen |
|---|---------|---------|----------|
| 1 | Kasa tanımları | `cash_registers` aktif | 200 |
| 2 | Kasa hareketleri | `cash_lines` LIMIT 10 | 200 veya ATLANDI |
| 3 | Banka hesapları | `bank_registers` | 200 veya ATLANDI |
| 4 | Dosyalar | `FinanceScreen.tsx`, `cashApi.ts` | var |

## Manuel UI checklist

| # | Adım | Geçti / Kaldı |
|---|------|---------------|
| 1 | Finans → kasa listesi / bakiye | |
| 2 | Hareket listesi | |
| 3 | Basit giriş-çıkış / cari tahsilat | |
| 4 | Banka sekmesi (varsa) | |

## Geçti / Kaldı

- **GEÇTİ:** en az kasa register SELECT OK  
- **KALDI:** cash_registers yok veya SELECT hata
