import type { MenuItem, OrderItem, PrinterProfile, PrinterRouting, Table } from '../components/restaurant/types';
import { useProductStore } from '../store/useProductStore';
import { buildKitchenTicketEscPosBuffer, printKitchenEscPosOverTcp } from './kitchenTicketEscPos';
import {
  buildRestaurantKitchenTicketHtml,
  printRestaurantHtmlNoPreview,
  type KitchenReceiptLocale,
} from './restaurantReceiptPrint';

/** Rota ve menü kategorisi karşılaştırması (trim + NFC); ayarlar ekranı ile aynı olmalı. */
export function normKitchenCategory(s: string | undefined | null): string {
  if (s == null) return '';
  try {
    return String(s).trim().normalize('NFC');
  } catch {
    return String(s).trim();
  }
}

function kitchenMenuItemKey(menuItemId: string | undefined | null): string {
  return String(menuItemId ?? '').trim();
}

/** loadMenu ile aynı kategori türetimi; menü satırı yoksa ürün stoğundan yedek. */
function resolveOrderItemCategoryLabel(item: OrderItem, menu: MenuItem[]): string {
  const idKey = kitchenMenuItemKey(item.menuItemId);
  if (!idKey) return '';

  const menuRow = menu.find((m) => kitchenMenuItemKey(m.id) === idKey);
  if (menuRow) {
    const c = String(menuRow.category ?? '').trim();
    return normKitchenCategory(c || 'Genel');
  }

  const products = useProductStore.getState().products as Array<{ id: string; category?: string; group_name?: string }>;
  const p = products.find((pr) => kitchenMenuItemKey(pr.id) === idKey) as { category?: string; group_name?: string; categoryId?: string } | undefined;
  if (!p) return normKitchenCategory('Genel');

  const c = String(p.category ?? p.group_name ?? '').trim() || 'Genel';
  return normKitchenCategory(c);
}

function clampEscPosPort(p: number | undefined): number {
  const n = Number(p);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 9100;
  return Math.floor(n);
}

function orderItemToKitchenLines(items: OrderItem[]): Parameters<typeof buildRestaurantKitchenTicketHtml>[0]['items'] {
  return items.map((it) => ({
    name: it.name,
    quantity: it.quantity,
    course: it.course,
    notes: it.notes,
    options: it.options,
  }));
}

type KitchenResolvedTarget =
  | { kind: 'system'; windowsPrinter: string }
  | { kind: 'network'; host: string; port: number }
  | { kind: 'html_fallback' };

function targetKey(t: KitchenResolvedTarget): string {
  if (t.kind === 'system') return `sys:${t.windowsPrinter}`;
  if (t.kind === 'network') return `net:${t.host}:${t.port}`;
  return 'html';
}

function resolveKitchenPrintTarget(
  item: OrderItem,
  menu: MenuItem[],
  printerProfiles: PrinterProfile[],
  printerRoutes: PrinterRouting[],
  commonProfile: PrinterProfile | undefined
): KitchenResolvedTarget {
  const idKey = kitchenMenuItemKey(item.menuItemId);
  const cat = resolveOrderItemCategoryLabel(item, menu);

  let route = cat ? printerRoutes.find((r) => normKitchenCategory(r.categoryId) === cat) : undefined;
  if (!route && idKey) {
    const p = useProductStore.getState().products.find((pr) => kitchenMenuItemKey(pr.id) === idKey) as
      | { categoryId?: string }
      | undefined;
    const pid = p?.categoryId != null ? normKitchenCategory(String(p.categoryId)) : '';
    if (pid) {
      route = printerRoutes.find((r) => normKitchenCategory(r.categoryId) === pid);
    }
  }

  const profRoute = route ? printerProfiles.find((p) => p.id === route.printerId) : undefined;

  const fromProfile = (p: PrinterProfile | undefined): KitchenResolvedTarget | null => {
    if (!p) return null;
    if (p.connection === 'network' && p.address?.trim()) {
      return { kind: 'network', host: p.address.trim(), port: clampEscPosPort(p.port) };
    }
    if (p.connection === 'system' && p.systemName?.trim()) {
      return { kind: 'system', windowsPrinter: p.systemName.trim() };
    }
    return null;
  };

  const r = fromProfile(profRoute);
  if (r) return r;
  const c = fromProfile(commonProfile);
  if (c) return c;
  return { kind: 'html_fallback' };
}

/**
 * Mutfağa gönderim sonrası: kategori rotasına göre gruplanmış mutfak fişi(leri).
 * - «Sistem yazıcısı»: Edge+PDF+Sumatra (HTML)
 * - «Ağ (IP)»: DeskApp `print_escpos_tcp` ham ESC/POS (varsayılan 9100)
 */
export async function printKitchenTicketsAfterSend(params: {
  table: Pick<Table, 'number' | 'location' | 'waiter'>;
  pendingItems: OrderItem[];
  menu: MenuItem[];
  printerProfiles: PrinterProfile[];
  printerRoutes: PrinterRouting[];
  commonPrinterId?: string;
  orderNote?: string;
  locale?: KitchenReceiptLocale;
}): Promise<void> {
  const {
    table,
    pendingItems,
    menu,
    printerProfiles,
    printerRoutes,
    commonPrinterId,
    orderNote,
    locale,
  } = params;
  if (pendingItems.length === 0) return;

  const commonProfile = commonPrinterId ? printerProfiles.find((p) => p.id === commonPrinterId) : undefined;

  const groups = new Map<string, { target: KitchenResolvedTarget; items: OrderItem[] }>();
  for (const item of pendingItems) {
    const target = resolveKitchenPrintTarget(item, menu, printerProfiles, printerRoutes, commonProfile);
    const key = targetKey(target);
    if (!groups.has(key)) groups.set(key, { target, items: [] });
    groups.get(key)!.items.push(item);
  }

  for (const { target, items } of groups.values()) {
    const lines = orderItemToKitchenLines(items);
    const base = {
      tableNumber: table.number,
      floorName: table.location,
      waiter: table.waiter,
      orderNote,
      items: lines,
      locale,
    };

    if (target.kind === 'network') {
      try {
        const buf = buildKitchenTicketEscPosBuffer(base);
        await printKitchenEscPosOverTcp(target.host, target.port, buf);
      } catch (e) {
        console.warn('[restaurantKitchenPrint] ESC/POS ağ:', e);
      }
      continue;
    }

    const html = buildRestaurantKitchenTicketHtml(base);
    try {
      const explicitPrinter = target.kind === 'system' ? target.windowsPrinter : undefined;
      await printRestaurantHtmlNoPreview(html, explicitPrinter);
    } catch (e) {
      console.warn('[restaurantKitchenPrint] yazdırma:', e);
      const raw =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
          ? (e as { message: string }).message
          : String(e);
      const msg = raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
      void import('sonner')
        .then(({ toast }) => {
          toast.error(
            `Mutfak fişi sessiz yazdırılamadı: ${msg}. SumatraPDF (npm run sumatra:fetch), Microsoft Edge ve yazıcı adını kontrol edin.`,
            { duration: 14_000 }
          );
        })
        .catch(() => {});
    }
  }
}

export type KitchenPrintLineInput = {
  menuItemId: string;
  name: string;
  quantity: number;
  course?: string;
  notes?: string;
  options?: string;
};

/** Paket / CallerID akışı gibi OrderItem listesi olmayan yerler için. */
export async function printKitchenTicketsFromLines(params: {
  table: Pick<Table, 'number' | 'location' | 'waiter'>;
  lines: KitchenPrintLineInput[];
  menu: MenuItem[];
  printerProfiles: PrinterProfile[];
  printerRoutes: PrinterRouting[];
  commonPrinterId?: string;
  orderNote?: string;
  locale?: KitchenReceiptLocale;
}): Promise<void> {
  const { lines, locale, ...rest } = params;
  const synthetic: OrderItem[] = lines.map((l, i) => ({
    id: `kitchen-line-${i}`,
    menuItemId: l.menuItemId,
    name: l.name,
    quantity: l.quantity,
    price: 0,
    status: 'pending',
    course: l.course as OrderItem['course'],
    notes: l.notes,
    options: l.options,
  }));
  await printKitchenTicketsAfterSend({ ...rest, pendingItems: synthetic, locale });
}
