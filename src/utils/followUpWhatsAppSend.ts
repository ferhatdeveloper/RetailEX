import type { BeautyFollowUpReminder } from '../types/beauty';
import { messagingService } from '../services/messaging/messagingService';
import {
  buildMetaAppointmentQueuePayload,
  previewMetaTemplateBody,
  resolveMetaAppointmentTemplateForLang,
} from '../services/messaging/metaWhatsAppTemplates';
import {
  buildFollowUpFreeText,
  FOLLOW_UP_REMINDER_TIME_LABEL,
  type WhatsAppMessageLang,
} from '../services/messaging/whatsappMessageLang';
import {
  DEFAULT_WHATSAPP_BULK_INTERVAL_MS,
  type WhatsAppBulkPreviewItem,
  runWhatsAppBulkCampaign,
} from './whatsappBulkSend';

function serviceLabel(r: BeautyFollowUpReminder): string {
  if (r.reminder_kind === 'product' && r.product_name?.trim()) {
    return r.product_name.trim();
  }
  return r.service_name?.trim() || 'Hizmet';
}

function normalizePhone(raw: string | undefined): string {
  return String(raw ?? '').replace(/\D/g, '');
}

function reminderKey(r: BeautyFollowUpReminder): string {
  return `${r.customer_id}|${r.service_id}|${r.due_date}|${r.product_id ?? ''}`;
}

export function followUpReminderKey(r: BeautyFollowUpReminder): string {
  return reminderKey(r);
}

export type FollowUpWhatsAppBuild = {
  phone: string;
  name: string;
  messageText: string;
  payload_json: Record<string, unknown> | null;
  reference_id: string;
};

export async function buildFollowUpWhatsAppPayload(
  reminder: BeautyFollowUpReminder,
  options?: { lang?: WhatsAppMessageLang },
): Promise<FollowUpWhatsAppBuild | null> {
  const phone = normalizePhone(reminder.customer_phone);
  if (!phone || phone.length < 10) return null;

  const lang = options?.lang ?? 'tr';
  const settings = await messagingService.getSettings();
  const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();
  const dueDate = reminder.due_date;
  const service = serviceLabel(reminder);
  const name = reminder.customer_name?.trim() || 'Müşteri';

  let messageText = buildFollowUpFreeText(lang, name, dueDate, service);
  let payload_json: Record<string, unknown> | null = null;

  if (provider === 'META' && settings) {
    const payload = buildMetaAppointmentQueuePayload(
      settings,
      {
        name,
        date: dueDate,
        time: FOLLOW_UP_REMINDER_TIME_LABEL[lang],
        service,
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
    reference_id: `${reminder.customer_id}-${reminder.service_id}-${dueDate}`,
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

export async function enqueueFollowUpReminderWhatsApp(
  reminder: BeautyFollowUpReminder,
): Promise<{ ok: boolean; error?: string }> {
  const ready = await ensureWhatsAppReady();
  if (!ready.ok) return { ok: false, error: ready.error };

  const built = await buildFollowUpWhatsAppPayload(reminder);
  if (!built) {
    return { ok: false, error: 'Müşteri telefon numarası yok veya geçersiz.' };
  }

  await messagingService.enqueueNotification({
    event_type: 'follow_up_reminder',
    channel: 'whatsapp',
    recipient_phone: built.phone,
    recipient_name: built.name,
    message_text: built.messageText,
    reference_type: 'follow_up_reminder',
    reference_id: built.reference_id,
    payload_json: built.payload_json,
  });
  return { ok: true };
}

/**
 * Takip hatırlatması kartından WhatsApp gönderir (kuyruğa ekler ve işler).
 */
export async function sendFollowUpReminderWhatsApp(
  reminder: BeautyFollowUpReminder,
): Promise<{ success: boolean; error?: string }> {
  const enq = await enqueueFollowUpReminderWhatsApp(reminder);
  if (!enq.ok) return { success: false, error: enq.error };

  const proc = await messagingService.processPendingQueue(5);
  if (proc.errors.length > 0) {
    return { success: false, error: proc.errors[0] };
  }
  if (proc.processed < 1) {
    return { success: false, error: 'Mesaj kuyruğa alındı ancak gönderilemedi.' };
  }
  return { success: true };
}

export function filterFollowUpRemindersForBulk(
  reminders: BeautyFollowUpReminder[],
  options?: { includeShadow?: boolean },
): BeautyFollowUpReminder[] {
  const includeShadow = options?.includeShadow === true;
  const seen = new Set<string>();
  const out: BeautyFollowUpReminder[] = [];
  for (const r of reminders) {
    if (!includeShadow && r.is_natural_shadow) continue;
    if (r.follow_up_status === 'dismissed') continue;
    const phone = normalizePhone(r.customer_phone);
    if (!phone || phone.length < 10) continue;
    const key = reminderKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Telefon numarasi olmayan / gecersiz olan hatirlatmalari ayirir.
 * Toplu gonderimde "Telefonu eksik musteriler" listesini olusturmak icin kullanilir.
 */
export interface MissingFollowUpRecipient {
  id: string;
  name: string;
  reason: 'no_phone' | 'invalid_phone' | 'dismissed' | 'shadow';
  service: string;
  due_date: string;
  customer_id?: string | null;
  phone_raw?: string | null;
}

export function partitionFollowUpRemindersForBulk(
  reminders: BeautyFollowUpReminder[],
  options?: { includeShadow?: boolean },
): {
  eligible: BeautyFollowUpReminder[];
  missing: MissingFollowUpRecipient[];
} {
  const includeShadow = options?.includeShadow === true;
  const seen = new Set<string>();
  const eligible: BeautyFollowUpReminder[] = [];
  const missing: MissingFollowUpRecipient[] = [];
  for (const r of reminders) {
    if (r.follow_up_status === 'dismissed') {
      missing.push({
        id: reminderKey(r),
        name: r.customer_name?.trim() || 'Musteri',
        reason: 'dismissed',
        service: serviceLabel(r),
        due_date: r.due_date,
        customer_id: r.customer_id,
        phone_raw: r.customer_phone,
      });
      continue;
    }
    if (!includeShadow && r.is_natural_shadow) {
      missing.push({
        id: reminderKey(r),
        name: r.customer_name?.trim() || 'Musteri',
        reason: 'shadow',
        service: serviceLabel(r),
        due_date: r.due_date,
        customer_id: r.customer_id,
        phone_raw: r.customer_phone,
      });
      continue;
    }
    const phone = normalizePhone(r.customer_phone);
    if (!phone || phone.length < 10) {
      missing.push({
        id: reminderKey(r),
        name: r.customer_name?.trim() || 'Musteri',
        reason: r.customer_phone?.trim() ? 'invalid_phone' : 'no_phone',
        service: serviceLabel(r),
        due_date: r.due_date,
        customer_id: r.customer_id,
        phone_raw: r.customer_phone,
      });
      continue;
    }
    const key = reminderKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    eligible.push(r);
  }
  return { eligible, missing };
}

/**
 * Toplu gönderim önizleme listesi (gönderimden önce gösterilir).
 */
export async function buildFollowUpBulkPreviewList(
  reminders: BeautyFollowUpReminder[],
  options?: { includeShadow?: boolean; lang?: WhatsAppMessageLang },
): Promise<WhatsAppBulkPreviewItem[]> {
  const { items, missing: _missing } = await buildFollowUpBulkPreviewWithMissing(
    reminders,
    options,
  );
  return items;
}

/**
 * buildFollowUpBulkPreviewList + telefonu eksik / gecersiz olan musteriler.
 * Bulk preview modalinda "Telefonu eksik" tab'i icin kullanilir.
 */
export async function buildFollowUpBulkPreviewWithMissing(
  reminders: BeautyFollowUpReminder[],
  options?: { includeShadow?: boolean; lang?: WhatsAppMessageLang },
): Promise<{ items: WhatsAppBulkPreviewItem[]; missing: MissingFollowUpRecipient[] }> {
  const { eligible, missing } = partitionFollowUpRemindersForBulk(reminders, options);
  const out: WhatsAppBulkPreviewItem[] = [];
  for (const r of eligible) {
    const built = await buildFollowUpWhatsAppPayload(r, { lang: options?.lang });
    if (!built) {
      // Bireysel payload insasi basarisiz (locale, template vs.) — missing'e dus.
      missing.push({
        id: reminderKey(r),
        name: r.customer_name?.trim() || 'Musteri',
        reason: r.customer_phone?.trim() ? 'invalid_phone' : 'no_phone',
        service: serviceLabel(r),
        due_date: r.due_date,
        customer_id: r.customer_id,
        phone_raw: r.customer_phone,
      });
      continue;
    }
    const service = serviceLabel(r);
    out.push({
      id: reminderKey(r),
      name: built.name,
      phone: built.phone,
      messageText: built.messageText,
      contextLine: `${service} · ${r.due_date}`,
      reference_type: 'follow_up_reminder',
      reference_id: built.reference_id,
      payload_json: built.payload_json,
      event_type: 'follow_up_reminder',
    });
  }
  return { items: out, missing };
}

/**
 * Tarih aralığındaki hatırlatmalar için toplu WhatsApp (kuyruk + aralıklı işleme).
 */
export async function sendFollowUpRemindersBulkWhatsApp(
  reminders: BeautyFollowUpReminder[],
  options?: { includeShadow?: boolean; processLimit?: number; intervalMs?: number },
): Promise<{ queued: number; sent: number; skipped: number; errors: string[] }> {
  const items = await buildFollowUpBulkPreviewList(reminders, options);
  return runWhatsAppBulkCampaign(items, {
    intervalMs: options?.intervalMs ?? DEFAULT_WHATSAPP_BULK_INTERVAL_MS,
  });
}
