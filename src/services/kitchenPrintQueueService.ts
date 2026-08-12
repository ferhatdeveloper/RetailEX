import type { MenuItem, OrderItem, PrinterProfile, PrinterRouting, Table } from '../components/restaurant/types';
import { useProductStore } from '../store/useProductStore';
import type { KitchenReceiptLocale } from '../utils/restaurantReceiptPrint';
import { DB_SETTINGS, ERP_SETTINGS, postgres } from './postgres';
import { getBindingForScope } from './printDesignBindingService';
import { getRestaurantPrinterConfig } from './restaurantPrinterConfigService';
import {
  enqueueFastReportFrxJob,
  enqueueFastReportTemplateJob,
  enqueuePrintJob,
  isWindowsPrinterServiceEnabled as isUnifiedWindowsPrinterServiceEnabled,
} from './unifiedPrintQueueService';

export { isWindowsPrinterServiceEnabled } from './unifiedPrintQueueService';

type KitchenPrintConnection = 'network' | 'system' | 'html_fallback';

type KitchenResolvedTarget = {
  connection: KitchenPrintConnection;
  profile?: PrinterProfile;
  printerName?: string;
  address?: string;
  port?: number;
};

export type EnqueueKitchenPrintJobsParams = {
  kitchenOrderId?: string | null;
  orderId?: string | null;
  table: Pick<Table, 'number' | 'location' | 'waiter'>;
  pendingItems: OrderItem[];
  menu: MenuItem[];
  orderNote?: string;
  locale?: KitchenReceiptLocale;
  sourceSystem?: 'web' | 'mobile' | 'service';
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

function kitchenMenuItemKey(menuItemId: string | undefined | null): string {
  return String(menuItemId ?? '').trim();
}

function resolveOrderItemCategoryLabel(item: OrderItem, menu: MenuItem[]): string {
  const idKey = kitchenMenuItemKey(item.menuItemId);
  if (!idKey) return '';

  const menuRow = menu.find((m) => kitchenMenuItemKey(m.id) === idKey);
  if (menuRow) {
    const c = String(menuRow.category ?? '').trim();
    return normKitchenCategory(c || 'Genel');
  }

  const products = useProductStore.getState().products as Array<{
    id: string;
    category?: string;
    group_name?: string;
  }>;
  const p = products.find((pr) => kitchenMenuItemKey(pr.id) === idKey);
  if (!p) return normKitchenCategory('Genel');

  const c = String(p.category ?? p.group_name ?? '').trim() || 'Genel';
  return normKitchenCategory(c);
}

function clampEscPosPort(p: number | undefined): number {
  const n = Number(p);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 9100;
  return Math.floor(n);
}

function targetKey(target: KitchenResolvedTarget): string {
  if (target.connection === 'system') return `sys:${target.printerName ?? ''}`;
  if (target.connection === 'network') return `net:${target.address ?? ''}:${target.port ?? 9100}`;
  return 'html';
}

function resolveKitchenPrintTarget(
  item: OrderItem,
  menu: MenuItem[],
  printerProfiles: PrinterProfile[],
  printerRoutes: PrinterRouting[],
  commonProfile: PrinterProfile | undefined,
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

function orderItemToKitchenLine(item: OrderItem) {
  return {
    name: item.name,
    quantity: item.quantity,
    course: item.course,
    notes: item.notes,
    options: item.options,
  };
}

function currentSourceDb(): 'local' | 'remote' {
  return DB_SETTINGS.activeMode === 'online' ? 'remote' : 'local';
}

export async function enqueueKitchenPrintJobs(
  params: EnqueueKitchenPrintJobsParams,
): Promise<EnqueueKitchenPrintJobsResult> {
  const cfg = await getRestaurantPrinterConfig();
  const pendingItems = params.pendingItems.filter((item) => Number(item.quantity) > 0);
  if (pendingItems.length === 0) return { jobCount: 0, itemCount: 0 };

  const commonProfile = cfg.commonPrinterId
    ? cfg.printerProfiles.find((p) => p.id === cfg.commonPrinterId)
    : undefined;
  const groups = new Map<string, { target: KitchenResolvedTarget; items: OrderItem[] }>();

  for (const item of pendingItems) {
    const target = resolveKitchenPrintTarget(
      item,
      params.menu,
      cfg.printerProfiles,
      cfg.printerRoutes,
      commonProfile,
    );
    const key = targetKey(target);
    if (!groups.has(key)) groups.set(key, { target, items: [] });
    groups.get(key)!.items.push(item);
  }

  const locale = params.locale ?? 'tr';
  const sourceDb = currentSourceDb();
  const jobsTable = postgres.getMovementTableName('kitchen_print_jobs', 'rest');
  const designBinding = await (async () => {
    try {
      if (!(await isUnifiedWindowsPrinterServiceEnabled())) return null;
      return await getBindingForScope(ERP_SETTINGS.firmNr, 'kitchen_ticket');
    } catch (error) {
      console.warn('[kitchenPrintQueueService] print design binding read failed:', error);
      return null;
    }
  })();
  let jobCount = 0;
  let itemCount = 0;

  for (const { target, items } of groups.values()) {
    const lines = items.map(orderItemToKitchenLine);
    const payload = {
      kind: 'kitchen_ticket',
      tableNumber: params.table.number,
      floorName: params.table.location,
      waiter: params.table.waiter,
      orderNote: params.orderNote,
      items: lines,
      sourceDb,
    };

    if (designBinding?.designId && target.connection !== 'network') {
      const common = {
        connection: 'system' as const,
        printerName: target.connection === 'system' ? target.printerName ?? null : null,
        refType: params.kitchenOrderId ? 'kitchen_order' : params.orderId ? 'order' : null,
        refId: params.kitchenOrderId ?? params.orderId ?? null,
        sourceSystem: params.sourceSystem ?? 'web',
        priority: 55,
      };
      if (designBinding.designKind === 'fastreport_frx') {
        await enqueueFastReportFrxJob({
          ...common,
          designId: designBinding.designId,
          designName: designBinding.designName,
          scope: 'kitchen_ticket',
          data: payload,
        });
      } else if (designBinding.designKind === 'design_center') {
        await enqueueFastReportTemplateJob({
          ...common,
          templateId: designBinding.designId,
          type: 'kitchen',
          data: payload,
        });
      }
      jobCount += 1;
      itemCount += lines.length;
      continue;
    }

    await enqueuePrintJob({
      jobType: 'kitchen_ticket',
      connection: target.connection === 'html_fallback' ? 'auto' : target.connection,
      address: target.address ?? null,
      port: target.port ?? null,
      printerName: target.printerName ?? null,
      printerProfileId: target.profile?.id ?? null,
      locale,
      payload,
      refType: params.kitchenOrderId ? 'kitchen_order' : params.orderId ? 'order' : null,
      refId: params.kitchenOrderId ?? params.orderId ?? null,
      sourceSystem: params.sourceSystem ?? 'web',
      priority: 50,
    });

    await postgres.query(
      `INSERT INTO ${jobsTable}
        (job_type, kitchen_order_id, order_id, printer_profile_id, printer_name, connection, address, port,
         locale, payload, status, source_system, source_db)
       VALUES ('kitchen_ticket', $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb, 'pending', $10, $11)`,
      [
        params.kitchenOrderId ?? null,
        params.orderId ?? null,
        target.profile?.id ?? null,
        target.printerName ?? null,
        target.connection,
        target.address ?? null,
        target.port ?? null,
        locale,
        JSON.stringify(payload),
        params.sourceSystem ?? 'web',
        sourceDb,
      ],
    );

    jobCount += 1;
    itemCount += lines.length;
  }

  return { jobCount, itemCount };
}
