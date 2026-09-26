/**
 * RetailEX — veri senkronu (soft realtime)
 *
 * - Aynı tarayıcı sekmeleri: BroadcastChannel
 * - Aynı sekme: CustomEvent
 * - Tauri yerel WS (wsService): DATA_INVALIDATION veya tablo-tipi eşlemesi
 * - İsteğe bağlı bulut: VITE_REALTIME_WS_URL (wss) — sunucu JSON push
 *
 * Tam satır-satır PG anlık yansıma için sunucuda NOTIFY + WS veya Supabase Realtime gerekir;
 * bu katman UI’ı “yenile” sinyaliyle güncel tutar.
 */

export type RealtimeInvalidateScope =
  | 'firms'
  | 'periods'
  | 'products'
  | 'customers'
  | 'sales'
  /** Alış/satış/iade fatura listeleri (sales ile birlikte dinlenebilir) */
  | 'invoices'
  | 'beauty'
  | 'restaurant'
  | 'all';

type InvalidateSource = 'local' | 'ws' | 'broadcast' | 'cloud';

const CHANNEL_NAME = 'retailex-sync-v1';
const DOM_EVENT = 'retailex:invalidate';

const ALL_SCOPES: RealtimeInvalidateScope[] = [
  'firms',
  'periods',
  'products',
  'customers',
  'sales',
  'invoices',
  'beauty',
  'restaurant',
  'all',
];

export function normalizeInvalidateScope(raw: string): RealtimeInvalidateScope {
  const s = String(raw || '').trim();
  if (ALL_SCOPES.includes(s as RealtimeInvalidateScope)) return s as RealtimeInvalidateScope;
  return 'all';
}

let broadcastChannel: BroadcastChannel | null = null;
let cloudWs: WebSocket | null = null;
const handlers = new Set<(scope: RealtimeInvalidateScope, source: InvalidateSource) => void>();

function ensureBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
      broadcastChannel.onmessage = (ev: MessageEvent) => {
        const scope = normalizeInvalidateScope(String((ev.data as { scope?: string })?.scope || 'all'));
        notifyLocal(scope, 'broadcast');
      };
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

function notifyLocal(scope: RealtimeInvalidateScope, source: InvalidateSource) {
  handlers.forEach((h) => {
    try {
      h(scope, source);
    } catch {
      /* ignore */
    }
  });
}

/**
 * Başka sekme / aynı sekme / WS: veri yenilemesi isteği yayınla.
 */
export function emitInvalidate(scope: RealtimeInvalidateScope, source: InvalidateSource = 'local') {
  const s = scope === 'all' ? 'all' : normalizeInvalidateScope(String(scope));
  notifyLocal(s, source);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(DOM_EVENT, {
        detail: { scope: s, source },
      })
    );
  }

  const ch = ensureBroadcastChannel();
  if (ch && source !== 'broadcast') {
    try {
      ch.postMessage({ scope: s, t: Date.now() });
    } catch {
      /* ignore */
    }
  }
}

/** Birden fazla kapsamı sırayla yayınla (ör. fatura → invoices + products). */
export function emitInvalidateScopes(
  scopes: readonly RealtimeInvalidateScope[],
  source: InvalidateSource = 'local'
) {
  const unique = Array.from(new Set(scopes));
  for (const scope of unique) {
    emitInvalidate(scope, source);
  }
}

/**
 * Fatura kaydı / silme sonrası açık tab listelerini ve stok/cariyi yenile.
 * `invoiceCreated` — eski PurchaseInvoiceModule dinleyicileri için.
 */
export function broadcastInvoiceMutation(options?: {
  skipProducts?: boolean;
  skipCustomers?: boolean;
  detail?: unknown;
}) {
  const scopes: RealtimeInvalidateScope[] = ['invoices', 'sales'];
  if (!options?.skipProducts) scopes.push('products');
  if (!options?.skipCustomers) scopes.push('customers');
  emitInvalidateScopes(scopes);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('invoiceCreated', {
          detail: options?.detail ?? { t: Date.now() },
        })
      );
    } catch {
      /* ignore */
    }
  }
}

export function subscribeInvalidate(
  callback: (scope: RealtimeInvalidateScope, source: InvalidateSource) => void
): () => void {
  // Yalnızca handlers — emitInvalidate zaten notifyLocal + DOM; DOM’u tekrar dinlemek çift tetikler.
  handlers.add(callback);
  return () => {
    handlers.delete(callback);
  };
}

/** wsService mesaj türlerini yenileme kapsamına çevir */
export function mapWsEventTypeToScope(type: string): RealtimeInvalidateScope | null {
  switch (type) {
    case 'PRODUCT_UPDATED':
    case 'STOCK_CHANGED':
    case 'PRICE_CHANGED':
      return 'products';
    case 'SALE_COMPLETED':
    case 'INVOICE_CREATED':
    case 'INVOICE_UPDATED':
    case 'INVOICE_DELETED':
      return 'invoices';
    case 'CUSTOMER_UPDATED':
      return 'customers';
    case 'CAMPAIGN_UPDATED':
      return 'all';
    case 'DATA_INVALIDATION':
      return 'all';
    default:
      return null;
  }
}

let cloudReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connectCloudRealtimeOnce() {
  if (typeof window === 'undefined') return;
  const raw =
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_REALTIME_WS_URL || '';
  const url = String(raw).trim();
  if (!url || !/^wss?:\/\//i.test(url)) return;
  if (cloudWs?.readyState === WebSocket.OPEN) return;

  try {
    cloudWs = new WebSocket(url);
    cloudWs.onmessage = (ev) => {
      try {
        const j = JSON.parse(String(ev.data || '{}')) as { scope?: string; type?: string };
        const raw = j.scope || j.type || 'all';
        const scope =
          raw === 'dashboard' ? 'beauty' : normalizeInvalidateScope(String(raw));
        emitInvalidate(scope, 'cloud');
      } catch {
        emitInvalidate('all', 'cloud');
      }
    };
    cloudWs.onclose = () => {
      cloudWs = null;
      if (cloudReconnectTimer) clearTimeout(cloudReconnectTimer);
      cloudReconnectTimer = setTimeout(connectCloudRealtimeOnce, 8000);
    };
    cloudWs.onerror = () => {
      try {
        cloudWs?.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore */
  }
}

/** Uygulama açılışında bir kez çağrın (App veya kök provider). */
export function initRetailexDataSync() {
  ensureBroadcastChannel();
  connectCloudRealtimeOnce();
}
