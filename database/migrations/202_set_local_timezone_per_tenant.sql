-- ============================================================================
-- Migration 202: Tenant DB'lerde local timezone ayarla
-- ----------------------------------------------------------------------------
-- Sorun: Postgres default timezone = `Etc/UTC`. Kullanıcının local TR saatinde
-- gece yarısından sonra yapılan satışlar (örn. 4 Ekim 01:07 TR) Postgres'te
-- UTC 3 Ekim 22:07 olarak tutuluyor. Raporlar `date::date BETWEEN ...` ile
-- local TR tarihe göre filtrelerse, satışın UTC tarihi (3 Ekim) local TR
-- tarihine (4 Ekim) uymadığı için rapora girmiyor.
--
-- Çözüm: Her tenant'ın kendi local timezone'unu DB session default'una
-- ayarlayalım. Bu sayede `s.date::date` gibi implicit timezone'a bağlı
-- cast'ler local tarihe göre sonuç döner.
--
-- Varsayım: şu an elimizde tek bir saat dilimi var (TR). Tenant başına
-- timezone config eklenirse burada dinamik yapılabilir.
-- ============================================================================

DO $$
DECLARE
  -- Tenant listesi: tüm RetailEX kiracıları
  tenant_dbs TEXT[] := ARRAY[
    'retailex_local',
    'aqua_beauty',
    'berzin_com',
    'canon',
    'guzel',
    'kasap',
    'lovan',
    'mettu',
    'retailex_demo',
    'testere',
    'ferhat'
  ];
  dbname TEXT;
BEGIN
  FOREACH dbname IN ARRAY tenant_dbs LOOP
    -- DB mevcut mu?
    IF NOT EXISTS (
      SELECT 1 FROM pg_database WHERE datname = dbname
    ) THEN
      CONTINUE;
    END IF;

    -- Bu DB'de kalıcı timezone ayarla (yeni bağlantılarda devralınır)
    EXECUTE format('ALTER DATABASE %I SET timezone = ''Europe/Istanbul''', dbname);
    RAISE NOTICE '%: timezone = Europe/Istanbul ayarlandı', dbname;
  END LOOP;
END $$;

-- PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';