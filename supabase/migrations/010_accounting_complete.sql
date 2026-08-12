-- Migration 010: Accounting Module Complete
-- Yevmiye FiÅŸleri + Cari Hesaplar + Mali Tablolar
-- Created: 2025-01-01

-- ============================================================================
-- HESAP PLANI (CHART OF ACCOUNTS)
-- ============================================================================

CREATE TABLE hesap_plani (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hesap_kodu TEXT UNIQUE NOT NULL,
    hesap_adi TEXT NOT NULL,
    parent_hesap_kodu TEXT REFERENCES hesap_plani(hesap_kodu),
    hesap_tipi TEXT CHECK (hesap_tipi IN ('AKTIF', 'PASIF', 'GELIR', 'GIDER', 'SERMAYE')),
    seviye INTEGER DEFAULT 1,
    detay_hesap BOOLEAN DEFAULT false, -- Ana hesap mÄ±, detay hesap mÄ±?
    
    -- Bakiye bilgileri
    borc_bakiye DECIMAL(15,2) DEFAULT 0,
    alacak_bakiye DECIMAL(15,2) DEFAULT 0,
    
    aciklama TEXT,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hesap_plani_kod ON hesap_plani(hesap_kodu);
CREATE INDEX idx_hesap_plani_parent ON hesap_plani(parent_hesap_kodu);
CREATE INDEX idx_hesap_plani_tip ON hesap_plani(hesap_tipi);

-- ============================================================================
-- YEVMÄ°YE FÄ°ÅLERÄ° (JOURNAL ENTRIES)
-- ============================================================================

CREATE TABLE yevmiye_fisleri (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fis_no TEXT UNIQUE NOT NULL,
    fis_tarihi DATE NOT NULL,
    fis_tipi TEXT CHECK (fis_tipi IN ('ACILIS', 'ISLEM', 'MAHSUP', 'DEVIR', 'KAPANIÅ')),
    
    -- DÃ¶nem bilgisi
    donem_yil INTEGER NOT NULL,
    donem_ay INTEGER CHECK (donem_ay >= 1 AND donem_ay <= 12),
    
    aciklama TEXT,
    evrak_no TEXT, -- Referans fatura/makbuz no
    
    -- Onay bilgileri
    onay_durumu TEXT DEFAULT 'TASLAK' CHECK (onay_durumu IN ('TASLAK', 'ONAYLANDI', 'IPTAL')),
    onaylayan_id UUID REFERENCES users(id),
    onay_tarihi TIMESTAMPTZ,
    
    -- KayÄ±t bilgileri
    olusturan_id UUID REFERENCES users(id) NOT NULL,
    store_id UUID REFERENCES stores(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_yevmiye_fisleri_tarih ON yevmiye_fisleri(fis_tarihi DESC);
CREATE INDEX idx_yevmiye_fisleri_donem ON yevmiye_fisleri(donem_yil, donem_ay);
CREATE INDEX idx_yevmiye_fisleri_onay ON yevmiye_fisleri(onay_durumu);
CREATE INDEX idx_yevmiye_fisleri_store ON yevmiye_fisleri(store_id);

-- ============================================================================
-- YEVMÄ°YE FÄ°ÅÄ° DETAYLARI (JOURNAL ENTRY LINES)
-- ============================================================================

CREATE TABLE yevmiye_fisi_detaylari (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fis_id UUID REFERENCES yevmiye_fisleri(id) ON DELETE CASCADE NOT NULL,
    sira_no INTEGER NOT NULL,
    
    hesap_kodu TEXT REFERENCES hesap_plani(hesap_kodu) NOT NULL,
    
    borc DECIMAL(15,2) DEFAULT 0,
    alacak DECIMAL(15,2) DEFAULT 0,
    
    aciklama TEXT,
    doviz_cinsi TEXT DEFAULT 'TRY',
    doviz_kur DECIMAL(10,4) DEFAULT 1,
    doviz_tutar DECIMAL(15,2),
    
    -- Ek bilgiler
    cari_hesap_id UUID REFERENCES customers(id), -- MÃ¼ÅŸteri/tedarikÃ§i iliÅŸkisi
    proje_kodu TEXT,
    masraf_merkezi TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CHECK (borc >= 0 AND alacak >= 0),
    CHECK (NOT (borc > 0 AND alacak > 0)), -- AynÄ± satÄ±rda hem borÃ§ hem alacak olamaz
    
    UNIQUE(fis_id, sira_no)
);

CREATE INDEX idx_yevmiye_detay_fis ON yevmiye_fisi_detaylari(fis_id);
CREATE INDEX idx_yevmiye_detay_hesap ON yevmiye_fisi_detaylari(hesap_kodu);
CREATE INDEX idx_yevmiye_detay_cari ON yevmiye_fisi_detaylari(cari_hesap_id);

-- ============================================================================
-- CARÄ° HESAPLAR (RECEIVABLES/PAYABLES)
-- ============================================================================

CREATE TABLE cari_hesaplar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cari_kod TEXT UNIQUE NOT NULL,
    cari_unvan TEXT NOT NULL,
    cari_tip TEXT CHECK (cari_tip IN ('MUSTERI', 'TEDARIKCI', 'HER_IKISI', 'PERSONEL', 'ORTAK')),
    
    -- Ä°letiÅŸim
    vergi_dairesi TEXT,
    vergi_no TEXT,
    tc_kimlik_no TEXT,
    telefon TEXT,
    email TEXT,
    adres TEXT,
    il TEXT,
    ilce TEXT,
    ulke TEXT DEFAULT 'TÃ¼rkiye',
    
    -- Finansal bilgiler
    hesap_kodu TEXT REFERENCES hesap_plani(hesap_kodu),
    bakiye DECIMAL(15,2) DEFAULT 0, -- (+) alacak, (-) borÃ§
    
    kredi_limiti DECIMAL(15,2) DEFAULT 0,
    vade_gun INTEGER DEFAULT 0,
    iskonto_orani DECIMAL(5,2) DEFAULT 0,
    
    -- Ã–deme tercihleri
    varsayilan_odeme_yontemi TEXT,
    banka_iban TEXT,
    
    -- Durum
    is_active BOOLEAN DEFAULT true,
    risk_durumu TEXT DEFAULT 'NORMAL' CHECK (risk_durumu IN ('NORMAL', 'DIKKAT', 'RISKLI', 'ENGELLI')),
    
    notlar TEXT,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cari_hesaplar_kod ON cari_hesaplar(cari_kod);
CREATE INDEX idx_cari_hesaplar_tip ON cari_hesaplar(cari_tip);
CREATE INDEX idx_cari_hesaplar_vergi ON cari_hesaplar(vergi_no);
CREATE INDEX idx_cari_hesaplar_active ON cari_hesaplar(is_active);

-- ============================================================================
-- CARÄ° HESAP HAREKETLERÄ° (ACCOUNT MOVEMENTS)
-- ============================================================================

CREATE TABLE cari_hesap_hareketleri (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cari_hesap_id UUID REFERENCES cari_hesaplar(id) NOT NULL,
    
    hareket_tarihi DATE NOT NULL,
    islem_tipi TEXT CHECK (islem_tipi IN ('FATURA', 'TAHSILAT', 'ODEME', 'VIRMAN', 'ACILIS', 'DUZELTME')),
    
    evrak_no TEXT,
    aciklama TEXT,
    
    borc DECIMAL(15,2) DEFAULT 0,
    alacak DECIMAL(15,2) DEFAULT 0,
    bakiye DECIMAL(15,2) DEFAULT 0, -- KÃ¼mÃ¼latif bakiye
    
    vade_tarihi DATE,
    
    -- Ä°liÅŸkili kayÄ±tlar
    fis_id UUID REFERENCES yevmiye_fisleri(id),
    fatura_id UUID, -- Sales invoice reference
    odeme_id UUID, -- Payment reference
    
    doviz_cinsi TEXT DEFAULT 'TRY',
    doviz_kur DECIMAL(10,4) DEFAULT 1,
    doviz_tutar DECIMAL(15,2),
    
    store_id UUID REFERENCES stores(id),
    olusturan_id UUID REFERENCES users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cari_hareket_hesap ON cari_hesap_hareketleri(cari_hesap_id);
CREATE INDEX idx_cari_hareket_tarih ON cari_hesap_hareketleri(hareket_tarihi DESC);
CREATE INDEX idx_cari_hareket_vade ON cari_hesap_hareketleri(vade_tarihi);
CREATE INDEX idx_cari_hareket_tip ON cari_hesap_hareketleri(islem_tipi);

-- ============================================================================
-- BANKA HESAPLARI
-- ============================================================================

CREATE TABLE banka_hesaplari (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hesap_adi TEXT NOT NULL,
    banka_adi TEXT NOT NULL,
    sube_adi TEXT,
    hesap_no TEXT,
    iban TEXT,
    
    hesap_tipi TEXT CHECK (hesap_tipi IN ('VADESIZ', 'VADELI', 'KREDILI')),
    para_birimi TEXT DEFAULT 'TRY',
    
    bakiye DECIMAL(15,2) DEFAULT 0,
    
    hesap_kodu TEXT REFERENCES hesap_plani(hesap_kodu),
    
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_banka_hesaplari_active ON banka_hesaplari(is_active);

-- ============================================================================
-- BANKA HAREKETLERÄ°
-- ============================================================================

CREATE TABLE banka_hareketleri (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    banka_hesap_id UUID REFERENCES banka_hesaplari(id) NOT NULL,
    
    hareket_tarihi DATE NOT NULL,
    valor_tarihi DATE,
    islem_tipi TEXT CHECK (islem_tipi IN ('GIRIS', 'CIKIS', 'VIRMAN')),
    
    aciklama TEXT,
    evrak_no TEXT,
    
    tutar DECIMAL(15,2) NOT NULL,
    bakiye DECIMAL(15,2), -- KÃ¼mÃ¼latif bakiye
    
    -- Ä°liÅŸkili kayÄ±tlar
    fis_id UUID REFERENCES yevmiye_fisleri(id),
    cari_hesap_id UUID REFERENCES cari_hesaplar(id),
    
    store_id UUID REFERENCES stores(id),
    olusturan_id UUID REFERENCES users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_banka_hareket_hesap ON banka_hareketleri(banka_hesap_id);
CREATE INDEX idx_banka_hareket_tarih ON banka_hareketleri(hareket_tarihi DESC);

-- ============================================================================
-- KASA HAREKETLERÄ° (CASH MOVEMENTS)
-- ============================================================================

CREATE TABLE kasa_hareketleri (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kasa_id TEXT NOT NULL, -- Kasa-01, Kasa-02, etc.
    store_id UUID REFERENCES stores(id),
    
    hareket_tarihi DATE NOT NULL,
    islem_tipi TEXT CHECK (islem_tipi IN ('GIRIS', 'CIKIS', 'DEVIR')),
    
    aciklama TEXT,
    evrak_no TEXT,
    
    tutar DECIMAL(15,2) NOT NULL,
    bakiye DECIMAL(15,2),
    
    -- Ä°liÅŸkili kayÄ±tlar
    fis_id UUID REFERENCES yevmiye_fisleri(id),
    satis_id UUID, -- Sale reference
    
    para_birimi TEXT DEFAULT 'TRY',
    
    olusturan_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kasa_hareket_kasa ON kasa_hareketleri(kasa_id);
CREATE INDEX idx_kasa_hareket_store ON kasa_hareketleri(store_id);
CREATE INDEX idx_kasa_hareket_tarih ON kasa_hareketleri(hareket_tarihi DESC);

-- ============================================================================
-- MALÄ° DÃ–NEMLER
-- ============================================================================

CREATE TABLE mali_donemler (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donem_yil INTEGER NOT NULL,
    donem_baslangic DATE NOT NULL,
    donem_bitis DATE NOT NULL,
    
    durum TEXT DEFAULT 'ACIK' CHECK (durum IN ('ACIK', 'KAPALI', 'GECICI_KAPALI')),
    
    kapanÄ±ÅŸ_tarihi TIMESTAMPTZ,
    kapatan_id UUID REFERENCES users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(donem_yil)
);

CREATE INDEX idx_mali_donemler_yil ON mali_donemler(donem_yil);

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Hesap PlanÄ± (Tek DÃ¼zen Hesap PlanÄ± - Temel)
INSERT INTO hesap_plani (hesap_kodu, hesap_adi, hesap_tipi, seviye, detay_hesap) VALUES
-- AKTÄ°FLER
('100', 'KASA', 'AKTIF', 1, false),
('100.01', 'TL Kasa', 'AKTIF', 2, true),
('100.02', 'DÃ¶viz Kasa', 'AKTIF', 2, true),

('102', 'BANKALAR', 'AKTIF', 1, false),
('102.01', 'Ziraat BankasÄ± TL', 'AKTIF', 2, true),
('102.02', 'Ä°ÅŸ BankasÄ± TL', 'AKTIF', 2, true),

('120', 'ALICILAR', 'AKTIF', 1, false),
('120.01', 'YurtiÃ§i AlÄ±cÄ±lar', 'AKTIF', 2, true),
('120.02', 'YurtdÄ±ÅŸÄ± AlÄ±cÄ±lar', 'AKTIF', 2, true),

('153', 'TÄ°CARÄ° MALLAR', 'AKTIF', 1, false),
('153.01', 'Ticari Mallar', 'AKTIF', 2, true),

('254', 'BÄ°NALAR', 'AKTIF', 1, false),
('254.01', 'Binalar', 'AKTIF', 2, true),

-- PASÄ°FLER
('300', 'BANKA KREDÄ°LERÄ°', 'PASIF', 1, false),
('300.01', 'KÄ±sa Vadeli Banka Kredileri', 'PASIF', 2, true),

('320', 'SATICILAR', 'PASIF', 1, false),
('320.01', 'YurtiÃ§i SatÄ±cÄ±lar', 'PASIF', 2, true),

('500', 'SERMAYE', 'SERMAYE', 1, false),
('500.01', 'Ã–denmiÅŸ Sermaye', 'SERMAYE', 2, true),

-- GELÄ°RLER
('600', 'YURTÄ°Ã‡Ä° SATIÅLAR', 'GELIR', 1, false),
('600.01', 'YurtiÃ§i SatÄ±ÅŸlar', 'GELIR', 2, true),

-- GÄ°DERLER
('770', 'GENEL YÃ–NETÄ°M GÄ°DERLERÄ°', 'GIDER', 1, false),
('770.01', 'Personel Giderleri', 'GIDER', 2, true),
('770.02', 'Kira Giderleri', 'GIDER', 2, true),
('770.03', 'Elektrik Giderleri', 'GIDER', 2, true);

-- Mali DÃ¶nem (2025)
INSERT INTO mali_donemler (donem_yil, donem_baslangic, donem_bitis, durum) VALUES
(2025, '2025-01-01', '2025-12-31', 'ACIK');

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Yevmiye fiÅŸi dengesi kontrolÃ¼
CREATE OR REPLACE FUNCTION check_yevmiye_fisi_balance() RETURNS TRIGGER AS $$
DECLARE
    v_toplam_borc DECIMAL(15,2);
    v_toplam_alacak DECIMAL(15,2);
BEGIN
    -- Toplam borÃ§ ve alacak hesapla
    SELECT 
        COALESCE(SUM(borc), 0),
        COALESCE(SUM(alacak), 0)
    INTO v_toplam_borc, v_toplam_alacak
    FROM yevmiye_fisi_detaylari
    WHERE fis_id = NEW.fis_id;

    -- Denge kontrolÃ¼
    IF ABS(v_toplam_borc - v_toplam_alacak) > 0.01 THEN
        RAISE EXCEPTION 'Yevmiye fiÅŸi dengesiz! BorÃ§: %, Alacak: %', v_toplam_borc, v_toplam_alacak;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_yevmiye_balance
AFTER INSERT OR UPDATE ON yevmiye_fisi_detaylari
FOR EACH ROW
EXECUTE FUNCTION check_yevmiye_fisi_balance();

-- Cari hesap bakiyesi gÃ¼ncelleme
CREATE OR REPLACE FUNCTION update_cari_bakiye() RETURNS TRIGGER AS $$
DECLARE
    v_yeni_bakiye DECIMAL(15,2);
BEGIN
    -- KÃ¼mÃ¼latif bakiye hesapla
    SELECT COALESCE(SUM(alacak - borc), 0)
    INTO v_yeni_bakiye
    FROM cari_hesap_hareketleri
    WHERE cari_hesap_id = NEW.cari_hesap_id
      AND hareket_tarihi <= NEW.hareket_tarihi;

    -- Bakiye gÃ¼ncelle
    NEW.bakiye := v_yeni_bakiye;

    -- Cari hesabÄ±n ana bakiyesini gÃ¼ncelle
    UPDATE cari_hesaplar
    SET bakiye = v_yeni_bakiye,
        updated_at = NOW()
    WHERE id = NEW.cari_hesap_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cari_bakiye
BEFORE INSERT ON cari_hesap_hareketleri
FOR EACH ROW
EXECUTE FUNCTION update_cari_bakiye();

-- Banka bakiyesi gÃ¼ncelleme
CREATE OR REPLACE FUNCTION update_banka_bakiye() RETURNS TRIGGER AS $$
DECLARE
    v_onceki_bakiye DECIMAL(15,2);
    v_yeni_bakiye DECIMAL(15,2);
BEGIN
    -- Ã–nceki bakiye al
    SELECT COALESCE(bakiye, 0) INTO v_onceki_bakiye
    FROM banka_hareketleri
    WHERE banka_hesap_id = NEW.banka_hesap_id
      AND hareket_tarihi < NEW.hareket_tarihi
    ORDER BY hareket_tarihi DESC, created_at DESC
    LIMIT 1;

    -- Yeni bakiye hesapla
    IF NEW.islem_tipi = 'GIRIS' THEN
        v_yeni_bakiye := v_onceki_bakiye + NEW.tutar;
    ELSE
        v_yeni_bakiye := v_onceki_bakiye - NEW.tutar;
    END IF;

    NEW.bakiye := v_yeni_bakiye;

    -- Ana banka hesabÄ±nÄ± gÃ¼ncelle
    UPDATE banka_hesaplari
    SET bakiye = v_yeni_bakiye,
        updated_at = NOW()
    WHERE id = NEW.banka_hesap_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_banka_bakiye
BEFORE INSERT ON banka_hareketleri
FOR EACH ROW
EXECUTE FUNCTION update_banka_bakiye();

-- Kasa bakiyesi gÃ¼ncelleme
CREATE OR REPLACE FUNCTION update_kasa_bakiye() RETURNS TRIGGER AS $$
DECLARE
    v_onceki_bakiye DECIMAL(15,2);
    v_yeni_bakiye DECIMAL(15,2);
BEGIN
    -- Ã–nceki bakiye al
    SELECT COALESCE(bakiye, 0) INTO v_onceki_bakiye
    FROM kasa_hareketleri
    WHERE kasa_id = NEW.kasa_id
      AND store_id = NEW.store_id
      AND hareket_tarihi < NEW.hareket_tarihi
    ORDER BY hareket_tarihi DESC, created_at DESC
    LIMIT 1;

    -- Yeni bakiye hesapla
    IF NEW.islem_tipi = 'GIRIS' THEN
        v_yeni_bakiye := v_onceki_bakiye + NEW.tutar;
    ELSE
        v_yeni_bakiye := v_onceki_bakiye - NEW.tutar;
    END IF;

    NEW.bakiye := v_yeni_bakiye;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_kasa_bakiye
BEFORE INSERT ON kasa_hareketleri
FOR EACH ROW
EXECUTE FUNCTION update_kasa_bakiye();

-- SatÄ±ÅŸ sonrasÄ± otomatik yevmiye fiÅŸi oluÅŸturma
CREATE OR REPLACE FUNCTION create_yevmiye_from_sale() RETURNS TRIGGER AS $$
DECLARE
    v_fis_id UUID;
    v_fis_no TEXT;
    v_donem_yil INTEGER;
    v_donem_ay INTEGER;
BEGIN
    -- DÃ¶nem bilgisi
    v_donem_yil := EXTRACT(YEAR FROM NEW.created_at);
    v_donem_ay := EXTRACT(MONTH FROM NEW.created_at);

    -- FiÅŸ numarasÄ± oluÅŸtur
    v_fis_no := 'YF-' || v_donem_yil || '-' || LPAD(v_donem_ay::TEXT, 2, '0') || '-' || 
                LPAD(NEXTVAL('yevmiye_fis_seq')::TEXT, 6, '0');

    -- Yevmiye fiÅŸi oluÅŸtur
    INSERT INTO yevmiye_fisleri (
        fis_no,
        fis_tarihi,
        fis_tipi,
        donem_yil,
        donem_ay,
        aciklama,
        evrak_no,
        onay_durumu,
        olusturan_id,
        store_id
    ) VALUES (
        v_fis_no,
        CURRENT_DATE,
        'ISLEM',
        v_donem_yil,
        v_donem_ay,
        'SatÄ±ÅŸ - ' || NEW.sale_number,
        NEW.sale_number,
        'ONAYLANDI',
        NEW.cashier_id,
        NEW.store_id
    ) RETURNING id INTO v_fis_id;

    -- BorÃ§ kaydÄ±: Kasa (veya AlÄ±cÄ±lar)
    INSERT INTO yevmiye_fisi_detaylari (
        fis_id,
        sira_no,
        hesap_kodu,
        borc,
        alacak,
        aciklama,
        cari_hesap_id
    ) VALUES (
        v_fis_id,
        1,
        CASE WHEN NEW.payment_method = 'cash' THEN '100.01' ELSE '120.01' END,
        NEW.total,
        0,
        'SatÄ±ÅŸ tahsilatÄ±',
        NEW.customer_id
    );

    -- Alacak kaydÄ±: YurtiÃ§i SatÄ±ÅŸlar
    INSERT INTO yevmiye_fisi_detaylari (
        fis_id,
        sira_no,
        hesap_kodu,
        borc,
        alacak,
        aciklama
    ) VALUES (
        v_fis_id,
        2,
        '600.01',
        0,
        NEW.total,
        'SatÄ±ÅŸ geliri'
    );

    -- Kasa hareketi oluÅŸtur (nakit ise)
    IF NEW.payment_method = 'cash' THEN
        INSERT INTO kasa_hareketleri (
            kasa_id,
            store_id,
            hareket_tarihi,
            islem_tipi,
            aciklama,
            evrak_no,
            tutar,
            fis_id,
            satis_id,
            olusturan_id
        ) VALUES (
            'KASA-01', -- Default kasa
            NEW.store_id,
            CURRENT_DATE,
            'GIRIS',
            'SatÄ±ÅŸ tahsilatÄ±',
            NEW.sale_number,
            NEW.total,
            v_fis_id,
            NEW.id,
            NEW.cashier_id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sequence for fiÅŸ numbering
CREATE SEQUENCE IF NOT EXISTS yevmiye_fis_seq START 1;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Mizan (Trial Balance)
CREATE OR REPLACE VIEW v_mizan AS
SELECT
    hp.hesap_kodu,
    hp.hesap_adi,
    hp.hesap_tipi,
    COALESCE(SUM(yfd.borc), 0) as toplam_borc,
    COALESCE(SUM(yfd.alacak), 0) as toplam_alacak,
    COALESCE(SUM(yfd.borc), 0) - COALESCE(SUM(yfd.alacak), 0) as bakiye
FROM hesap_plani hp
LEFT JOIN yevmiye_fisi_detaylari yfd ON hp.hesap_kodu = yfd.hesap_kodu
LEFT JOIN yevmiye_fisleri yf ON yfd.fis_id = yf.id
WHERE yf.onay_durumu = 'ONAYLANDI' OR yf.id IS NULL
GROUP BY hp.hesap_kodu, hp.hesap_adi, hp.hesap_tipi
ORDER BY hp.hesap_kodu;

-- Cari hesap ekstresi
CREATE OR REPLACE VIEW v_cari_ekstre AS
SELECT
    ch.cari_kod,
    ch.cari_unvan,
    chh.hareket_tarihi,
    chh.islem_tipi,
    chh.evrak_no,
    chh.aciklama,
    chh.borc,
    chh.alacak,
    chh.bakiye,
    chh.vade_tarihi
FROM cari_hesaplar ch
JOIN cari_hesap_hareketleri chh ON ch.id = chh.cari_hesap_id
ORDER BY ch.cari_kod, chh.hareket_tarihi;

-- YaÅŸlandÄ±rma raporu (Aging report)
CREATE OR REPLACE VIEW v_yaslandirma AS
SELECT
    ch.cari_kod,
    ch.cari_unvan,
    SUM(CASE WHEN CURRENT_DATE - chh.vade_tarihi <= 0 THEN chh.alacak - chh.borc ELSE 0 END) as vadesi_gelmemis,
    SUM(CASE WHEN CURRENT_DATE - chh.vade_tarihi BETWEEN 1 AND 30 THEN chh.alacak - chh.borc ELSE 0 END) as "0_30_gun",
    SUM(CASE WHEN CURRENT_DATE - chh.vade_tarihi BETWEEN 31 AND 60 THEN chh.alacak - chh.borc ELSE 0 END) as "31_60_gun",
    SUM(CASE WHEN CURRENT_DATE - chh.vade_tarihi BETWEEN 61 AND 90 THEN chh.alacak - chh.borc ELSE 0 END) as "61_90_gun",
    SUM(CASE WHEN CURRENT_DATE - chh.vade_tarihi > 90 THEN chh.alacak - chh.borc ELSE 0 END) as "90_gun_uzeri",
    SUM(chh.alacak - chh.borc) as toplam_borc
FROM cari_hesaplar ch
JOIN cari_hesap_hareketleri chh ON ch.id = chh.cari_hesap_id
WHERE chh.vade_tarihi IS NOT NULL
  AND (chh.alacak - chh.borc) > 0
GROUP BY ch.cari_kod, ch.cari_unvan;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE ON yevmiye_fisleri, yevmiye_fisi_detaylari TO authenticated;
GRANT INSERT, UPDATE ON cari_hesaplar, cari_hesap_hareketleri TO authenticated;
GRANT INSERT, UPDATE ON banka_hesaplari, banka_hareketleri TO authenticated;
GRANT INSERT, UPDATE ON kasa_hareketleri TO authenticated;
GRANT SELECT ON hesap_plani, mali_donemler TO authenticated;

