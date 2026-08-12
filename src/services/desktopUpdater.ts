import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { IS_TAURI } from '../utils/env';
import { APP_VERSION } from '../core/version';

export type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'backing_up'
  | 'downloading'
  | 'installing'
  | 'done'
  | 'error';

export type DesktopUpdateProgress = {
  phase: DesktopUpdatePhase;
  message: string;
  update?: Update | null;
  percent?: number;
};

const GITHUB_LATEST_JSON =
  'https://github.com/ferhatdeveloper/RetailEX/releases/latest/download/latest.json';

/** Updater yapılandırılmış mı (tauri.conf pubkey + endpoint). */
export function isDesktopUpdaterConfigured(): boolean {
  return IS_TAURI;
}

export async function checkDesktopUpdate(): Promise<Update | null> {
  if (!IS_TAURI) return null;
  try {
    return await check();
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg.includes('not configured') || msg.includes('pubkey')) {
      return null;
    }
    throw e;
  }
}

/**
 * Güncelleme öncesi pg_dump tam yedek, ardından indir/kur ve yeniden başlat.
 * Uygulama açılışında bekleyen SQL migration'lar otomatik çalışır (db_ops).
 */
export async function runDesktopUpdateWithBackup(
  onProgress?: (p: DesktopUpdateProgress) => void,
): Promise<{ ok: boolean; message: string }> {
  if (!IS_TAURI) {
    return { ok: false, message: 'Yalnızca masaüstü (Tauri) uygulamasında kullanılabilir.' };
  }

  const report = (phase: DesktopUpdatePhase, message: string, extra?: Partial<DesktopUpdateProgress>) => {
    onProgress?.({ phase, message, ...extra });
  };

  try {
    report('checking', 'GitHub üzerinden sürüm kontrol ediliyor…');
    const update = await checkDesktopUpdate();
    if (!update) {
      report('idle', `Güncel sürüm: v${APP_VERSION.full}`);
      return { ok: true, message: `Güncel sürüm (v${APP_VERSION.full}).` };
    }

    const nextVer = update.version;
    report('available', `Yeni sürüm: v${nextVer}`, { update });

    report('backing_up', 'Güncelleme öncesi PostgreSQL tam yedeği alınıyor (pg_dump)…');
    try {
      const backupMsg = await invoke<string>('export_full_postgres_dump');
      report('backing_up', backupMsg || 'Yedek tamamlandı.');
    } catch (backupErr) {
      const errText = String((backupErr as Error)?.message || backupErr);
      report('error', `Yedek alınamadı — güncelleme iptal: ${errText}`);
      return {
        ok: false,
        message: `Güncelleme iptal: yedek alınamadı. pg_dump kurulu ve veritabanı erişilebilir olmalı. (${errText})`,
      };
    }

    report('downloading', 'Güncelleme paketi indiriliyor…', { update, percent: 0 });
    let downloaded = 0;
    let contentLength: number | undefined;
    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength;
        downloaded = 0;
        report('downloading', 'İndirme başladı…', { update, percent: 0 });
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        const pct =
          contentLength && contentLength > 0
            ? Math.min(100, Math.round((downloaded / contentLength) * 100))
            : undefined;
        report('downloading', pct != null ? `İndiriliyor… %${pct}` : 'İndiriliyor…', {
          update,
          percent: pct,
        });
      } else if (event.event === 'Finished') {
        report('installing', 'Kurulum uygulanıyor…', { update, percent: 100 });
      }
    });

    report('done', 'Güncelleme kuruldu; uygulama yeniden başlatılıyor (migration’lar otomatik).');
    await relaunch();
    return { ok: true, message: 'Güncelleme kuruldu.' };
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    report('error', msg);
    return { ok: false, message: msg };
  }
}

export function getDesktopUpdateEndpoint(): string {
  return GITHUB_LATEST_JSON;
}
