/**
 * ERP geneli mesajlaşma — ayarlar, kuyruk, WhatsApp/SMS gönderimi.
 * Baileys köprüsü (EMBEDDED), Evolution, Meta — clinicMessaging ile aynı sağlayıcılar.
 */
import { v4 as uuidv4 } from 'uuid';
import { shouldUseTenantPostgrestApi } from '../../config/postgrest.config';
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import {
  buildReminderText,
  sendAtakSms,
  sendWhatsAppNotification,
  sendWhatsAppText,
  type ClinicMessagingPortalConfig,
} from './clinicMessaging';
import {
  buildMetaInvoiceQueuePayload,
  parseMetaTemplateQueuePayload,
  previewMetaTemplateBody,
  resolveMetaInvoiceTemplate,
} from './metaWhatsAppTemplates';
import { getEmbeddedBridgeStatus } from './whatsappEmbeddedBridge';
import type {
  InvoiceNotificationContext,
  MessagingSettings,
  NotificationQueueRow,
} from './messagingTypes';

function firmNrRow(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').padStart(3, '0').slice(0, 10);
}

function periodNrRow(): string {
  return String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0').slice(0, 10);
}

function isRestApi(): boolean {
  return shouldUseTenantPostgrestApi();
}

const MESSAGING_TABLE_MISSING_HINT =
  'rex_*_messaging_settings tablosu API\'de yok. Kiracı veritabanında migration 042/044 çalıştırın; ardından NOTIFY pgrst, \'reload schema\'.';

function isPostgrestMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('404') && msg.includes('messaging_settings');
}

async function getSettingsViaSql(): Promise<MessagingSettings | null> {
  const t = settingsTable();
  const { rows } = await postgres.query(`SELECT * FROM ${t} ORDER BY created_at LIMIT 1`);
  if (!rows[0]) {
    await postgres.query(
      `INSERT INTO ${t} (id, whatsapp_provider, notify_invoice_whatsapp) VALUES ($1, 'NONE', false)`,
      [uuidv4()]
    );
    const r2 = await postgres.query(`SELECT * FROM ${t} LIMIT 1`);
    return r2.rows[0] ?? null;
  }
  return rows[0];
}

function settingsTable(): string {
  return postgres.getCardTableName('messaging_settings', 'public');
}

function queueTable(): string {
  return postgres.getMovementTableName('notification_queue', 'public');
}

const DEFAULT_INVOICE_TEMPLATE =
  'Sayın {customer_name}, {date} tarihli {fiche_no} numaralı {category} faturanız: {amount} {currency}. Asin';

export function buildInvoiceWhatsAppText(
  template: string | undefined | null,
  ctx: InvoiceNotificationContext
): string {
  const base = (template || DEFAULT_INVOICE_TEMPLATE).trim();
  return base.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = ctx[key as keyof InvoiceNotificationContext];
    return v != null ? String(v) : '';
  });
}

export function settingsToPortalConfig(s: MessagingSettings | null): ClinicMessagingPortalConfig {
  if (!s) return { whatsapp_provider: 'NONE' };
  return {
    sms_user: s.sms_user,
    sms_password: s.sms_password,
    sms_sender: s.sms_sender,
    sms_template: s.sms_template,
    whatsapp_template: s.whatsapp_template,
    whatsapp_provider: s.whatsapp_provider,
    whatsapp_base_url: s.whatsapp_base_url,
    whatsapp_token: s.whatsapp_token,
    whatsapp_instance_id: s.whatsapp_instance_id,
    whatsapp_phone_id: s.whatsapp_phone_id,
    default_reminder_channel: s.default_reminder_channel,
  };
}

export const messagingService = {
  async getSettings(): Promise<MessagingSettings | null> {
    const fn = firmNrRow();
    if (isRestApi()) {
      try {
        const { postgrest } = await import('../api/postgrestClient');
        const rows = await postgrest.get<MessagingSettings[]>(
          `/rex_${fn}_messaging_settings`,
          { select: '*', order: 'created_at.asc', limit: '1' },
          { schema: 'public' }
        );
        if (!rows[0]) {
          await postgrest.post(
            `/rex_${fn}_messaging_settings`,
            [{ id: uuidv4(), whatsapp_provider: 'NONE', notify_invoice_whatsapp: false }],
            { schema: 'public', prefer: 'return=minimal' }
          );
          const refreshed = await postgrest.get<MessagingSettings[]>(
            `/rex_${fn}_messaging_settings`,
            { select: '*', limit: '1' },
            { schema: 'public' }
          );
          return refreshed[0] ?? null;
        }
        return rows[0];
      } catch (e: unknown) {
        if (isPostgrestMissingTableError(e) && DB_SETTINGS.connectionProvider !== 'rest_api') {
          try {
            return await getSettingsViaSql();
          } catch {
            /* SQL yolu da yoksa aşağıdaki mesaj */
          }
        }
        if (isPostgrestMissingTableError(e)) {
          throw new Error(MESSAGING_TABLE_MISSING_HINT);
        }
        throw e;
      }
    }
    return getSettingsViaSql();
  },

  async updateSettings(data: Partial<MessagingSettings>): Promise<void> {
    const cur = await messagingService.getSettings();
    if (!cur?.id) return;
    const merged: MessagingSettings = { ...cur, ...data };
    if (isRestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      const fn = firmNrRow();
      await postgrest.patch(
        `/rex_${fn}_messaging_settings?id=eq.${encodeURIComponent(cur.id)}`,
        {
          sms_user: merged.sms_user ?? null,
          sms_password: merged.sms_password ?? null,
          sms_sender: merged.sms_sender ?? null,
          sms_template: merged.sms_template ?? null,
          whatsapp_template: merged.whatsapp_template ?? null,
          whatsapp_provider: (merged.whatsapp_provider || 'NONE').toString().toUpperCase(),
          whatsapp_base_url: merged.whatsapp_base_url ?? null,
          whatsapp_token: merged.whatsapp_token ?? null,
          whatsapp_instance_id: merged.whatsapp_instance_id ?? null,
          whatsapp_phone_id: merged.whatsapp_phone_id ?? null,
          default_reminder_channel: (merged.default_reminder_channel || 'whatsapp').toString().toLowerCase(),
          notify_invoice_whatsapp: merged.notify_invoice_whatsapp === true,
          invoice_whatsapp_template: merged.invoice_whatsapp_template ?? null,
          notify_sale_categories: merged.notify_sale_categories ?? 'Satis,Hizmet',
          meta_invoice_template_name: merged.meta_invoice_template_name ?? null,
          meta_invoice_template_language: merged.meta_invoice_template_language ?? null,
          meta_appointment_template_name: merged.meta_appointment_template_name ?? null,
          meta_appointment_template_language: merged.meta_appointment_template_language ?? null,
          updated_at: new Date().toISOString(),
        },
        { schema: 'public', prefer: 'return=minimal' }
      );
      return;
    }
    const t = settingsTable();
    await postgres.query(
      `UPDATE ${t} SET
        sms_user = $2, sms_password = $3, sms_sender = $4, sms_template = $5,
        whatsapp_template = $6, whatsapp_provider = $7, whatsapp_base_url = $8,
        whatsapp_token = $9, whatsapp_instance_id = $10, whatsapp_phone_id = $11,
        default_reminder_channel = $12, notify_invoice_whatsapp = $13,
        invoice_whatsapp_template = $14, notify_sale_categories = $15,
        meta_invoice_template_name = $16, meta_invoice_template_language = $17,
        meta_appointment_template_name = $18, meta_appointment_template_language = $19,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        cur.id,
        merged.sms_user ?? null,
        merged.sms_password ?? null,
        merged.sms_sender ?? null,
        merged.sms_template ?? null,
        merged.whatsapp_template ?? null,
        (merged.whatsapp_provider || 'NONE').toString().toUpperCase(),
        merged.whatsapp_base_url ?? null,
        merged.whatsapp_token ?? null,
        merged.whatsapp_instance_id ?? null,
        merged.whatsapp_phone_id ?? null,
        (merged.default_reminder_channel || 'whatsapp').toString().toLowerCase(),
        merged.notify_invoice_whatsapp === true,
        merged.invoice_whatsapp_template ?? null,
        merged.notify_sale_categories ?? 'Satis,Hizmet',
        merged.meta_invoice_template_name ?? null,
        merged.meta_invoice_template_language ?? null,
        merged.meta_appointment_template_name ?? null,
        merged.meta_appointment_template_language ?? null,
      ]
    );
  },

  async getEmbeddedStatus(override?: {
    whatsapp_base_url?: string | null;
    whatsapp_token?: string | null;
  }) {
    if (override?.whatsapp_base_url?.trim()) {
      return getEmbeddedBridgeStatus({
        whatsapp_base_url: override.whatsapp_base_url,
        whatsapp_token: override.whatsapp_token ?? null,
      });
    }
    const s = await messagingService.getSettings();
    return getEmbeddedBridgeStatus({
      whatsapp_base_url: s?.whatsapp_base_url,
      whatsapp_token: s?.whatsapp_token,
    });
  },

  async sendTestWhatsApp(
    phone: string,
    options?: {
      message?: string;
      provider?: string;
      whatsapp_base_url?: string | null;
      whatsapp_token?: string | null;
      whatsapp_instance_id?: string | null;
      whatsapp_phone_id?: string | null;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const s = await messagingService.getSettings();
    const merged: MessagingSettings | null = s
      ? {
          ...s,
          whatsapp_provider: options?.provider ?? s.whatsapp_provider,
          whatsapp_base_url: options?.whatsapp_base_url ?? s.whatsapp_base_url,
          whatsapp_token: options?.whatsapp_token ?? s.whatsapp_token,
          whatsapp_instance_id: options?.whatsapp_instance_id ?? s.whatsapp_instance_id,
          whatsapp_phone_id: options?.whatsapp_phone_id ?? s.whatsapp_phone_id,
        }
      : null;
    const portal = settingsToPortalConfig(merged);
    const provider = (merged?.whatsapp_provider || 'NONE').toString().toUpperCase();
    const digits = phone.replace(/\D/g, '');
    if (!digits || digits.length < 10) {
      return { success: false, error: 'Geçerli telefon numarası girin (ör. 905551234567).' };
    }
    if (provider === 'NONE') {
      return { success: false, error: 'WhatsApp sağlayıcısı kapalı.' };
    }
    if (provider === 'EMBEDDED') {
      const st = await getEmbeddedBridgeStatus({
        whatsapp_base_url: portal.whatsapp_base_url,
        whatsapp_token: portal.whatsapp_token,
      });
      if (!st.ok) {
        return { success: false, error: st.error || 'Köprüye ulaşılamadı.' };
      }
      if (st.status !== 'connected') {
        return {
          success: false,
          error: 'WhatsApp bağlı değil. Önce QR kodu okutarak bağlantı kurun.',
        };
      }
    }
    const text = (options?.message || 'Asin — WhatsApp test mesajı.').trim();
    if (provider === 'META' && merged) {
      const tpl = resolveMetaInvoiceTemplate(
        merged.meta_invoice_template_name,
        merged.meta_invoice_template_language
      );
      const params = tpl.sampleValues;
      const preview = previewMetaTemplateBody(tpl, params);
      return sendWhatsAppNotification(portal, phone, {
        text: options?.message?.trim() ? text : preview,
        metaTemplate: options?.message?.trim()
          ? undefined
          : {
              name: tpl.metaName,
              language: tpl.language,
              bodyParameters: params,
            },
      });
    }
    return sendWhatsAppText(portal, phone, text);
  },

  async enqueueNotification(params: {
    event_type: string;
    channel?: 'whatsapp' | 'sms';
    recipient_phone: string;
    recipient_name?: string;
    message_text: string;
    reference_type?: string;
    reference_id?: string;
    payload_json?: Record<string, unknown> | null;
    firmNr?: string;
    periodNr?: string;
  }): Promise<string | null> {
    const fn = String(params.firmNr ?? firmNrRow()).padStart(3, '0').slice(0, 10);
    const pn = String(params.periodNr ?? periodNrRow()).padStart(2, '0').slice(0, 10);
    const id = uuidv4();
    const row = {
      id,
      firm_nr: fn,
      period_nr: pn,
      event_type: params.event_type,
      channel: params.channel || 'whatsapp',
      recipient_phone: params.recipient_phone,
      recipient_name: params.recipient_name ?? null,
      message_text: params.message_text,
      reference_type: params.reference_type ?? null,
      reference_id: params.reference_id ?? null,
      payload_json: params.payload_json ?? {},
      status: 'pending',
    };
    if (isRestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      await postgrest.post(
        `/rex_${fn}_${pn}_notification_queue`,
        [row],
        { schema: 'public', prefer: 'return=minimal' }
      );
      return id;
    }
    const t = queueTable();
    await postgres.query(
      `INSERT INTO ${t} (
        id, firm_nr, period_nr, event_type, channel, recipient_phone, recipient_name,
        message_text, reference_type, reference_id, payload_json, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'pending')`,
      [
        id, fn, pn, params.event_type, params.channel || 'whatsapp',
        params.recipient_phone, params.recipient_name ?? null, params.message_text,
        params.reference_type ?? null, params.reference_id ?? null,
        JSON.stringify(params.payload_json ?? {}),
      ],
      { firmNr: fn, periodNr: pn }
    );
    return id;
  },

  async listQueue(limit = 30): Promise<NotificationQueueRow[]> {
    const fn = firmNrRow();
    const pn = periodNrRow();
    if (isRestApi()) {
      try {
        const { postgrest } = await import('../api/postgrestClient');
        const rows = await postgrest.get<NotificationQueueRow[]>(
          `/rex_${fn}_${pn}_notification_queue`,
          { select: '*', order: 'created_at.desc', limit: String(limit) },
          { schema: 'public' }
        );
        return Array.isArray(rows) ? rows : [];
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('404') && msg.includes('notification_queue')) return [];
        throw e;
      }
    }
    const t = queueTable();
    const { rows } = await postgres.query(
      `SELECT * FROM ${t} ORDER BY created_at DESC LIMIT $1`,
      [limit],
      { firmNr: fn, periodNr: pn }
    );
    return rows;
  },

  async getQueueStats(): Promise<{ pending: number; sent: number; failed: number }> {
    const fn = firmNrRow();
    const pn = periodNrRow();
    if (isRestApi()) {
      const list = await messagingService.listQueue(200);
      return {
        pending: list.filter((r) => r.status === 'pending').length,
        sent: list.filter((r) => r.status === 'sent').length,
        failed: list.filter((r) => r.status === 'failed').length,
      };
    }
    const t = queueTable();
    const { rows } = await postgres.query(
      `SELECT status, COUNT(*)::int AS c FROM ${t} GROUP BY status`,
      [],
      { firmNr: fn, periodNr: pn }
    );
    const map = Object.fromEntries(rows.map((r: { status: string; c: number }) => [r.status, r.c]));
    return {
      pending: map.pending ?? 0,
      sent: map.sent ?? 0,
      failed: map.failed ?? 0,
    };
  },

  async processPendingQueue(limit = 20): Promise<{ processed: number; errors: string[] }> {
    const settings = await messagingService.getSettings();
    const portal = settingsToPortalConfig(settings);
    const fn = firmNrRow();
    const pn = periodNrRow();
    const errors: string[] = [];
    let processed = 0;

    const markRow = async (id: string, patch: { status: string; error_text?: string | null; sent_at?: string }) => {
      if (isRestApi()) {
        const { postgrest } = await import('../api/postgrestClient');
        await postgrest.patch(
          `/rex_${fn}_${pn}_notification_queue?id=eq.${encodeURIComponent(id)}`,
          patch,
          { schema: 'public', prefer: 'return=minimal' }
        );
        return;
      }
      const t = queueTable();
      await postgres.query(
        `UPDATE ${t} SET status = $2, error_text = $3, sent_at = $4 WHERE id = $1`,
        [id, patch.status, patch.error_text ?? null, patch.sent_at ?? null],
        { firmNr: fn, periodNr: pn }
      );
    };

    let pending: NotificationQueueRow[] = [];
    if (isRestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      pending = await postgrest.get<NotificationQueueRow[]>(
        `/rex_${fn}_${pn}_notification_queue`,
        { select: '*', status: 'eq.pending', order: 'created_at.asc', limit: String(limit) },
        { schema: 'public' }
      );
    } else {
      const t = queueTable();
      const { rows } = await postgres.query(
        `SELECT * FROM ${t} WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1`,
        [limit],
        { firmNr: fn, periodNr: pn }
      );
      pending = rows;
    }

    const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();

    for (const row of pending) {
      const qid = String(row.id || '');
      const phone = String(row.recipient_phone || '').trim();
      const text = String(row.message_text || '').trim();
      const channel = String(row.channel || 'whatsapp').toLowerCase();
      const metaPayload = parseMetaTemplateQueuePayload(
        row.payload_json as Record<string, unknown> | null | undefined
      );
      const hasMetaTemplate = provider === 'META' && !!metaPayload;
      if (!qid || !phone || (!text && !hasMetaTemplate)) {
        await markRow(qid, { status: 'failed', error_text: 'Telefon veya mesaj eksik' });
        errors.push(`${qid}: eksik alan`);
        continue;
      }
      try {
        const result =
          channel === 'sms'
            ? await sendAtakSms(portal, phone, text)
            : await sendWhatsAppNotification(portal, phone, {
                text,
                metaTemplate: hasMetaTemplate
                  ? {
                      name: metaPayload!.meta_template_name,
                      language: metaPayload!.meta_template_language,
                      bodyParameters: metaPayload!.meta_body_parameters,
                    }
                  : undefined,
              });
        if (!result.success) throw new Error(result.error || 'Gönderilemedi');
        await markRow(qid, { status: 'sent', error_text: null, sent_at: new Date().toISOString() });
        processed++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await markRow(qid, { status: 'failed', error_text: msg });
        errors.push(`${qid}: ${msg}`);
      }
    }
    return { processed, errors };
  },

  /**
   * Toplu WhatsApp — mesajlar arasında bekleme (ban riskini azaltır).
   */
  async processPendingQueueThrottled(options?: {
    limit?: number;
    intervalMs?: number;
    onProgress?: (p: { sent: number; total: number; currentName?: string; error?: string }) => void;
    shouldAbort?: () => boolean;
  }): Promise<{ processed: number; errors: string[] }> {
    const intervalMs = Math.max(3000, Number(options?.intervalMs) || 12000);
    const limit = Math.max(1, Number(options?.limit) || 100);
    const settings = await messagingService.getSettings();
    const portal = settingsToPortalConfig(settings);
    const fn = firmNrRow();
    const pn = periodNrRow();
    const errors: string[] = [];
    let processed = 0;

    const markRow = async (id: string, patch: { status: string; error_text?: string | null; sent_at?: string }) => {
      if (isRestApi()) {
        const { postgrest } = await import('../api/postgrestClient');
        await postgrest.patch(
          `/rex_${fn}_${pn}_notification_queue?id=eq.${encodeURIComponent(id)}`,
          patch,
          { schema: 'public', prefer: 'return=minimal' }
        );
        return;
      }
      const t = queueTable();
      await postgres.query(
        `UPDATE ${t} SET status = $2, error_text = $3, sent_at = $4 WHERE id = $1`,
        [id, patch.status, patch.error_text ?? null, patch.sent_at ?? null],
        { firmNr: fn, periodNr: pn }
      );
    };

    let pending: NotificationQueueRow[] = [];
    if (isRestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      pending = await postgrest.get<NotificationQueueRow[]>(
        `/rex_${fn}_${pn}_notification_queue`,
        { select: '*', status: 'eq.pending', order: 'created_at.asc', limit: String(limit) },
        { schema: 'public' }
      );
    } else {
      const t = queueTable();
      const { rows } = await postgres.query(
        `SELECT * FROM ${t} WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1`,
        [limit],
        { firmNr: fn, periodNr: pn }
      );
      pending = rows;
    }

    const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();
    const total = pending.length;

    for (let i = 0; i < pending.length; i++) {
      if (options?.shouldAbort?.()) break;

      const row = pending[i];
      const qid = String(row.id || '');
      const phone = String(row.recipient_phone || '').trim();
      const text = String(row.message_text || '').trim();
      const channel = String(row.channel || 'whatsapp').toLowerCase();
      const metaPayload = parseMetaTemplateQueuePayload(
        row.payload_json as Record<string, unknown> | null | undefined
      );
      const hasMetaTemplate = provider === 'META' && !!metaPayload;

      options?.onProgress?.({
        sent: processed,
        total,
        currentName: String(row.recipient_name ?? phone),
      });

      if (!qid || !phone || (!text && !hasMetaTemplate)) {
        await markRow(qid, { status: 'failed', error_text: 'Telefon veya mesaj eksik' });
        errors.push(`${qid}: eksik alan`);
        continue;
      }

      try {
        const result =
          channel === 'sms'
            ? await sendAtakSms(portal, phone, text)
            : await sendWhatsAppNotification(portal, phone, {
                text,
                metaTemplate: hasMetaTemplate
                  ? {
                      name: metaPayload!.meta_template_name,
                      language: metaPayload!.meta_template_language,
                      bodyParameters: metaPayload!.meta_body_parameters,
                    }
                  : undefined,
              });
        if (!result.success) throw new Error(result.error || 'Gönderilemedi');
        await markRow(qid, { status: 'sent', error_text: null, sent_at: new Date().toISOString() });
        processed++;
        options?.onProgress?.({
          sent: processed,
          total,
          currentName: String(row.recipient_name ?? phone),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await markRow(qid, { status: 'failed', error_text: msg });
        errors.push(`${row.recipient_name ?? phone}: ${msg}`);
        options?.onProgress?.({
          sent: processed,
          total,
          currentName: String(row.recipient_name ?? phone),
          error: msg,
        });
      }

      if (i < pending.length - 1 && !options?.shouldAbort?.()) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    return { processed, errors };
  },

  /**
   * Satış/hizmet faturası kaydı sonrası WhatsApp kuyruğuna ekler (ayar açıksa).
   */
  async maybeEnqueueInvoiceNotification(
    invoice: {
      invoice_no?: string;
      invoice_category?: string;
      customer_id?: string;
      supplier_id?: string;
      customer_name?: string;
      supplier_name?: string;
      total_amount?: number;
      currency?: string;
      created_at?: string | Date;
    },
    invoiceId: string,
    firmNr?: string,
    periodNr?: string
  ): Promise<void> {
    const settings = await messagingService.getSettings();
    if (!settings?.notify_invoice_whatsapp) return;
    if ((settings.whatsapp_provider || 'NONE').toString().toUpperCase() === 'NONE') return;

    const category = String(invoice.invoice_category || '');
    const allowed = (settings.notify_sale_categories || 'Satis,Hizmet')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(category)) return;

    const accountId = invoice.customer_id || invoice.supplier_id;
    if (!accountId) return;

    const fn = String(firmNr ?? firmNrRow()).padStart(3, '0').slice(0, 10);
    let phone = '';
    let name = String(invoice.customer_name || invoice.supplier_name || '').trim();

    if (isRestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      const cust = await postgrest.get<{ phone?: string; name?: string }[]>(
        `/rex_${fn}_customers`,
        { select: 'phone,name', id: `eq.${accountId}`, limit: '1' },
        { schema: 'public' }
      ).catch(() => []);
      if (cust[0]?.phone) {
        phone = String(cust[0].phone).trim();
        if (cust[0].name) name = String(cust[0].name);
      } else {
        const sup = await postgrest.get<{ phone?: string; name?: string }[]>(
          `/rex_${fn}_suppliers`,
          { select: 'phone,name', id: `eq.${accountId}`, limit: '1' },
          { schema: 'public' }
        ).catch(() => []);
        if (sup[0]?.phone) {
          phone = String(sup[0].phone).trim();
          if (sup[0].name) name = String(sup[0].name);
        }
      }
    } else {
      const custT = postgres.getCardTableName('customers', 'public');
      const { rows: cr } = await postgres.query(
        `SELECT phone, name FROM ${custT} WHERE id = $1::uuid AND firm_nr = $2 LIMIT 1`,
        [accountId, fn],
        { firmNr: fn }
      );
      if (cr[0]?.phone) {
        phone = String(cr[0].phone).trim();
        if (cr[0].name) name = String(cr[0].name);
      } else {
        const supT = postgres.getCardTableName('suppliers', 'public');
        const { rows: sr } = await postgres.query(
          `SELECT phone, name FROM ${supT} WHERE id = $1::uuid LIMIT 1`,
          [accountId],
          { firmNr: fn }
        );
        if (sr[0]?.phone) {
          phone = String(sr[0].phone).trim();
          if (sr[0].name) name = String(sr[0].name);
        }
      }
    }

    if (!phone) return;

    const dateStr = invoice.created_at
      ? String(invoice.created_at).split('T')[0]
      : new Date().toISOString().split('T')[0];
    const ctx: InvoiceNotificationContext = {
      fiche_no: String(invoice.invoice_no || ''),
      date: dateStr,
      amount: String(invoice.total_amount ?? 0),
      currency: String(invoice.currency || 'IQD'),
      customer_name: name || 'Müşteri',
      category,
    };
    const provider = (settings.whatsapp_provider || 'NONE').toString().toUpperCase();
    let text = buildInvoiceWhatsAppText(settings.invoice_whatsapp_template, ctx);
    let payload_json: Record<string, unknown> | undefined;
    if (provider === 'META') {
      const meta = buildMetaInvoiceQueuePayload(settings, ctx);
      const tpl = resolveMetaInvoiceTemplate(
        settings.meta_invoice_template_name,
        settings.meta_invoice_template_language
      );
      text = previewMetaTemplateBody(tpl, meta.meta_body_parameters);
      payload_json = { ...meta };
    }
    await messagingService.enqueueNotification({
      event_type: 'invoice_created',
      channel: 'whatsapp',
      recipient_phone: phone,
      recipient_name: name,
      message_text: text,
      reference_type: 'sales',
      reference_id: invoiceId,
      payload_json,
      firmNr: fn,
      periodNr: periodNr,
    });
  },
};

/** Randevu şablonu (güzellik ile paylaşımlı değişkenler) */
export function buildAppointmentReminderText(
  template: string | undefined | null,
  ctx: { name: string; date: string; time: string; service: string }
): string {
  return buildReminderText(template || undefined, 'whatsapp', ctx);
}
