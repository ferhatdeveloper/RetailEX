/** WhatsApp toplu gönderim — ban riskini azaltmak için aralıklı kuyruk işleme */

import { messagingService } from '../services/messaging/messagingService';

export const WHATSAPP_BULK_INTERVAL_OPTIONS_MS = [8000, 12000, 15000, 20000] as const;

export const DEFAULT_WHATSAPP_BULK_INTERVAL_MS = 12000;

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
): Promise<{ queued: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let queued = 0;
  let skipped = 0;
  const total = items.length;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.({ phase: 'enqueue', done: i, total, currentName: item.name });
    try {
      await messagingService.enqueueNotification({
        event_type: item.event_type ?? 'customer_broadcast',
        channel: 'whatsapp',
        recipient_phone: item.phone,
        recipient_name: item.name,
        message_text: item.messageText,
        reference_type: item.reference_type,
        reference_id: item.reference_id,
        payload_json: item.payload_json,
      });
      queued++;
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
  },
): Promise<{ queued: number; sent: number; skipped: number; errors: string[] }> {
  const ready = await ensureWhatsAppReady();
  if (!ready.ok) {
    return { queued: 0, sent: 0, skipped: items.length, errors: [ready.error] };
  }
  if (!items.length) {
    return { queued: 0, sent: 0, skipped: 0, errors: [] };
  }

  const enq = await enqueuePreviewItems(items, options?.onProgress);
  if (enq.queued === 0) {
    return { queued: 0, sent: 0, skipped: items.length, errors: enq.errors };
  }
  if (options?.enqueueOnly) {
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
