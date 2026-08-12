# ğŸš€ DEPO YÖNETİMİ SİSTEMİ - HIZLI BAŞLANGIÇ KILAVUZU

## ğŸ“± DEPO YÖNETİMİNE NASIL ERİŞİRİM?

### **Yöntem 1: Ana Uygulamadan**
```
1. ExRetailOS'a giriş yapın
2. Üst menüde "DEPO" butonuna tıklayın
3. WMS Dashboard açılacak
```

**Görsel:**
```
┌─────────────────────────────────────────────┐
│  [Satış]  [Yönetim]  [DEPO] ← Buraya tıklayın │
└─────────────────────────────────────────────┘
```

### **Yöntem 2: Doğrudan URL**
```
Ana URL?mode=warehouse
```

### **Yöntem 3: Mobil Cihazlardan**
```
1. Tarayıcınızdan uygulamayı açın
2. Hamburger menü (☰) → "Depo Yönetimi"
3. Veya bottom navigation → "Depo" ikonu
```

---

## ğŸ¯ ANA MODÜLLER

### **1. ğŸ“Š Dashboard**
- **Erişim:** Ana sayfa
- **Özellikler:**
  - Real-time KPI'lar
  - Günlük istatistikler
  - Kritik uyarılar
  - Hızlı işlemler

**Kullanım:**
```
Dashboard → Metrikleri görüntüle → Hızlı işlem seç
```

---

### **2. ğŸš¨ Akıllı Stok Uyarı Sistemi** (YENİ!)

#### **Nedir?**
Şubelerdeki stok seviyelerini anlık izler ve otomatik sevkiyat önerileri sunar.

#### **Nasıl Erişilir?**
```
Dashboard → "Akıllı Stok Uyarı Sistemi" kartı → "Görüntüle" butonu
```

veya

```
Bottom Navigation → "Daha Fazla" → "Stok Uyarıları"
```

#### **Özellikler:**

**A) Anlık İzleme**
```typescript
// Sistem şunları izler:
- Şube stoğu
- Minimum stok seviyesi
- Günlük satış ortalaması
- Stok tükenme tahmini (gün)
```

**B) Otomatik Öneri**
```typescript
// AI sistemi şunları hesaplar:
- Önerilen sevk miktarı
- Öncelik seviyesi (Kritik/Yüksek/Orta)
- Tahmini maliyet
- Depo stok kontrolü
```

**C) Öncelik Seviyeleri**
```
ğŸ”´ KRİTİK: 1-2 gün içinde tükenecek
ğŸŸ  YÜKSEK: 2-5 gün içinde tükenecek
ğŸŸ¡ ORTA: 5-10 gün içinde tükenecek
ğŸ”µ DÜŞÜK: 10+ gün stok var
```

#### **Kullanım Adımları:**

**1. Uyarıları Görüntüleme**
```
Stok Uyarı Sistemi → Tüm uyarılar listesi görünür
```

**2. Filtreleme**
```
- Öncelik: Kritik/Yüksek/Orta/Düşük
- Şube: Tüm şubeler veya spesifik şube
- Ürün Arama: Ürün adı/kodu ile ara
```

**3. Sevkiyat Oluşturma**
```
Uyarı kartı → "Transfer Oluştur" butonu → Otomatik transfer formu
```

#### **Örnek Senaryo:**

```
❌ SORUN:
Karrada Şubesi - iPhone 15 Pro Max
Mevcut: 3 adet
Günlük Satış: 2.5 adet
Tükenmesine: 1.2 gün

✅ SİSTEM ÖNERİSİ:
Öncelik: KRİTİK ğŸ”´
Önerilen Miktar: 47 adet
- 10 adet → Min. stok seviyesine ulaşmak için
- 20 adet → Haftalık satışı karşılamak için
- 17 adet → Güvenlik stoğu (7 gün)
Maliyet: 1,175,000,000 IQD

ğŸš€ AKSYON:
"Transfer Oluştur" → Sistem otomatik formu doldurur
```

#### **Otomatik Onay Sistemi:**
```typescript
// Kritik uyarılar otomatik onaylı gelir
if (daysUntilStockout < 2) {
  autoApproved = true; // ⚡ Oto-Onaylı
}
```

**Oto-Onaylı Badge:**
```
┌──────────────────────────────────┐
│ [KRİTİK] [⚡ OTO-ONAY] 10:45     │
│                                   │
│ iPhone 15 Pro Max                 │
│ Karrada Şubesi - Baghdad          │
│                                   │
│ Mevcut: 3 → Öneri: 47 adet       │
│ Maliyet: 1,175,000,000 IQD       │
│                                   │
│ [Transfer Oluştur] [Detaylar]    │
└──────────────────────────────────┘
```

#### **Dashboard'ta Özet:**
```
Akıllı Stok Uyarı Sistemi
┌─────────┬──────────┬────────────┐
│ 5       │ 12       │ 8          │
│ Kritik  │ Yüksek   │ Oto-Onaylı │
└─────────┴──────────┴────────────┘
```

#### **Otomatik Yenileme:**
```
ğŸŸ¢ Otomatik Yenileme: AÇIK
Her 30 saniyede bir güncellenir

ğŸ”´ Otomatik Yenileme: KAPALI
Manuel "Yenile" butonu ile güncelle
```

---

### **3. ⬇️ Mal Kabul (Receiving)**

#### **Kullanım:**
```
Dashboard → "Mal Kabul" butonu
```

**İşlem Adımları:**
```
1. Tedarikçi seç
2. Ürünleri ekle (Barkod okut veya manuel)
3. Miktarları gir
4. Kalite kontrolü yap
5. Raf yerini belirle
6. Kabul işlemini tamamla
```

**Özellikler:**
- ✅ Barkod okuma
- ✅ Toplu ürün ekleme
- ✅ Fotoğraf ekleme
- ✅ Notlar & açıklamalar
- ✅ Yazdır (Fiş/Etiket)

---

### **4. ⬆️ Mal Çıkış (Issue)**

#### **Kullanım:**
```
Dashboard → "Mal Çıkış" butonu
```

**İşlem Adımları:**
```
1. Hedef şube/müşteri seç
2. Ürünleri ekle
3. Raf yerlerini kontrol et
4. Çıkış onayı
5. Sevk fişi yazdır
```

---

### **5. ğŸšš Transfer**

#### **Kullanım:**
```
Dashboard → "Transfer" butonu
VEYA
Stok Uyarı Sistemi → "Transfer Oluştur"
```

**Otomatik Transfer (Stok Uyarısından):**
```
1. Stok uyarısı kartında "Transfer Oluştur" tıkla
2. Form otomatik doldurulur:
   - Hedef şube: ✅ Belirlendi
   - Ürün: ✅ Belirlendi
   - Miktar: ✅ Önerildi
3. Sadece onayla ve gönder!
```

**Manuel Transfer:**
```
1. Kaynak depo seç
2. Hedef depo/şube seç
3. Ürünleri ekle
4. Miktarları gir
5. Transfer talep et
6. Onay ve sevkiyat
```

---

### **6. ğŸ“‹ Sayım (Counting)**

#### **Kullanım:**
```
Dashboard → "Sayım" butonu
```

**Sayım Türleri:**
```
A) Periyodik Sayım: Tüm stok
B) Döngüsel Sayım: Belirli ürünler
C) Fark Analizi: Sistem vs Fiziki
```

---

## ğŸ“Š RAPORLAR

### **Anlık Metrikler (Dashboard)**
```
✅ Toplam Stok Değeri
✅ Günlük Gelen/Giden
✅ Aktif Uyarılar
✅ Doğruluk Oranı
✅ Kapasite Kullanımı
✅ Tamamlama Oranı
```

### **Detaylı Raporlar**
```
Dashboard → Bottom Nav → "Raporlar"
```

---

## ğŸ¯ MOBİL KULLANIM

### **ğŸ“± Bottom Navigation (Mobil)**
```
┌─────┬─────┬─────┬─────┬─────────┐
│ ğŸ   │ ⬇️  │ ⬆️  │ ğŸšš  │   ≡     │
│ Ana │Gelen│Giden│Trans│Daha     │
└─────┴─────┴─────┴─────┴─────────┘
```

### **ğŸ” Hamburger Menu (Mobil)**
```
☰ → Menü:
  ğŸ  Ana Sayfa
  ⬇️ Mal Kabul
  ⬆️ Mal Çıkış
  ğŸšš Transfer
  ğŸ“Š Sayım
  ğŸš¨ Stok Uyarıları ← YENİ!
  ──────────
  ⚙️ Ayarlar
  ğŸšª Çıkış Yap
```

### **Touch-Friendly Features**
- ✅ 44x44px minimum touch targets
- ✅ Active animations (basınca küçülür)
- ✅ Horizontal scroll (stats bar)
- ✅ Swipe-friendly layout
- ✅ No hover-only interactions

---

## ⚙️ AYARLAR

### **Kullanıcı Tercihleri**
```
Ayarlar → Tercihler:
- ğŸŒ™ Dark Mode
- ğŸŒ Dil (TR/EN/AR)
- ğŸ”” Bildirimler
- ğŸ“± Mobil Mod
```

### **Depo Ayarları**
```
Ayarlar → Depo Konfigürasyonu:
- Depo listesi
- Raf sistemi
- Min/Max stok seviyeleri
- Otomatik uyarılar
```

---

## ğŸ”” BİLDİRİM SİSTEMİ

### **Bildirim Türleri:**
```
ğŸ”´ KRİTİK: Stok tükenmek üzere
ğŸŸ  UYARI: Min. stok seviyesi
ğŸŸ¡ BİLGİ: Transfer tamamlandı
ğŸ”µ BAŞARILI: İşlem başarılı
```

### **Bildirim Kanalları:**
```
1. Dashboard: Badge + Liste
2. Mobil: Push notification (gelecek)
3. Email: Özet raporlar (gelecek)
4. SMS: Kritik uyarılar (gelecek)
```

---

## ğŸš€ HIZLI ERİŞİM (SHORTCUTS)

### **Klavye Kısayolları (Desktop)**
```
Ctrl + H → Ana Sayfa
Ctrl + R → Mal Kabul
Ctrl + I → Mal Çıkış
Ctrl + T → Transfer
Ctrl + A → Stok Uyarıları
Ctrl + / → Arama
```

### **Mobil Gestures**
```
← Swipe Left: Sonraki sayfa
→ Swipe Right: Önceki sayfa
↓ Pull Down: Yenile
```

---

## ❓ SIKÇA SORULAN SORULAR (FAQ)

### **Q: Stok uyarıları ne sıklıkla güncellenir?**
A: Otomatik yenileme açıksa 30 saniyede bir. Manuel "Yenile" butonu ile istediğiniz zaman.

### **Q: Otomatik transfer önerileri nereye gider?**
A: Depo'dan ilgili şubeye otomatik transfer formu oluşturulur. Siz sadece onaylarsınız.

### **Q: Kritik uyarılar ne kadar sürede bildirilir?**
A: Anlık! Stok kritik seviyeye düştüğü anda sistem uyarı oluşturur.

### **Q: Mobilde tüm özellikler var mı?**
A: Evet! Mobil versiyonda touch-optimized olarak tüm özellikler mevcut.

### **Q: Offline çalışır mı?**
A: Kısmi offline destek. Temel işlemler cache'lenir, senkronizasyon internet bağlantısı gerektirir.

### **Q: Birden fazla depo yönetebilir miyim?**
A: Evet! Multi-warehouse destekli. Depo seçerek geçiş yapabilirsiniz.

### **Q: Raporlar Excel'e aktarılabilir mi?**
A: Evet! Tüm raporlar Excel/PDF formatında indirilebilir.

### **Q: Barkod okuyucu gerekli mi?**
A: Hayır, zorunlu değil. Manuel giriş yapabilirsiniz. Ama barkod okuyucu önerilir (hız + doğruluk).

---

## ğŸ“ EĞİTİM VİDEOLARI (Yakında!)

```
ğŸ“¹ Video 1: Sisteme Giriş & Dashboard
ğŸ“¹ Video 2: Stok Uyarı Sistemi Kullanımı
ğŸ“¹ Video 3: Mal Kabul İşlemleri
ğŸ“¹ Video 4: Transfer Yönetimi
ğŸ“¹ Video 5: Mobil Kullanım
```

---

## ğŸ“ DESTEK

### **Teknik Destek:**
```
ğŸ“§ Email: support@exretailos.com
ğŸ’¬ Live Chat: Uygulama içi chat (sağ alt)
ğŸ“± WhatsApp: +964 XXX XXX XXXX
```

### **Dokümantasyon:**
```
ğŸ“š Kullanım Kılavuzu: /docs/user-guide
ğŸ”§ Teknik Dokümantasyon: /docs/technical
ğŸ’¡ Best Practices: /docs/best-practices
```

---

## ✅ İLK KULLANIMDA YAPILACAKLAR

```
1. ✅ Depo'ya erişim sağla (Üst menü → "DEPO")
2. ✅ Dashboard'u incele
3. ✅ Stok Uyarı Sistemi'ni aç
4. ✅ Mobil cihazdan test et
5. ✅ İlk mal kabul işlemi yap
6. ✅ Transfer dene
7. ✅ Raporları kontrol et
8. ✅ Ayarları yapılandır
```

---

## ğŸ‰ HAZIR!

**Sistem kullanıma hazır! Başarılar dileriz! ğŸš€**

İRAK'IN EN MODERN DEPO YÖNETİM SİSTEMİ! ğŸ‡®ğŸ‡¶âœ¨

---

**Son Güncelleme:** 26 Aralık 2024
**Versiyon:** 1.0.0
**Geliştirici:** ExRetailOS Team

