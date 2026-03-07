# RetailEX: Project Definition & Vision

**RetailEX**, modern perakende ve iþletme yönetimi için tasarlanmýþ, "AI-Native" felsefesiyle geliþtirilen bir Kurumsal Kaynak Planlama (ERP) ve Perakende þletim Sistemidir.

## ?? Vizyon (The Vision)
Hantal ve eski nesil ERP sistemlerinin aksine, RetailEX:
- **AI-Native**: Yapay zeka (Jules) sistemin bir parçasý deðil, merkezidir. Sesli komut, OCR, akýllý tahminleme ve otomatik muhasebe standarttýr.
- **Premium UX**: Estetikten ödün vermez. Glassmorphism, canlý gradyanlar ve akýcý animasyonlarla "wow-factor" yaratýr.
- **High Performance**: Tauri ve Rust altyapýsý sayesinde masaüstünde yerel performans ve donaným (RFID, Terazi, Yazýcý) entegrasyonu sunar.
- **Global & Local**: Uluslararasý ticaret standartlarýný desteklerken, yerel vergi ve mevzuatlara (Örn: Irak/Türkiye vergi sistemleri) mükemmel uyum saðlar.

## ??? Mimari (Architecture)
- **Framework**: React + Vite + TypeScript (Frontend).
- **Native Bridge**: Tauri (Rust) - Donaným iletiþimi ve yüksek performans için.
- **Backend**: Supabase (PostgreSQL, Realtime, Edge Functions).
- **AI Engine**: Gemini tabanlý Jules asistaný, Vision yetenekleri ve özel NLP modelleri.

## ?? Temel Modüller
1. **Ticaret (Trading)**: Evrensel Fatura Modülü (Satýþ/Alýþ), Teklif ve Sipariþ yönetimi.
2. **Stok & WMS**: RFID destekli envanter, depo yönetimi ve merkezi veri yönetimi.
3. **Finans & Muhasebe**: Geliþmiþ defter yönetimi, mizan raporlarý ve dinamik vergi hesaplamalarý.
4. **Perakende (Point of Sale)**: Dokunmatik uyumlu, hýzlý satýþ ekraný (POS).
5. **Kurumsal Yönetim**: Çoklu firma, dönem ve yetki yönetimi.

## ?? Ajanlar çin Temel Kurallar (Source of Truth)
Tüm Jules ajanlarý, yaptýklarý her geliþtirme ve analizde þu üç prensibi gözetmelidir:
1. **Veri Bütünlüðü**: Finansal ve stok verilerinde asla hata kabul edilmez.
2. **Kullanýlabilirlik**: Tasarlanan her ekran, en az eðitimle en hýzlý þekilde kullanýlabilmelidir.
3. **Geleceðe Hazýrlýk**: Kod her zaman modüler, tip güvenli ve AI tarafýndan okunabilir olmalýdýr.

