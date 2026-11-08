/** WhatsApp toplu gönderim — ban riskini azaltmak için aralıklı kuyruk işleme */

import { messagingService } from '../services/messaging/messagingService';
import { openWhatsAppDesktopChat } from './openWhatsAppDesktop';

export const WHATSAPP_BULK_INTERVAL_OPTIONS_MS = [8000, 12000, 15000, 20000] as const;

export const DEFAULT_WHATSAPP_BULK_INTERVAL_MS = 12000;

/** Desktop link sırayla aç — kullanıcı her sohbette Gönder’e basar */
export const WHATSAPP_BULK_DESKTOP_INTERVAL_OPTIONS_MS = [5000, 8000, 12000, 15000] as const;

export const DEFAULT_WHATSAPP_BULK_DESKTOP_INTERVAL_MS = 8000;

export type WhatsAppBulkDeliveryMode = 'api' | 'desktop_link';

export type WhatsAppBulkPreviewItem = {
  id: string;
  name: string;
  phone: string;
  messageText: string;
  contextLine?: string;
  reference_type?: string;
  reference_id?: string;
  payload_json?: Record<string, unknown> | null;
  event_type?: string;
};

export type WhatsAppBulkSendProgress = {
  phase: 'enqueue' | 'send';
  done: number;
  total: number;
  currentName?: string;
  lastError?: string;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function estimateBulkDurationSec(count: number, intervalMs: number): number {
  if (count <= 0) return 0;
  return Math.ceil((count * intervalMs) / 1000);
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

async function enqueuePreviewItems(
  items: WhatsAppBulkPreviewItem[],
  onProgress?: (p: WhatsAppBulkSendProgress) => void,
  scheduledAt?: string | null,
): Promise<{ queued: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let queued = 0;
  let skipped = 0;
  const total = items.length;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.({ phase: 'enqueue', done: i, total, currentName: item.name });
    try {
      const id = await messagingService.enqueueNotification({
        event_type: item.event_type ?? 'customer_broadcast',
        channel: 'whatsapp',
        recipient_phone: item.phone,
        recipient_name: item.name,
        message_text: item.messageText,
        reference_type: item.reference_type,
        reference_id: item.reference_id,
        payload_json: item.payload_json,
        scheduled_at: scheduledAt ?? null,
      });
      if (id) queued++;
      else skipped++;
    } catch (e: unknown) {
      skipped++;
      errors.push(`${item.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  onProgress?.({ phase: 'enqueue', done: total, total, currentName: undefined });
  return { queued, skipped, errors };
}

/** Önizleme listesini kuyruğa ekler; isteğe bağlı aralıklı otomatik gönderir. */
export async function runWhatsAppBulkCampaign(
  items: WhatsAppBulkPreviewItem[],
  options?: {
    intervalMs?: number;
    onProgress?: (p: WhatsAppBulkSendProgress) => void;
    shouldAbort?: () => boolean;
    enqueueOnly?: boolean;
    /** ISO — gelecekteyse yalnızca kuyruğa yazılır, vadesi gelince gönderilir */
    scheduledAt?: string | null;
  },
): Promise<{ queued: number; sent: number; skipped: number; errors: string[] }> {
  const ready = await ensureWhatsAppReady();
  if (!ready.ok) {
    return { queued: 0, sent: 0, skipped: items.length, errors: [ready.error] };
  }
  if (!items.length) {
    return { queued: 0, sent: 0, skipped: 0, errors: [] };
  }

  const scheduledAt = options?.scheduledAt?.trim() || null;
  const isFuture =
    !!scheduledAt && !Number.isNaN(new Date(scheduledAt).getTime()) && new Date(scheduledAt).getTime() > Date.now() + 30_000;

  const enq = await enqueuePreviewItems(items, options?.onProgress, scheduledAt);
  if (enq.queued === 0) {
    return { queued: 0, sent: 0, skipped: items.length, errors: enq.errors };
  }
  if (options?.enqueueOnly || isFuture) {
    return { queued: enq.queued, sent: 0, skipped: enq.skipped, errors: enq.errors };
  }

  const intervalMs = Math.max(3000, options?.intervalMs ?? DEFAULT_WHATSAPP_BULK_INTERVAL_MS);
  const proc = await messagingService.processPendingQueueThrottled({
    limit: enq.queued,
    intervalMs,
    shouldAbort: options?.shouldAbort,
    onProgress: (p) =>
      options?.onProgress?.({
        phase: 'send',
        done: p.sent,
        total: p.total,
        currentName: p.currentName,
        lastError: p.error,
      }),
  });

  return {
    queued: enq.queued,
    sent: proc.processed,
    skipped: enq.skipped,
    errors: [...enq.errors, ...proc.errors],
  };
}

/**
 * Sağlayıcı / QR gerekmez. Her alıcı için WhatsApp Desktop (whatsapp://) sohbetini
 * aralıklı açar; kullanıcı uygulamada Gönder’e basar. API kuyruğuna yazılmaz.
 */
export async function runWhatsAppBulkDesktopLinkCampaign(
  items: WhatsAppBulkPreviewItem[],
  options?: {
    intervalMs?: number;
    onProgress?: (p: WhatsAppBulkSendProgress) => void;
    shouldAbort?: () => boolean;
    defaultCountryCode?: string;
  },
): Promise<{ opened: number; skipped: number; errors: string[] }> {
  if (!items.length) {
    return { opened: 0, skipped: 0, errors: [] };
  }

  const intervalMs = Math.max(3000, options?.intervalMs ?? DEFAULT_WHATSAPP_BULK_DESKTOP_INTERVAL_MS);
  const country = options?.defaultCountryCode ?? '964';
  const errors: string[] = [];
  let opened = 0;
  let skipped = 0;
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    if (options?.shouldAbort?.()) break;
    const item = items[i];
    options?.onProgress?.({
      phase: 'send',
      done: i,
      total,
      currentName: item.name,
    });

    const result = await openWhatsAppDesktopChat(item.phone, item.messageText, {
      defaultCountryCode: country,
    });
    let lastError: string | undefined;
    if (result.ok) {
      opened++;
    } else {
      skipped++;
      lastError =
        result.error === 'invalid_phone' ? 'geçersiz numara' : 'Desktop açılamadı';
      errors.push(`${item.name}: ${lastError}`);
    }

    options?.onProgress?.({
      phase: 'send',
      done: i + 1,
      total,
      currentName: item.name,
      lastError,
    });

    if (i < items.length - 1 && !options?.shouldAbort?.()) {
      await sleep(intervalMs);
    }
  }

  return { opened, skipped, errors };
}
