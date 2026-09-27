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
  | 'group_exclude'
  | 'birthday_today'
  | 'birthday_upcoming';

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
  birth_date?: string | null;
}

function firmNrRow(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').padStart(3, '0').slice(0, 10);
}

function customersTable(): string {
  return postgres.getCardTableName('customers', 'public');
}

function mapCustomerRow(
  r: Record<string, unknown>,
  countryCode = '90',
): NotifyCustomerRow | null {
  const phone = normalizePhoneDigits(String(r.phone ?? ''), countryCode);
  if (!phone || phone.length < 10) return null;
  const birthRaw = r.birth_date != null ? String(r.birth_date).slice(0, 10) : null;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? '').trim() || '—',
    phone,
    customer_tier: r.customer_tier != null ? String(r.customer_tier) : undefined,
    city: r.city != null ? String(r.city) : undefined,
    district: r.district != null ? String(r.district) : undefined,
    heard_from: r.heard_from != null ? String(r.heard_from) : undefined,
    birth_date: birthRaw && birthRaw.length >= 10 ? birthRaw : null,
  };
}

/** Ay-gün eşleşmesi (yıl bağımsız). */
function birthMonthDay(isoDate: string): { m: number; d: number } | null {
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length < 3) return null;
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!m || !d) return null;
  return { m, d };
}

function isBirthdayToday(birthDate: string | null | undefined, now = new Date()): boolean {
  if (!birthDate) return false;
  const bd = birthMonthDay(birthDate);
  if (!bd) return false;
  return bd.m === now.getMonth() + 1 && bd.d === now.getDate();
}

/** Sonraki doğum gününe kalan gün (0 = bugün). Yoksa null. */
export function daysUntilBirthday(
  birthDate: string | null | undefined,
  now = new Date(),
): number | null {
  if (!birthDate) return null;
  const bd = birthMonthDay(birthDate);
  if (!bd) return null;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), bd.m - 1, bd.d);
  if (next < todayStart) {
    next = new Date(now.getFullYear() + 1, bd.m - 1, bd.d);
  }
  return Math.round((next.getTime() - todayStart.getTime()) / 86_400_000);
}

function isBirthdayUpcoming(
  birthDate: string | null | undefined,
  withinDays: number,
  now = new Date(),
): boolean {
  if (!birthDate || withinDays <= 0) return false;
  const diffDays = daysUntilBirthday(birthDate, now);
  if (diffDays == null) return false;
  // Yaklaşan: bugün hariç 1..N gün içinde
  return diffDays >= 1 && diffDays <= withinDays;
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
    birth_date: customer.birth_date ?? '',
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
    const settings = await messagingService.getSettings();
    const cc = String(settings?.default_country_code || '90').replace(/\D/g, '') || '90';
    const select =
      'id,name,phone,customer_tier,city,district,heard_from,birth_date,is_active';

    if (shouldUseTenantPostgrestApi()) {
      const { postgrest } = await import('../api/postgrestClient');
      const rows = await postgrest.get<Record<string, unknown>[]>(
        `/rex_${fn}_customers`,
        {
          select,
          is_active: 'eq.true',
          order: 'name.asc',
          limit: limit,
        },
        { schema: 'public' },
      );
      return (Array.isArray(rows) ? rows : [])
        .map((r) => mapCustomerRow(r, cc))
        .filter((r): r is NotifyCustomerRow => r != null);
    }

    const t = customersTable();
    const { rows } = await postgres.query(
      `SELECT id, name, phone, customer_tier, city, district, heard_from, birth_date
       FROM ${t}
       WHERE firm_nr = $1 AND COALESCE(is_active, true) = true
       ORDER BY name
       LIMIT $2`,
      [fn, limit],
      { firmNr: fn },
    );
    return (rows as Record<string, unknown>[])
      .map((r) => mapCustomerRow(r, cc))
      .filter((r): r is NotifyCustomerRow => r != null);
  },

  async resolveRecipients(params: {
    mode: CustomerNotifyAudience;
    customerIds?: string[];
    groupFilter?: CustomerGroupFilter;
    upcomingDays?: number;
  }): Promise<NotifyCustomerRow[]> {
    const all = await customerNotificationService.listActiveCustomers();
    const ids = new Set((params.customerIds ?? []).map(String));
    const upcomingDays = Math.max(1, Number(params.upcomingDays) || 7);

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
      case 'birthday_today':
        return all.filter((c) => isBirthdayToday(c.birth_date));
      case 'birthday_upcoming':
        return all.filter((c) => isBirthdayUpcoming(c.birth_date, upcomingDays));
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
