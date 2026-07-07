import type { Product, Sale } from '../core/types/models';
import { localCalendarDateKey } from './localCalendarDate';
import { canonicalInvoiceLineType, isInvoiceServiceLineType } from './invoiceLineType';

export interface ErpServiceBreakdownLine {
  id: string;
  saleId: string;
  date: string;
  customerName: string;
  staffName: string;
  deviceName: string;
  serviceName: string;
  amount: number;
  status: string;
  receiptNumber: string;
}

export interface ServiceBreakdownGroup<T = ErpServiceBreakdownLine> {
  serviceName: string;
  items: T[];
  sum: number;
}

function productLookup(products: Product[]) {
  const byId = new Map<string, Product>();
  const byCode = new Map<string, Product>();
  for (const p of products) {
    if (p.id) byId.set(String(p.id), p);
    if (p.code) byCode.set(String(p.code).trim().toLowerCase(), p);
  }
  return { byId, byCode };
}

function isServiceProduct(p: Product | undefined): boolean {
  if (!p) return false;
  return p.materialType === 'service' || p.isService === true;
}

function isServiceLineItem(
  lineType: string | undefined,
  productId: string,
  productName: string,
  products: Product[],
  serviceCardKeys: Set<string>,
): boolean {
  if (lineType && isInvoiceServiceLineType(lineType)) return true;
  if (lineType && canonicalInvoiceLineType(lineType) === 'Malzeme') return false;

  const key = String(productId ?? '').trim().toLowerCase();
  const nameKey = String(productName ?? '').trim().toLowerCase();
  if (key && serviceCardKeys.has(key)) return true;
  if (nameKey && serviceCardKeys.has(nameKey)) return true;

  const { byId, byCode } = productLookup(products);
  const p = (key && byId.get(key)) || (key && byCode.get(key));
  if (isServiceProduct(p)) return true;

  if (nameKey) {
    for (const prod of products) {
      if (String(prod.name ?? '').trim().toLowerCase() === nameKey && isServiceProduct(prod)) {
        return true;
      }
    }
  }
  return false;
}

export function buildErpServiceBreakdownGroups(
  sales: Sale[],
  products: Product[],
  serviceCards: Array<{ id?: string; code?: string; name?: string }>,
  fromYmd: string,
  toYmd: string,
  hizmetSaleIds?: Set<string>,
): ServiceBreakdownGroup<ErpServiceBreakdownLine>[] {
  const serviceCardKeys = new Set<string>();
  for (const s of serviceCards) {
    if (s.id) serviceCardKeys.add(String(s.id).trim().toLowerCase());
    if (s.code) serviceCardKeys.add(String(s.code).trim().toLowerCase());
    if (s.name) serviceCardKeys.add(String(s.name).trim().toLowerCase());
  }

  const lines: ErpServiceBreakdownLine[] = [];

  for (const sale of sales) {
    const dateKey = localCalendarDateKey(sale.date);
    if (dateKey < fromYmd || dateKey > toYmd) continue;
    const isHizmetInvoice = hizmetSaleIds?.has(sale.id) ?? false;
    const items = Array.isArray(sale.items) ? sale.items : [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const productId = String(item.productId ?? '');
      const productName = String(item.productName ?? '').trim() || '—';
      const lineType = String(item.lineType ?? (item as { item_type?: string }).item_type ?? '').trim() || undefined;
      if (!isHizmetInvoice && !isServiceLineItem(lineType, productId, productName, products, serviceCardKeys)) {
        continue;
      }
      const amount = Number(item.total ?? 0);
      if (!Number.isFinite(amount) || amount === 0) continue;

      lines.push({
        id: `${sale.id}-${i}`,
        saleId: sale.id,
        date: dateKey,
        customerName: String(sale.customerName ?? '').trim() || '—',
        staffName: String(sale.cashier ?? '').trim() || '—',
        deviceName: String(sale.beautyDeviceName ?? '').trim() || '—',
        serviceName: productName,
        amount,
        status: String(sale.status ?? sale.paymentStatus ?? 'completed'),
        receiptNumber: String(sale.receiptNumber ?? '').trim() || '—',
      });
    }
  }

  const map = new Map<string, ErpServiceBreakdownLine[]>();
  for (const line of lines) {
    if (!map.has(line.serviceName)) map.set(line.serviceName, []);
    map.get(line.serviceName)!.push(line);
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.receiptNumber.localeCompare(b.receiptNumber, 'tr');
    });
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
    .map(([serviceName, items]) => ({
      serviceName,
      items,
      sum: items.reduce((s, it) => s + it.amount, 0),
    }));
}
