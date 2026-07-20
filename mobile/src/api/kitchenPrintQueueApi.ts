import { restKitchenPrintJobsTable } from './erpTables';
import { pgQuery } from './pgClient';
import {
  getRestaurantPrinterConfig,
  type RestaurantPrinterConfig,
  type RestaurantPrinterProfile,
  type RestaurantPrinterRouting,
} from './restaurantPrinterConfigApi';
import type { RestMenuItem, RestOrderDetail, RestOrderItem, SendToKitchenResult } from './restaurantApi';
import { useConfigStore } from '../store/configStore';
import type { ReceiptLangCode } from '../types/printerSettings';

type KitchenPrintConnection = 'network' | 'system' | 'html_fallback';

type KitchenResolvedTarget = {
  connection: KitchenPrintConnection;
  profile?: RestaurantPrinterProfile;
  printerName?: string;
  address?: string;
  port?: number;
};

export type EnqueueKitchenPrintJobsRequest = {
  order: RestOrderDetail;
  kitchenResult: SendToKitchenResult;
  tableName?: string | null;
  menu?: Array<Pick<RestMenuItem, 'id' | 'category'>>;
  locale?: ReceiptLangCode | null;
};

export type EnqueueKitchenPrintJobsResult = {
  jobCount: number;
  itemCount: number;
};

function normKitchenCategory(s: string | undefined | null): string {
  if (s == null) return '';
  try {
    return String(s).trim().normalize('NFC');
  } catch {
    return String(s).trim();
  }
}

function productKey(item: RestOrderItem): string {
  return String(item.product_id ?? '').trim();
}

function clampEscPosPort(p: number | undefined): number {
  const n = Number(p);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 9100;
  return Math.floor(n);
}

function resolveOrderItemCategoryLabel(
  item: RestOrderItem,
  menu: Array<Pick<RestMenuItem, 'id' | 'category'>>,
): string {
  const direct = String(item.category_name ?? item.category_code ?? '').trim();
  if (direct) return normKitchenCategory(direct);

  const idKey = productKey(item);
  const menuRow = idKey ? menu.find((m) => String(m.id) === idKey) : undefined;
  if (menuRow) {
    const c = String(menuRow.category ?? '').trim();
    return normKitchenCategory(c || 'Genel');
  }

  return normKitchenCategory('Genel');
}

function targetKey(target: KitchenResolvedTarget): string {
  if (target.connection === 'system') return `sys:${target.printerName ?? ''}`;
  if (target.connection === 'network') return `net:${target.address ?? ''}:${target.port ?? 9100}`;
  return 'html';
}

function resolveKitchenPrintTarget(
  item: RestOrderItem,
  menu: Array<Pick<RestMenuItem, 'id' | 'category'>>,
  config: RestaurantPrinterConfig,
  commonProfile: RestaurantPrinterProfile | undefined,
): KitchenResolvedTarget {
  const idKey = productKey(item);
  const cat = resolveOrderItemCategoryLabel(item, menu);

  let route = cat
    ? config.printerRoutes.find((r: RestaurantPrinterRouting) => normKitchenCategory(r.categoryId) === cat)
    : undefined;
  if (!route && idKey) {
    const pid = normKitchenCategory(String(item.category_id ?? ''));
    if (pid) {
      route = config.printerRoutes.find((r: RestaurantPrinterRouting) => normKitchenCategory(r.categoryId) === pid);
    }
  }

  const profRoute = route ? config.printerProfiles.find((p) => p.id === route.printerId) : undefined;
  const fromProfile = (p: RestaurantPrinterProfile | undefined): KitchenResolvedTarget | null => {
    if (!p) return null;
    if (p.connection === 'network' && p.address?.trim()) {
      return {
        connection: 'network',
        profile: p,
        printerName: p.name,
        address: p.address.trim(),
        port: clampEscPosPort(p.port),
      };
    }
    if (p.connection === 'system' && p.systemName?.trim()) {
      return {
        connection: 'system',
        profile: p,
        printerName: p.systemName.trim(),
      };
    }
    return null;
  };

  return fromProfile(profRoute) ?? fromProfile(commonProfile) ?? { connection: 'html_fallback' };
}

function itemToKitchenLine(item: RestOrderItem) {
  return {
    name: item.product_name,
    quantity: item.quantity,
    course: item.course ?? undefined,
    notes: item.note ?? undefined,
    options: item.options,
  };
}

function currentSourceDb(): 'local' | 'remote' {
  return useConfigStore.getState().config.dbMode === 'online' ? 'remote' : 'local';
}

export async function isWindowsPrinterServiceEnabled(): Promise<boolean> {
  const cfg = await getRestaurantPrinterConfig();
  return cfg.printViaWindowsService === true;
}

export async function enqueueKitchenPrintJobs(
  request: EnqueueKitchenPrintJobsRequest,
): Promise<EnqueueKitchenPrintJobsResult> {
  const cfg = await getRestaurantPrinterConfig();
  const sentIds = new Set(request.kitchenResult.sentItemIds);
  const pendingItems = request.order.items.filter((item) => sentIds.has(item.id) && Number(item.quantity) > 0);
  if (pendingItems.length === 0) return { jobCount: 0, itemCount: 0 };

  const commonProfile = cfg.commonPrinterId
    ? cfg.printerProfiles.find((p) => p.id === cfg.commonPrinterId)
    : undefined;
  const groups = new Map<string, { target: KitchenResolvedTarget; items: RestOrderItem[] }>();

  for (const item of pendingItems) {
    const target = resolveKitchenPrintTarget(item, request.menu ?? [], cfg, commonProfile);
    const key = targetKey(target);
    if (!groups.has(key)) groups.set(key, { target, items: [] });
    groups.get(key)!.items.push(item);
  }

  const tableName = request.tableName || request.order.table_name || request.order.table_id || 'Masa';
  const locale = request.locale ?? 'tr';
  const sourceDb = currentSourceDb();
  const jobs = restKitchenPrintJobsTable();
  let jobCount = 0;
  let itemCount = 0;

  for (const { target, items } of groups.values()) {
    const lines = items.map(itemToKitchenLine);
    const payload = {
      tableNumber: tableName,
      floorName: undefined,
      waiter: request.order.waiter ?? undefined,
      orderNote: undefined,
      items: lines,
      sourceDb,
    };

    await pgQuery(
      `INSERT INTO ${jobs}
        (kitchen_order_id, order_id, printer_profile_id, printer_name, connection, address, port,
         locale, payload, status, source_system, source_db)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb, 'pending', 'mobile', $10)`,
      [
        request.kitchenResult.kitchenOrderId ?? null,
        request.order.id,
        target.profile?.id ?? null,
        target.printerName ?? null,
        target.connection,
        target.address ?? null,
        target.port ?? null,
        locale,
        JSON.stringify(payload),
        sourceDb,
      ],
    );

    jobCount += 1;
    itemCount += lines.length;
  }

  return { jobCount, itemCount };
}
