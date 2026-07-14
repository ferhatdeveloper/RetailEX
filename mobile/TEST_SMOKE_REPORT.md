# RetailEX Mobile - TEST SMOKE REPORT

**Tarih:** 2026-07-14 (TEST wave)  
**Kök:** `mobile/` (Expo / React Native)  
**Sürüm (mobile package):** 0.1.227  
**Commit:** yok (rapor yalnızca)

## Özet

| # | Kontrol | Sonuç | Not |
|---|---------|--------|-----|
| 1 | `npm run typecheck` (`tsc --noEmit`) | **GEÇTİ** | Exit 0 |
| 2 | `npx expo export --platform android` | **GEÇTİ** | Exit 0; `.tmp-smoke-export` 19 dosya |
| 2b | adb / logcat ReactNativeJS | **ATLANDI** | `adb` PATH’te yok / cihaz yok |
| 3 | Modül API smoke (`mobile-module-api-smoke.mjs`) | **KALDI** | Terazi `rongta/test` 404; diğerleri GEÇTİ |
| 4 | Bridge `:3001/api/status` | **GEÇTİ** | 200 + RUNNING |

**Genel duman sonucu: KALDI** — typecheck + export + bridge GEÇTİ; modül API’de yalnızca Terazi route düştü.

---

## 1. Typecheck — GEÇTİ

```
> mobile@0.1.227 typecheck
> tsc --noEmit
EXIT:0
```

---

## 2. Expo export / cihaz smoke

### 2a. `npx expo export --platform android` — GEÇTİ

- Exit: **0**
- Bundle: `index.ts` **2922** modules → Hermes `.hbc` (~5.6 MB)
- Örnek: `.tmp-smoke-export/_expo/static/js/android/index-6ec3349d9aaaa3584fc10b81d64fe84b.hbc`
- Çıktı: `.tmp-smoke-export` (**19** dosya: assets + `metadata.json` + android hbc)

### 2b. adb logcat — ATLANDI

- `adb` bulunamadı (PATH)
- ReactNativeJS logcat yapılmadı

---

## 3. Modül API smoke — KALDI

```
node scripts/test/mobile-module-api-smoke.mjs
→ EXIT 1
```

| Modül | Sonuç |
|-------|--------|
| infra | GEÇTİ |
| POS | GEÇTİ |
| Faturalar | GEÇTİ |
| Cari | GEÇTİ |
| WMS | GEÇTİ |
| Restoran | GEÇTİ (2 atlandı — şema yok) |
| Güzellik | GEÇTİ (3 atlandı — şema yok) |
| Finans | GEÇTİ |
| Terazi | **KALDI** (`POST /api/scale/rongta/test` → 404) |
| Raporlar | GEÇTİ |

Ayrıntı: [TEST_MODULE_REPORT.md](./TEST_MODULE_REPORT.md)

---

## 4. Bridge smoke — GEÇTİ

```http
GET http://127.0.0.1:3001/api/status
→ 200 {"status":"RUNNING","version":"1.0.0","service":"PostgreSQL Bridge"}
```

TCP `:3001` açık. Kök `/` ve `/api/health` 404 (beklenen; status yolu `/api/status`).

---

## Geçti / Kaldı özeti

- **GEÇTİ:** typecheck, expo export, bridge `/api/status`, modül API (infra–Raporlar; Restoran/Güzellik şema ATLANDI)
- **KALDI:** Terazi bridge `rongta/test` route (404)
- **ATLANDI:** adb logcat
- **Commit:** yok (istek üzerine)
