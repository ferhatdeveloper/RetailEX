# Caller ID — React Native (`mobile/`)

Web / DeskApp ile aynı `pg_bridge` bellek API’sini tüketir: `/api/caller_id/push|last|customer_context|customer_last`.

## Mimari

| Katman | Rol |
|--------|-----|
| **Producer** | Gelen arama → `POST …/api/caller_id/push` |
| **Bridge** | `npm run bridge` (port 3001) — son arayanı tutar |
| **Consumer (RN)** | `GET …/api/caller_id/last` poll + gelen arama banner |

## Expo Go vs EAS / dev client

| Ortam | Poll + banner | LAN bridge bulma | Telefon çağrı → push |
|-------|---------------|------------------|----------------------|
| **Expo Go** | Evet | Evet (`lanServerScan`) | Hayır — native modül yok |
| **EAS debug / preview / production** (`expo prebuild`) | Evet | Evet | Evet — `withCallerIdAndroid` + `CallStateReceiver` |
| **Ayrı APK** `android-callerid-bridge/` | — | mDNS + scan | Evet (SMS/WhatsApp dahil) |

- Expo Go ile geliştirirken: PC’de bridge açık olsun; isteğe bağlı olarak **android-callerid-bridge** APK’yı producer olarak kurun; RN uygulama yalnızca dinler.
- Yerleşik native push için: `npx expo prebuild --platform android` veya `npm run mobile:eas:debug` / CI Android release — plugin `READ_PHONE_STATE` ekler ve `RetailExCallerId` modülünü paketler.

## Ayarlar (uygulama)

**Sistem Yönetimi → Sanal santral (Caller ID)** (`SystemExtras` sekmesi):

- Mod: kapalı / sanal / fiziksel / seri (seri yalnız DeskApp)
- Poll URL (boş = `{bridge}/api/caller_id/last`)
- Aralık (sn), API token, cihaz adı
- **Ağda PC / bridge bul** — mevcut LAN taraması
- Test poll / test push

Yerel kayıt: AsyncStorage `retailex_mobile_caller_id_config`. Config kaydı native SharedPreferences’a da senkronlanır (EAS build’de).

## UI

Oturum açıkken `CallerIdHost` poll eder; yeni numarada üst banner:

- Restoran (sipariş sekmesi + telefon)
- Güzellik (randevu formu prefill)
- Cari ara / aç
- POS

Eşleşen müşteri bridge’e `customer_context` ile yazılır (kurye köprüsü ile uyumlu).

## Kaynak dosyalar

- `src/api/callerIdApi.ts` — poll / push / müşteri eşleştirme
- `src/hooks/useCallerIdPoll.ts` — periyodik dinleme
- `src/components/CallerIdHost.tsx` + `CallerIdIncomingBanner.tsx`
- `plugins/withCallerIdAndroid.js` + `native-modules/caller-id/android/*`
- Ayrı producer: `../android-callerid-bridge/README.md`
