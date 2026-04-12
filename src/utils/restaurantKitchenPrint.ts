import type { MenuItem, OrderItem, PrinterProfile, PrinterRouting, Table } from '../components/restaurant/types';
import { buildRestaurantKitchenTicketHtml, printRestaurantHtmlNoPreview } from './restaurantReceiptPrint';

function orderItemToKitchenLines(items: OrderItem[]): Parameters<typeof buildRestaurantKitchenTicketHtml>[0]['items'] {
  return items.map((it) => ({
    name: it.name,
    quantity: it.quantity,
    course: it.course,
    notes: it.notes,
    options: it.options,
  }));
}

function resolveSystemPrinterNameForItem(
  item: OrderItem,
  menu: MenuItem[],
  printerProfiles: PrinterProfile[],
  printerRoutes: PrinterRouting[],
  commonProfile: PrinterProfile | undefined
): string | undefined {
  const cat = menu.find((m) => m.id === item.menuItemId)?.category;
  const route = cat ? printerRoutes.find((r) => r.categoryId === cat) : undefined;
  const profile = route ? printerProfiles.find((p) => p.id === route.printerId) : undefined;
  if (profile?.connection === 'system' && profile.systemName?.trim()) {
    return profile.systemName.trim();
  }
  if (commonProfile?.connection === 'system' && commonProfile.systemName?.trim()) {
    return commonProfile.systemName.trim();
  }
  return undefined;
}

const DEFAULT_GROUP_KEY = '__kitchen_default__';

/**
 * Mutfağa gönderim sonrası: kategori rotasına göre gruplanmış mutfak fişi(leri) yazar.
 * Ağ/USB yazıcılar henüz `print_html_silent` ile desteklenmediği için yalnızca
 * «Sistem Yazıcısı» eşlemesi veya kasa fişi ayarı / OS varsayılanı kullanılır.
 */
export async function printKitchenTicketsAfterSend(params: {
  table: Pick<Table, 'number' | 'location' | 'waiter'>;
  pendingItems: OrderItem[];
  menu: MenuItem[];
  printerProfiles: PrinterProfile[];
  printerRoutes: PrinterRouting[];
  commonPrinterId?: string;
  orderNote?: string;
}): Promise<void> {
  const { table, pendingItems, menu, printerProfiles, printerRoutes, commonPrinterId, orderNote } = params;
  if (pendingItems.length === 0) return;

  const commonProfile = commonPrinterId ? printerProfiles.find((p) => p.id === commonPrinterId) : undefined;

  const groups = new Map<string, OrderItem[]>();
  for (const item of pendingItems) {
    const sysName = resolveSystemPrinterNameForItem(item, menu, printerProfiles, printerRoutes, commonProfile);
    const key = sysName === undefined ? DEFAULT_GROUP_KEY : sysName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  for (const [key, groupItems] of groups) {
    const explicitPrinter = key === DEFAULT_GROUP_KEY ? undefined : key;
    const html = buildRestaurantKitchenTicketHtml({
      tableNumber: table.number,
      floorName: table.location,
      waiter: table.waiter,
      orderNote,
      items: orderItemToKitchenLines(groupItems),
    });
    try {
      await printRestaurantHtmlNoPreview(html, explicitPrinter);
    } catch (e) {
      console.warn('[restaurantKitchenPrint] yazdırma:', e);
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
}): Promise<void> {
  const { lines, ...rest } = params;
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
  await printKitchenTicketsAfterSend({ ...rest, pendingItems: synthetic });
}
