/**
 * Oturum açıkken WhatsApp kampanya zamanlayıcısı (planlı kuyruk + doğum günü + özel gün).
 * Dakikada bir tick; uygulama kapalıyken çalışmaz.
 */
import {
  customerNotificationService,
  replaceMessagePlaceholders,
  type NotifyCustomerRow,
} from './customerNotificationService';
import {
  messageTemplateService,
  resolveTemplateBody,
  type MessageTemplateRow,
} from './messageTemplateService';
import { messagingService } from './messagingService';
import {
  isSpecialDaySendDue,
  specialDayService,
  timeMatchesNow,
} from './specialDayService';
import { normalizeWhatsAppMessageLang, type WhatsAppMessageLang } from './whatsappMessageLang';

let timerId: number | null = null;
let running = false;
let lastTickMinute = '';

function ymd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pickRecipientLang(c: NotifyCustomerRow): WhatsAppMessageLang {
  return normalizeWhatsAppMessageLang((c as { lang?: string | null }).lang);
}

async function enqueueCampaignBatch(params: {
  campaignKey: string;
  eventType: string;
  /** Şablon satırı (4-dil birleşik) — varsa recipient diline göre kolon seçilir */
  template?: MessageTemplateRow | null;
  /** template yoksa kullanılan TR fallback metin */
  templateFallback?: string;
  recipients: NotifyCustomerRow[];
  extraPlaceholders?: Record<string, string>;
}): Promise<number> {
  let queued = 0;
  for (const c of params.recipients) {
    const lang = pickRecipientLang(c);
    const body = params.template
      ? resolveTemplateBody(params.template, lang) || params.templateFallback || ''
      : params.templateFallback || '';
    const messageText = replaceMessagePlaceholders(
      body,
      c,
      params.extraPlaceholders,
    );
    const id = await messagingService.enqueueNotification({
      event_type: params.eventType,
      channel: 'whatsapp',
      recipient_phone: c.phone,
      recipient_name: c.name,
      message_text: messageText,
      reference_type: 'customer',
      reference_id: c.id,
      payload_json: { campaign_key: params.campaignKey, lang },
    });
    if (id) queued++;
  }
  return queued;
}

async function tick(): Promise<void> {
  if (running) return;
  const minuteKey = `${ymd()}-${new Date().getHours()}:${new Date().getMinutes()}`;
  if (minuteKey === lastTickMinute) return;
  running = true;
  try {
    const settings = await messagingService.getSettings();
    const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();

    // Planlı (scheduled_at) kuyruk: oturum açıkken her dakika vadesi gelenleri işle
    if (provider !== 'NONE') {
      await messagingService.processPendingQueue(20);
    }

    if (!settings?.auto_campaign_enabled || provider === 'NONE') {
      lastTickMinute = minuteKey;
      return;
    }

    const now = new Date();

    if (settings.birthday_enabled && timeMatchesNow(settings.birthday_send_time || '10:00', now, 1)) {
      const mode = (settings.birthday_mode || 'today').toString();
      const upcomingDays = Number(settings.birthday_upcoming_days ?? 7) || 7;
      const exactUpcoming = settings.birthday_upcoming_exact === true;
      const giftText = String(settings.birthday_gift_text ?? '').trim();
      const tpl = settings.birthday_template_id
        ? await messageTemplateService.getById(settings.birthday_template_id)
        : null;
      const tplFallback = 'Sayın {customer_name}, doğum gününüzü kutlarız! {gift}';

      const modes: Array<'birthday_today' | 'birthday_upcoming'> = [];
      if (mode === 'today' || mode === 'both') modes.push('birthday_today');
      if (mode === 'upcoming' || mode === 'both') modes.push('birthday_upcoming');

      for (const m of modes) {
        const recipients = await customerNotificationService.resolveRecipients({
          mode: m,
          upcomingDays,
          exactUpcoming: m === 'birthday_upcoming' ? exactUpcoming : false,
        });
        const campaignKey =
          m === 'birthday_today'
            ? `birthday:${ymd(now)}`
            : `birthday_upcoming:${ymd(now)}`;
        await enqueueCampaignBatch({
          campaignKey,
          eventType: m,
          template: tpl,
          templateFallback: tplFallback,
          recipients,
          extraPlaceholders: { gift: giftText, service: giftText },
        });
      }
    }

    const specialDays = await specialDayService.list(true);
    for (const day of specialDays) {
      if (!isSpecialDaySendDue(day, now)) continue;
      if (!timeMatchesNow(day.send_time || '10:00', now, 1)) continue;
      const tpl = day.template_id
        ? await messageTemplateService.getById(day.template_id)
        : null;
      const fallback = 'Sayın {customer_name}, {special_day_name} kutlu olsun!';
      const gender = (day.gender_filter ?? '').trim().toLowerCase();
      const recipients =
        gender === 'female' || gender === 'male' || gender === 'other'
          ? await customerNotificationService.resolveRecipients({
              mode: 'group_include',
              groupFilter: { gender },
            })
          : await customerNotificationService.resolveRecipients({
              mode: 'bulk_all',
            });
      const campaignKey = `special:${day.id}:${now.getFullYear()}`;
      await enqueueCampaignBatch({
        campaignKey,
        eventType: 'special_day',
        template: tpl,
        templateFallback: fallback,
        recipients,
        extraPlaceholders: { special_day_name: day.name },
      });
    }

    lastTickMinute = minuteKey;
    await messagingService.processPendingQueue(15);
  } catch (e) {
    console.warn('[messagingCampaignScheduler]', e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

export function startMessagingCampaignScheduler(): void {
  if (typeof window === 'undefined') return;
  if (timerId != null) return;
  void tick();
  timerId = window.setInterval(() => void tick(), 60_000);
}

export function stopMessagingCampaignScheduler(): void {
  if (timerId != null) {
    clearInterval(timerId);
    timerId = null;
  }
  lastTickMinute = '';
}
