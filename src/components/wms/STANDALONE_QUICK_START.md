# ğŸ¢ WMS Module - Standalone Quick Start

## ⚡ **HIZLI BAŞLANGIÇ (3 Adım)**

### **1. Kopyala**
```bash
# WMS klasörünü istediğin yere kopyala
cp -r warehouse-management/ /hedef/dizin/wms/
cd /hedef/dizin/wms/
```

### **2. Install**
```bash
npm install
```

### **3. Çalıştır**
```bash
npm start
```

**Tarayıcı otomatik açılacak:** `http://localhost:3000` ✅

---

## ğŸŒ **ÇOK DİLLİ DESTEK**

WMS **4 dil** destekler:

- ğŸ‡¹ğŸ‡· **Türkçe** (Varsayılan)
- ğŸ‡¬ğŸ‡§ **English**
- ğŸ‡®ğŸ‡¶ **العربية** (Arapça - RTL desteği)
- ğŸŸ¥ğŸŸ© **کوردی** (Kürtçe Sorani - RTL desteği)

**Dil değiştirme:** Header'daki bayrak ikonuna tıkla!

**RTL Desteği:** Arapça ve Kürtçe Sorani seçildiğinde otomatik sağdan sola düzen aktif olur!

---

## ğŸ¯ **BU KADAR!**

WMS modülü artık standalone çalışıyor! ğŸ‰

---

## ğŸ“ **KLASÖR YAPISI**

```
wms/
├── components/           # 25 WMS modülü
├── utils/                # Utilities
├── styles/               # CSS
├── package.json          # Dependencies
├── vite.config.ts        # Vite config
├── tsconfig.json         # TypeScript config
├── index.html            # HTML entry
├── main.tsx              # React entry
└── index.tsx             # WMS component
```

---

## ğŸ”§ **KOMUTLARı**

```bash
# Development server
npm start          # veya npm run dev

# Production build
npm run build

# Preview build
npm run preview
```

---

## ğŸŒ **SUPABASE BAĞLANTISI**

**Dosya:** `utils/supabase/info.tsx`

```typescript
export const projectId = "YOUR_PROJECT_ID";
export const publicAnonKey = "YOUR_ANON_KEY";
```

**Varsayılan:** Demo Supabase instance (çalışır durumda) ✅

---

## ğŸ“¦ **DEPENDENCIES**

Auto-install edilecek:

- ✅ `react` - React 18
- ✅ `react-dom` - React DOM
- ✅ `lucide-react` - Icons
- ✅ `motion` - Animations
- ✅ `@supabase/supabase-js` - Backend
- ✅ `vite` - Build tool
- ✅ `typescript` - Type safety
- ✅ `tailwindcss` - Styling

---

## ğŸ¨ **ÖZELLEŞTİRME**

### **Dark Mode Aktif Et:**

**Dosya:** `main.tsx`

```typescript
<WarehouseManagement 
  darkMode={true}  // ✅ Dark mode
  onClose={() => console.log('Closed')}
/>
```

### **Port Değiştir:**

**Dosya:** `vite.config.ts`

```typescript
server: {
  port: 5000,  // İstediğin port
}
```

---

## ğŸ” **MODÜLLER (25)**

Dashboard, Mal Kabul, İade, Sevkiyat, Transfer, Sayım, Stok Sorgulama, Çoklu Depo, Raf Yönetimi, Kalite Kontrol, Araç Yükleme, Sipariş Bölme, Satış Hızı, Kar-Zarar, Performans, Live TV, Raporlama, Otomatik Sipariş, Fiyatlandırma, Personel, GPS Tracking Enhanced, Uyarılar, Görevler, Metrikler, Bildirimler

---

## ğŸ†˜ **SORUN GİDERME**

### **1. npm install hatası**

```bash
# Node.js versiyonu kontrol et (18+ gerekli)
node -v

# npm cache temizle
npm cache clean --force
npm install
```

### **2. Port zaten kullanımda**

```bash
# Port değiştir (vite.config.ts)
server: { port: 3001 }
```

### **3. CSS yüklenmiyor**

```bash
# Vite cache temizle
rm -rf .vite node_modules
npm install
npm start
```

### **4. Supabase bağlantı hatası**

```typescript
// utils/supabase/info.tsx kontrol et
export const projectId = "DOĞRU_ID";
```

---

## ğŸ“š **DETAYLI DOKÜMANTASYON**

- **README.md** - Tam dokümantasyon
- **INTEGRATION_GUIDE.md** - Entegrasyon rehberi
- **MODULE_INFO.md** - Modül API referansı
- **PORTABLE_DEPLOYMENT.md** - Portable deployment

---

## ✅ **TEST ET**

```bash
# 1. Install
npm install

# 2. Start
npm start

# 3. Tarayıcıda aç
# http://localhost:3000

# 4. Dashboard göreceksin! ✅
```

---

## ğŸ‰ **BAŞARILI!**

WMS modülü standalone çalışıyor!

- ✅ npm start → Çalışıyor
- ✅ 25 modül aktif
- ✅ Dark mode destekli
- ✅ Responsive
- ✅ TypeScript
- ✅ Supabase entegre

---

**Made with ❤️ by ExRetailOS Team**

**Version:** 2.0.0  
**Son Güncelleme:** 28 Aralık 2024
