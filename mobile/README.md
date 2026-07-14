# RetailEX Native Mobile (React Native + Expo)

Bu klasör **gerçek native** React Native uygulamasıdır (View / Text / FlatList / React Navigation).

- **WebView / Capacitor / Cordova yok** — mevcut Vite SPA buraya yüklenmez.
- Mevcut Capacitor uygulaması (`android/` kökte) **ayrı** kalır; yeni native RN = **`mobile/`**.

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

## Görsel dil

Web Login / Dashboard / ManagementModule ile uyumlu: mavi gradient header, hızlı erişim grid, dark mode (`themeStore`).

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

Kök: `mobile:start`, `mobile:android`, `mobile:ios`, `mobile:typecheck`.

## Mimari

```
mobile/
  TODO_RN_MIGRATION.md   # kalıcı migrasyon todo
  App.tsx
  src/
    api/                 # pgClient, products, customers, invoices, pos, …
    config/menuConfig.ts # web menü eşlemesi
    screens/             # Login… + Detail + POS + raporlar
    navigation/          # Auth → MainStack (Tabs + deep stack)
```

## Sonraki (Faz 2+)

1. Fatura / cari oluşturma formları  
2. WMS sayım fişi yazma  
3. Restoran adisyon kalem  
4. Güzellik randevu CRUD  
5. Cari ekstre / mizan özel SQL  
6. EAS Build  

## Blocker notları

- **Windows:** iOS yok; Android + Expo Go.
- Capacitor `android/` silinmez; iki mobil yüzey yan yana.
