# RetailEX Native Mobile (React Native + Expo)

Bu klasör **gerçek native** React Native uygulamasıdır (View / Text / FlatList / React Navigation).

- **WebView / Capacitor / Cordova yok** — mevcut Vite SPA buraya yüklenmez.
- Kök Capacitor `android/` **kaldırıldı / legacy**; RetailEX mobil hedefi yalnızca **`mobile/`**.
- Android CI (varsayılan dağıtım): kökte `npm run android:ci:build` → `.github/workflows/android-release.yml` (tag `android-v{version}`) → **debug APK**.
- EAS Build (isteğe bağlı / store yolu): [`eas.json`](./eas.json) + aşağıdaki [EAS Build](#eas-build) bölümü.

## Migrasyon durumu

Kalıcı checklist ve faz planı:

**→ [`TODO_RN_MIGRATION.md`](./TODO_RN_MIGRATION.md)**  
**→ [`EAS_CHECKLIST.md`](./EAS_CHECKLIST.md)** (store / EAS production hazırlık)

Modül smoke / geçti-kaldı: **[`TEST_MODULE_REPORT.md`](./TEST_MODULE_REPORT.md)**  
API birim smoke: kökte `node scripts/test/mobile-module-api-smoke.mjs`

| Sembol | Anlam |
|--------|--------|
| `[x]` Canlı | API + anlamlı native UI |
| `[~]` Kısmi | Liste / Module host / okuma |
| `[ ]` Bekliyor | Form CRUD veya derin özellik |

Menü grupları web `src/config/staticMenuConfig.ts` + POS/WMS/Restoran/Güzellik ile hizalı (`src/config/menuConfig.ts`).

## Canlı modüller (API / pg_bridge)

| Modül | Durum | Not |
|-------|--------|-----|
| Dashboard KPI + tam menü | **Canlı** | Bugün ciro/fiş/kritik stok/ürün/cari + tüm menü grupları |
| Ürünler | **Canlı** | Liste + **ürün detay** |
| Cariler | **Canlı** | Liste + **cari detay** + son faturalar |
| Faturalar | **Canlı** | Liste + **fatura detay** (kalemler) |
| POS | **Canlı** | Sepet + **fiş kaydı** (`sales` + `sale_items` + stok) |
| Raporlar | **Canlı** | Hub + günlük satış + kritik stok + menü eşlemesi |
| WMS / Depo | **Canlı** | Stok özeti + liste |
| Restoran | **Canlı (liste)** | Masalar + açık adisyon |
| Güzellik | **Canlı (liste)** | Randevu / hizmet / uzman |
| Diğer menü yaprakları | **Module host** | Alt menü veya ilgili canlı kısayol — boş ekran yok |

## Auth / API taşıma (PostgREST-first)

Config `apiMode` = **postgrest** veya **hybrid** (+ `remoteRestUrl`) iken giriş web ile aynı sırayı izler:

1. PostgREST `POST /rpc/verify_login` (schema `logic`)
2. Başarısızsa bridge SQL `logic.verify_login`
3. Sonra `public.users` + `crypt` fallback

Firma listesi: önce PostgREST `GET /firms`, sonra SQL. Salt **postgrest** modunda köprü zorunlu değildir — Config’te PostgREST bağlantı testi yeterlidir.

## Görsel dil ve i18n

Web Login / Dashboard ile uyumlu: mavi gradient header, hızlı erişim grid.

- **Tema:** Light/Dark — `themeStore` + AsyncStorage (`retailex_mobile_theme`); Login ve **Diğer** ayarlarından.
- **Dil:** `tr` / `en` / `ar` / `ku` (web ile aynı) — `languageStore` (`retailex_mobile_language`); `ar`/`ku` için `I18nManager` RTL.
- Giriş noktaları: Login header (dil döngüsü + tema) ve tab **Diğer** → Ayarlar.

## Gereksinimler

- Node 20+ (önerilen 22)
- Android Studio (emülatör) ve/veya fiziksel cihaz
- iOS: **yalnızca macOS + Xcode**
- Yerel geliştirmede: kökte `npm run bridge` (güncel Node pg_bridge; varsayılan port **3001**)
- **Terazi / scale (`/api/scale/*`):** güncel Node bridge gerekir. Windows’ta eski `RetailEX_SQL_Bridge` hâlâ **3001**’deyse scale route’ları yoktur — köke `BRIDGE_PORT=3002 npm run bridge` (PowerShell: `$env:BRIDGE_PORT=3002; npm run bridge`), mobilde Config / `EXPO_PUBLIC_BRIDGE_PORT=3002`.

## Kurulum / test

```bash
cd mobile
npm install
cp .env.example .env   # isteğe bağlı
npx expo start -c
```

- **Android:** `a` veya `npm run android`
- **iOS (Mac):** `i` veya `npm run ios`
- Expo Go ile QR kod

### Android emülatör + pg_bridge

Emülatörde host = **`10.0.2.2`**, port bridge ile aynı (`3001` veya scale için `3002` — yukarıdaki not). Fiziksel cihazda Bridge host = PC **LAN IP**.

## Terazi BLE (development build)

`react-native-ble-plx` **Expo Go’da çalışmaz** (native modül). Canlı BLE kg / tarama için **development build** gerekir.

| Adım | Komut / not |
|------|-------------|
| 1. Bağımlılık | `cd mobile && npx expo install react-native-ble-plx` (kurulu) |
| 2. Plugin | `app.json` → `plugins`: `react-native-ble-plx` (BT izin metni dahil) |
| 3. Native üret | `npx expo prebuild` *(veya EAS native build)* |
| 4. Cihaza kur | `npx expo run:android` **fiziksel cihaz** (emülatörde Bluetooth yok) |
| 5. Metro | `npx expo start --dev-client` |

- **TCP/LAN Rongta** (etiket terazisi): Expo Go → `pg_bridge`; development build → önce **doğrudan TCP** (`react-native-tcp-socket`), sonra köprü. LAN tarama, PLU, `clearPlu` (operate=D), satış raporu. Canlı kg LAN’da yok — [`RONGTA_LAN.md`](./RONGTA_LAN.md).
- **BLE tartı**: Terazi Yönetimi → Cihazlar → BLE → **BLE Tara** → cihaz ekle → Terazi sekmesinde canlı kg; Tartılı Satış’ta “simüle tercih” kapalıyken poll.
- **Classic SPP / USB-OTG**: SPP (`react-native-bluetooth-classic` opsiyonel) + USB native probe (`usbSerialScale`); Expo Go’da yok. Hotkey/.scr dosya indirme Windows TeraziRongta DLL / Android JAR sınırı (dürüst UI).

## Yazıcı — ağ ESC/POS TCP

«Ağ (IP)» termal yazıcılar için ham ESC/POS (varsayılan port **9100**). DeskApp `print_escpos_tcp` ile aynı mantık.

| Yol | Ne zaman | Gereksinim |
|-----|----------|------------|
| **pg_bridge köprüsü** | Expo Go, emülatör, fiziksel cihaz | PC’de `npm run bridge`; Config → Bridge host = PC LAN IP (emülatör `10.0.2.2`) |
| **Doğrudan TCP** | Telefon ve yazıcı aynı Wi‑Fi | Development build + `npx expo install react-native-tcp-socket` |

- Test: **Diğer** → Yazıcı / Fiş Ayarları → **Test yazdır**
- POS otomatik yazdır: ayarlarda «Otomatik yazdır» + «Ağ (IP)»
- Köprü uç noktası: `POST /api/printer/escpos-tcp` (`host`, `port`, `dataB64`)
- **Faz 2+:** Bluetooth (`react-native-bluetooth-escpos-printer`), sistem (`expo-print` + paylaşım)

## Scriptler

| Komut | Açıklama |
|-------|----------|
| `npm start` / `npx expo start` | Metro |
| `npm run android` / `ios` | Platform |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run eas:check` | EAS hazırlık doğrulama |
| `npm run eas:init` | Expo projesi bağla (`projectId`) |
| `npm run eas:preview` / `eas:production` | EAS bulut derleme |

Kök: `mobile:start`, `mobile:android`, `mobile:ios`, `mobile:typecheck`, `mobile:sync-version`, `mobile:eas:check|init|debug|preview|production`, `android:ci:build`.

EAS checklist: [`EAS_CHECKLIST.md`](./EAS_CHECKLIST.md)

## EAS Build

Expo Application Services ile bulut derleme. Sürüm kaynağı **yerel** (`eas.json` → `cli.appVersionSource: "local"`); semver kök `package.json` + `npm run mobile:sync-version` ile hizalanır (`app.json` / `versionCode` / `buildNumber`).

### CI vs EAS (Android)

| Yol | Komut / tetik | Çıktı | İmza |
|-----|----------------|-------|------|
| **GitHub Actions (varsayılan)** | `npm run android:ci:build` veya tag `android-v{version}` | `RetailEX-Android-{version}.apk` (debug) | Debug keystore |
| **EAS `debug`** | `npm run mobile:eas:debug` | APK (`assembleDebug`) | Credentials gerekmez (`withoutCredentials`) |
| **EAS `preview`** | `npm run mobile:eas:preview` | Dahili dağıtım **APK** | EAS yönetimli keystore |
| **EAS `production`** | `npm run mobile:eas:production` | Play **AAB** | EAS / store credentials |

Günlük / Actions tabanlı APK için **CI yeterlidir**. Store öncesi veya dahili imzalı APK için **EAS `preview` / `production`**.

### İlk kurulum (bir kez) — login kullanıcı adımı

```bash
cd mobile
npm install
npx eas-cli@latest login          # KULLANICI (ajan otomatik edemez)
npx eas-cli@latest whoami         # kullanıcı adını görmeli
npm run mobile:eas:init           # kökten; app.json → extra.eas.projectId
# headless / CI (login veya EXPO_TOKEN sonrası):
# npm run mobile:eas:init -- --non-interactive [--force]
npm run mobile:eas:check          # hazırlık + whoami
```

- `projectId` **uydurulmaz**; yalnızca `eas init` yazar (`extra.retailexEasNotes`).
- Non-interactive: `eas init [--id UUID] [--force] [--non-interactive]` — [EAS CLI](https://docs.expo.dev/eas/cli/#eas-init).
- `EXPO_TOKEN` headless/CI için; yerelde `eas login` yeterli.
- Opsiyonel Play submit: `.github/workflows/android-play-submit.yml` — secrets `EXPO_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON` (**JSON commit yasak**).
- Checklist: [`EAS_CHECKLIST.md`](./EAS_CHECKLIST.md) · [`PLAY_SUBMIT.md`](./PLAY_SUBMIT.md)
- Play Submit (internal track, secrets): [`PLAY_SUBMIT.md`](./PLAY_SUBMIT.md) · `npm run mobile:eas:submit`

### Derleme örnekleri

```bash
npm run mobile:sync-version    # build öncesi sürüm (eas-mobile-build içinde otomatik)

npm run mobile:eas:debug       # CI benzeri debug APK
npm run mobile:eas:preview     # dahili imzalı APK
npm run mobile:eas:production  # Play Store AAB
```

iOS: `debug` → simulator; `preview` / `production` → cihaz/store (Apple Developer gerekir).

### Notlar

- Profil tanımları: [`eas.json`](./eas.json) (`debug` | `preview` | `production`).
- Node **22** (GHA ile aynı major).
- Capacitor / kök `android/` yok — yalnızca Expo prebuild (`mobile/`).
- Resmi referans: [EAS Build setup](https://docs.expo.dev/build/setup/), [eas.json](https://docs.expo.dev/eas/json/).

## Mimari

```
mobile/
  TODO_RN_MIGRATION.md   # kalıcı migrasyon todo
  App.tsx
  src/
    api/                 # pgClient, products, customers, invoices, pos, …
    offline/             # NetInfo hybrid: snapshot cache, mutation queue, HYBRID_POLICY.md
    config/menuConfig.ts # web menü eşlemesi
    screens/             # Login… + Detail + POS + raporlar
    navigation/          # Auth → MainStack (Tabs + deep stack)
```

### Online / Offline / Hybrid

- **`dbMode`** (`local` | `online`): canlı sorguda hangi PG ucu (web Login ile aynı).
- **`networkPolicy`** (`online` | `offline` | `hybrid`, varsayılan hybrid): NetInfo + cache.
- Cache: ürün / cari son liste snapshot (`AsyncStorage`).
- Kuyruk: cari create/update (offline); net açılınca flush.
- UI rozet: `ScreenHeader`, Dashboard, Config, Diğer.
- Ayrıntı: [`src/offline/HYBRID_POLICY.md`](./src/offline/HYBRID_POLICY.md)

## Sonraki (Faz 2+)

1. Fatura formu derinliği / diğer mutasyon kuyrukları  
2. Restoran ödeme / güzellik POS  
3. EAS: `npm run mobile:eas:init` + ilk `preview`/`production` build — yapılandırma hazır; bkz. [`EAS_CHECKLIST.md`](./EAS_CHECKLIST.md)  

## Blocker notları

- **Windows:** iOS yok; Android + Expo Go.
- Capacitor `android/` silinmez; iki mobil yüzey yan yana.
