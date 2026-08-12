import {
  cat,
  CUT_PARTIAL,
  ESC_ALIGN_CENTER,
  ESC_ALIGN_LEFT,
  ESC_BOLD_OFF,
  ESC_BOLD_ON,
  ESC_DOUBLE_OFF,
  ESC_DOUBLE_ON,
  ESC_INIT,
  NL,
  padEnd,
  txt,
  wrapText,
} from './escposBytes';
import { sendEscposOverNetwork } from './escposTcpTransport';
import {
  getRestaurantPrinterConfig,
  type RestaurantPrinterConfig,
  type RestaurantPrinterProfile,
  type RestaurantPrinterRouting,
} from '../../api/restaurantPrinterConfigApi';
import { useLanguageStore } from '../../store/languageStore';
import { usePrinterSettingsStore } from '../../store/printerSettingsStore';
import type { ReceiptLangCode } from '../../types/printerSettings';

export type KitchenReceiptLocale = ReceiptLangCode;

export type KitchenTicketItemLine = {
  name: string;
  quantity: number;
  course?: string;
  notes?: string;
  options?: string;
};

type KitchenTicketLabels = {
  title: string;
  tableSource: string;
  floor: string;
  waiter: string;
  time: string;
  empty: string;
  footer: string;
  colQty: string;
  colProduct: string;
};

const KITCHEN_I18N: Record<KitchenReceiptLocale, KitchenTicketLabels> = {
  tr: {
    title: 'MUTFAK FİŞİ',
    tableSource: 'MASA / KAYNAK:',
    floor: 'BÖLGE:',
    waiter: 'GARSON:',
    time: 'SAAT:',
    empty: '(kalem yok)',
    footer: '— hazırlanacak —',
    colQty: 'Adet',
    colProduct: 'Ürün',
  },
  en: {
    title: 'KITCHEN TICKET',
    tableSource: 'TABLE / SOURCE:',
    floor: 'AREA:',
    waiter: 'SERVER:',
    time: 'TIME:',
    empty: '(no items)',
    footer: '— to prepare —',
    colQty: 'Qty',
    colProduct: 'Item',
  },
  ar: {
    title: 'فاتورة المطبخ',
    tableSource: 'طاولة / مصدر:',
    floor: 'منطقة:',
    waiter: 'نادل:',
    time: 'الوقت:',
    empty: '(لا عناصر)',
    footer: '— للتحضير —',
    colQty: 'العدد',
    colProduct: 'الصنف',
  },
  ku: {
    title: 'پسوولەی چێشتخانە',
    tableSource: 'مێز / سەرچاوە:',
    floor: 'ناوچە:',
    waiter: 'گەرسۆن:',
    time: 'کات:',
    empty: '(بێ بەرهەم)',
    footer: '— بۆ ئامادەکردن —',
    colQty: 'ژمارە',
    colProduct: 'بەرهەم',
  },
  uz: {
    title: 'OSHXONA CHEKI',
    tableSource: 'STOL / MANBA:',
    floor: 'HUDUD:',
    waiter: 'OFITSANT:',
    time: 'VAQT:',
    empty: "(mahsulot yo'q)",
    footer: '— tayyorlash uchun —',
    colQty: 'Soni',
    colProduct: 'Mahsulot',
  },
};

function isKitchenLocale(v: unknown): v is KitchenReceiptLocale {
  return v === 'tr' || v === 'en' || v === 'ar' || v === 'ku' || v === 'uz';
}

export function getKitchenTicketLabels(locale?: KitchenReceiptLocale): KitchenTicketLabels {
  return KITCHEN_I18N[isKitchenLocale(locale) ? locale : 'tr'];
}

function kitchenDateLocale(locale: KitchenReceiptLocale): string {
  switch (locale) {
    case 'en':
      return 'en-GB';
    case 'ar':
      return 'ar-IQ';
    case 'ku':
      return 'ku-IQ';
    case 'uz':
      return 'uz-UZ';
    default:
      return 'tr-TR';
  }
}

export function formatKitchenTicketTime(locale?: KitchenReceiptLocale): string {
  const loc = isKitchenLocale(locale) ? locale : 'tr';
  return new Date().toLocaleString(kitchenDateLocale(loc));
}

export function resolveKitchenTicketLocale(explicit?: ReceiptLangCode | null): KitchenReceiptLocale {
  if (isKitchenLocale(explicit)) return explicit;
  const printerLang = usePrinterSettingsStore.getState().settings.defaultLanguage;
  if (isKitchenLocale(printerLang)) return printerLang;
  const appLang = useLanguageStore.getState().language;
  return isKitchenLocale(appLang) ? appLang : 'tr';
}

/** Rota ve kategori karşılaştırması web ile aynı: trim + NFC. */
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

function clampEscPosPort(p: number | undefined): number {
  const n = Number(p);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 9100;
  return Math.floor(n);
}

/** 80mm termal - web mutfak fişi ile aynı yaklaşık monosp genişlik. */
const LINE_W = 40;

function dashLine(): Uint8Array {
  return txt(`${'-'.repeat(LINE_W)}\n`);
}

export function buildKitchenTicketEscPosBuffer(input: {
  tableNumber: string;
  floorName?: string;
  waiter?: string;
  orderNote?: string;
  items: KitchenTicketItemLine[];
  locale?: KitchenReceiptLocale;
}): Uint8Array {
  const L = getKitchenTicketLabels(input.locale);
  const printed = formatKitchenTicketTime(input.locale);
  const parts: Uint8Array[] = [];
  const dash = dashLine();

  parts.push(ESC_INIT);
  parts.push(ESC_ALIGN_CENTER, ESC_DOUBLE_ON, ESC_BOLD_ON, txt(`${L.title}\n`), ESC_BOLD_OFF, ESC_DOUBLE_OFF, NL);
  parts.push(ESC_ALIGN_LEFT, dash);
  parts.push(txt(`${L.tableSource} ${input.tableNumber}\n`));
  if (input.floorName?.trim()) parts.push(txt(`${L.floor} ${input.floorName.trim()}\n`));
  if (input.waiter?.trim()) parts.push(txt(`${L.waiter} ${input.waiter.trim()}\n`));
  parts.push(txt(`${L.time} ${printed}\n`));
  parts.push(dash);

  if (input.orderNote?.trim()) {
    for (const w of wrapText(input.orderNote.trim(), LINE_W)) {
      parts.push(txt(`${w}\n`));
    }
    parts.push(dash);
  }

  const items = input.items || [];
  if (items.length === 0) {
    parts.push(txt(`${L.empty}\n`));
  } else {
    parts.push(ESC_BOLD_ON, txt(`${padEnd(L.colQty, 6)} ${L.colProduct}\n`), ESC_BOLD_OFF, dash);
    for (const it of items) {
      const qty = `${it.quantity}x`;
      const nameLines = wrapText(it.name, LINE_W - 7);
      const first = nameLines[0] ?? '';
      parts.push(ESC_BOLD_ON, txt(`${padEnd(qty, 6)} ${first}\n`), ESC_BOLD_OFF);
      for (let i = 1; i < nameLines.length; i++) {
        parts.push(txt(`${padEnd('', 6)} ${nameLines[i]}\n`));
      }
      const det = [it.notes?.trim(), it.options?.trim(), it.course?.trim() ? `(${it.course.trim()})` : '']
        .filter((x): x is string => Boolean(x && String(x).trim()))
        .join(' · ');
      if (det) {
        for (const w of wrapText(det, LINE_W)) {
          parts.push(txt(`  ${w}\n`));
        }
      }
    }
  }

  parts.push(dash);
  parts.push(ESC_ALIGN_CENTER, txt(`${L.footer}\n`));
  parts.push(NL, NL, NL, CUT_PARTIAL);
  return cat(...parts);
}

export type KitchenTicketMenuItem = {
  id: string;
  category?: string | null;
};

export type KitchenTicketProductLookup = {
  id: string;
  category?: string | null;
  group_name?: string | null;
  categoryId?: string | null;
  category_id?: string | null;
  categoryCode?: string | null;
  category_code?: string | null;
  groupCode?: string | null;
  group_code?: string | null;
};

export type KitchenTicketOrderItem = {
  id?: string;
  menuItemId?: string | null;
  productId?: string | null;
  product_id?: string | null;
  name?: string | null;
  productName?: string | null;
  product_name?: string | null;
  quantity: number;
  course?: string | null;
  notes?: string | null;
  note?: string | null;
  options?: unknown;
  category?: string | null;
  categoryName?: string | null;
  category_name?: string | null;
  categoryId?: string | null;
  category_id?: string | null;
  categoryCode?: string | null;
  category_code?: string | null;
};

type KitchenResolvedTarget =
  | { kind: 'system'; windowsPrinter: string }
  | { kind: 'network'; host: string; port: number }
  | { kind: 'html_fallback' };

function targetKey(t: KitchenResolvedTarget): string {
  if (t.kind === 'system') return `sys:${t.windowsPrinter}`;
  if (t.kind === 'network') return `net:${t.host}:${t.port}`;
  return 'html';
}

function productKey(item: KitchenTicketOrderItem): string {
  return kitchenMenuItemKey(item.menuItemId ?? item.productId ?? item.product_id);
}

function productLookupMap(rows?: KitchenTicketProductLookup[]): Map<string, KitchenTicketProductLookup> {
  const out = new Map<string, KitchenTicketProductLookup>();
  for (const row of rows || []) {
    const key = kitchenMenuItemKey(row.id);
    if (key) out.set(key, row);
  }
  return out;
}

function formatOptions(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') return raw.trim() || undefined;
  if (Array.isArray(raw)) {
    const parts = raw
      .map((x) => {
        if (x == null) return '';
        if (typeof x === 'string') return x;
        if (typeof x === 'object') {
          const r = x as Record<string, unknown>;
          return String(r.name ?? r.label ?? r.value ?? '').trim();
        }
        return String(x);
      })
      .filter(Boolean);
    return parts.join(', ') || undefined;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function itemToKitchenLine(item: KitchenTicketOrderItem): KitchenTicketItemLine {
  return {
    name: String(item.name ?? item.productName ?? item.product_name ?? '').trim() || 'Ürün',
    quantity: Number(item.quantity) || 0,
    course: item.course?.trim() || undefined,
    notes: (item.notes ?? item.note)?.trim() || undefined,
    options: formatOptions(item.options),
  };
}

function resolveOrderItemCategoryLabel(
  item: KitchenTicketOrderItem,
  menu: KitchenTicketMenuItem[],
  products: Map<string, KitchenTicketProductLookup>,
): string {
  const direct = String(item.category ?? item.categoryName ?? item.category_name ?? '').trim();
  if (direct) return normKitchenCategory(direct);

  const idKey = productKey(item);
  if (!idKey) return '';

  const menuRow = menu.find((m) => kitchenMenuItemKey(m.id) === idKey);
  if (menuRow) {
    const c = String(menuRow.category ?? '').trim();
    return normKitchenCategory(c || 'Genel');
  }

  const p = products.get(idKey);
  if (!p) return normKitchenCategory('Genel');
  const c =
    String(p.category ?? p.group_name ?? p.categoryCode ?? p.category_code ?? p.groupCode ?? p.group_code ?? '').trim() ||
    'Genel';
  return normKitchenCategory(c);
}

function resolveKitchenPrintTarget(
  item: KitchenTicketOrderItem,
  menu: KitchenTicketMenuItem[],
  products: Map<string, KitchenTicketProductLookup>,
  printerProfiles: RestaurantPrinterProfile[],
  printerRoutes: RestaurantPrinterRouting[],
  commonProfile: RestaurantPrinterProfile | undefined,
): KitchenResolvedTarget {
  const idKey = productKey(item);
  const cat = resolveOrderItemCategoryLabel(item, menu, products);

  let route = cat ? printerRoutes.find((r) => normKitchenCategory(r.categoryId) === cat) : undefined;
  if (!route && idKey) {
    const p = products.get(idKey);
    const pid = normKitchenCategory(String(item.categoryId ?? item.category_id ?? p?.categoryId ?? p?.category_id ?? ''));
    if (pid) {
      route = printerRoutes.find((r) => normKitchenCategory(r.categoryId) === pid);
    }
  }

  const profRoute = route ? printerProfiles.find((p) => p.id === route.printerId) : undefined;
  const fromProfile = (p: RestaurantPrinterProfile | undefined): KitchenResolvedTarget | null => {
    if (!p) return null;
    if (p.connection === 'network' && p.address?.trim()) {
      return { kind: 'network', host: p.address.trim(), port: clampEscPosPort(p.port) };
    }
    if (p.connection === 'system' && p.systemName?.trim()) {
      return { kind: 'system', windowsPrinter: p.systemName.trim() };
    }
    return null;
  };

  return fromProfile(profRoute) ?? fromProfile(commonProfile) ?? { kind: 'html_fallback' };
}

export type KitchenTicketPrintResult = {
  ok: boolean;
  message: string;
  sentGroups: number;
  sentItems: number;
  skippedGroups: number;
  errors: string[];
};

export async function printKitchenTicketsForOrder(params: {
  table: { number?: string | null; name?: string | null; location?: string | null; waiter?: string | null };
  pendingItems: KitchenTicketOrderItem[];
  menu?: KitchenTicketMenuItem[];
  productLookup?: KitchenTicketProductLookup[];
  printerConfig?: RestaurantPrinterConfig;
  orderNote?: string | null;
  locale?: ReceiptLangCode | null;
}): Promise<KitchenTicketPrintResult> {
  const pendingItems = params.pendingItems.filter((it) => Number(it.quantity) > 0);
  if (pendingItems.length === 0) {
    return {
      ok: true,
      message: 'Mutfağa gönderilecek kalem yok.',
      sentGroups: 0,
      sentItems: 0,
      skippedGroups: 0,
      errors: [],
    };
  }

  const cfg = params.printerConfig ?? (await getRestaurantPrinterConfig());
  const commonProfile = cfg.commonPrinterId
    ? cfg.printerProfiles.find((p) => p.id === cfg.commonPrinterId)
    : undefined;
  const products = productLookupMap(params.productLookup);
  const groups = new Map<string, { target: KitchenResolvedTarget; items: KitchenTicketOrderItem[] }>();

  for (const item of pendingItems) {
    const target = resolveKitchenPrintTarget(
      item,
      params.menu ?? [],
      products,
      cfg.printerProfiles,
      cfg.printerRoutes,
      commonProfile,
    );
    const key = targetKey(target);
    if (!groups.has(key)) groups.set(key, { target, items: [] });
    groups.get(key)!.items.push(item);
  }

  const locale = resolveKitchenTicketLocale(params.locale);
  const errors: string[] = [];
  let sentGroups = 0;
  let sentItems = 0;
  let skippedGroups = 0;

  for (const { target, items } of groups.values()) {
    if (target.kind !== 'network') {
      skippedGroups += 1;
      const label =
        target.kind === 'system'
          ? `Sistem yazıcısı (${target.windowsPrinter}) mobilde desteklenmiyor.`
          : 'HTML yazdırma mobilde desteklenmiyor.';
      errors.push(`${label} Ağ (IP) yazıcı profili veya ortak yazıcı tanımlayın.`);
      continue;
    }

    const payload = buildKitchenTicketEscPosBuffer({
      tableNumber: String(params.table.number ?? params.table.name ?? 'Masa'),
      floorName: params.table.location?.trim() || undefined,
      waiter: params.table.waiter?.trim() || undefined,
      orderNote: params.orderNote?.trim() || undefined,
      items: items.map(itemToKitchenLine),
      locale,
    });
    const res = await sendEscposOverNetwork(target.host, target.port, payload);
    if (res.ok) {
      sentGroups += 1;
      sentItems += items.length;
    } else {
      errors.push(`${target.host}:${target.port} mutfak yazıcısı başarısız: ${res.message}`);
    }
  }

  const ok = sentItems === pendingItems.length && errors.length === 0;
  const base = sentGroups > 0 ? `${sentItems} kalem ${sentGroups} ağ yazıcısı grubuna gönderildi.` : 'Mutfak fişi yazdırılamadı.';
  return {
    ok,
    message: errors.length > 0 ? `${base}\n${errors.join('\n')}` : base,
    sentGroups,
    sentItems,
    skippedGroups,
    errors,
  };
}
