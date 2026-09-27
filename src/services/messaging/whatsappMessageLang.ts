/** WhatsApp toplu / hatırlatma mesajı dili (TR, EN, AR, Sorani/KU) */

export type WhatsAppMessageLang = 'tr' | 'en' | 'ar' | 'ku';

export const WHATSAPP_MESSAGE_LANG_OPTIONS: Array<{
  id: WhatsAppMessageLang;
  labelKey: 'turkish' | 'english' | 'arabic' | 'kurdish';
}> = [
  { id: 'tr', labelKey: 'turkish' },
  { id: 'en', labelKey: 'english' },
  { id: 'ar', labelKey: 'arabic' },
  { id: 'ku', labelKey: 'kurdish' },
];

export const FOLLOW_UP_REMINDER_TIME_LABEL: Record<WhatsAppMessageLang, string> = {
  tr: 'Hatırlatma',
  en: 'Reminder',
  ar: 'تذكير',
  ku: 'بیرەوەرگرتن',
};

export const CUSTOMER_BROADCAST_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  tr: 'Merhaba {customer_name}, sizinle iletişime geçmek istedik. RetailEX',
  en: 'Hello {customer_name}, we would like to get in touch with you. RetailEX',
  ar: 'مرحباً {customer_name}، نود التواصل معك. RetailEX',
  ku: 'سڵاو {customer_name}، دەمانەوێت پەیوەندیت پێوە بکەین. RetailEX',
};

export const AQUA_VALENTINE_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی ڕۆژی ڤاڵانتاین ١٤/٢، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویست ئامادە کردووە.
بۆ ماوەیەکی سنووردار، بە ڕێژەی ٪٣٠ داشکاندن لەسەر خزمەتگوزارییەکانمان.
لەگەڵ ئێمە ڤاڵانتاینێکی جوانتر بەسەر ببەن.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة عيد الحب 14/2، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا لكم.
لفترة محدودة، خصم 30٪ على خدماتنا.
احتفلوا معنا بعيد حب أجمل.
أكوا بيوتي سنتر`,
  tr: `Sevgililer Günü 14/2 — %30 indirim (sınırlı süre). Aqua Beauty Center`,
  en: `Valentine's Day 14/2 — 30% off (limited). Aqua Beauty Center`,
};

export const AQUA_STUDENT_DAY_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی ڕۆژی قوتابی ١٨/٢، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ قوتابییە خۆشەویستەکانمان ئامادە کردووە.
٪٥٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە مەرجی هەبوونی کارتی قوتابی.
ڕۆژی قوتابییەکانتان پیرۆز بێت.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة يوم الطالب 18/2، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا للطلاب.
خصم 50٪ على خدماتنا، بشرط إبراز بطاقة الطالب.
كل عام وطلابنا الأعزاء بألف خير.
أكوا بيوتي سنتر`,
  tr: `Öğrenci Günü 18/2 — %50 (öğrenci kartı şart). Aqua Beauty Center`,
  en: `Student Day 18/2 — 50% (student card required). Aqua Beauty Center`,
};

export const AQUA_WOMENS_DAY_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی ڕۆژی جیهانی ئافرەت ٨/٣، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ هەموو ئافرەتە خۆشەویستەکانمان ئامادە کردووە.
٪٣٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم ڕۆژە تایبەتە.
ڕۆژی جیهانی ئافرەتتان پیرۆز بێت.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة اليوم العالمي للمرأة 8/3، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا لجميع السيدات العزيزات.
خصم 30٪ على خدماتنا، احتفالًا بهذا اليوم المميز.
كل عام وأنتنّ بألف خير.
أكوا بيوتي سنتر`,
  tr: `Kadınlar Günü 8/3 — %30. Aqua Beauty Center`,
  en: `Women's Day 8/3 — 30%. Aqua Beauty Center`,
};

export const AQUA_NEVRUZ_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی جەژنی نەورۆز ٢١/٣، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.
٪٣٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم جەژنە جوانە.
نەورۆزتان پیرۆز بێت، ساڵێکی پڕ لە خۆشی و سەرکەوتن بۆ هەمووتان بە ئاوات دەخوازین.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة عيد نوروز 21/3، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.
خصم 30٪ على خدماتنا احتفالًا بهذا العيد الجميل.
كل عام وأنتم بخير، ونتمنى لكم عامًا مليئًا بالفرح والنجاح.
أكوا بيوتي سنتر`,
  tr: `Nevruz 21/3 — %30. Aqua Beauty Center`,
  en: `Nowruz 21/3 — 30%. Aqua Beauty Center`,
};

export const AQUA_HEALTH_DAY_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی ڕۆژی تەندروستی جیهانی ٧/٤، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.
٪٢٥ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم ڕۆژە تایبەتە.
تەندروستی و جوانیتان هەمیشە لە گرنگترینەکانە.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة اليوم العالمي للصحة 7/4، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.
خصم 25٪ على خدماتنا احتفالًا بهذا اليوم المميز.
لأن صحتكم وجمالكم دائمًا من أولوياتنا.
أكوا بيوتي سنتر`,
  tr: `Sağlık Günü 7/4 — %25. Aqua Beauty Center`,
  en: `World Health Day 7/4 — 25%. Aqua Beauty Center`,
};

export const AQUA_HIJRI_NEW_YEAR_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی سەری ساڵی نوێی هیجری ١٦/٦، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.
٪٢٥ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم ڕۆژە تایبەتە.
ساڵی نوێی هیجریتان پیرۆز بێت، هیوادارین ساڵێکی پڕ لە خۆشی و سەرکەوتن بێت.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة رأس السنة الهجرية 16/6، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.
خصم 25٪ على خدماتنا احتفالًا بهذه المناسبة.
كل عام وأنتم بخير، ونتمنى لكم سنة هجرية جديدة مليئة بالفرح والنجاح.
أكوا بيوتي سنتر`,
  tr: `Hicri yılbaşı 16/6 — %25. Aqua Beauty Center`,
  en: `Hijri New Year 16/6 — 25%. Aqua Beauty Center`,
};

export const AQUA_MAWLID_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی مولودی پێغەمبەر ﷺ لە ٢٥/٨، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.
٪٤٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم ڕۆژە پیرۆزە.
مولودی پێغەمبەر ﷺ تان پیرۆز بێت، هیوادارین ئەم بۆنەیە بۆ هەمووتان پڕ لە خۆشی و ئارامی بێت.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة المولد النبوي الشريف 25/8، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.
خصم 40٪ على خدماتنا احتفالًا بهذه المناسبة المباركة.
كل عام وأنتم بخير بمناسبة المولد النبوي الشريف ﷺ.
أكوا بيوتي سنتر`,
  tr: `Mevlid-i Nebi 25/8 — %40. Aqua Beauty Center`,
  en: `Mawlid 25/8 — 40%. Aqua Beauty Center`,
};

export const AQUA_GHADIR_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی جەژنی غەدیر، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.
٪٢٥ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم جەژنە پیرۆزە.
جەژنی غەدیرتان پیرۆز بێت.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة عيد الغدير، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.
خصم 25٪ على خدماتنا احتفالًا بهذه المناسبة المباركة.
عيد غدير مبارك عليكم.
أكوا بيوتي سنتر`,
  tr: `Gadir Bayramı — %25. Aqua Beauty Center`,
  en: `Eid al-Ghadir — 25%. Aqua Beauty Center`,
};

/** {customer_name} + {gift}/{service} — hediye sabit değil */
export const AQUA_BIRTHDAY_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی ڕۆژی لەدایکبوون
بۆ خانم/بەڕێز: {customer_name}
لە لایەن ئەکوا بیوتی سەنتەرەوە، بە خۆشحاڵییەوە
دیارییەکی تایبەت بۆت ئامادە کراوە: {gift}
هیوادارین ڕۆژی لەدایکبوونت پڕ بێت لە خۆشی و جوانی.
لەگەڵ خۆشەویستی،
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة عيد ميلاد
للسيدة/السيدة: {customer_name}
من أكوا بيوتي سنتر، نقدم لكِ هدية خاصة بمناسبة عيد ميلادكِ:
جلسة {gift} مجانًا
نتمنى لكِ عيد ميلاد سعيدًا مليئًا بالفرح والجمال.
مع محبتنا،
أكوا بيوتي سنتر`,
  tr: `Doğum gününüz kutlu olsun {customer_name}. Hediyeniz: {gift}. Aqua Beauty Center`,
  en: `Happy birthday {customer_name}. Your gift: {gift}. Aqua Beauty Center`,
};

export const AQUA_GREGORIAN_NEW_YEAR_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی سەری ساڵی نوێ ١/١، ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.
٪٢٥ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی سەری ساڵی نوێ.
ساڵی نوێتان پیرۆز بێت، هیوادارین ساڵێکی پڕ لە خۆشی، سەرکەوتن و جوانی بێت.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة رأس السنة الميلادية 1/1، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.
خصم 25٪ على خدماتنا احتفالًا بالعام الجديد.
كل عام وأنتم بخير، ونتمنى لكم سنة مليئة بالفرح والنجاح والجمال.
أكوا بيوتي سنتر`,
  tr: `Yılbaşı 1/1 — %25. Aqua Beauty Center`,
  en: `New Year 1/1 — 25%. Aqua Beauty Center`,
};

/** Ramazan Bayramı 9/3 %30; gönderim 1/3 (−8g) */
export const AQUA_RAMADAN_EID_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی جەژنی ڕەمەزان ٩/٣ ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.
٪٣٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم جەژنە پیرۆزە.
جەژنی ڕەمەزانتان پیرۆز بێت و هیوادارین پڕ بێت لە خۆشی و ئارامی.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة عيد رمضان٩/٣، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.
خصم 30٪ على خدماتنا احتفالًا بهذه المناسبة المباركة.
كل عام وأنتم بخير، وعيد رمضان مبارك عليكم.
أكوا بيوتي سنتر`,
  tr: `Ramazan Bayramı 9/3 — %30. Aqua Beauty Center`,
  en: `Eid al-Fitr / Ramadan Eid 9/3 — 30%. Aqua Beauty Center`,
};

/** Kurban Bayramı 16/5 %30; gönderim 1/5 (−15g) */
export const AQUA_KURBAN_EID_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  ku: `بە بۆنەی جەژنی قوربان، ١٦/٥ئەکوا بیوتی سەنتەر داشكانيكي تایبەتی بۆ ئێوەی خۆشەویستمان ئامادە کردووە.
٪٣٠ داشکاندن لەسەر خزمەتگوزارییەکانمان، بە بۆنەی ئەم جەژنە پیرۆزە.
جەژنی قوربانتان پیرۆز بێت، هیوادارین ڕۆژێکی پڕ لە خۆشی و ئارامی بێت.
ئەکوا بیوتی سەنتەر`,
  ar: `بمناسبة عيد الأضحى المبارك ١٦/٥ ، يقدم لكم أكوا بيوتي سنتر عرضًا خاصًا.
خصم 30٪ على خدماتنا احتفالًا بهذه المناسبة المباركة.
عيد أضحى مبارك عليكم، ونتمنى لكم أيامًا مليئة بالفرح والراحة.
أكوا بيوتي سنتر`,
  tr: `Kurban Bayramı 16/5 — %30. Aqua Beauty Center`,
  en: `Eid al-Adha 16/5 — 30%. Aqua Beauty Center`,
};

export function metaAppointmentTemplateIdForLang(lang: WhatsAppMessageLang): string {
  return `retailex_appointment_${lang}`;
}

export function buildFollowUpFreeText(
  lang: WhatsAppMessageLang,
  name: string,
  dueDate: string,
  service: string,
): string {
  switch (lang) {
    case 'en':
      return `Hello ${name}, you have a follow-up reminder for ${service} on ${dueDate}. RetailEX`;
    case 'ar':
      return `مرحباً ${name}، لديك تذكير متابعة لـ ${service} بتاريخ ${dueDate}. RetailEX`;
    case 'ku':
      return `سڵاو ${name}، لە ${dueDate} بۆ ${service} بیرەوەرگرتنەکەت هەیە. RetailEX`;
    default:
      return `Merhaba ${name}, ${dueDate} tarihinde ${service} için takip hatırlatmanız bulunmaktadır. RetailEX`;
  }
}

export function normalizeWhatsAppMessageLang(raw: string | null | undefined): WhatsAppMessageLang {
  const v = String(raw ?? 'tr').trim().toLowerCase();
  if (v === 'en' || v === 'ar' || v === 'ku') return v;
  return 'tr';
}

export type WhatsAppFreeTextPresetId =
  | 'customer_greeting'
  | 'appointment_reminder'
  | 'payment_reminder'
  | 'aqua_valentine'
  | 'aqua_student_day'
  | 'aqua_womens_day'
  | 'aqua_nevruz'
  | 'aqua_health_day'
  | 'aqua_hijri_new_year'
  | 'aqua_mawlid'
  | 'aqua_ghadir'
  | 'aqua_birthday'
  | 'aqua_gregorian_new_year'
  | 'aqua_ramadan_eid'
  | 'aqua_kurban_eid'
  | 'custom';

export const WHATSAPP_FREE_TEXT_PRESET_OPTIONS: Array<{
  id: WhatsAppFreeTextPresetId;
  labelKey:
    | 'msgNotifyTplGreeting'
    | 'msgNotifyTplAppointment'
    | 'msgNotifyTplPayment'
    | 'msgNotifyTplAquaValentine'
    | 'msgNotifyTplAquaStudentDay'
    | 'msgNotifyTplAquaWomensDay'
    | 'msgNotifyTplAquaNevruz'
    | 'msgNotifyTplAquaHealthDay'
    | 'msgNotifyTplAquaHijriNewYear'
    | 'msgNotifyTplAquaMawlid'
    | 'msgNotifyTplAquaGhadir'
    | 'msgNotifyTplAquaBirthday'
    | 'msgNotifyTplAquaGregorianNewYear'
    | 'msgNotifyTplAquaRamadanEid'
    | 'msgNotifyTplAquaKurbanEid'
    | 'msgNotifyTplCustom';
}> = [
  { id: 'customer_greeting', labelKey: 'msgNotifyTplGreeting' },
  { id: 'appointment_reminder', labelKey: 'msgNotifyTplAppointment' },
  { id: 'payment_reminder', labelKey: 'msgNotifyTplPayment' },
  { id: 'aqua_valentine', labelKey: 'msgNotifyTplAquaValentine' },
  { id: 'aqua_student_day', labelKey: 'msgNotifyTplAquaStudentDay' },
  { id: 'aqua_womens_day', labelKey: 'msgNotifyTplAquaWomensDay' },
  { id: 'aqua_nevruz', labelKey: 'msgNotifyTplAquaNevruz' },
  { id: 'aqua_health_day', labelKey: 'msgNotifyTplAquaHealthDay' },
  { id: 'aqua_hijri_new_year', labelKey: 'msgNotifyTplAquaHijriNewYear' },
  { id: 'aqua_mawlid', labelKey: 'msgNotifyTplAquaMawlid' },
  { id: 'aqua_ghadir', labelKey: 'msgNotifyTplAquaGhadir' },
  { id: 'aqua_birthday', labelKey: 'msgNotifyTplAquaBirthday' },
  { id: 'aqua_gregorian_new_year', labelKey: 'msgNotifyTplAquaGregorianNewYear' },
  { id: 'aqua_ramadan_eid', labelKey: 'msgNotifyTplAquaRamadanEid' },
  { id: 'aqua_kurban_eid', labelKey: 'msgNotifyTplAquaKurbanEid' },
  { id: 'custom', labelKey: 'msgNotifyTplCustom' },
];

const FREE_TEXT_PRESET_TEMPLATES: Record<
  Exclude<WhatsAppFreeTextPresetId, 'custom'>,
  Record<WhatsAppMessageLang, string>
> = {
  customer_greeting: CUSTOMER_BROADCAST_TEMPLATES,
  appointment_reminder: {
    tr: 'Merhaba {customer_name}, {date} tarihinde saat {time} için randevunuz bulunmaktadır. RetailEX',
    en: 'Hello {customer_name}, you have an appointment on {date} at {time}. RetailEX',
    ar: 'مرحباً {customer_name}، لديك موعد بتاريخ {date} الساعة {time}. RetailEX',
    ku: 'سڵاو {customer_name}، لە {date} کاتژمێر {time} خزمەتگوزارییەکەت هەیە. RetailEX',
  },
  payment_reminder: {
    tr: 'Sayın {customer_name}, {date} vadesine kadar ödemeniz beklenmektedir. RetailEX',
    en: 'Dear {customer_name}, your payment is expected by {date}. RetailEX',
    ar: 'عزيزي {customer_name}، يُتوقع سدادك قبل {date}. RetailEX',
    ku: 'ڕێزدار {customer_name}، پارەدان پێش {date} چاوەڕوان دەکرێت. RetailEX',
  },
  aqua_valentine: AQUA_VALENTINE_TEMPLATES,
  aqua_student_day: AQUA_STUDENT_DAY_TEMPLATES,
  aqua_womens_day: AQUA_WOMENS_DAY_TEMPLATES,
  aqua_nevruz: AQUA_NEVRUZ_TEMPLATES,
  aqua_health_day: AQUA_HEALTH_DAY_TEMPLATES,
  aqua_hijri_new_year: AQUA_HIJRI_NEW_YEAR_TEMPLATES,
  aqua_mawlid: AQUA_MAWLID_TEMPLATES,
  aqua_ghadir: AQUA_GHADIR_TEMPLATES,
  aqua_birthday: AQUA_BIRTHDAY_TEMPLATES,
  aqua_gregorian_new_year: AQUA_GREGORIAN_NEW_YEAR_TEMPLATES,
  aqua_ramadan_eid: AQUA_RAMADAN_EID_TEMPLATES,
  aqua_kurban_eid: AQUA_KURBAN_EID_TEMPLATES,
};

export function getFreeTextPresetTemplate(
  presetId: WhatsAppFreeTextPresetId,
  lang: WhatsAppMessageLang,
): string {
  if (presetId === 'custom') return CUSTOMER_BROADCAST_TEMPLATES[lang];
  return FREE_TEXT_PRESET_TEMPLATES[presetId][lang];
}

export type WhatsAppMetaPresetFamily = 'appointment' | 'payment' | 'invoice';

export function metaTemplateIdForPresetAndLang(
  family: WhatsAppMetaPresetFamily,
  lang: WhatsAppMessageLang,
): string {
  if (family === 'payment') return 'retailex_payment_reminder_tr';
  if (family === 'invoice') return `retailex_invoice_${lang}`;
  return metaAppointmentTemplateIdForLang(lang);
}

export function metaPresetFamilyForFreeTextPreset(
  presetId: WhatsAppFreeTextPresetId,
): WhatsAppMetaPresetFamily {
  if (presetId === 'payment_reminder') return 'payment';
  if (presetId === 'customer_greeting') return 'appointment';
  return 'appointment';
}
