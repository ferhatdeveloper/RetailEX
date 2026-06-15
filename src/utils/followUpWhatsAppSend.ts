import type { BeautyFollowUpReminder } from '../types/beauty';
import { messagingService } from '../services/messaging/messagingService';
import {
  buildMetaAppointmentQueuePayload,
  previewMetaTemplateBody,
  resolveMetaAppointmentTemplate,
} from '../services/messaging/metaWhatsAppTemplates';

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

export type FollowUpWhatsAppBuild = {
  phone: string;
  name: string;
  messageText: string;
  payload_json: Record<string, unknown> | null;
  reference_id: string;
};

export async function buildFollowUpWhatsAppPayload(
  reminder: BeautyFollowUpReminder,
): Promise<FollowUpWhatsAppBuild | null> {
  const phone = normalizePhone(reminder.customer_phone);
  if (!phone || phone.length < 10) return null;

  const settings = await messagingService.getSettings();
  const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();
  const dueDate = reminder.due_date;
  const service = serviceLabel(reminder);
  const name = reminder.customer_name?.trim() || 'Müşteri';

  let messageText = `Merhaba ${name}, ${dueDate} tarihinde ${service} için takip hatırlatmanız bulunmaktadır. RetailEX`;
  let payload_json: Record<string, unknown> | null = null;

  if (provider === 'META' && settings) {
    const payload = buildMetaAppointmentQueuePayload(settings, {
      name,
      date: dueDate,
      time: 'Hatırlatma',
      service,
    });
    const tpl = resolveMetaAppointmentTemplate(
      settings.meta_appointment_template_name,
      settings.meta_appointment_template_language,
    );
    messageText = previewMetaTemplateBody(tpl, payload.meta_body_parameters);
    payload_json = payload;
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
 * Tarih aralığındaki hatırlatmalar için toplu WhatsApp (kuyruk + işleme).
 */
export async function sendFollowUpRemindersBulkWhatsApp(
  reminders: BeautyFollowUpReminder[],
  options?: { includeShadow?: boolean; processLimit?: number },
): Promise<{ queued: number; sent: number; skipped: number; errors: string[] }> {
  const ready = await ensureWhatsAppReady();
  if (!ready.ok) {
    return { queued: 0, sent: 0, skipped: reminders.length, errors: [ready.error] };
  }

  const rows = filterFollowUpRemindersForBulk(reminders, options);
  const errors: string[] = [];
  let queued = 0;
  let skipped = reminders.length - rows.length;

  for (const r of rows) {
    const enq = await enqueueFollowUpReminderWhatsApp(r);
    if (enq.ok) {
      queued++;
    } else {
      skipped++;
      errors.push(`${r.customer_name ?? '—'}: ${enq.error ?? 'Hata'}`);
    }
  }

  let sent = 0;
  if (queued > 0) {
    const proc = await messagingService.processPendingQueue(options?.processLimit ?? Math.min(queued, 80));
    sent = proc.processed;
    errors.push(...proc.errors);
  }

  return { queued, sent, skipped, errors };
}
