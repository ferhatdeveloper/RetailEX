-- =============================================================================
-- 171: Beauty WhatsApp kampanya TASLAKLARI (tüm aktif firmalar)
-- Özel günler: is_active=false (UI'da Taslak; otomatik gönderim YOK).
-- Birthday: şablonlar + settings taslak (birthday_enabled=false, gift boş).
-- Önkoşul: 167 (+169 gender_filter, 170 birthday_gift).
-- =============================================================================

DO $$
DECLARE
  f RECORD;
  v_prefix TEXT;
  v_fn TEXT;
  v_tpl TEXT;
  v_sd TEXT;
  v_ms TEXT;
BEGIN
  FOR f IN SELECT firm_nr FROM public.firms WHERE COALESCE(is_active, true) LOOP
    v_fn := lpad(f.firm_nr::text, 3, '0');
    v_prefix := lower('rex_' || f.firm_nr);
    v_tpl := v_prefix || '_message_templates';
    v_sd := v_prefix || '_special_days';
    v_ms := v_prefix || '_messaging_settings';

    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gender_filter VARCHAR(20)', v_sd);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS birthday_gift_text TEXT', v_ms);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS birthday_upcoming_exact BOOLEAN DEFAULT false', v_ms);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Skip firm % — messaging tabloları yok', f.firm_nr;
      CONTINUE;
    END;

    -- Şablonlar (aktif listede görünür; kampanya henüz taslak)
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000001', v_fn, E'[Taslak] Valentine KU', E'بە بۆنەی ڕۆژی ڤاڵانتاین ١٤/٢، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویست ئامادە کردووە.\nبۆ ماوەیەکی سنووردار، بە ڕێژەی ٪٣٠ داشکاندن لەسەر خزمەتگوزارییەکانمان.\nلەگەڵ ئێمە ڤاڵانتاینێکی جوانتر بەسەر ببەن.\nئەکوا بیوتی سەنتەر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000002', v_fn, E'[Taslak] Valentine AR', E'بمناسبة عيد الحب 14/2، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا لكم.\nلفترة محدودة، خصم 30٪ على خدماتنا.\nاحتفلوا معنا بعيد حب أجمل.\nأكوا بيوتي سنتر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000003', v_fn, E'[Taslak] Öğrenci Günü KU', E'بە بۆنەی ڕۆژی قوتابی ١٨/٢، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ قوتابییە خۆشەویستەکانمان ئامادە کردووە.\n٪٥٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە مەرجی هەبوونی کارتی قوتابی.\nڕۆژی قوتابییەکانتان پیرۆز بێت.\nئەکوا بیوتی سەنتەر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000004', v_fn, E'[Taslak] Öğrenci Günü AR', E'بمناسبة يوم الطالب 18/2، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا للطلاب.\nخصم 50٪ على خدماتنا، بشرط إبراز بطاقة الطالب.\nكل عام وطلابنا الأعزاء بألف خير.\nأكوا بيوتي سنتر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000005', v_fn, E'[Taslak] Kadınlar Günü KU', E'بە بۆنەی ڕۆژی جیهانی ئافرەت ٨/٣، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ هەموو ئافرەتە خۆشەویستەکانمان ئامادە کردووە.\n٪٣٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم ڕۆژە تایبەتە.\nڕۆژی جیهانی ئافرەتتان پیرۆز بێت.\nئەکوا بیوتی سەنتەر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000006', v_fn, E'[Taslak] Kadınlar Günü AR', E'بمناسبة اليوم العالمي للمرأة 8/3، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا لجميع السيدات العزيزات.\nخصم 30٪ على خدماتنا، احتفالًا بهذا اليوم المميز.\nكل عام وأنتنّ بألف خير.\nأكوا بيوتي سنتر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000007', v_fn, E'[Taslak] Nevruz KU', E'بە بۆنەی جەژنی نەورۆز ٢١/٣، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.\n٪٣٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم جەژنە جوانە.\nنەورۆزتان پیرۆز بێت، ساڵێکی پڕ لە خۆشی و سەرکەوتن بۆ هەمووتان بە ئاوات دەخوازین.\nئەکوا بیوتی سەنتەر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000008', v_fn, E'[Taslak] Nevruz AR', E'بمناسبة عيد نوروز 21/3، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.\nخصم 30٪ على خدماتنا احتفالًا بهذا العيد الجميل.\nكل عام وأنتم بخير، ونتمنى لكم عامًا مليئًا بالفرح والنجاح.\nأكوا بيوتي سنتر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000009', v_fn, E'[Taslak] Sağlık Günü KU', E'بە بۆنەی ڕۆژی تەندروستی جیهانی ٧/٤، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.\n٪٢٥ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم ڕۆژە تایبەتە.\nتەندروستی و جوانیتان هەمیشە لە گرنگترینەکانە.\nئەکوا بیوتی سەنتەر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000010', v_fn, E'[Taslak] Sağlık Günü AR', E'بمناسبة اليوم العالمي للصحة 7/4، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.\nخصم 25٪ على خدماتنا احتفالًا بهذا اليوم المميز.\nلأن صحتكم وجمالكم دائمًا من أولوياتنا.\nأكوا بيوتي سنتر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000011', v_fn, E'[Taslak] Hicri Yılbaşı KU', E'بە بۆنەی سەری ساڵی نوێی هیجری ١٦/٦، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.\n٪٢٥ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم ڕۆژە تایبەتە.\nساڵی نوێی هیجریتان پیرۆز بێت، هیوادارین ساڵێکی پڕ لە خۆشی و سەرکەوتن بێت.\nئەکوا بیوتی سەنتەر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000012', v_fn, E'[Taslak] Hicri Yılbaşı AR', E'بمناسبة رأس السنة الهجرية 16/6، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.\nخصم 25٪ على خدماتنا احتفالًا بهذه المناسبة.\nكل عام وأنتم بخير، ونتمنى لكم سنة هجرية جديدة مليئة بالفرح والنجاح.\nأكوا بيوتي سنتر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000013', v_fn, E'[Taslak] Mevlid KU', E'بە بۆنەی مولودی پێغەمبەر ﷺ لە ٢٥/٨، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.\n٪٤٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم ڕۆژە پیرۆزە.\nمولودی پێغەمبەر ﷺ تان پیرۆز بێت، هیوادارین ئەم بۆنەیە بۆ هەمووتان پڕ لە خۆشی و ئارامی بێت.\nئەکوا بیوتی سەنتەر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000014', v_fn, E'[Taslak] Mevlid AR', E'بمناسبة المولد النبوي الشريف 25/8، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.\nخصم 40٪ على خدماتنا احتفالًا بهذه المناسبة المباركة.\nكل عام وأنتم بخير بمناسبة المولد النبوي الشريف ﷺ.\nأكوا بيوتي سنتر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000015', v_fn, E'[Taslak] Gadir KU', E'بە بۆنەی جەژنی غەدیر، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.\n٪٢٥ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم جەژنە پیرۆزە.\nجەژنی غەدیرتان پیرۆز بێت.\nئەکوا بیوتی سەنتەر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000016', v_fn, E'[Taslak] Gadir AR', E'بمناسبة عيد الغدير، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.\nخصم 25٪ على خدماتنا احتفالًا بهذه المناسبة المباركة.\nعيد غدير مبارك عليكم.\nأكوا بيوتي سنتر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000017', v_fn, E'[Taslak] Doğum Günü KU', E'بە بۆنەی ڕۆژی لەدایکبوون\nبۆ خانم/بەڕێز: {customer_name}\nلە لایەن ئەکوا بیوتی سەنتەرەوە، بە خۆشحاڵییەوە\nدیارییەکی تایبەت بۆت ئامادە کراوە: {gift}\nهیوادارین ڕۆژی لەدایکبوونت پڕ بێت لە خۆشی و جوانی.\nلەگەڵ خۆشەویستی،\nئەکوا بیوتی سەنتەر', 'birthday'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000018', v_fn, E'[Taslak] Doğum Günü AR', E'بمناسبة عيد ميلاد\nللسيدة/السيدة: {customer_name}\nمن أكوا بيوتي سنتر، نقدم لكِ هدية خاصة بمناسبة عيد ميلادكِ:\nجلسة {gift} مجانًا\nنتمنى لكِ عيد ميلاد سعيدًا مليئًا بالفرح والجمال.\nمع محبتنا،\nأكوا بيوتي سنتر', 'birthday'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000019', v_fn, E'[Taslak] Miladi Yılbaşı KU', E'بە بۆنەی سەری ساڵی نوێ ١/١، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.\n٪٢٥ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی سەری ساڵی نوێ.\nساڵی نوێتان پیرۆز بێت، هیوادارین ساڵێکی پڕ لە خۆشی، سەرکەوتن و جوانی بێت.\nئەکوا بیوتی سەنتەر', 'special_day'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, body_text, category, is_active)
       VALUES (%L, %L, %L, %L, %L, true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, body_text=EXCLUDED.body_text,
         category=EXCLUDED.category, is_active=true, updated_at=CURRENT_TIMESTAMP',
      v_tpl, 'a1000001-aaaa-4aaa-8aaa-000000000020', v_fn, E'[Taslak] Miladi Yılbaşı AR', E'بمناسبة رأس السنة الميلادية 1/1، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.\nخصم 25٪ على خدماتنا احتفالًا بالعام الجديد.\nكل عام وأنتم بخير، ونتمنى لكم سنة مليئة بالفرح والنجاح والجمال.\nأكوا بيوتي سنتر', 'special_day'
    );

    -- Özel gün TASLAKLARI (is_active=false)
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000001', v_fn, E'[Taslak] Valentine KU', 2, 14, 15, '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000001'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000002', v_fn, E'[Taslak] Valentine AR', 2, 14, 14, '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000002'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000003', v_fn, E'[Taslak] Öğrenci Günü KU', 2, 18, 4, '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000003'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000004', v_fn, E'[Taslak] Öğrenci Günü AR', 2, 18, 4, '11:00', 'a1000001-aaaa-4aaa-8aaa-000000000004'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, 'female', false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000005', v_fn, E'[Taslak] Kadınlar Günü KU', 3, 8, 3, '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000005'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, 'female', false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000006', v_fn, E'[Taslak] Kadınlar Günü AR', 3, 8, 3, '11:00', 'a1000001-aaaa-4aaa-8aaa-000000000006'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000007', v_fn, E'[Taslak] Nevruz KU', 3, 21, 12, '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000007'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000008', v_fn, E'[Taslak] Nevruz AR', 3, 21, 12, '11:00', 'a1000001-aaaa-4aaa-8aaa-000000000008'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000009', v_fn, E'[Taslak] Sağlık Günü KU', 4, 7, 2, '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000009'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000010', v_fn, E'[Taslak] Sağlık Günü AR', 4, 7, 2, '11:00', 'a1000001-aaaa-4aaa-8aaa-000000000010'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000011', v_fn, E'[Taslak] Hicri Yılbaşı KU', 6, 16, 2, '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000011'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000012', v_fn, E'[Taslak] Hicri Yılbaşı AR', 6, 16, 2, '11:00', 'a1000001-aaaa-4aaa-8aaa-000000000012'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000013', v_fn, E'[Taslak] Mevlid KU', 8, 25, 5, '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000013'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000014', v_fn, E'[Taslak] Mevlid AR', 8, 25, 5, '11:00', 'a1000001-aaaa-4aaa-8aaa-000000000014'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000015', v_fn, E'[Taslak] Gadir KU', 5, 31, 0, '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000015'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000016', v_fn, E'[Taslak] Gadir AR', 5, 31, 0, '11:00', 'a1000001-aaaa-4aaa-8aaa-000000000016'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000017', v_fn, E'[Taslak] Miladi Yılbaşı KU', 1, 1, 17, '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000019'
    );
    EXECUTE format(
      'INSERT INTO public.%I (id, firm_nr, name, month, day, days_before, send_time, template_id, gender_filter, is_active)
       VALUES (%L, %L, %L, %s, %s, %s, %L, %L, NULL, false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, month=EXCLUDED.month, day=EXCLUDED.day,
         days_before=EXCLUDED.days_before, send_time=EXCLUDED.send_time, template_id=EXCLUDED.template_id,
         gender_filter=EXCLUDED.gender_filter, is_active=false, updated_at=CURRENT_TIMESTAMP',
      v_sd, 'a2000001-bbbb-4bbb-8bbb-000000000018', v_fn, E'[Taslak] Miladi Yılbaşı AR', 1, 1, 17, '11:00', 'a1000001-aaaa-4aaa-8aaa-000000000020'
    );

    -- Birthday otomasyon taslağı (kapalı; hediye boş; 2 gün önce tam)
    EXECUTE format(
      'UPDATE public.%I SET
         birthday_enabled = false,
         birthday_mode = %L,
         birthday_upcoming_days = 2,
         birthday_upcoming_exact = true,
         birthday_send_time = %L,
         birthday_template_id = %L::uuid,
         birthday_gift_text = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id IN (SELECT id FROM public.%I ORDER BY created_at ASC NULLS LAST LIMIT 1)',
      v_ms, 'upcoming', '10:00', 'a1000001-aaaa-4aaa-8aaa-000000000017', v_ms
    );
    RAISE NOTICE 'WhatsApp kampanya taslakları OK: firm=%', f.firm_nr;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
