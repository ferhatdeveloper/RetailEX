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

/**
 * Takip hatırlatması kartından WhatsApp gönderir (kuyruğa ekler ve işler).
 */
export async function sendFollowUpReminderWhatsApp(
  reminder: BeautyFollowUpReminder,
): Promise<{ success: boolean; error?: string }> {
  const phone = String(reminder.customer_phone ?? '').replace(/\D/g, '');
  if (!phone || phone.length < 10) {
    return { success: false, error: 'Müşteri telefon numarası yok veya geçersiz.' };
  }

  const settings = await messagingService.getSettings();
  const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();
  if (provider === 'NONE') {
    return {
      success: false,
      error: 'WhatsApp kapalı. Yönetim → WhatsApp Entegrasyonu ekranından yapılandırın.',
    };
  }

  if (provider === 'EMBEDDED') {
    const st = await messagingService.getEmbeddedStatus();
    if (st.status !== 'connected') {
      return { success: false, error: 'WhatsApp bağlı değil. QR ile bağlantı kurun.' };
    }
  }

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

  await messagingService.enqueueNotification({
    event_type: 'follow_up_reminder',
    channel: 'whatsapp',
    recipient_phone: phone,
    recipient_name: name,
    message_text: messageText,
    reference_type: 'follow_up_reminder',
    reference_id: `${reminder.customer_id}-${reminder.service_id}-${dueDate}`,
    payload_json,
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
