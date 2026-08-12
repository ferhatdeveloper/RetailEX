-- ============================================================================
-- 017: Beauty — Müşteri memnuniyet anketleri (çok dilli sorular) + geri bildirim
-- ============================================================================
-- beauty.rex_{firma}_beauty_satisfaction_surveys
-- beauty.rex_{firma}_beauty_satisfaction_questions (labels_json: tr, en, ar, ku)
-- beauty.rex_{firma}_{dönem}_beauty_customer_feedback: survey_id, survey_answers
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_prefix TEXT;
  v_surveys TEXT;
  v_questions TEXT;
BEGIN
  FOR r IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
    v_prefix := lower('rex_' || r.firm_nr);
    v_surveys := v_prefix || '_beauty_satisfaction_surveys';
    v_questions := v_prefix || '_beauty_satisfaction_questions';

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_surveys);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        survey_id UUID NOT NULL REFERENCES beauty.%I(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        question_type VARCHAR(30) DEFAULT 'rating',
        scale_max SMALLINT DEFAULT 5,
        is_required BOOLEAN DEFAULT true,
        labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_questions, v_surveys);
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_satisfaction_questions$'
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON beauty.%I (survey_id)',
      r.tablename || '_survey_id', r.tablename);
  END LOOP;
END $$;

-- Geri bildirim tablolarına anket alanları
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_customer_feedback$'
  LOOP
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS survey_id UUID', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS survey_answers JSONB', r.tablename);
  END LOOP;
END $$;
