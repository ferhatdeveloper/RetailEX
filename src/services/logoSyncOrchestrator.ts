/**
 * Logo çek/gönder + isteğe bağlı hibrit merkez↔mağaza aktarımı.
 */

import { IS_TAURI } from '../utils/env';
import {
  loadLogoErpSyncFlowSettings,
  type LogoDataTopology,
} from './logoErpSyncFlow';
import { runLogoMssqlSyncNow } from './logoMssqlSyncService';
import {
  loadLogoRestSyncSettings,
  runLogoRestSyncNow,
  saveLogoRestSyncSettings,
  subscribeLogoRestSyncLogs,
  type LogoPushModules,
  type LogoRestSyncModules,
} from './logoRestSyncService';
import { pushPendingLogoOutbound } from './logoRestOutbound';
import { loadLogoRestConfig } from './logoRestApi';
import { DB_SETTINGS, postgres, type HybridSyncFlow } from './postgres';

export type LogoSyncAction = 'pull' | 'push' | 'full';

export type LogoSyncRunResult = {
  ok: boolean;
  message: string;
  steps: string[];
};

function pushLog(onLog: ((line: string) => void) | undefined, line: string): void {
  onLog?.(line);
}

async function runHybridFollowUp(
  topology: LogoDataTopology,
  onLog?: (line: string) => void,
): Promise<string | null> {
  if (DB_SETTINGS.activeMode !== 'hybrid') {
    return 'Hibrit mod kapalı — merkez↔mağaza aktarımı atlandı.';
  }

  let flow: HybridSyncFlow | null = null;
  if (topology === 'logo_desktop_merkez') flow = 'send';
  if (topology === 'logo_merkez_desktop') flow = 'receive';
  if (!flow) return null;

  pushLog(onLog, `[Hibrit] ${flow === 'send' ? 'Merkeze gönderiliyor…' : 'Merkezden alınıyor…'}`);
  const result = await postgres.sync({
    flow,
    scope: 'all',
    hybridSyncDirection: flow === 'send' ? 'local_to_remote' : 'remote_to_local',
  });

  if (!result.success) {
    return result.message || 'Hibrit aktarım başarısız.';
  }
  return `Hibrit ${flow === 'send' ? 'gönder' : 'al'}: ${result.totalSynced} kayıt`;
}

export async function runLogoSyncAction(
  action: LogoSyncAction,
  opts: {
    serviceType: 'rest' | 'lobject';
    onLog?: (line: string) => void;
    /** Logo'dan çekilecek modüller */
    pullModules?: Partial<LogoRestSyncModules>;
    pullMode?: 'incremental' | 'full';
    /** Logo'ya gönderilecek kuyruklar */
    pushModules?: Partial<LogoPushModules>;
  },
): Promise<LogoSyncRunResult> {
  const flow = loadLogoErpSyncFlowSettings();
  const steps: string[] = [];
  // Web'de yalnızca Logo REST; LOBJECT/MSSQL masaüstü (Tauri) içindir.
  const serviceType: 'rest' | 'lobject' = !IS_TAURI ? 'rest' : opts.serviceType;
  if (action === 'push' && flow.syncDirection === 'pull_only') {
    return { ok: false, message: "Senkron yönü «yalnızca Logo'dan çek» — gönderim devre dışı.", steps };
  }
  if (action === 'full' && flow.syncDirection === 'push_only') {
    return { ok: false, message: 'Senkron yönü «yalnızca gönder» — çekim devre dışı.', steps };
  }

  const wantPull = action === 'pull' || action === 'full';
  const wantPush =
    action === 'push' ||
    (action === 'full' && flow.syncDirection !== 'pull_only');

  if (opts.pullModules || opts.pullMode || opts.pushModules) {
    saveLogoRestSyncSettings({
      ...(opts.pullModules ? { modules: { ...loadLogoRestSyncSettings().modules, ...opts.pullModules } } : {}),
      ...(opts.pullMode ? { pullMode: opts.pullMode } : {}),
      ...(opts.pushModules
        ? { pushModules: { ...loadLogoRestSyncSettings().pushModules, ...opts.pushModules } }
        : {}),
    });
  }

  if (wantPull) {
    pushLog(opts.onLog, `[Logo] ${serviceType === 'rest' ? 'REST' : 'MSSQL'} çekim başlıyor…`);
    let unsub: (() => void) | undefined;
    if (serviceType === 'rest') {
      unsub = subscribeLogoRestSyncLogs((line) => pushLog(opts.onLog, line));
    }

    try {
      const pullResult =
        serviceType === 'rest'
          ? await runLogoRestSyncNow({
              modules: opts.pullModules,
              pullMode: opts.pullMode ?? loadLogoRestSyncSettings().pullMode,
            })
          : await runLogoMssqlSyncNow();

      steps.push(pullResult.message);
      if (!pullResult.ok) {
        return { ok: false, message: pullResult.message, steps };
      }

      if (
        flow.autoHybridAfterPull &&
        flow.dataTopology !== 'logo_merkez' &&
        (IS_TAURI || flow.dataTopology === 'logo_merkez_desktop')
      ) {
        const hybridMsg = await runHybridFollowUp(flow.dataTopology, opts.onLog);
        if (hybridMsg) {
          steps.push(hybridMsg);
          pushLog(opts.onLog, hybridMsg);
        }
      }
    } finally {
      unsub?.();
    }
  }

  if (wantPush) {
    if (serviceType !== 'rest') {
      const msg =
        "Logo'ya gönderim yalnızca REST modunda desteklenir (kartlar / belgeler / stok — PostgREST kuyruk).";
      steps.push(msg);
      if (action === 'push') return { ok: false, message: msg, steps };
    } else {
      const pushMods = {
        ...loadLogoRestSyncSettings().pushModules,
        ...(opts.pushModules || {}),
      };
      const anyPush = Object.entries(pushMods).some(
        ([k, v]) => k !== 'invoices' && Boolean(v),
      );
      if (!anyPush) {
        const msg =
          "Logo'ya gönderim için en az bir tür seçin (kartlar / belgeler / stok).";
        steps.push(msg);
        return { ok: false, message: msg, steps };
      }

      pushLog(
        opts.onLog,
        '[Logo] Seçili bekleyen kayıtlar gönderiliyor (PostgREST → Logo REST)…',
      );
      try {
        const cfg = loadLogoRestConfig();
        const pushResult = await pushPendingLogoOutbound(cfg, {
          limit: 25,
          products: pushMods.products,
          customers: pushMods.customers,
          suppliers: pushMods.suppliers,
          banks: pushMods.banks,
          salesInvoices: pushMods.salesInvoices,
          purchaseInvoices: pushMods.purchaseInvoices,
          salesOrders: pushMods.salesOrders,
          purchaseOrders: pushMods.purchaseOrders,
          salesDispatches: pushMods.salesDispatches,
          purchaseDispatches: pushMods.purchaseDispatches,
          itemSlips: pushMods.itemSlips,
          onLog: (entry) => {
            if (entry.detail) pushLog(opts.onLog, `[${entry.entity}] ${entry.code}: ${entry.detail}`);
          },
        });
        const msg =
          pushResult.messages.filter(Boolean).slice(-8).join(' · ') ||
          `${pushResult.success} kayıt Logo'ya yazıldı`;
        steps.push(
          `Gönderim: ürün ${pushResult.products.success}, müşteri ${pushResult.customers.success}, ` +
            `tedarikçi ${pushResult.suppliers.success}, kasa ${pushResult.banks.success}, ` +
            `sf ${pushResult.invoices.success}, af ${pushResult.purchaseInvoices.success}, ` +
            `ss ${pushResult.salesOrders.success}, as ${pushResult.purchaseOrders.success}, ` +
            `si ${pushResult.salesDispatches.success}, ai ${pushResult.purchaseDispatches.success}, ` +
            `stok ${pushResult.itemSlips.success}` +
            (pushResult.errors ? ` · hata ${pushResult.errors}` : ''),
        );
        pushLog(opts.onLog, msg);
        if (pushResult.errors > 0 && action === 'push') {
          return { ok: false, message: msg, steps };
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        steps.push(msg);
        return { ok: false, message: msg, steps };
      }
    }
  }

  const message = steps.join(' · ') || 'İşlem tamamlandı.';
  return { ok: true, message, steps };
}
