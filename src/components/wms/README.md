# ğŸ­ ExRetailOS WMS - Enterprise Depo Yönetim Sistemi

> **✨ STANDALONE MOD AKTİF!** Bu modül artık bağımsız çalışır! → [STANDALONE_QUICK_START.md](./STANDALONE_QUICK_START.md)

## ⚡ **HIZLI BAŞLANGIÇ (3 Adım)**

```bash
# 1. Kopyala
cp -r warehouse-management/ /istedigin/yer/

# 2. Install
npm install

# 3. Çalıştır
npm start
```

**Tarayıcı otomatik açılır:** `http://localhost:3000` ✅

## ğŸŒ **4 DİL DESTEĞİ**

- ğŸ‡¹ğŸ‡· Türkçe
- ğŸ‡¬ğŸ‡§ English  
- ğŸ‡®ğŸ‡¶ العربية (RTL)
- ğŸŸ¥ğŸŸ© کوردی (Sorani - RTL)

---

## ğŸ“‹ Genel Bakış

ExRetailOS WMS, Irak pazarına özel olarak optimize edilmiş, enterprise seviyesinde tam donanımlı bir Depo Yönetim Sistemi (Warehouse Management System) modülüdür.

**Artık 2 şekilde kullanabilirsiniz:**
- ✅ **Standalone:** `npm start` → Direkt çalışır
- ✅ **Module:** ExRetailOS içinde import edilebilir

### ğŸ¯ Temel Özellikler

#### ✅ Tamamlanan Özellikler
- ✅ **Dashboard**: Real-time KPI'lar ve anlık durum takibi
- ✅ **Mal Kabul**: Gelen mal kayıtları ve kalite kontrol
- ✅ **Dark Mode**: Tam dark mode desteği
- ✅ **Responsive Design**: Mobil ve tablet uyumlu
- ✅ **Type-Safe**: Full TypeScript desteği
- ✅ **Turkish Decimal System**: 20.000,50 IQD formatı

#### ğŸš§ Geliştirme Aşamasında
- ğŸš§ **Mal Çıkış**: Sevkiyat ve picking işlemleri
- ğŸš§ **Transfer**: Depolar arası stok transferi
- ğŸš§ **Sayım**: Envanter ve döngüsel sayım
- ğŸš§ **Stok Yönetimi**: Ürün ve stok takibi
- ğŸš§ **Depo Haritası**: 3D görselleştirme ve navigasyon
- ğŸš§ **Raporlar**: Detaylı analiz ve raporlama
- ğŸš§ **Ayarlar**: Sistem yapılandırması

### ğŸ† Enterprise Özellikler (Yakında)

#### **Gelişmiş Stok Yönetimi**
- Multi-warehouse support (Çoklu depo desteği)
- Seri/Lot/Batch tracking (Seri/Lot/Parti takibi)
- Expiry date management (Son kullanma tarihi yönetimi)
- Min/Max stock levels (Min/Max stok seviyeleri)
- ABC/XYZ analysis (ABC/XYZ analizi)
- FIFO/LIFO/FEFO stratejileri

#### **İleri Seviye Operasyonlar**
- Barcode/QR code system (Barkod/QR kod sistemi)
- Mobile PDA support (Mobil PDA desteği)
- Picking optimization (Picking optimizasyonu)
- Wave picking (Dalga toplama)
- Cross-docking (Çapraz sevkiyat)
- Kitting operations (Paketleme operasyonları)
- Cycle counting (Döngüsel sayım)
- Put-away strategies (Yerleştirme stratejileri)

#### **Otomasyon & AI**
- Auto reorder suggestions (Otomatik sipariş önerileri)
- Smart bin allocation (Akıllı raf tahsisi)
- Low stock alerts (Düşük stok uyarıları)
- Expiry warnings (Son kullanma tarihi uyarıları)
- Performance analytics (Performans analizi)

#### **Entegrasyonlar**
- Supabase backend
- Real-time sync (Gerçek zamanlı senkronizasyon)
- Multi-user support (Çoklu kullanıcı desteği)
- Offline-first architecture (Offline öncelikli mimari)
- REST API support

## ğŸš€ Kurulum ve Kullanım

### 1. Modülü Projenize Ekleyin

Tüm `/warehouse-management/` klasörünü projenizin root dizinine kopyalayın:

```
/warehouse-management/
  ├── index.tsx                 # Ana entry point
  ├── types.ts                  # Type tanımları
  ├── utils.ts                  # Utility fonksiyonlar
  ├── README.md                 # Bu dosya
  └── /components/
      ├── Dashboard.tsx         # Ana dashboard
      ├── GoodsReceiving.tsx    # Mal kabul modülü
      ├── GoodsIssue.tsx        # Mal çıkış modülü
      ├── Transfer.tsx          # Transfer modülü
      ├── Counting.tsx          # Sayım modülü
      ├── Inventory.tsx         # Stok yönetimi modülü
      ├── WarehouseMap.tsx      # Depo haritası modülü
      ├── Reports.tsx           # Raporlar modülü
      └── Settings.tsx          # Ayarlar modülü
```

### 2. Ana Uygulamanızda Kullanın

#### Option A: Standalone (Bağımsız Sayfa)

```tsx
// App.tsx
import { useState } from 'react';
import WarehouseManagement from './warehouse-management';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <WarehouseManagement 
      darkMode={darkMode}
      language="tr"
      onLogout={() => {
        // Logout işlemleri
        console.log('User logged out');
      }}
    />
  );
}
```

#### Option B: ExRetailOS Entegrasyonu

```tsx
// ManagementModule.tsx veya App.tsx
import WarehouseManagement from './warehouse-management';

const renderModule = () => {
  if (activeModule === 'warehouse') {
    return (
      <WarehouseManagement 
        darkMode={darkMode}
        language={currentLanguage}
        onLogout={handleLogout}
      />
    );
  }
  // Diğer modüller...
};
```

### 3. Authentication Entegrasyonu

Modül, mevcut ExRetailOS authentication sistemini kullanır:

```tsx
// index.tsx içinde otomatik kontrol yapılır:
const user = localStorage.getItem('exretail_user');
const firmaId = localStorage.getItem('exretail_selected_firma_id');
```

## ğŸ“Š Dashboard Özellikleri

### KPI Cards
- **Toplam Stok Değeri**: Tüm stokların toplam değeri
- **Bugün Gelen**: Günlük mal kabul istatistikleri
- **Bugün Giden**: Günlük sevkiyat istatistikleri
- **Aktif Uyarılar**: Kritik uyarı sayısı

### Secondary Stats
- **Depo Durumu**: Toplam/aktif depo, ürün, stok kalemi
- **Picking Durumu**: Bekleyen, devam eden, tamamlanan
- **Transferler**: Günlük transfer istatistikleri

### Quick Actions
- Mal Kabul
- Mal Çıkış
- Transfer
- Sayım

## ğŸ¨ Tasarım Sistemi

### Color Palette
```css
/* Primary Colors */
--blue: #3B82F6 to #2563EB     /* Dashboard, Info */
--green: #10B981 to #059669    /* Receiving, Success */
--orange: #F97316 to #EA580C   /* Issue, Warning */
--purple: #8B5CF6 to #7C3AED   /* Counting, Premium */
--red: #EF4444 to #DC2626      /* Alerts, Danger */

/* Dark Mode */
--bg-dark: #111827 (gray-900)
--card-dark: #1F2937 (gray-800)
--border-dark: #374151 (gray-700)
```

### Typography
- Başlıklar: `text-xl` / `text-2xl`
- İçerik: `text-sm` / `text-base`
- Muted text: `text-gray-600` (light) / `text-gray-400` (dark)

### Components
- Cards: `rounded-xl` with `shadow-sm` hover `shadow-md`
- Buttons: `rounded-lg` with gradient backgrounds
- Inputs: `rounded-lg` with focus ring

## ğŸ”§ API Entegrasyonu (Yakında)

### Endpoints

```typescript
// Dashboard Stats
GET /api/wms/dashboard/stats

// Goods Receiving
GET /api/wms/receiving
POST /api/wms/receiving
PUT /api/wms/receiving/:id
DELETE /api/wms/receiving/:id

// Goods Issue
GET /api/wms/issue
POST /api/wms/issue
PUT /api/wms/issue/:id

// Transfers
GET /api/wms/transfer
POST /api/wms/transfer
PUT /api/wms/transfer/:id

// Inventory
GET /api/wms/inventory
GET /api/wms/inventory/:id
PUT /api/wms/inventory/:id

// Counting
GET /api/wms/counting
POST /api/wms/counting
PUT /api/wms/counting/:id

// Alerts
GET /api/wms/alerts
PUT /api/wms/alerts/:id/resolve
```

## ğŸ“± Mobil Desteği

Modül tamamen responsive olup, mobil cihazlarda kullanıma uygundur:

- ✅ Tablet (768px+)
- ✅ Mobile (320px+)
- ✅ Desktop (1024px+)
- ✅ 4K (1920px+)

## ğŸŒ Multi-Language Support

Şu anda desteklenen diller:
- ğŸ‡¹ğŸ‡· Türkçe (Default)
- ğŸ‡¬ğŸ‡§ İngilizce (Yakında)
- ğŸ‡®ğŸ‡¶ Arapça (Yakında)

## ğŸ’¾ Offline Support

Modül offline-first mimarisinde çalışacak şekilde tasarlanmıştır:
- Local storage cache
- IndexedDB support (yakında)
- Background sync (yakında)

## ğŸ§ª Test Verileri

Dashboard'da örnek test verileri bulunmaktadır:
- 5 Depo
- 1.247 Ürün
- 458.750.000 IQD stok değeri
- Mock alerts ve transactions

## ğŸš€ Gelecek Özellikler

### Q1 2025
- [ ] Mal Çıkış modülü completion
- [ ] Transfer modülü completion
- [ ] Barkod/QR kod sistemi
- [ ] Mobil PDA desteği

### Q2 2025
- [ ] 3D Depo haritası
- [ ] Picking optimizasyonu
- [ ] Wave picking
- [ ] AI-powered analytics

### Q3 2025
- [ ] IoT entegrasyonu
- [ ] RFID support
- [ ] Advanced reporting
- [ ] Custom dashboards

## ğŸ“ Destek

Sorularınız için:
- Email: support@exretailos.com
- Docs: https://docs.exretailos.com/wms

## ğŸ“„ Lisans

ExRetailOS WMS - Enterprise Edition
Copyright © 2024-2025 ExRetailOS

---

**Made with ❤️ for Iraq Market**

ğŸ‡®ğŸ‡¶ Optimized for Iraqi Dinar (IQD)
ğŸŒ Enterprise-grade warehouse management
ğŸš€ Built with modern tech stack
