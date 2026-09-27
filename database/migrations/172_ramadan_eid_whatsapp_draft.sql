-- ============================================================================
-- 172: Ramazan Bayramı WhatsApp kampanya TASLAĞI (KU+AR)
-- Etkinlik 9/3, gönderim 1/3 (days_before=8), bulk all, is_active=false
-- Önkoşul: 171 (veya en az 167+169)
-- ============================================================================

DO $$
DECLARE
  f RECORD;
  v_prefix TEXT;
  v_fn TEXT;
  v_tpl TEXT;
  v_sd TEXT;
  id_ram_ku UUID := 'a1000001-aaaa-4aaa-8aaa-000000000021';
  id_ram_ar UUID := 'a1000001-aaaa-4aaa-8aaa-000000000022';
  sd_ram_ku UUID := 'a2000001-bbbb-4bbb-8bbb-000000000019';
  sd_ram_ar UUID := 'a2000001-bbbb-4bbb-8bbb-000000000020';
  body_ku TEXT := E'بە بۆنەی جەژنی ڕەمەزان ٩/٣ ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.\n٪٣٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم جەژنە پیرۆزە.\nجەژنی ڕەمەزانتان پیرۆز بێت و هیوادارین پڕ بێت لە خۆشی و ئارامی.\nئەکوا بیوتی سەنتەر';
  body_ar TEXT := E'بمناسبة عيد رمضان٩/٣، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.\nخصم 30٪ على خدماتنا احتفالًا بهذه المناسبة المباركة.\nكل عام وأنتم بخير، وعيد رمضان مبارك عليكم.\nأكوا بيوتي سنتر';
BEGIN
  FOR f IN SELECT firm_nr FROM public.firms WHERE COALESCE(is_active, true) LOOP
    v_fn := lpad(f.firm_nr::text, 3, '0');
    v_prefix := lower('rex_' || f.firm_nr);
    v_tpl := v_prefix || '_message_templates';
    v_sd := v_prefix || '_special_days';

    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gender_filter VARCHAR(20)', v_sd);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Skip firm % — special_days yok', f.firm_nr;
      CONTINUE;
    END;

    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, id_ram_ku, v_fn, E'[Taslak] Ramazan Bayramı KU', body_ku, 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, id_ram_ar, v_fn, E'[Taslak] Ramazan Bayramı AR', body_ar, 'special_day'
    );

    -- 9/3 etkinlik → 1/3 gönderim (−8 gün); taslak
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, sd_ram_ku, v_fn, E'[Taslak] Ramazan Bayramı KU', 3, 9, 8, '10:00', id_ram_ku
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, sd_ram_ar, v_fn, E'[Taslak] Ramazan Bayramı AR', 3, 9, 8, '11:00', id_ram_ar
    );

    RAISE NOTICE 'Ramazan Bayramı taslak OK: firm=%', f.firm_nr;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
