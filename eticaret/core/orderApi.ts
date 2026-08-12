import type { EticaretWebOrder } from './types';
import type { PaymentInitRequest, PaymentProviderConfig } from './payments/types';

function rewriteBridgeUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  const origin = window.location.origin;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

async function bridgePost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(rewriteBridgeUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(String((data as { error?: string }).error || res.statusText));
  return data;
}

export async function submitWebOrder(payload: {
  tenantCode: string;
  demoMode: boolean;
  customer: { name?: string; email?: string; phone?: string; address?: string };
  items: Array<{ code: string; name: string; quantity: number; price: number; line_total?: number }>;
  paymentProvider?: string;
  paymentStatus?: string;
  currency?: string;
  connStr?: string;
  firmNr?: string;
}): Promise<Record<string, unknown>> {
  const subtotal = payload.items.reduce((s, i) => s + i.quantity * i.price, 0);
  const body: Record<string, unknown> = {
    connStr: payload.connStr,
    tenant_code: payload.tenantCode,
    demo_mode: payload.demoMode,
    customer_name: payload.customer.name,
    customer_email: payload.customer.email,
    customer_phone: payload.customer.phone,
    shipping_address: payload.customer.address,
    payment_provider: payload.paymentProvider,
    payment_status: payload.paymentStatus || 'pending',
    currency: payload.currency || 'TRY',
    subtotal,
    total: subtotal,
    items: payload.items,
  };
  if (payload.firmNr?.trim()) {
    body.firm_nr = payload.firmNr.trim();
  }

  return bridgePost('/api/eticaret/submit-order', body);
}

export async function initPayment(
  req: PaymentInitRequest & { connStr?: string; providers?: PaymentProviderConfig[] },
): Promise<Record<string, unknown>> {
  return bridgePost('/api/eticaret/payment/init', req as unknown as Record<string, unknown>);
}

export async function listWebOrders(connStr: string, tenantCode?: string): Promise<EticaretWebOrder[]> {
  const sql = tenantCode
    ? `SELECT * FROM public.eticaret_web_orders WHERE tenant_code = $1 ORDER BY created_at DESC LIMIT 200`
    : `SELECT * FROM public.eticaret_web_orders ORDER BY created_at DESC LIMIT 200`;
  const params = tenantCode ? [tenantCode] : [];
  const res = await bridgePost<{ rows: EticaretWebOrder[] }>('/api/pg_query', { connStr, sql, params });
  return Array.isArray(res.rows) ? res.rows : [];
}

export async function fetchEnabledPaymentMethods(connStr: string): Promise<string[]> {
  const res = await bridgePost<{ rows: Array<{ eticaret_settings?: { paymentProviders?: PaymentProviderConfig[] } }> }>(
    '/api/pg_query',
    {
      connStr,
      sql: `SELECT eticaret_settings FROM public.system_settings WHERE id = 1 LIMIT 1`,
      params: [],
    },
  );
  const settings = res.rows?.[0]?.eticaret_settings;
  const list = settings?.paymentProviders || [];
  return list.filter((p) => p.enabled).map((p) => p.id);
}
