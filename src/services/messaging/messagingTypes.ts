import type { ClinicMessagingPortalConfig } from './clinicMessaging';

export type NotificationEventType =
  | 'invoice_created'
  | 'appointment_reminder'
  | 'payment_reminder'
  | 'manual';

export type NotificationChannel = 'whatsapp' | 'sms';

export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface MessagingSettings extends ClinicMessagingPortalConfig {
  id?: string;
  sms_template?: string | null;
  notify_invoice_whatsapp?: boolean;
  invoice_whatsapp_template?: string | null;
  /** Virgülle ayrılmış fatura kategorileri: Satis,Hizmet */
  notify_sale_categories?: string | null;
  /** Meta Cloud API onaylı şablon adı (örn. retailex_invoice_tr) */
  meta_invoice_template_name?: string | null;
  meta_invoice_template_language?: string | null;
  meta_appointment_template_name?: string | null;
  meta_appointment_template_language?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MetaTemplateQueuePayload {
  meta_template_name: string;
  meta_template_language: string;
  meta_body_parameters: string[];
}

export interface NotificationQueueRow {
  id: string;
  firm_nr?: string;
  period_nr?: string;
  event_type: NotificationEventType | string;
  channel: NotificationChannel | string;
  recipient_phone?: string | null;
  recipient_name?: string | null;
  message_text?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  payload_json?: Record<string, unknown> | null;
  status: NotificationStatus | string;
  scheduled_at?: string | null;
  sent_at?: string | null;
  error_text?: string | null;
  created_at?: string;
}

export interface InvoiceNotificationContext {
  fiche_no: string;
  date: string;
  amount: string;
  currency: string;
  customer_name: string;
  category: string;
}
