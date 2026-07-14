# RetailEX Native Mobile (React Native + Expo)

Bu klasör **gerçek native** React Native uygulamasıdır (View / Text / FlatList / React Navigation).

- **WebView / Capacitor / Cordova yok** — mevcut Vite SPA buraya yüklenmez.
- Kök Capacitor `android/` **kaldırıldı / legacy**; RetailEX mobil hedefi yalnızca **`mobile/`**.
- Android CI: kökte `npm run android:ci:build` → `.github/workflows/android-release.yml` (tag `android-v{version}`).

## Migrasyon durumu

Kalıcı checklist ve faz planı:

**→ [`TODO_RN_MIGRATION.md`](./TODO_RN_MIGRATION.md)**

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

## Görsel dil ve i18n

Web Login / Dashboard ile uyumlu: mavi gradient header, hızlı erişim grid.

- **Tema:** Light/Dark — `themeStore` + AsyncStorage (`retailex_mobile_theme`); Login ve **Diğer** ayarlarından.
- **Dil:** `tr` / `en` / `ar` / `ku` (web ile aynı) — `languageStore` (`retailex_mobile_language`); `ar`/`ku` için `I18nManager` RTL.
- Giriş noktaları: Login header (dil döngüsü + tema) ve tab **Diğer** → Ayarlar.

## Gereksinimler

- Node 20+ (önerilen 22)
- Android Studio (emülatör) ve/veya fiziksel cihaz
- iOS: **yalnızca macOS + Xcode**
- Yerel geliştirmede: kökte `npm run bridge` (port **3001**)

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

Emülatörde host = **`10.0.2.2`**, port `3001`. Fiziksel cihazda Bridge host = PC **LAN IP**.

## Scriptler

| Komut | Açıklama |
|-------|----------|
| `npm start` / `npx expo start` | Metro |
| `npm run android` / `ios` | Platform |
| `npm run typecheck` | `tsc --noEmit` |

Kök: `mobile:start`, `mobile:android`, `mobile:ios`, `mobile:typecheck`, `mobile:sync-version`, `android:ci:build`.

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
3. EAS Build  

## Blocker notları

- **Windows:** iOS yok; Android + Expo Go.
- Capacitor `android/` silinmez; iki mobil yüzey yan yana.
