import type { Supplier } from '../services/api/suppliers';
import { normalizePhoneDigits } from '../services/messaging/clinicMessaging';
import { messagingService } from '../services/messaging/messagingService';
import {
  buildMetaAppointmentQueuePayload,
  previewMetaTemplateBody,
  resolveMetaAppointmentTemplateForLang,
} from '../services/messaging/metaWhatsAppTemplates';
import {
  CUSTOMER_BROADCAST_TEMPLATES,
  normalizeWhatsAppMessageLang,
  type WhatsAppMessageLang,
} from '../services/messaging/whatsappMessageLang';
import {
  DEFAULT_WHATSAPP_BULK_INTERVAL_MS,
  type WhatsAppBulkPreviewItem,
  runWhatsAppBulkCampaign,
} from './whatsappBulkSend';
import { customerCallWeekdaysLabel } from './customerCallPlan';

export type CallPlanWhatsAppPreset = 'greeting' | 'call_reminder' | 'custom';

const CALL_PLAN_REMINDER_TEMPLATES: Record<WhatsAppMessageLang, string> = {
  tr: 'Merhaba {customer_name}, arama listenizde yer alıyorsunuz ({call_days}). Bugün sipariş vermek ister misiniz? RetailEX',
  en: 'Hello {customer_name}, you are on our call list ({call_days}). Would you like to place an order today? RetailEX',
  ar: 'مرحباً {customer_name}، أنت في قائمة الاتصال ({call_days}). هل ترغب في تقديم طلب اليوم؟ RetailEX',
  ku: 'سڵاو {customer_name}، لە لیستی پەیوەندیدایت ({call_days}). ئەمڕۆ داواکاری دەدەیت؟ RetailEX',
};

function normalizePhone(raw: string | undefined | null): string {
  const digits = normalizePhoneDigits(String(raw ?? ''));
  return digits.length >= 10 ? digits : '';
}

export function supplierHasWhatsAppPhone(customer: Supplier): boolean {
  return normalizePhone(customer.phone).length >= 10;
}

function replaceCallPlanPlaceholders(
  template: string,
  customer: Supplier,
  extra?: Record<string, string>,
): string {
  const name = String(customer.name ?? '').trim() || 'Müşteri';
  const callDays = customerCallWeekdaysLabel(customer.call_plan_weekdays, true);
  const today = new Date().toISOString().slice(0, 10);
  const vars: Record<string, string> = {
    customer_name: name,
    name,
    call_days: callDays || '—',
    date: today,
    time: '14:00',
    ...extra,
  };
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

export function buildCallPlanMessageText(
  customer: Supplier,
  preset: CallPlanWhatsAppPreset,
  options?: { lang?: WhatsAppMessageLang; customText?: string },
): string {
  const lang = options?.lang ?? 'tr';
  if (preset === 'custom') {
    const raw = options?.customText?.trim();
    if (!raw) return replaceCallPlanPlaceholders(CUSTOMER_BROADCAST_TEMPLATES[lang], customer);
    return replaceCallPlanPlaceholders(raw, customer);
  }
  if (preset === 'greeting') {
    return replaceCallPlanPlaceholders(CUSTOMER_BROADCAST_TEMPLATES[lang], customer);
  }
  return replaceCallPlanPlaceholders(CALL_PLAN_REMINDER_TEMPLATES[lang], customer);
}

export type CallPlanWhatsAppBuild = {
  phone: string;
  name: string;
  messageText: string;
  payload_json: Record<string, unknown> | null;
  reference_id: string;
};

export async function buildCallPlanWhatsAppPayload(
  customer: Supplier,
  options?: {
    preset?: CallPlanWhatsAppPreset;
    lang?: WhatsAppMessageLang;
    customText?: string;
  },
): Promise<CallPlanWhatsAppBuild | null> {
  const phone = normalizePhone(customer.phone);
  if (!phone) return null;

  const lang = options?.lang ?? 'tr';
  const preset = options?.preset ?? 'greeting';
  const name = String(customer.name ?? '').trim() || 'Müşteri';
  const settings = await messagingService.getSettings();
  const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();

  let messageText = buildCallPlanMessageText(customer, preset, {
    lang,
    customText: options?.customText,
  });
  let payload_json: Record<string, unknown> | null = null;

  if (provider === 'META' && settings && preset !== 'custom') {
    const callDays = customerCallWeekdaysLabel(customer.call_plan_weekdays, true) || '—';
    const payload = buildMetaAppointmentQueuePayload(
      settings,
      {
        name,
        date: new Date().toISOString().slice(0, 10),
        time: callDays,
        service: preset === 'greeting' ? 'RetailEX' : 'Arama',
      },
      lang,
    );
    const tpl = resolveMetaAppointmentTemplateForLang(lang);
    messageText = previewMetaTemplateBody(tpl, payload.meta_body_parameters);
    payload_json = { ...payload };
  }

  return {
    phone,
    name,
    messageText,
    payload_json,
    reference_id: `call-plan-${customer.id}`,
  };
}

async function ensureWhatsAppReady(): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await messagingService.getSettings();
  const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();
  if (provider === 'NONE') {
    return {
      ok: false,
      error: 'WhatsApp kapalı. Yönetim → WhatsApp Entegrasyonu ekranından yapılandırın.',
    };
  }
  if (provider === 'EMBEDDED') {
    const st = await messagingService.getEmbeddedStatus();
    if (st.status !== 'connected') {
      return { ok: false, error: 'WhatsApp bağlı değil. QR ile bağlantı kurun.' };
    }
  }
  return { ok: true };
}

export function openCallPlanWhatsAppWeb(customer: Supplier, messageText: string): boolean {
  const phone = normalizePhone(customer.phone);
  if (!phone) return false;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`;
  window.open(url, '_blank');
  return true;
}

export async function sendCallPlanCustomerWhatsApp(
  customer: Supplier,
  options?: {
    preset?: CallPlanWhatsAppPreset;
    lang?: WhatsAppMessageLang;
    customText?: string;
    allowWebFallback?: boolean;
  },
): Promise<{ success: boolean; error?: string; usedWeb?: boolean }> {
  const built = await buildCallPlanWhatsAppPayload(customer, options);
  if (!built) {
    return { success: false, error: 'Müşteri telefon numarası yok veya geçersiz.' };
  }

  const ready = await ensureWhatsAppReady();
  if (!ready.ok) {
    if (options?.allowWebFallback !== false) {
      const opened = openCallPlanWhatsAppWeb(customer, built.messageText);
      if (opened) return { success: true, usedWeb: true };
    }
    return { success: false, error: ready.error };
  }

  await messagingService.enqueueNotification({
    event_type: 'customer_call_plan',
    channel: 'whatsapp',
    recipient_phone: built.phone,
    recipient_name: built.name,
    message_text: built.messageText,
    reference_type: 'customer_call_plan',
    reference_id: built.reference_id,
    payload_json: built.payload_json,
  });

  const proc = await messagingService.processPendingQueue(5);
  if (proc.errors.length > 0) {
    return { success: false, error: proc.errors[0] };
  }
  if (proc.processed < 1) {
    return { success: false, error: 'Mesaj kuyruğa alındı ancak gönderilemedi.' };
  }
  return { success: true };
}

export async function buildCallPlanBulkPreviewList(
  customers: Supplier[],
  options?: {
    preset?: CallPlanWhatsAppPreset;
    lang?: WhatsAppMessageLang;
    customText?: string;
  },
): Promise<WhatsAppBulkPreviewItem[]> {
  const lang = options?.lang ?? 'tr';
  const preset = options?.preset ?? 'call_reminder';
  const out: WhatsAppBulkPreviewItem[] = [];
  const seen = new Set<string>();

  for (const customer of customers) {
    const phone = normalizePhone(customer.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);

    const built = await buildCallPlanWhatsAppPayload(customer, {
      preset,
      lang,
      customText: options?.customText,
    });
    if (!built) continue;

    out.push({
      id: customer.id,
      name: built.name,
      phone: built.phone,
      messageText: built.messageText,
      contextLine: customerCallWeekdaysLabel(customer.call_plan_weekdays, true) || undefined,
      reference_type: 'customer_call_plan',
      reference_id: built.reference_id,
      payload_json: built.payload_json,
      event_type: 'customer_call_plan',
    });
  }
  return out;
}

export async function sendCallPlanCustomersBulkWhatsApp(
  customers: Supplier[],
  options?: {
    preset?: CallPlanWhatsAppPreset;
    lang?: WhatsAppMessageLang;
    customText?: string;
    intervalMs?: number;
  },
): Promise<{ queued: number; sent: number; skipped: number; errors: string[] }> {
  const items = await buildCallPlanBulkPreviewList(customers, options);
  return runWhatsAppBulkCampaign(items, {
    intervalMs: options?.intervalMs ?? DEFAULT_WHATSAPP_BULK_INTERVAL_MS,
  });
}

export function normalizeCallPlanMessageLang(raw: string | null | undefined): WhatsAppMessageLang {
  return normalizeWhatsAppMessageLang(raw);
}
