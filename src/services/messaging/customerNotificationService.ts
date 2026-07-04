/**
 * Müşteri toplu / segmentli WhatsApp bildirimi — kuyruk üzerinden.
 */
import { shouldUseTenantPostgrestApi } from '../../config/postgrest.config';
import { ERP_SETTINGS, postgres } from '../postgres';
import { normalizePhoneDigits } from './clinicMessaging';
import {
  ALL_META_WHATSAPP_TEMPLATES,
  buildMetaAppointmentQueuePayload,
  findMetaTemplate,
  previewMetaTemplateBody,
  type MetaWhatsAppTemplateDef,
} from './metaWhatsAppTemplates';
import { messagingService } from './messagingService';
import type { MessagingSettings } from './messagingTypes';
import {
  DEFAULT_WHATSAPP_BULK_INTERVAL_MS,
  type WhatsAppBulkPreviewItem,
} from '../../utils/whatsappBulkSend';

export type CustomerNotifyAudience =
  | 'single'
  | 'multiple'
  | 'bulk_all'
  | 'group_include'
  | 'group_exclude';

export type CustomerGroupFilter = {
  customer_tier?: string;
  city?: string;
  district?: string;
  heard_from?: string;
};

export interface NotifyCustomerRow {
  id: string;
  name: string;
  phone: string;
  customer_tier?: string;
  city?: string;
  district?: string;
  heard_from?: string;
}

function firmNrRow(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').padStart(3, '0').slice(0, 10);
}

function customersTable(): string {
  return postgres.getCardTableName('customers', 'public');
}

function normalizePhone(raw: string | undefined | null): string {
  const digits = normalizePhoneDigits(String(raw ?? ''));
  return digits.length >= 10 ? digits : '';
}

function mapCustomerRow(r: Record<string, unknown>): NotifyCustomerRow | null {
  const phone = normalizePhone(r.phone != null ? String(r.phone) : '');
  if (!phone) return null;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? '').trim() || '—',
    phone,
    customer_tier: r.customer_tier != null ? String(r.customer_tier) : undefined,
    city: r.city != null ? String(r.city) : undefined,
    district: r.district != null ? String(r.district) : undefined,
    heard_from: r.heard_from != null ? String(r.heard_from) : undefined,
  };
}

function matchesGroupFilter(row: NotifyCustomerRow, filter: CustomerGroupFilter): boolean {
  if (filter.customer_tier?.trim()) {
    const tier = (row.customer_tier ?? 'normal').toLowerCase();
    if (tier !== filter.customer_tier.trim().toLowerCase()) return false;
  }
  if (filter.city?.trim()) {
    const city = (row.city ?? '').trim().toLowerCase();
    if (!city.includes(filter.city.trim().toLowerCase())) return false;
  }
  if (filter.district?.trim()) {
    const district = (row.district ?? '').trim().toLowerCase();
    if (!district.includes(filter.district.trim().toLowerCase())) return false;
  }
  if (filter.heard_from?.trim()) {
    const hf = (row.heard_from ?? '').trim().toLowerCase();
    if (!hf.includes(filter.heard_from.trim().toLowerCase())) return false;
  }
  return true;
}

export function replaceMessagePlaceholders(
  template: string,
  customer: NotifyCustomerRow,
  extra?: Record<string, string>,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const vars: Record<string, string> = {
    customer_name: customer.name,
    name: customer.name,
    phone: customer.phone,
    city: customer.city ?? '',
    district: customer.district ?? '',
    customer_tier: customer.customer_tier ?? 'normal',
    date: today,
    ...extra,
  };
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

export function buildMetaParametersForCustomer(
  tpl: MetaWhatsAppTemplateDef,
  customer: NotifyCustomerRow,
  manualParams: string[],
): string[] {
  if (manualParams.length > 0 && manualParams.some((p) => p.trim() !== '')) {
    return manualParams.map((p, i) => {
      const raw = p.trim();
      if (!raw) return tpl.sampleValues[i] ?? customer.name;
      return replaceMessagePlaceholders(raw, customer);
    });
  }
  if (tpl.eventTypes.includes('appointment_reminder')) {
    return [customer.name, new Date().toISOString().slice(0, 10), '—', 'Bilgilendirme'];
  }
  if (tpl.eventTypes.includes('payment_reminder')) {
    return [customer.name, '—', '—', new Date().toISOString().slice(0, 10)];
  }
  return tpl.sampleValues.map((s, i) =>
    i === 0 ? customer.name : replaceMessagePlaceholders(s, customer),
  );
}

export const customerNotificationService = {
  async listActiveCustomers(limit = 5000): Promise<NotifyCustomerRow[]> {
    const fn = firmNrRow();
    const select =
      'id,name,phone,customer_tier,city,district,heard_from,is_active';

    if (shouldUseTenantPostgrestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      const rows = await postgrest.get<Record<string, unknown>[]>(
        `/rex_${fn}_customers`,
        {
          select,
          is_active: 'eq.true',
          order: 'name.asc',
          limit: String(limit),
        },
        { schema: 'public' },
      );
      return (Array.isArray(rows) ? rows : [])
        .map(mapCustomerRow)
        .filter((r): r is NotifyCustomerRow => r != null);
    }

    const t = customersTable();
    const { rows } = await postgres.query(
      `SELECT id, name, phone, customer_tier, city, district, heard_from
       FROM ${t}
       WHERE firm_nr = $1 AND COALESCE(is_active, true) = true
       ORDER BY name
       LIMIT $2`,
      [fn, limit],
      { firmNr: fn },
    );
    return (rows as Record<string, unknown>[])
      .map(mapCustomerRow)
      .filter((r): r is NotifyCustomerRow => r != null);
  },

  async resolveRecipients(params: {
    mode: CustomerNotifyAudience;
    customerIds?: string[];
    groupFilter?: CustomerGroupFilter;
  }): Promise<NotifyCustomerRow[]> {
    const all = await customerNotificationService.listActiveCustomers();
    const ids = new Set((params.customerIds ?? []).map(String));

    switch (params.mode) {
      case 'single':
        return all.filter((c) => ids.has(c.id)).slice(0, 1);
      case 'multiple':
        return all.filter((c) => ids.has(c.id));
      case 'bulk_all':
        return all;
      case 'group_include': {
        const f = params.groupFilter ?? {};
        const hasFilter = Object.values(f).some((v) => String(v ?? '').trim() !== '');
        if (!hasFilter) return [];
        return all.filter((c) => matchesGroupFilter(c, f));
      }
      case 'group_exclude': {
        const f = params.groupFilter ?? {};
        const hasFilter = Object.values(f).some((v) => String(v ?? '').trim() !== '');
        if (!hasFilter) return all;
        return all.filter((c) => !matchesGroupFilter(c, f));
      }
      default:
        return [];
    }
  },

  async buildBulkPreviewItems(params: {
    recipients: NotifyCustomerRow[];
    messageTemplate: string;
    metaTemplateId?: string;
    metaManualParameters?: string[];
    eventType?: string;
  }): Promise<WhatsAppBulkPreviewItem[]> {
    const settings = await messagingService.getSettings();
    const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();
    const metaTpl =
      provider === 'META' && params.metaTemplateId
        ? findMetaTemplate(params.metaTemplateId)
        : undefined;
    const eventType = params.eventType ?? 'customer_broadcast';
    const out: WhatsAppBulkPreviewItem[] = [];

    for (const customer of params.recipients) {
      if (!customer.phone) continue;
      let messageText = replaceMessagePlaceholders(params.messageTemplate, customer);
      let payload_json: Record<string, unknown> | null = null;

      if (metaTpl && settings) {
        const bodyParams = buildMetaParametersForCustomer(
          metaTpl,
          customer,
          params.metaManualParameters ?? [],
        );
        payload_json = {
          meta_template_name: metaTpl.metaName,
          meta_template_language: metaTpl.language,
          meta_body_parameters: bodyParams,
        };
        messageText = previewMetaTemplateBody(metaTpl, bodyParams);
      }

      out.push({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        messageText,
        contextLine: [customer.city, customer.customer_tier].filter(Boolean).join(' · ') || undefined,
        reference_type: 'customer',
        reference_id: customer.id,
        payload_json,
        event_type: eventType,
      });
    }
    return out;
  },

  async enqueueBulkNotifications(params: {
    recipients: NotifyCustomerRow[];
    messageTemplate: string;
    metaTemplateId?: string;
    metaManualParameters?: string[];
    eventType?: string;
    autoProcess?: boolean;
    intervalMs?: number;
  }): Promise<{ queued: number; skipped: number; sent: number; errors: string[] }> {
    const settings = await messagingService.getSettings();
    const provider = (settings?.whatsapp_provider || 'NONE').toString().toUpperCase();
    if (provider === 'NONE') {
      return { queued: 0, skipped: params.recipients.length, sent: 0, errors: ['WhatsApp sağlayıcısı kapalı.'] };
    }

    if (provider === 'EMBEDDED') {
      const st = await messagingService.getEmbeddedStatus();
      if (st.status !== 'connected') {
        return {
          queued: 0,
          skipped: params.recipients.length,
          sent: 0,
          errors: ['WhatsApp QR bağlantısı yok. Önce WhatsApp Entegrasyonu ekranından bağlanın.'],
        };
      }
    }

    const metaTpl =
      provider === 'META' && params.metaTemplateId
        ? findMetaTemplate(params.metaTemplateId)
        : undefined;

    if (provider === 'META' && !metaTpl) {
      return {
        queued: 0,
        skipped: params.recipients.length,
        sent: 0,
        errors: ['Meta sağlayıcısında onaylı şablon seçmelisiniz.'],
      };
    }

    let queued = 0;
    let skipped = 0;
    const errors: string[] = [];
    const eventType = params.eventType ?? 'customer_broadcast';

    for (const customer of params.recipients) {
      if (!customer.phone) {
        skipped++;
        continue;
      }
      try {
        let messageText = replaceMessagePlaceholders(params.messageTemplate, customer);
        let payload_json: Record<string, unknown> | null = null;

        if (metaTpl && settings) {
          const bodyParams = buildMetaParametersForCustomer(
            metaTpl,
            customer,
            params.metaManualParameters ?? [],
          );
          payload_json = {
            meta_template_name: metaTpl.metaName,
            meta_template_language: metaTpl.language,
            meta_body_parameters: bodyParams,
          };
          messageText = previewMetaTemplateBody(metaTpl, bodyParams);
        }

        await messagingService.enqueueNotification({
          event_type: eventType,
          channel: 'whatsapp',
          recipient_phone: customer.phone,
          recipient_name: customer.name,
          message_text: messageText,
          reference_type: 'customer',
          reference_id: customer.id,
          payload_json,
        });
        queued++;
      } catch (e: unknown) {
        skipped++;
        errors.push(`${customer.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    let sent = 0;
    if (params.autoProcess !== false && queued > 0) {
      const proc = await messagingService.processPendingQueueThrottled({
        limit: queued,
        intervalMs: params.intervalMs ?? DEFAULT_WHATSAPP_BULK_INTERVAL_MS,
      });
      sent = proc.processed;
      errors.push(...proc.errors);
    }

    return { queued, skipped, sent, errors };
  },

  getMetaTemplates(): MetaWhatsAppTemplateDef[] {
    return ALL_META_WHATSAPP_TEMPLATES;
  },

  async getMessagingSettings(): Promise<MessagingSettings | null> {
    return messagingService.getSettings();
  },
};
