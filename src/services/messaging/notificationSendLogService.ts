/**
 * Kampanya gönderim kaydı — aynı campaign_key + phone için çift gönderimi engeller.
 */
import { v4 as uuidv4 } from 'uuid';
import { shouldUseTenantPostgrestApi } from '../../config/postgrest.config';
import { ERP_SETTINGS, postgres } from '../postgres';

function firmNrRow(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').padStart(3, '0').slice(0, 10);
}

function sendLogTable(): string {
  return postgres.getCardTableName('notification_send_log', 'public');
}

export interface NotificationSendLogRow {
  id: string;
  firm_nr?: string;
  campaign_key: string;
  customer_id?: string | null;
  phone: string;
  queue_id?: string | null;
  status?: string;
  message_text?: string | null;
  sent_at?: string | null;
  created_at?: string;
}

export async function hasSendLogEntry(campaignKey: string, phone: string): Promise<boolean> {
  const fn = firmNrRow();
  const key = String(campaignKey || '').trim();
  const ph = String(phone || '').replace(/\D/g, '');
  if (!key || !ph) return false;

  if (shouldUseTenantPostgrestApi()) {
    const { postgrest } = await import('../api/postgrestClient');
    const rows = await postgrest.get<NotificationSendLogRow[]>(
      `/rex_${fn}_notification_send_log`,
      {
        select: 'id',
        campaign_key: `eq.${key}`,
        phone: `eq.${ph}`,
        limit: 1,
      },
      { schema: 'public' },
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  const t = sendLogTable();
  const { rows } = await postgres.query(
    `SELECT id FROM ${t} WHERE campaign_key = $1 AND phone = $2 LIMIT 1`,
    [key, ph],
    { firmNr: fn },
  );
  return rows.length > 0;
}

export async function recordSendLog(params: {
  campaign_key: string;
  phone: string;
  customer_id?: string | null;
  queue_id?: string | null;
  status?: string;
  message_text?: string | null;
}): Promise<void> {
  const fn = firmNrRow();
  const key = String(params.campaign_key || '').trim();
  const ph = String(params.phone || '').replace(/\D/g, '');
  if (!key || !ph) return;

  const row = {
    id: uuidv4(),
    firm_nr: fn,
    campaign_key: key,
    customer_id: params.customer_id ?? null,
    phone: ph,
    queue_id: params.queue_id ?? null,
    status: params.status || 'sent',
    message_text: params.message_text ?? null,
    sent_at: new Date().toISOString(),
  };

  if (shouldUseTenantPostgrestApi()) {
    const { postgrest } = await import('../api/postgrestClient');
    try {
      await postgrest.post(`/rex_${fn}_notification_send_log`, [row], {
        schema: 'public',
        prefer: 'return=minimal',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // UNIQUE ihlali = zaten kayıtlı
      if (msg.includes('23505') || msg.toLowerCase().includes('unique') || msg.includes('409')) {
        return;
      }
      throw e;
    }
    return;
  }

  const t = sendLogTable();
  await postgres.query(
    `INSERT INTO ${t} (
      id, firm_nr, campaign_key, customer_id, phone, queue_id, status, message_text, sent_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (campaign_key, phone) DO NOTHING`,
    [
      row.id,
      fn,
      key,
      row.customer_id,
      ph,
      row.queue_id,
      row.status,
      row.message_text,
      row.sent_at,
    ],
    { firmNr: fn },
  );
}

export async function listSendLog(limit = 50): Promise<NotificationSendLogRow[]> {
  const fn = firmNrRow();
  if (shouldUseTenantPostgrestApi()) {
    try {
      const { postgrest } = await import('../api/postgrestClient');
      const rows = await postgrest.get<NotificationSendLogRow[]>(
        `/rex_${fn}_notification_send_log`,
        { select: '*', order: 'sent_at.desc', limit },
        { schema: 'public' },
      );
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }
  const t = sendLogTable();
  const { rows } = await postgres.query(
    `SELECT * FROM ${t} ORDER BY sent_at DESC NULLS LAST, created_at DESC LIMIT $1`,
    [limit],
    { firmNr: fn },
  );
  return rows as NotificationSendLogRow[];
}
