-- ============================================================================
-- 040: Güzellik merkezi memnuniyet anketi — genişletilmiş soru seti (TR/EN/AR/KU)
-- Mevcut "Güzellik Merkezi Memnuniyet Anketi" kaydına eksik soruları ekler (idempotent).
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_surveys TEXT;
  v_questions TEXT;
  v_survey_id UUID;
  c_survey_name CONSTANT TEXT := 'Güzellik Merkezi Memnuniyet Anketi';
  q RECORD;
BEGIN
  FOR r IN SELECT firm_nr FROM public.firms WHERE COALESCE(is_active, true) LOOP
    v_surveys := lower('rex_' || r.firm_nr || '_beauty_satisfaction_surveys');
    v_questions := lower('rex_' || r.firm_nr || '_beauty_satisfaction_questions');

    IF to_regclass('beauty.' || quote_ident(v_surveys)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT id FROM beauty.%I WHERE name = $1 LIMIT 1', v_surveys)
      INTO v_survey_id
      USING c_survey_name;

    IF v_survey_id IS NULL THEN
      CONTINUE;
    END IF;

    FOR q IN
      SELECT * FROM (VALUES
        (7,  'rating', 5, true,
          '{"tr":"Karşılama ve resepsiyon deneyiminizi nasıl değerlendirirsiniz?","en":"How would you rate your welcome and reception experience?","ar":"كيف تقيم تجربة الاستقبال والترحيب؟","ku":"چۆن ئەزموونی بەخێرهاتن و پێشوازی هەڵدەسەنگێنیت؟"}'),
        (8,  'rating', 5, true,
          '{"tr":"İşleminizi yapan uzman veya personelden ne kadar memnun kaldınız?","en":"How satisfied are you with the specialist or staff who performed your treatment?","ar":"ما مدى رضاك عن الأخصائي أو الموظف الذي أجرى علاجك؟","ku":"چەند لە پسپۆڕ یان کارمەندی چارەسەرەکەت ڕازیت؟"}'),
        (9,  'rating', 5, true,
          '{"tr":"Personelimiz güler yüzlü ve saygılı mıydı?","en":"Was our staff friendly and respectful?","ar":"هل كان موظفونا ودودين ومحترمين؟","ku":"ئایا کارمەندەکانمان دۆستانە و ڕێزدار بوون؟"}'),
        (10, 'yes_no', 5, true,
          '{"tr":"İşlem öncesi süreç ve beklentiler yeterince anlatıldı mı?","en":"Were the procedure and expectations explained clearly beforehand?","ar":"هل تم شرح الإجراء والتوقعات بوضوح مسبقًا؟","ku":"ئایا پێش چارەسەرەکە ڕوونکرایەوە چی دەبێت؟"}'),
        (11, 'rating', 5, true,
          '{"tr":"Bugün yapılan işlemden ve sonuçtan ne kadar memnunsunuz?","en":"How satisfied are you with today''s treatment and its results?","ar":"ما مدى رضاك عن العلاج اليوم ونتائجه؟","ku":"چەند لە چارەسەری ئەمڕۆ و ئەنجامەکەی ڕازیت؟"}'),
        (12, 'rating', 5, true,
          '{"tr":"İşlem sırasında konforunuzu nasıl değerlendirirsiniz?","en":"How comfortable did you feel during the treatment?","ar":"ما مدى راحتك أثناء العلاج؟","ku":"لە کاتی چارەسەرەکەدا چەند هەست بە ئارامی کرد؟"}'),
        (13, 'rating', 5, true,
          '{"tr":"Kullanılan ürün ve ekipman kalitesini nasıl buldunuz?","en":"How would you rate the quality of products and equipment used?","ar":"كيف تقيم جودة المنتجات والمعدات المستخدمة؟","ku":"چۆن کوالیتی بەرهەم و ئامێرە بەکارهاتووەکان هەڵدەسەنگێنیت؟"}'),
        (14, 'yes_no', 5, true,
          '{"tr":"Beklediğiniz sonucu aldınız mı?","en":"Did you achieve the result you expected?","ar":"هل حصلت على النتيجة التي توقعتها؟","ku":"ئایا ئەنجامی چاوەڕوانکراوت بەدەست هێنا؟"}'),
        (15, 'yes_no', 5, true,
          '{"tr":"İşlem sonrası bakım ve takip önerileri yeterince açıklandı mı?","en":"Were post-treatment care and follow-up instructions explained clearly?","ar":"هل تم شرح تعليمات العناية والمتابعة بعد العلاج بوضوح؟","ku":"ئایا ڕێنمایی چاودێری دوای چارەسەر بە شێوەیەکی ڕوون ڕوونکرایەوە؟"}'),
        (16, 'rating', 5, true,
          '{"tr":"Merkezimizin ortamı, atmosferi ve ferahlığını nasıl buldunuz?","en":"How would you rate the ambiance, atmosphere and comfort of our center?","ar":"كيف تقيم أجواء المركز وانسيابيته وراحته؟","ku":"چۆن کەش و هەوای ناوەندەکەمان هەڵدەسەنگێنیت؟"}'),
        (17, 'rating', 5, true,
          '{"tr":"Gizlilik ve mahremiyet hissinizi nasıl değerlendirirsiniz?","en":"How would you rate your sense of privacy and discretion?","ar":"كيف تقيم شعورك بالخصوصية والسرية؟","ku":"چۆن هەست بە تایبەتمەندی و نهێنی هەڵدەسەنگێنیت؟"}'),
        (18, 'rating', 5, true,
          '{"tr":"İşlem öncesi fiyat ve süre bilgilendirmesinin şeffaflığını nasıl buldunuz?","en":"How transparent was the pricing and duration information before treatment?","ar":"ما مدى شفافية معلومات السعر والمدة قبل العلاج؟","ku":"زانیاری نرخ و ماوە پێش چارەسەر چەند ڕوون بوو؟"}'),
        (19, 'rating', 5, true,
          '{"tr":"Aldığınız hizmet için fiyat-performans dengesinden memnun musunuz?","en":"Are you satisfied with the value for money of the service you received?","ar":"هل أنت راضٍ عن قيمة المال مقابل الخدمة التي تلقيتها؟","ku":"دە لە هاوسەنگی نرخ و کوالیتی خزمەتەکە ڕازیت؟"}'),
        (20, 'rating', 5, true,
          '{"tr":"Ödeme sürecinin kolaylığını nasıl değerlendirirsiniz?","en":"How would you rate the ease of the payment process?","ar":"كيف تقيم سهولة عملية الدفع؟","ku":"چۆن ئاسانی پرۆسەی پارەدان هەڵدەسەنگێنیت؟"}'),
        (21, 'yes_no', 5, true,
          '{"tr":"Merkezimizi tekrar ziyaret etmeyi düşünür müsünüz?","en":"Would you consider visiting our center again?","ar":"هل تفكر في زيارة مركزنا مرة أخرى؟","ku":"ئایا بیر لە سەردانکردنەوەی ناوەندەکەمان دەکەیتەوە؟"}'),
        (22, 'text', 5, false,
          '{"tr":"Geliştirmemizi istediğiniz bir alan var mı? (isteğe bağlı)","en":"Is there any area you would like us to improve? (optional)","ar":"هل هناك مجال تود أن نحسّنه؟ (اختياري)","ku":"ئایا بوارێک هەیە دەتەوێت باشتر بکەین؟ (ئارەزوومەندانە)"}'),
        (23, 'text', 5, false,
          '{"tr":"Beğendiğiniz personel veya eklemek istediğiniz övgü/not (isteğe bağlı)","en":"Staff member you appreciated or praise you would like to share (optional)","ar":"الموظف الذي أعجبك أو ملاحظة إطراء تود مشاركتها (اختياري)","ku":"کارمەندی حەزت پێی بوو یان ستایشێک دەتەوێت بنووسیت (ئارەزوومەندانە)"}')
      ) AS t(sort_order, question_type, scale_max, is_required, labels_json)
    LOOP
      EXECUTE format(
        'INSERT INTO beauty.%I (survey_id, sort_order, question_type, scale_max, is_required, labels_json)
         SELECT $1, $2, $3, $4, $5, $6::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM beauty.%I x
           WHERE x.survey_id = $1 AND x.labels_json->>''tr'' = ($6::jsonb->>''tr'')
         )',
        v_questions, v_questions
      )
      USING v_survey_id, q.sort_order, q.question_type, q.scale_max, q.is_required, q.labels_json;
    END LOOP;
  END LOOP;
END $$;
