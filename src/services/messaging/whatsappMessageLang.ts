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
  tr: 'Merhaba {customer_name}, sizinle iletişime geçmek istedik. Asin',
  en: 'Hello {customer_name}, we would like to get in touch with you. Asin',
  ar: 'مرحباً {customer_name}، نود التواصل معك. Asin',
  ku: 'سڵاو {customer_name}، دەمانەوێت پەیوەندیت پێوە بکەین. Asin',
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
      return `Hello ${name}, you have a follow-up reminder for ${service} on ${dueDate}. Asin`;
    case 'ar':
      return `مرحباً ${name}، لديك تذكير متابعة لـ ${service} بتاريخ ${dueDate}. Asin`;
    case 'ku':
      return `سڵاو ${name}، لە ${dueDate} بۆ ${service} بیرەوەرگرتنەکەت هەیە. Asin`;
    default:
      return `Merhaba ${name}, ${dueDate} tarihinde ${service} için takip hatırlatmanız bulunmaktadır. Asin`;
  }
}

export function normalizeWhatsAppMessageLang(raw: string | null | undefined): WhatsAppMessageLang {
  const v = String(raw ?? 'tr').trim().toLowerCase();
  if (v === 'en' || v === 'ar' || v === 'ku') return v;
  return 'tr';
}

/** Serbest metin hazır şablon kimlikleri (Evolution / Embedded / önizleme) */
export type WhatsAppFreeTextPresetId =
  | 'customer_greeting'
  | 'appointment_reminder'
  | 'payment_reminder'
  | 'custom';

export const WHATSAPP_FREE_TEXT_PRESET_OPTIONS: Array<{
  id: WhatsAppFreeTextPresetId;
  labelKey:
    | 'msgNotifyTplGreeting'
    | 'msgNotifyTplAppointment'
    | 'msgNotifyTplPayment'
    | 'msgNotifyTplCustom';
}> = [
  { id: 'customer_greeting', labelKey: 'msgNotifyTplGreeting' },
  { id: 'appointment_reminder', labelKey: 'msgNotifyTplAppointment' },
  { id: 'payment_reminder', labelKey: 'msgNotifyTplPayment' },
  { id: 'custom', labelKey: 'msgNotifyTplCustom' },
];

const FREE_TEXT_PRESET_TEMPLATES: Record<
  Exclude<WhatsAppFreeTextPresetId, 'custom'>,
  Record<WhatsAppMessageLang, string>
> = {
  customer_greeting: CUSTOMER_BROADCAST_TEMPLATES,
  appointment_reminder: {
    tr: 'Merhaba {customer_name}, {date} tarihinde saat {time} için randevunuz bulunmaktadır. Asin',
    en: 'Hello {customer_name}, you have an appointment on {date} at {time}. Asin',
    ar: 'مرحباً {customer_name}، لديك موعد بتاريخ {date} الساعة {time}. Asin',
    ku: 'سڵاو {customer_name}، لە {date} کاتژمێر {time} خزمەتگوزارییەکەت هەیە. Asin',
  },
  payment_reminder: {
    tr: 'Sayın {customer_name}, {date} vadesine kadar ödemeniz beklenmektedir. Asin',
    en: 'Dear {customer_name}, your payment is expected by {date}. Asin',
    ar: 'عزيزي {customer_name}، يُتوقع سدادك قبل {date}. Asin',
    ku: 'ڕێزدار {customer_name}، پارەدان پێش {date} چاوەڕوان دەکرێت. Asin',
  },
};

export function getFreeTextPresetTemplate(
  presetId: WhatsAppFreeTextPresetId,
  lang: WhatsAppMessageLang,
): string {
  if (presetId === 'custom') return CUSTOMER_BROADCAST_TEMPLATES[lang];
  return FREE_TEXT_PRESET_TEMPLATES[presetId][lang];
}

/** Meta şablon ailesi — dil değişince eşleşen şablon adı */
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

