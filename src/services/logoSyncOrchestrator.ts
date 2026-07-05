/**
 * Logo çek/gönder + isteğe bağlı hibrit merkez↔mağaza aktarımı.
 */

import { IS_TAURI } from '../utils/env';
import { loadLogoErpMode } from './logoErpMode';
import {
  loadLogoErpSyncFlowSettings,
  type LogoDataTopology,
} from './logoErpSyncFlow';
import { runLogoMssqlSyncNow } from './logoMssqlSyncService';
import {
  runLogoRestSyncNow,
  subscribeLogoRestSyncLogs,
} from './logoRestSyncService';
import { pushPendingSalesToLogo } from './logoRestInvoicePush';
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
  const pg = postgres.getInstance();
  const result = await pg.sync({
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
  },
): Promise<LogoSyncRunResult> {
  const flow = loadLogoErpSyncFlowSettings();
  const steps: string[] = [];
  const mode = loadLogoErpMode();
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

  if (wantPull) {
    pushLog(opts.onLog, `[Logo] ${opts.serviceType === 'rest' ? 'REST' : 'MSSQL'} çekim başlıyor…`);
    let unsub: (() => void) | undefined;
    if (opts.serviceType === 'rest') {
      unsub = subscribeLogoRestSyncLogs((line) => pushLog(opts.onLog, line));
    }

    try {
      const pullResult =
        opts.serviceType === 'rest'
          ? await runLogoRestSyncNow()
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
    if (mode !== 'rest') {
      const msg = 'Logo\'ya gönderim yalnızca REST modunda desteklenir (bekleyen faturalar).';
      steps.push(msg);
      if (action === 'push') return { ok: false, message: msg, steps };
    } else {
      pushLog(opts.onLog, '[Logo] Bekleyen faturalar gönderiliyor…');
      try {
        const cfg = loadLogoRestConfig();
        const pushResult = await pushPendingSalesToLogo(cfg, { limit: 25 });
        const msg = pushResult.messages.join(' · ') || `${pushResult.success} fatura gönderildi`;
        steps.push(msg);
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
