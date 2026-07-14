/**
 * İletişim & Bildirimler — web MesajBildirimModule / messagingService ile uyumlu okuma.
 * Müşteri (telefonlu) listesi + bildirim kuyruğu + sağlayıcı özeti.
 */

import { pgQuery } from './pgClient';
import {
  customersTable,
  firmNr,
  messagingSettingsTable,
  notificationQueueTable,
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

export type MessagingProviderSummary = {
  whatsapp_provider: string;
  notify_invoice_whatsapp: boolean;
};

export type QueueStats = {
  pending: number;
  sent: number;
  failed: number;
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

export async function fetchMessagingProvider(): Promise<MessagingProviderSummary> {
  const fn = firmNr();
  const mt = messagingSettingsTable(fn);

  const rows = await tryQueries<{ whatsapp_provider: string; notify_invoice_whatsapp: boolean }>([
    {
      sql: `SELECT COALESCE(whatsapp_provider, 'NONE') AS whatsapp_provider,
              COALESCE(notify_invoice_whatsapp, false) AS notify_invoice_whatsapp
       FROM ${mt}
       ORDER BY created_at ASC NULLS LAST
       LIMIT 1`,
    },
    {
      sql: `SELECT COALESCE(whatsapp_provider, 'NONE') AS whatsapp_provider,
              COALESCE(notify_invoice_whatsapp, false) AS notify_invoice_whatsapp
       FROM public.rex_001_messaging_settings
       LIMIT 1`,
    },
  ]);

  const row = rows[0];
  return {
    whatsapp_provider: (row?.whatsapp_provider || 'NONE').toString().toUpperCase(),
    notify_invoice_whatsapp: row?.notify_invoice_whatsapp === true,
  };
}

export async function fetchQueueStats(): Promise<QueueStats> {
  const list = await fetchNotificationQueue(200);
  return {
    pending: list.filter((r) => r.status === 'pending').length,
    sent: list.filter((r) => r.status === 'sent').length,
    failed: list.filter((r) => r.status === 'failed').length,
  };
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
