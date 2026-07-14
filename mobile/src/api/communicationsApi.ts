/**
 * İletişim & Bildirimler — web MesajBildirimModule / messagingService ile uyumlu.
 * Okuma + kuyruğa yazma + ayar güncelleme + bekleyen kuyruk işleme (WhatsApp HTTP).
 */

import { pgQuery } from './pgClient';
import {
  customersTable,
  firmNr,
  messagingSettingsTable,
  newUuid,
  notificationQueueTable,
  periodNr,
} from './erpTables';

export type NotifyCustomerRow = {
  id: string;
  name: string;
  phone: string;
  customer_tier: string | null;
  city: string | null;
  district: string | null;
};

export type NotificationQueueRow = {
  id: string;
  event_type: string;
  channel: string;
  recipient_phone: string | null;
  recipient_name: string | null;
  message_text: string | null;
  status: string;
  created_at: string | null;
  sent_at: string | null;
  error_text: string | null;
};

export type MessagingSettingsRow = {
  id: string;
  whatsapp_provider: string;
  notify_invoice_whatsapp: boolean;
  whatsapp_base_url: string | null;
  whatsapp_token: string | null;
  whatsapp_instance_id: string | null;
  whatsapp_phone_id: string | null;
  default_reminder_channel: string;
  whatsapp_template: string | null;
};

export type MessagingProviderSummary = {
  whatsapp_provider: string;
  notify_invoice_whatsapp: boolean;
};

export type QueueStats = {
  pending: number;
  sent: number;
  failed: number;
};

export type ProcessQueueResult = {
  processed: number;
  errors: string[];
};

async function tryQueries<T>(queries: { sql: string; params?: unknown[] }[]): Promise<T[]> {
  for (const q of queries) {
    try {
      const res = await pgQuery<T>(q.sql, q.params ?? []);
      return res.rows;
    } catch {
      /* next */
    }
  }
  return [];
}

function normalizePhone(raw: string | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : '';
}

/** Uluslararası format: 90XXXXXXXXXX */
export function normalizePhoneDigits(raw: string): string {
  let p = String(raw || '').replace(/\D/g, '');
  if (p.length === 10) p = '90' + p;
  return p;
}

function mapCustomerRow(r: Record<string, unknown>): NotifyCustomerRow | null {
  const phone = normalizePhone(r.phone != null ? String(r.phone) : '');
  if (!phone) return null;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? '').trim() || '—',
    phone,
    customer_tier: r.customer_tier != null ? String(r.customer_tier) : null,
    city: r.city != null ? String(r.city) : null,
    district: r.district != null ? String(r.district) : null,
  };
}

export async function fetchNotifyCustomers(
  search = '',
  limit = 200,
): Promise<NotifyCustomerRow[]> {
  const fn = firmNr();
  const ct = customersTable(fn);
  const q = search.trim().toLowerCase();
  const like = q ? `%${q}%` : null;

  const rows = await tryQueries<Record<string, unknown>>([
    {
      sql: `SELECT id, name, phone, customer_tier, city, district
            FROM ${ct}
            WHERE COALESCE(is_active, true) = true
              AND phone IS NOT NULL AND TRIM(phone) <> ''
              AND (
                $1::text IS NULL
                OR LOWER(COALESCE(name, '')) LIKE $1
                OR REPLACE(COALESCE(phone, ''), ' ', '') LIKE $1
                OR LOWER(COALESCE(city, '')) LIKE $1
              )
            ORDER BY name ASC
            LIMIT $2`,
      params: [like, limit],
    },
    {
      sql: `SELECT id, name, phone, customer_tier, city, district
            FROM public.customers
            WHERE firm_nr = $1
              AND COALESCE(is_active, true) = true
              AND phone IS NOT NULL AND TRIM(phone) <> ''
            ORDER BY name ASC
            LIMIT $2`,
      params: [fn, limit],
    },
  ]);

  return rows.map(mapCustomerRow).filter((r): r is NotifyCustomerRow => r != null);
}

export async function fetchNotificationQueue(limit = 80): Promise<NotificationQueueRow[]> {
  const fn = firmNr();
  const qt = notificationQueueTable(fn);

  return tryQueries<NotificationQueueRow>([
    {
      sql: `SELECT id,
              COALESCE(event_type, '') AS event_type,
              COALESCE(channel, 'whatsapp') AS channel,
              recipient_phone,
              recipient_name,
              message_text,
              COALESCE(status, 'pending') AS status,
              created_at::text AS created_at,
              sent_at::text AS sent_at,
              error_text
       FROM ${qt}
       ORDER BY created_at DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchMessagingSettings(): Promise<MessagingSettingsRow | null> {
  const fn = firmNr();
  const mt = messagingSettingsTable(fn);

  const rows = await tryQueries<{
    id: string;
    whatsapp_provider: string;
    notify_invoice_whatsapp: boolean;
    whatsapp_base_url: string | null;
    whatsapp_token: string | null;
    whatsapp_instance_id: string | null;
    whatsapp_phone_id: string | null;
    default_reminder_channel: string | null;
    whatsapp_template: string | null;
  }>([
    {
      sql: `SELECT id::text AS id,
              COALESCE(whatsapp_provider, 'NONE') AS whatsapp_provider,
              COALESCE(notify_invoice_whatsapp, false) AS notify_invoice_whatsapp,
              whatsapp_base_url,
              whatsapp_token,
              whatsapp_instance_id,
              whatsapp_phone_id,
              COALESCE(default_reminder_channel, 'whatsapp') AS default_reminder_channel,
              whatsapp_template
       FROM ${mt}
       ORDER BY created_at ASC NULLS LAST
       LIMIT 1`,
    },
  ]);

  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    whatsapp_provider: (row.whatsapp_provider || 'NONE').toString().toUpperCase(),
    notify_invoice_whatsapp: row.notify_invoice_whatsapp === true,
    whatsapp_base_url: row.whatsapp_base_url,
    whatsapp_token: row.whatsapp_token,
    whatsapp_instance_id: row.whatsapp_instance_id,
    whatsapp_phone_id: row.whatsapp_phone_id,
    default_reminder_channel: (row.default_reminder_channel || 'whatsapp').toString().toLowerCase(),
    whatsapp_template: row.whatsapp_template,
  };
}

export async function fetchMessagingProvider(): Promise<MessagingProviderSummary> {
  const s = await fetchMessagingSettings();
  if (s) {
    return {
      whatsapp_provider: s.whatsapp_provider,
      notify_invoice_whatsapp: s.notify_invoice_whatsapp,
    };
  }
  return { whatsapp_provider: 'NONE', notify_invoice_whatsapp: false };
}

export async function ensureMessagingSettings(): Promise<MessagingSettingsRow> {
  const existing = await fetchMessagingSettings();
  if (existing) return existing;

  const fn = firmNr();
  const mt = messagingSettingsTable(fn);
  const id = newUuid();
  await pgQuery(
    `INSERT INTO ${mt} (id, whatsapp_provider, notify_invoice_whatsapp)
     VALUES ($1::uuid, 'NONE', false)`,
    [id],
  );
  const created = await fetchMessagingSettings();
  if (!created) {
    return {
      id,
      whatsapp_provider: 'NONE',
      notify_invoice_whatsapp: false,
      whatsapp_base_url: null,
      whatsapp_token: null,
      whatsapp_instance_id: null,
      whatsapp_phone_id: null,
      default_reminder_channel: 'whatsapp',
      whatsapp_template: null,
    };
  }
  return created;
}

/** Web `messagingService.updateSettings` — güvenli alanlar (token URL masaüstü). */
export async function updateMessagingSettings(patch: {
  whatsapp_provider?: string;
  notify_invoice_whatsapp?: boolean;
  default_reminder_channel?: string;
}): Promise<void> {
  const cur = await ensureMessagingSettings();
  const provider = String(patch.whatsapp_provider ?? cur.whatsapp_provider ?? 'NONE').toUpperCase();
  const notify =
    patch.notify_invoice_whatsapp != null
      ? patch.notify_invoice_whatsapp === true
      : cur.notify_invoice_whatsapp;
  const channel = String(
    patch.default_reminder_channel ?? cur.default_reminder_channel ?? 'whatsapp',
  ).toLowerCase();

  const fn = firmNr();
  const mt = messagingSettingsTable(fn);
  await pgQuery(
    `UPDATE ${mt} SET
       whatsapp_provider = $2,
       notify_invoice_whatsapp = $3,
       default_reminder_channel = $4,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid`,
    [cur.id, provider, notify, channel],
  );
}

export async function fetchQueueStats(): Promise<QueueStats> {
  const list = await fetchNotificationQueue(200);
  return {
    pending: list.filter((r) => r.status === 'pending').length,
    sent: list.filter((r) => r.status === 'sent').length,
    failed: list.filter((r) => r.status === 'failed').length,
  };
}

/** Web `messagingService.enqueueNotification` */
export async function enqueueNotification(params: {
  event_type?: string;
  channel?: 'whatsapp' | 'sms';
  recipient_phone: string;
  recipient_name?: string;
  message_text: string;
}): Promise<string> {
  const fn = firmNr();
  const pn = periodNr();
  const qt = notificationQueueTable(fn, pn);
  const phone = normalizePhoneDigits(params.recipient_phone);
  if (!phone || phone.length < 10) {
    throw new Error('Geçerli telefon numarası gerekli');
  }
  const text = String(params.message_text || '').trim();
  if (!text) throw new Error('Mesaj metni boş olamaz');

  const id = newUuid();
  await pgQuery(
    `INSERT INTO ${qt} (
      id, firm_nr, period_nr, event_type, channel, recipient_phone, recipient_name,
      message_text, payload_json, status
    ) VALUES (
      $1::uuid, $2, $3, $4, $5, $6, $7, $8, '{}'::jsonb, 'pending'
    )`,
    [
      id,
      fn,
      pn,
      params.event_type || 'customer_broadcast',
      params.channel || 'whatsapp',
      phone,
      params.recipient_name ?? null,
      text,
    ],
  );
  return id;
}

/** Hatalı kuyruk satırını yeniden deneme için pending yapar. */
export async function retryNotificationItem(queueId: string): Promise<void> {
  const fn = firmNr();
  const qt = notificationQueueTable(fn);
  await pgQuery(
    `UPDATE ${qt}
     SET status = 'pending', error_text = NULL, sent_at = NULL
     WHERE id = $1::uuid`,
    [queueId],
  );
}

async function markNotificationRow(
  id: string,
  patch: { status: string; error_text?: string | null; sent_at?: string | null },
): Promise<void> {
  const fn = firmNr();
  const qt = notificationQueueTable(fn);
  await pgQuery(
    `UPDATE ${qt}
     SET status = $2, error_text = $3, sent_at = $4
     WHERE id = $1::uuid`,
    [id, patch.status, patch.error_text ?? null, patch.sent_at ?? null],
  );
}

async function sendWhatsAppHttp(
  settings: MessagingSettingsRow,
  phone: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const provider = (settings.whatsapp_provider || 'NONE').toUpperCase();
  const digits = normalizePhoneDigits(phone);
  if (!digits || digits.length < 10) {
    return { success: false, error: 'Geçerli telefon yok' };
  }
  if (provider === 'NONE') {
    return { success: false, error: 'WhatsApp sağlayıcısı kapalı' };
  }

  try {
    if (provider === 'EMBEDDED') {
      const base = (settings.whatsapp_base_url || '').trim().replace(/\/$/, '');
      if (!base) return { success: false, error: 'Köprü URL (whatsapp_base_url) eksik' };
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      const token = settings.whatsapp_token?.trim();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${base}/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: digits, text }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        return { success: false, error: `Köprü HTTP ${res.status}${err ? `: ${err.slice(0, 160)}` : ''}` };
      }
      return { success: true };
    }

    if (!settings.whatsapp_token) {
      return { success: false, error: 'WhatsApp API token gerekli (Evolution/Meta)' };
    }

    if (provider === 'EVOLUTION') {
      const base = (settings.whatsapp_base_url || '').trim().replace(/\/$/, '');
      const inst = (settings.whatsapp_instance_id || '').trim();
      if (!base || !inst) {
        return { success: false, error: 'Evolution URL veya instance eksik' };
      }
      const res = await fetch(`${base}/message/sendText/${inst}`, {
        method: 'POST',
        headers: {
          apikey: settings.whatsapp_token,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: digits,
          options: { delay: 1200, presence: 'composing' },
          textMessage: { text },
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        return { success: false, error: `Evolution: ${res.status} ${err.slice(0, 160)}` };
      }
      return { success: true };
    }

    if (provider === 'META') {
      const phoneId = (settings.whatsapp_phone_id || '').trim();
      if (!phoneId) return { success: false, error: 'Meta phone_id eksik' };
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.whatsapp_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: digits,
          type: 'text',
          text: { body: text },
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        return { success: false, error: `Meta WA: ${res.status} ${err.slice(0, 160)}` };
      }
      return { success: true };
    }

    return { success: false, error: `Bilinmeyen sağlayıcı: ${provider}` };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Web `messagingService.processPendingQueue` — WhatsApp kanalları.
 * SMS (Atak) mobil P1 dışı; SMS satırları başarısız işaretlenir.
 */
export async function processPendingQueue(limit = 20): Promise<ProcessQueueResult> {
  const settings = await fetchMessagingSettings();
  if (!settings || settings.whatsapp_provider === 'NONE') {
    return { processed: 0, errors: ['WhatsApp sağlayıcısı kapalı veya ayar yok'] };
  }

  const fn = firmNr();
  const qt = notificationQueueTable(fn);
  const pending = await tryQueries<NotificationQueueRow>([
    {
      sql: `SELECT id,
              COALESCE(event_type, '') AS event_type,
              COALESCE(channel, 'whatsapp') AS channel,
              recipient_phone,
              recipient_name,
              message_text,
              COALESCE(status, 'pending') AS status,
              created_at::text AS created_at,
              sent_at::text AS sent_at,
              error_text
       FROM ${qt}
       WHERE status = 'pending'
       ORDER BY created_at ASC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);

  const errors: string[] = [];
  let processed = 0;

  for (const row of pending) {
    const qid = String(row.id || '');
    const phone = String(row.recipient_phone || '').trim();
    const text = String(row.message_text || '').trim();
    const channel = String(row.channel || 'whatsapp').toLowerCase();

    if (!qid || !phone || !text) {
      await markNotificationRow(qid, { status: 'failed', error_text: 'Telefon veya mesaj eksik' });
      errors.push(`${qid}: eksik alan`);
      continue;
    }

    if (channel === 'sms') {
      await markNotificationRow(qid, {
        status: 'failed',
        error_text: 'SMS gönderimi mobil P1 dışı — masaüstü Atak kullanın',
      });
      errors.push(`${qid}: SMS mobil desteklenmiyor`);
      continue;
    }

    const result = await sendWhatsAppHttp(settings, phone, text);
    if (!result.success) {
      await markNotificationRow(qid, { status: 'failed', error_text: result.error || 'Gönderilemedi' });
      errors.push(`${qid}: ${result.error || 'hata'}`);
      continue;
    }
    await markNotificationRow(qid, {
      status: 'sent',
      error_text: null,
      sent_at: new Date().toISOString(),
    });
    processed += 1;
  }

  return { processed, errors };
}

/** Tek müşteriye kuyruk + hemen işlemeyi dene. */
export async function sendCustomerMessage(params: {
  recipient_phone: string;
  recipient_name?: string;
  message_text: string;
  processNow?: boolean;
}): Promise<{ queueId: string; processed: number; errors: string[] }> {
  const queueId = await enqueueNotification({
    event_type: 'customer_broadcast',
    channel: 'whatsapp',
    recipient_phone: params.recipient_phone,
    recipient_name: params.recipient_name,
    message_text: params.message_text,
  });
  if (params.processNow === false) {
    return { queueId, processed: 0, errors: [] };
  }
  const r = await processPendingQueue(5);
  return { queueId, processed: r.processed, errors: r.errors };
}

export function statusLabelTr(status: string): string {
  switch (status) {
    case 'pending':
      return 'Bekliyor';
    case 'sent':
      return 'Gönderildi';
    case 'failed':
      return 'Hata';
    default:
      return status;
  }
}

export function channelLabelTr(channel: string): string {
  switch (channel) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'sms':
      return 'SMS';
    default:
      return channel;
  }
}

export function providerLabelTr(provider: string): string {
  switch (provider) {
    case 'NONE':
      return 'Kapalı';
    case 'META':
      return 'Meta Cloud';
    case 'EMBEDDED':
      return 'Gömülü köprü';
    case 'EVOLUTION':
      return 'Evolution API';
    default:
      return provider;
  }
}
