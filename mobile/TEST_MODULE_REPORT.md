# RetailEX Mobile — TEST_MODULE_REPORT

**Tarih:** 2026-07-14 (TEST wave)  
**Kapsam:** POS, Faturalar, Cari, WMS, Restoran, Güzellik, Finans, Terazi, Raporlar  
**Ortam:** bridge `http://127.0.0.1:3001` + `config.db` → **lovan** (firm `002` / dönem `01`)  
**Commit:** yok (yalnızca test + doküman)

## Özet tablo

| Modül | Doküman | API smoke | Typecheck* | Genel |
|-------|---------|-----------|------------|-------|
| Altyapı (bridge/PG) | — | **GEÇTİ** | — | **GEÇTİ** |
| POS | [TEST_SMOKE_POS.md](./TEST_SMOKE_POS.md) | **GEÇTİ** | — | **GEÇTİ** |
| Faturalar | [TEST_SMOKE_INVOICES.md](./TEST_SMOKE_INVOICES.md) | **GEÇTİ** | — | **GEÇTİ** |
| Cari | [TEST_SMOKE_CUSTOMERS.md](./TEST_SMOKE_CUSTOMERS.md) | **GEÇTİ** | — | **GEÇTİ** |
| WMS | [TEST_SMOKE_WMS.md](./TEST_SMOKE_WMS.md) | **GEÇTİ** | — | **GEÇTİ** |
| Restoran | [TEST_SMOKE_RESTAURANT.md](./TEST_SMOKE_RESTAURANT.md) | **GEÇTİ** (şema ATLANDI) | — | **GEÇTİ** / kısmi |
| Güzellik | [TEST_SMOKE_BEAUTY.md](./TEST_SMOKE_BEAUTY.md) | **GEÇTİ** (şema ATLANDI) | — | **GEÇTİ** / kısmi |
| Finans | [TEST_SMOKE_FINANCE.md](./TEST_SMOKE_FINANCE.md) | **GEÇTİ** | — | **GEÇTİ** |
| Terazi | [TEST_SMOKE_SCALE.md](./TEST_SMOKE_SCALE.md) | **KALDI** | — | **KALDI** |
| Raporlar | [TEST_SMOKE_REPORTS.md](./TEST_SMOKE_REPORTS.md) | **GEÇTİ** | — | **GEÇTİ** |
| `npm run typecheck` | — | — | **GEÇTİ** | **GEÇTİ** |

\*Typecheck tüm `mobile/` için tek koşu; modül bazlı değil.

**Genel duman sonucu: KALDI** — yalnızca Terazi `POST /api/scale/rongta/test` → HTTP 404. Typecheck bu dalgada **GEÇTİ**.

---

## Nasıl tekrarlanır

```bash
# Repo kökü
node scripts/test/mobile-module-api-smoke.mjs

# Typecheck
cd mobile && npm run typecheck
```

İsteğe bağlı: `FIRM_NR=001 PERIOD_NR=01 BRIDGE_URL=http://127.0.0.1:3001`

---

## API smoke ayrıntı (bridge)

Komut: `node scripts/test/mobile-module-api-smoke.mjs`  
Exit: **1** (Terazi KALDI)

| Modül | Geçti | Kaldı | Atlandı | Not |
|-------|------:|------:|--------:|-----|
| infra | 4 | 0 | 0 | status RUNNING; lovan PG OK; firm=002 period=01 |
| POS | 4 | 0 | 0 | ürün 5 satır; sales 0 satır OK |
| Faturalar | 4 | 0 | 0 | sales + sale_items SELECT OK |
| Cari | 3 | 0 | 0 | 10 cari |
| WMS | 4 | 0 | 0 | stok + özet OK |
| Restoran | 2 | 0 | 2 | `rex_002_rest_*` yok |
| Güzellik | 2 | 0 | 3 | `rex_002_beauty_*` yok |
| Finans | 5 | 0 | 0 | kasa 1 satır |
| Terazi | 3 | 1 | 0 | products OK; **`POST /api/scale/rongta/test` → 404** |
| Raporlar | 4 | 0 | 0 | günlük satış + kritik stok OK |

### Terazi KALDI kök neden

- Çalışan bridge süreci `/api/scale/rongta/test` için **404** döndü.
- Kaynak kodda route tanımlı: `src/services/pg_bridge.ts` (`app.post('/api/scale/rongta/test', …)`).
- Muhtemel: **eski bridge süreci** (yeniden başlatılmamış) veya farklı entrypoint.
- Ölçüm: ürün SQL (`is_scale_product`) GEÇTİ; ekran/API dosyaları GEÇTİ.

### Restoran / Güzellik ATLANDI

Kiracı `lovan` firm `002` altında ilgili tablolar yok. Mobil API `tryQueries` ile boş liste döner — uygulama crash beklemez. Şema yüklendiğinde smoke tekrarlanmalı.

---

## Typecheck — GEÇTİ

```
cd mobile && npm run typecheck
→ EXIT 0
> mobile@0.1.227 typecheck
> tsc --noEmit
```

Önceki dalgadaki tip hataları bu ağaçta giderilmiş; `tsc --noEmit` temiz.

---

## Doküman indeksi

| Dosya | Konu |
|-------|------|
| [TEST_SMOKE_POS.md](./TEST_SMOKE_POS.md) | POS |
| [TEST_SMOKE_INVOICES.md](./TEST_SMOKE_INVOICES.md) | Faturalar |
| [TEST_SMOKE_CUSTOMERS.md](./TEST_SMOKE_CUSTOMERS.md) | Cari |
| [TEST_SMOKE_WMS.md](./TEST_SMOKE_WMS.md) | WMS |
| [TEST_SMOKE_RESTAURANT.md](./TEST_SMOKE_RESTAURANT.md) | Restoran |
| [TEST_SMOKE_BEAUTY.md](./TEST_SMOKE_BEAUTY.md) | Güzellik |
| [TEST_SMOKE_FINANCE.md](./TEST_SMOKE_FINANCE.md) | Finans |
| [TEST_SMOKE_SCALE.md](./TEST_SMOKE_SCALE.md) | Terazi |
| [TEST_SMOKE_REPORTS.md](./TEST_SMOKE_REPORTS.md) | Raporlar |
| [TEST_SMOKE_REPORT.md](./TEST_SMOKE_REPORT.md) | Genel Metro/export duman |
| `scripts/test/mobile-module-api-smoke.mjs` | Tek komutla API smoke |

---

## Sonraki adımlar (commit yok)

1. Bridge’i güncel `pg_bridge.ts` ile yeniden başlat → Terazi route smoke tekrar.
2. Lovan’da rest/beauty şeması isteniyorsa migration; yoksa ATLANDI kabul.
