/**
 * Public QR Menü API — `/api/qr/:tenantCode/...` (pg_bridge).
 * Bridge camelCase yanıtını UI'nın beklediği şekle normalize eder.
 */
import { getBridgeUrl } from '../../../utils/env';

export type QrLang = 'tr' | 'en' | 'ar' | 'ku';

export type QrPublicSettings = {
  restaurant_name?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  primary_color?: string | null;
  wifi_ssid?: string | null;
  wifi_password?: string | null;
  default_language?: string | null;
  supported_languages?: string[];
  ordering_enabled?: boolean;
  call_waiter_enabled?: boolean;
  request_bill_enabled?: boolean;
  valet_enabled?: boolean;
  feedback_enabled?: boolean;
  wifi_enabled?: boolean;
  is_active?: boolean;
  /** premium = yeni UI; classic = eski renkli grid UI */
  guest_ui_theme?: 'premium' | 'classic';
};

export type QrPublicMenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  image?: string | null;
  description?: string | null;
};

export type QrPublicMenuPayload = {
  settings: QrPublicSettings;
  categories: string[];
  items: QrPublicMenuItem[];
};

export type QrLiveOrderItem = {
  id: string;
  name: string;
  qty: number;
  price: number;
  subtotal?: number;
  status?: string;
  note?: string | null;
  sentToKitchenAt?: string | null;
  servedAt?: string | null;
  createdAt?: string | null;
};

export type QrLiveOrder = {
  id: string;
  orderNo?: string;
  status?: string;
  totalAmount: number;
  discountAmount?: number;
  taxAmount?: number;
  guestPhase?: string;
  openedAt?: string | null;
  items: QrLiveOrderItem[];
};

export type QrLiveBill = {
  tableNumber?: string;
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  guestPhase?: string;
  items: QrLiveOrderItem[];
};

export type QrPublicTableInfo = {
  tableId: string;
  tableNumber: string;
  tableStatus?: string;
  orderSummary?: { orderId?: string; total?: number; itemCount?: number } | null;
  order: QrLiveOrder | null;
  bill: QrLiveBill | null;
  pendingOrders?: Array<{
    requestId: string;
    awaitingApproval?: boolean;
    createdAt?: string;
    note?: string | null;
    items: QrLiveOrderItem[];
  }>;
};

export type QrPublicCartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
  image?: string | null;
};

export type QrPublicFeedbackQuestion = {
  id: string;
  code: string;
  name_tr: string;
  name_en?: string | null;
  name_ar?: string | null;
  name_ku?: string | null;
  icon_key?: string | null;
  sort_order?: number;
};

function bridgeBase(): string {
  try {
    return getBridgeUrl().replace(/\/+$/, '');
  } catch {
    if (typeof window !== 'undefined') return window.location.origin.replace(/\/+$/, '');
    return '';
  }
}

async function qrFetch<T>(
  tenantCode: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const code = encodeURIComponent(tenantCode.trim());
  const url = `${bridgeBase()}/api/qr/${code}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.error || body?.message || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `QR API ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function mapSettings(raw: Record<string, unknown> | undefined): QrPublicSettings {
  if (!raw) return {};
  // Bridge camelCase veya snake_case
  return {
    restaurant_name: (raw.restaurantName ?? raw.restaurant_name) as string | null,
    logo_url: (raw.logoUrl ?? raw.logo_url) as string | null,
    cover_image_url: (raw.coverImageUrl ?? raw.cover_image_url) as string | null,
    primary_color: (raw.primaryColor ?? raw.primary_color ?? '#f59e0b') as string,
    wifi_ssid: (raw.wifiSsid ?? raw.wifi_ssid) as string | null,
    wifi_password: (raw.wifiPassword ?? raw.wifi_password) as string | null,
    default_language: (raw.defaultLanguage ?? raw.default_language ?? 'tr') as string,
    supported_languages: (raw.supportedLanguages ??
      raw.supported_languages ?? ['tr', 'en', 'ar', 'ku']) as string[],
    ordering_enabled: (raw.orderingEnabled ?? raw.ordering_enabled) !== false,
    call_waiter_enabled: (raw.callWaiterEnabled ?? raw.call_waiter_enabled) !== false,
    request_bill_enabled: (raw.requestBillEnabled ?? raw.request_bill_enabled) !== false,
    valet_enabled: !!(raw.valetEnabled ?? raw.valet_enabled),
    feedback_enabled: (raw.feedbackEnabled ?? raw.feedback_enabled) !== false,
    wifi_enabled: (raw.wifiEnabled ?? raw.wifi_enabled) !== false,
    is_active: (raw.isActive ?? raw.is_active) !== false,
    guest_ui_theme:
      String(raw.guestUiTheme ?? raw.guest_ui_theme ?? 'premium') === 'classic'
        ? 'classic'
        : 'premium',
  };
}

export const qrPublicApi = {
  async getMenu(tenantCode: string): Promise<QrPublicMenuPayload> {
    const raw = await qrFetch<{
      settings?: Record<string, unknown>;
      categories?: Array<{ id: string; name: string } | string>;
      products?: Array<Record<string, unknown>>;
      items?: QrPublicMenuItem[];
    }>(tenantCode, '/menu');

    const catList = (raw.categories || []).map((c) =>
      typeof c === 'string' ? c : String(c.name || 'Genel')
    );
    const catById = new Map<string, string>();
    for (const c of raw.categories || []) {
      if (typeof c !== 'string' && c.id) catById.set(String(c.id), String(c.name || 'Genel'));
    }

    const items: QrPublicMenuItem[] =
      raw.items ||
      (raw.products || []).map((p) => ({
        id: String(p.id),
        name: String(p.name || 'Ürün'),
        price: Number(p.price ?? p.sale_price) || 0,
        category: catById.get(String((p.categoryId ?? p.category_id) || '')) || 'Genel',
        image: (p.imageUrl ?? p.image_url) as string | null,
        description: (p.description as string) || null,
      }));

    const categories =
      catList.length > 0
        ? catList
        : Array.from(new Set(items.map((i) => i.category || 'Genel')));

    return {
      settings: mapSettings(raw.settings),
      categories,
      items,
    };
  },

  async getTable(tenantCode: string, tableToken: string): Promise<QrPublicTableInfo> {
    const raw = await qrFetch<{
      table?: { id: string; number: string; status?: string; total?: number };
      order?: {
        id?: string;
        orderNo?: string;
        order_no?: string;
        status?: string;
        totalAmount?: number;
        total_amount?: number;
        discountAmount?: number;
        discount_amount?: number;
        taxAmount?: number;
        guestPhase?: string;
        openedAt?: string;
        items?: QrLiveOrderItem[] | string;
      } | null;
      bill?: QrLiveBill | null;
      pendingOrders?: Array<{
        requestId: string;
        awaitingApproval?: boolean;
        createdAt?: string;
        note?: string | null;
        items: QrLiveOrderItem[];
      }>;
      tableId?: string;
      tableNumber?: string;
    }>(tenantCode, `/table/${encodeURIComponent(tableToken)}`);

    const tableId = raw.table?.id || raw.tableId || '';
    const tableNumber = raw.table?.number || raw.tableNumber || '';
    let items: QrLiveOrderItem[] = [];
    const rawItems = raw.order?.items;
    if (Array.isArray(rawItems)) items = rawItems;
    else if (typeof rawItems === 'string') {
      try {
        items = JSON.parse(rawItems);
      } catch {
        items = [];
      }
    }
    items = items.map((i) => ({
      id: String(i.id),
      name: String(i.name || ''),
      qty: Number(i.qty) || 0,
      price: Number(i.price) || 0,
      subtotal: Number(i.subtotal) || Number(i.qty) * Number(i.price) || 0,
      status: i.status,
      note: i.note,
      sentToKitchenAt: i.sentToKitchenAt,
      servedAt: i.servedAt,
      createdAt: i.createdAt,
    }));

    const totalAmount =
      Number(raw.order?.totalAmount ?? raw.order?.total_amount) ||
      Number(raw.bill?.totalAmount) ||
      Number(raw.table?.total) ||
      0;
    const discountAmount =
      Number(raw.order?.discountAmount ?? raw.order?.discount_amount) ||
      Number(raw.bill?.discountAmount) ||
      0;

    const order: QrLiveOrder | null = raw.order
      ? {
          id: String(raw.order.id || ''),
          orderNo: raw.order.orderNo || raw.order.order_no,
          status: raw.order.status,
          totalAmount,
          discountAmount,
          taxAmount: Number(raw.order.taxAmount) || 0,
          guestPhase: raw.order.guestPhase || raw.bill?.guestPhase,
          openedAt: raw.order.openedAt,
          items,
        }
      : null;

    const bill: QrLiveBill | null =
      raw.bill ||
      (order
        ? {
            tableNumber,
            itemCount: items.length,
            subtotal: items.reduce((s, i) => s + (i.subtotal || i.qty * i.price), 0),
            discountAmount,
            totalAmount,
            guestPhase: order.guestPhase,
            items,
          }
        : null);

    return {
      tableId,
      tableNumber,
      tableStatus: raw.table?.status,
      orderSummary: order
        ? {
            orderId: order.id,
            total: order.totalAmount,
            itemCount: order.items.length,
          }
        : null,
      order,
      bill,
      pendingOrders: raw.pendingOrders || [],
    };
  },

  placeOrder(
    tenantCode: string,
    body: { tableToken: string; items: QrPublicCartItem[]; note?: string }
  ) {
    return qrFetch<{
      orderId: string | null;
      requestId?: string | null;
      pendingApproval?: boolean;
      message?: string;
    }>(
      tenantCode,
      '/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          tableToken: body.tableToken,
          note: body.note,
          items: body.items.map((i) => ({
            productId: i.productId,
            name: i.name,
            quantity: i.qty,
            unitPrice: i.price,
            note: i.note,
          })),
        }),
      }
    );
  },

  async createRequest(
    tenantCode: string,
    body: {
      tableToken: string;
      type: 'waiter' | 'bill' | 'help' | 'valet';
      note?: string;
      plateNumber?: string;
      payload?: Record<string, unknown>;
    }
  ) {
    const raw = await qrFetch<{ ok?: boolean; request?: { id: string }; id?: string }>(
      tenantCode,
      '/requests',
      {
        method: 'POST',
        body: JSON.stringify({
          tableToken: body.tableToken,
          type: body.type,
          note: body.note,
          plateNumber: body.plateNumber,
          payload: body.payload,
        }),
      }
    );
    return { id: raw.request?.id || raw.id || '' };
  },

  getFeedbackQuestions(tenantCode: string) {
    return qrFetch<{ questions: QrPublicFeedbackQuestion[] }>(
      tenantCode,
      '/feedback/questions'
    );
  },

  async submitFeedback(
    tenantCode: string,
    body: {
      tableToken?: string;
      ratings: Array<{ questionCode: string; questionId?: string; rating: number }>;
      firstName?: string;
      lastName?: string;
      phone?: string;
      comment?: string;
    }
  ) {
    // Bridge tek satır kabul eder — her rating için ayrı POST
    for (const r of body.ratings) {
      await qrFetch(tenantCode, '/feedback', {
        method: 'POST',
        body: JSON.stringify({
          tableToken: body.tableToken,
          questionCode: r.questionCode,
          questionId: r.questionId,
          rating: r.rating,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
          comment: body.comment,
        }),
      });
    }
    return { ok: true };
  },
};

export function questionLabel(q: QrPublicFeedbackQuestion, lang: QrLang): string {
  if (lang === 'en' && q.name_en) return q.name_en;
  if (lang === 'ar' && q.name_ar) return q.name_ar;
  if (lang === 'ku' && q.name_ku) return q.name_ku;
  return q.name_tr;
}
