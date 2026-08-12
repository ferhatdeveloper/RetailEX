-- Güzellik takip hatırlatması: ertelenince orijinal vade tarihinde isteğe bağlı gösterim

DO $$
DECLARE
  r RECORD;
  v_actions TEXT;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_follow_up_reminder_actions$'
  LOOP
    v_actions := r.tablename;
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS show_natural_when_postponed BOOLEAN NOT NULL DEFAULT false',
      v_actions
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
