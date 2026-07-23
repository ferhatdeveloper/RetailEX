/**
 * Meta WhatsApp Cloud API — onaylı mesaj şablonları kataloğu.
 * Şablon metinleri Meta Business Manager'da aynı isim/dil ile oluşturulmalıdır (UTILITY).
 */
import type { InvoiceNotificationContext } from './messagingTypes';

export type MetaTemplateCategory = 'UTILITY' | 'MARKETING';

export interface MetaWhatsAppTemplateDef {
  /** RetailEX iç kimlik + Meta şablon adı (küçük harf, alt çizgi) */
  id: string;
  metaName: string;
  language: string;
  category: MetaTemplateCategory;
  eventTypes: Array<'invoice_created' | 'appointment_reminder' | 'payment_reminder'>;
  label: string;
  /** Meta konsoluna yapıştırılacak gövde ({{1}} … sıralı parametreler) */
  bodyForMetaConsole: string;
  /** Opsiyonel üst bilgi — Meta'da ayrıca tanımlanır */
  headerForMetaConsole?: string;
  parameterLabels: string[];
  sampleValues: string[];
}

function categoryLabel(cat: string): string {
  const m: Record<string, string> = {
    Satis: 'Satış',
    Hizmet: 'Hizmet',
    Alis: 'Alış',
    Iade: 'İade',
    Irsaliye: 'İrsaliye',
    Siparis: 'Sipariş',
  };
  return m[cat] || cat || 'Fatura';
}

function amountWithCurrency(amount: string | number, currency: string): string {
  const a = String(amount ?? '0').trim();
  const c = String(currency || 'IQD').trim().toUpperCase();
  return `${a} ${c}`;
}

/** Meta şablon parametreleri — sıra bodyForMetaConsole {{n}} ile aynı olmalı */
export function buildMetaInvoiceBodyParameters(
  template: MetaWhatsAppTemplateDef,
  ctx: InvoiceNotificationContext
): string[] {
  const cat = categoryLabel(ctx.category);
  const amt = amountWithCurrency(ctx.amount, ctx.currency);
  if (template.id === 'retailex_invoice_compact_tr') {
    return [ctx.customer_name, ctx.fiche_no, amt, ctx.date];
  }
  return [ctx.customer_name, ctx.fiche_no, ctx.date, amt, cat];
}

export function buildMetaAppointmentBodyParameters(ctx: {
  name: string;
  date: string;
  time: string;
  service: string;
}): string[] {
  return [ctx.name, ctx.date, ctx.time, ctx.service];
}

export function buildMetaPaymentReminderBodyParameters(ctx: {
  name: string;
  fiche_no: string;
  amount_currency: string;
  due_date: string;
}): string[] {
  return [ctx.name, ctx.fiche_no, ctx.amount_currency, ctx.due_date];
}

export function previewMetaTemplateBody(
  template: MetaWhatsAppTemplateDef,
  parameters: string[]
): string {
  let out = template.bodyForMetaConsole;
  parameters.forEach((val, i) => {
    out = out.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), val);
  });
  return out;
}

/** Fatura bildirimi — Meta UTILITY şablonları */
export const META_INVOICE_TEMPLATES: MetaWhatsAppTemplateDef[] = [
  {
    id: 'retailex_invoice_tr',
    metaName: 'retailex_invoice_tr',
    language: 'tr',
    category: 'UTILITY',
    eventTypes: ['invoice_created'],
    label: 'Fatura bildirimi (Türkçe)',
    headerForMetaConsole: 'Fatura Bilgilendirme',
    bodyForMetaConsole:
      'Sayın {{1}}, {{2}} numaralı {{5}} faturanız {{3}} tarihinde düzenlenmiştir. Tutar: {{4}}. Teşekkürler — RetailEX',
    parameterLabels: ['Müşteri adı', 'Fiş no', 'Tarih', 'Tutar (para birimi)', 'Fatura türü'],
    sampleValues: ['Ahmet Yılmaz', 'SF-2026-0042', '2026-06-09', '1.500 IQD', 'Satış'],
  },
  {
    id: 'retailex_invoice_en',
    metaName: 'retailex_invoice_en',
    language: 'en',
    category: 'UTILITY',
    eventTypes: ['invoice_created'],
    label: 'Invoice notification (English)',
    headerForMetaConsole: 'Invoice Notice',
    bodyForMetaConsole:
      'Dear {{1}}, your {{5}} invoice {{2}} dated {{3}} has been issued. Amount: {{4}}. Thank you — RetailEX',
    parameterLabels: ['Customer name', 'Invoice no', 'Date', 'Amount', 'Type'],
    sampleValues: ['John Smith', 'INV-2026-0042', '2026-06-09', '1,500 IQD', 'Sales'],
  },
  {
    id: 'retailex_invoice_ar',
    metaName: 'retailex_invoice_ar',
    language: 'ar',
    category: 'UTILITY',
    eventTypes: ['invoice_created'],
    label: 'إشعار فاتورة (عربي)',
    headerForMetaConsole: 'إشعار فاتورة',
    bodyForMetaConsole:
      'عزيزي {{1}}، تم إصدار فاتورة {{5}} رقم {{2}} بتاريخ {{3}}. المبلغ: {{4}}. شكراً — RetailEX',
    parameterLabels: ['اسم العميل', 'رقم الفاتورة', 'التاريخ', 'المبلغ', 'النوع'],
    sampleValues: ['أحمد', 'SF-2026-0042', '2026-06-09', '1500 IQD', 'مبيعات'],
  },
  {
    id: 'retailex_invoice_compact_tr',
    metaName: 'retailex_invoice_compact_tr',
    language: 'tr',
    category: 'UTILITY',
    eventTypes: ['invoice_created'],
    label: 'Fatura bildirimi — kısa (TR)',
    bodyForMetaConsole: '{{1}}, {{2}} no\'lu faturanız: {{3}} ({{4}}). RetailEX',
    parameterLabels: ['Müşteri', 'Fiş no', 'Tutar', 'Tarih'],
    sampleValues: ['Ahmet Yılmaz', 'SF-0042', '1.500 IQD', '09.06.2026'],
  },
];

/** Randevu hatırlatma — Meta UTILITY */
export const META_APPOINTMENT_TEMPLATES: MetaWhatsAppTemplateDef[] = [
  {
    id: 'retailex_appointment_tr',
    metaName: 'retailex_appointment_tr',
    language: 'tr',
    category: 'UTILITY',
    eventTypes: ['appointment_reminder'],
    label: 'Randevu hatırlatma (Türkçe)',
    headerForMetaConsole: 'Randevu Hatırlatma',
    bodyForMetaConsole:
      'Merhaba {{1}}, {{2}} tarihinde saat {{3}} için {{4}} randevunuz bulunmaktadır. RetailEX',
    parameterLabels: ['Müşteri adı', 'Tarih', 'Saat', 'Hizmet'],
    sampleValues: ['Ayşe Demir', '10.06.2026', '14:30', 'Cilt bakımı'],
  },
  {
    id: 'retailex_appointment_en',
    metaName: 'retailex_appointment_en',
    language: 'en',
    category: 'UTILITY',
    eventTypes: ['appointment_reminder'],
    label: 'Appointment reminder (English)',
    headerForMetaConsole: 'Appointment Reminder',
    bodyForMetaConsole:
      'Hello {{1}}, you have an appointment for {{4}} on {{2}} at {{3}}. RetailEX',
    parameterLabels: ['Name', 'Date', 'Time', 'Service'],
    sampleValues: ['Jane Doe', '2026-06-10', '14:30', 'Facial care'],
  },
  {
    id: 'retailex_appointment_ar',
    metaName: 'retailex_appointment_ar',
    language: 'ar',
    category: 'UTILITY',
    eventTypes: ['appointment_reminder'],
    label: 'تذكير موعد (عربي)',
    headerForMetaConsole: 'تذكير الموعد',
    bodyForMetaConsole:
      'مرحباً {{1}}، لديك موعد {{4}} بتاريخ {{2}} الساعة {{3}}. RetailEX',
    parameterLabels: ['اسم العميل', 'التاريخ', 'الوقت', 'الخدمة'],
    sampleValues: ['أحمد', '10.06.2026', '14:30', 'العناية بالبشرة'],
  },
  {
    id: 'retailex_appointment_ku',
    metaName: 'retailex_appointment_ku',
    language: 'ku',
    category: 'UTILITY',
    eventTypes: ['appointment_reminder'],
    label: 'بیرەوەرگرتنی کات (کوردی)',
    headerForMetaConsole: 'بیرەوەرگرتنی کات',
    bodyForMetaConsole:
      'سڵاو {{1}}، لە {{2}} کاتژمێر {{3}} بۆ {{4}} خزمەتگوزارییەکەت هەیە. RetailEX',
    parameterLabels: ['ناوی کڕیار', 'بەروار', 'کات', 'خزمەتگوزاری'],
    sampleValues: ['سارا', '10.06.2026', '14:30', 'چاودێری پێست'],
  },
];

/** Ödeme / vade hatırlatma */
export const META_PAYMENT_TEMPLATES: MetaWhatsAppTemplateDef[] = [
  {
    id: 'retailex_payment_reminder_tr',
    metaName: 'retailex_payment_reminder_tr',
    language: 'tr',
    category: 'UTILITY',
    eventTypes: ['payment_reminder'],
    label: 'Ödeme hatırlatma (Türkçe)',
    bodyForMetaConsole:
      'Sayın {{1}}, {{2}} numaralı belgeniz için {{4}} vadesine kadar {{3}} ödemeniz beklenmektedir. RetailEX',
    parameterLabels: ['Müşteri', 'Belge no', 'Tutar', 'Vade tarihi'],
    sampleValues: ['Mehmet Kaya', 'SF-0099', '2.000 IQD', '15.06.2026'],
  },
];

export const ALL_META_WHATSAPP_TEMPLATES: MetaWhatsAppTemplateDef[] = [
  ...META_INVOICE_TEMPLATES,
  ...META_APPOINTMENT_TEMPLATES,
  ...META_PAYMENT_TEMPLATES,
];

export function findMetaTemplate(
  idOrName: string | null | undefined,
  language?: string | null
): MetaWhatsAppTemplateDef | undefined {
  const key = String(idOrName || '').trim();
  if (!key) return undefined;
  const lang = language ? String(language).trim().toLowerCase() : '';
  return ALL_META_WHATSAPP_TEMPLATES.find(
    (t) =>
      (t.id === key || t.metaName === key) &&
      (!lang || t.language.toLowerCase() === lang)
  );
}

export function resolveMetaInvoiceTemplate(
  templateId: string | null | undefined,
  language: string | null | undefined
): MetaWhatsAppTemplateDef {
  return (
    findMetaTemplate(templateId, language) ||
    findMetaTemplate('retailex_invoice_tr', 'tr') ||
    META_INVOICE_TEMPLATES[0]!
  );
}

export function resolveMetaAppointmentTemplate(
  templateId: string | null | undefined,
  language: string | null | undefined
): MetaWhatsAppTemplateDef {
  return (
    findMetaTemplate(templateId, language) ||
    findMetaTemplate('retailex_appointment_tr', 'tr') ||
    META_APPOINTMENT_TEMPLATES[0]!
  );
}

export function resolveMetaAppointmentTemplateForLang(
  lang: string | null | undefined
): MetaWhatsAppTemplateDef {
  const key = String(lang || 'tr').trim().toLowerCase();
  return (
    findMetaTemplate(`retailex_appointment_${key}`, key) ||
    resolveMetaAppointmentTemplate(null, key)
  );
}

/** Meta Business Manager kurulum notları */
export function metaTemplateSetupSteps(template: MetaWhatsAppTemplateDef): string[] {
  const steps = [
    'Meta Business Suite → WhatsApp Manager → Message templates → Create template',
    `Kategori: ${template.category}`,
    `Şablon adı: ${template.metaName} (tam eşleşmeli)`,
    `Dil: ${template.language}`,
  ];
  if (template.headerForMetaConsole) {
    steps.push(`Header (TEXT): ${template.headerForMetaConsole}`);
  }
  steps.push(`Body: ${template.bodyForMetaConsole}`);
  steps.push(`Örnek değerler: ${template.sampleValues.join(' | ')}`);
  steps.push('Onay sonrası RetailEX\'te aynı şablon adını seçin.');
  return steps;
}

export interface MetaTemplatePayload {
  meta_template_name: string;
  meta_template_language: string;
  meta_body_parameters: string[];
}

export function buildMetaInvoiceQueuePayload(
  settings: { meta_invoice_template_name?: string | null; meta_invoice_template_language?: string | null },
  ctx: InvoiceNotificationContext
): MetaTemplatePayload {
  const tpl = resolveMetaInvoiceTemplate(
    settings.meta_invoice_template_name,
    settings.meta_invoice_template_language
  );
  return {
    meta_template_name: tpl.metaName,
    meta_template_language: tpl.language,
    meta_body_parameters: buildMetaInvoiceBodyParameters(tpl, ctx),
  };
}

export function buildMetaAppointmentQueuePayload(
  settings: {
    meta_appointment_template_name?: string | null;
    meta_appointment_template_language?: string | null;
  },
  ctx: { name: string; date: string; time: string; service: string },
  langOverride?: string | null
): MetaTemplatePayload {
  const tpl = langOverride
    ? resolveMetaAppointmentTemplateForLang(langOverride)
    : resolveMetaAppointmentTemplate(
        settings.meta_appointment_template_name,
        settings.meta_appointment_template_language
      );
  return {
    meta_template_name: tpl.metaName,
    meta_template_language: tpl.language,
    meta_body_parameters: buildMetaAppointmentBodyParameters(ctx),
  };
}

export function parseMetaTemplateQueuePayload(
  payload: Record<string, unknown> | null | undefined
): MetaTemplatePayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const name = payload.meta_template_name;
  const lang = payload.meta_template_language;
  const params = payload.meta_body_parameters;
  if (typeof name !== 'string' || !name.trim()) return null;
  if (typeof lang !== 'string' || !lang.trim()) return null;
  if (!Array.isArray(params)) return null;
  return {
    meta_template_name: name.trim(),
    meta_template_language: lang.trim(),
    meta_body_parameters: params.map((p) => String(p ?? '')),
  };
}
