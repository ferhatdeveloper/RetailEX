-- ============================================================================
-- 039: Güzellik merkezi varsayılan memnuniyet anketi (TR / EN / AR / KU)
-- Her aktif firma için tek aktif anket; yoksa eklenir (idempotent).
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_surveys TEXT;
  v_questions TEXT;
  v_survey_id UUID;
  v_exists INT;
  c_survey_name CONSTANT TEXT := 'Güzellik Merkezi Memnuniyet Anketi';
BEGIN
  FOR r IN SELECT firm_nr FROM public.firms WHERE COALESCE(is_active, true) LOOP
    v_surveys := lower('rex_' || r.firm_nr || '_beauty_satisfaction_surveys');
    v_questions := lower('rex_' || r.firm_nr || '_beauty_satisfaction_questions');

    IF to_regclass('beauty.' || quote_ident(v_surveys)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT COUNT(*) FROM beauty.%I WHERE name = $1', v_surveys)
      INTO v_exists
      USING c_survey_name;

    IF v_exists > 0 THEN
      CONTINUE;
    END IF;

    v_survey_id := gen_random_uuid();

    EXECUTE format(
      'INSERT INTO beauty.%I (id, name, is_active, sort_order) VALUES ($1, $2, true, 0)',
      v_surveys
    ) USING v_survey_id, c_survey_name;

    EXECUTE format(
      'UPDATE beauty.%I SET is_active = false, updated_at = NOW() WHERE id <> $1 AND is_active = true',
      v_surveys
    ) USING v_survey_id;

    EXECUTE format(
      'INSERT INTO beauty.%I (survey_id, sort_order, question_type, scale_max, is_required, labels_json) VALUES
        ($1, 0, ''rating'', 5, true, $2::jsonb),
        ($1, 1, ''rating'', 5, true, $3::jsonb),
        ($1, 2, ''rating'', 5, true, $4::jsonb),
        ($1, 3, ''rating'', 5, true, $5::jsonb),
        ($1, 4, ''rating'', 5, true, $6::jsonb),
        ($1, 5, ''yes_no'', 5, true, $7::jsonb),
        ($1, 6, ''text'', 5, false, $8::jsonb)',
      v_questions
    )
    USING
      v_survey_id,
      '{"tr":"Genel memnuniyetiniz nedir?","en":"How satisfied are you overall with your visit?","ar":"ما مدى رضاك العام عن زيارتك؟","ku":"بە گشتی چەند لە سەردانەکەت ڕازیت؟"}',
      '{"tr":"Personelimizin ilgi ve profesyonelliğini nasıl değerlendirirsiniz?","en":"How would you rate our staff''s attentiveness and professionalism?","ar":"كيف تقيم اهتمام واحترافية موظفينا؟","ku":"چۆن سەرنج و پیشەیی کارمەندەکانمان هەڵدەسەنگێنیت؟"}',
      '{"tr":"Merkezimizin temizlik ve hijyen düzeyini nasıl buldunuz?","en":"How would you rate the cleanliness and hygiene of our center?","ar":"كيف تقيم مستوى النظافة والنظافة الصحية في مركزنا؟","ku":"چۆن ئاستی پاکی و پاکیزەیی ناوەندەکەمان هەڵدەسەنگێنیت؟"}',
      '{"tr":"Aldığınız hizmet veya tedavi kalitesini nasıl değerlendirirsiniz?","en":"How would you rate the quality of the service or treatment you received?","ar":"كيف تقيم جودة الخدمة أو العلاج الذي تلقيته؟","ku":"چۆن کوالیتی خزمەت یان چارەسەری وەرگرتووت هەڵدەسەنگێنیت؟"}',
      '{"tr":"Randevu saatinize uyuldu mu ve bekleme süreniz makul müydü?","en":"Was your appointment on time and was the waiting period reasonable?","ar":"هل تم الالتزام بموعدك وهل كانت فترة الانتظار معقولة؟","ku":"ئایا کاتی چاوپێکەوتنەکەت لە کاتی خۆیدا بوو و چاوەڕوانی گونجاو بوو؟"}',
      '{"tr":"Bizi çevrenize tavsiye eder misiniz?","en":"Would you recommend our beauty center to others?","ar":"هل توصي بمركزنا للآخرين؟","ku":"ئایا ناوەندەکەمان بە کەسانی تر پێشنیار دەکەیت؟"}',
      '{"tr":"Eklemek istediğiniz görüş veya öneriniz var mı?","en":"Do you have any additional comments or suggestions?","ar":"هل لديك أي ملاحظات أو اقتراحات إضافية؟","ku":"هیچ بۆچوون یان پێشنیارێکی زیادەت هەیە؟"}';
  END LOOP;
END $$;
