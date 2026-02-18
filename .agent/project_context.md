# ExRetailOS: Project Definition & Vision

**ExRetailOS**, modern perakende ve işletme yönetimi için tasarlanmış, "AI-Native" felsefesiyle geliştirilen bir Kurumsal Kaynak Planlama (ERP) ve Perakende şletim Sistemidir.

## 🚀 Vizyon (The Vision)
Hantal ve eski nesil ERP sistemlerinin aksine, ExRetailOS:
- **AI-Native**: Yapay zeka (Jules) sistemin bir parçası değil, merkezidir. Sesli komut, OCR, akıllı tahminleme ve otomatik muhasebe standarttır.
- **Premium UX**: Estetikten ödün vermez. Glassmorphism, canlı gradyanlar ve akıcı animasyonlarla "wow-factor" yaratır.
- **High Performance**: Tauri ve Rust altyapısı sayesinde masaüstünde yerel performans ve donanım (RFID, Terazi, Yazıcı) entegrasyonu sunar.
- **Global & Local**: Uluslararası ticaret standartlarını desteklerken, yerel vergi ve mevzuatlara (Örn: Irak/Türkiye vergi sistemleri) mükemmel uyum sağlar.

## ��️ Mimari (Architecture)
- **Framework**: React + Vite + TypeScript (Frontend).
- **Native Bridge**: Tauri (Rust) - Donanım iletişimi ve yüksek performans için.
- **Backend**: Supabase (PostgreSQL, Realtime, Edge Functions).
- **AI Engine**: Gemini tabanlı Jules asistanı, Vision yetenekleri ve özel NLP modelleri.

## 📦 Temel Modüller
1. **Ticaret (Trading)**: Evrensel Fatura Modülü (Satış/Alış), Teklif ve Sipariş yönetimi.
2. **Stok & WMS**: RFID destekli envanter, depo yönetimi ve merkezi veri yönetimi.
3. **Finans & Muhasebe**: Gelişmiş defter yönetimi, mizan raporları ve dinamik vergi hesaplamaları.
4. **Perakende (Point of Sale)**: Dokunmatik uyumlu, hızlı satış ekranı (POS).
5. **Kurumsal Yönetim**: Çoklu firma, dönem ve yetki yönetimi.

## 🎯 Ajanlar çin Temel Kurallar (Source of Truth)
Tüm Jules ajanları, yaptıkları her geliştirme ve analizde şu üç prensibi gözetmelidir:
1. **Veri Bütünlüğü**: Finansal ve stok verilerinde asla hata kabul edilmez.
2. **Kullanılabilirlik**: Tasarlanan her ekran, en az eğitimle en hızlı şekilde kullanılabilmelidir.
3. **Geleceğe Hazırlık**: Kod her zaman modüler, tip güvenli ve AI tarafından okunabilir olmalıdır.

