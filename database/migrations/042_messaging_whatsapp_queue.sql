-- ============================================================================
-- 042: ERP geneli mesajlaşma ayarları + bildirim kuyruğu (WhatsApp / SMS)
-- Baileys köprüsü, Evolution, Meta — clinicMessaging ile uyumlu
-- ============================================================================

DO $$
DECLARE
  f RECORD;
  p RECORD;
  v_prefix TEXT;
  v_period_prefix TEXT;
  v_period_nr TEXT;
BEGIN
  FOR f IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
    v_prefix := lower('rex_' || f.firm_nr);
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sms_user VARCHAR(255),
        sms_password VARCHAR(255),
        sms_sender VARCHAR(80),
        sms_template TEXT,
        whatsapp_template TEXT,
        whatsapp_provider VARCHAR(30) DEFAULT 'NONE',
        whatsapp_base_url TEXT,
        whatsapp_token TEXT,
        whatsapp_instance_id VARCHAR(255),
        whatsapp_phone_id VARCHAR(80),
        default_reminder_channel VARCHAR(20) DEFAULT 'whatsapp',
        notify_invoice_whatsapp BOOLEAN DEFAULT false,
        invoice_whatsapp_template TEXT,
        notify_sale_categories TEXT DEFAULT 'Satis,Hizmet',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    $f$, v_prefix || '_messaging_settings');
  END LOOP;

  FOR f IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
    FOR p IN
      SELECT pr.nr
      FROM periods pr
      JOIN firms fm ON fm.id = pr.firm_id
      WHERE fm.firm_nr = f.firm_nr AND COALESCE(pr.is_active, true)
    LOOP
      v_period_nr := lpad(p.nr::text, 2, '0');
      v_period_prefix := lower('rex_' || f.firm_nr || '_' || v_period_nr);
      EXECUTE format($f$
        CREATE TABLE IF NOT EXISTS public.%I (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          firm_nr VARCHAR(10) NOT NULL,
          period_nr VARCHAR(10) NOT NULL,
          event_type VARCHAR(50) NOT NULL,
          channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
          recipient_phone VARCHAR(30),
          recipient_name VARCHAR(255),
          message_text TEXT,
          reference_type VARCHAR(50),
          reference_id UUID,
          payload_json JSONB DEFAULT '{}'::jsonb,
          status VARCHAR(20) DEFAULT 'pending',
          scheduled_at TIMESTAMPTZ,
          sent_at TIMESTAMPTZ,
          error_text TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      $f$, v_period_prefix || '_notification_queue');
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (status, created_at DESC)',
        v_period_prefix || '_notification_queue_status_idx',
        v_period_prefix || '_notification_queue'
      );
    END LOOP;
  END LOOP;
END $$;
