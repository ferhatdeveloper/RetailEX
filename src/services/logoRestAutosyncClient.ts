/**
 * Logo otomatik senkron — tarayıcı / DeskApp istemcisi.
 * node:fs kullanmaz; köprüye HTTP POST atar.
 */

import { getBridgeUrl } from '../utils/env';
import { loadLogoErpIntegrationParams } from './logoErpIntegrationParams';
import { loadLogoRestConfig, type LogoRestConfig } from './logoRestApi';
import type { LogoServerSyncJob } from './logoRestServerContext';
import { DB_SETTINGS, ERP_SETTINGS } from './postgres';
import type { LogoRestSyncModules } from './logoRestSync';

export async function pushLogoAutosyncJobToBridge(settings?: {
  enabled: boolean;
  intervalMinutes: number;
  pullMode: 'incremental' | 'full';
  modules: LogoRestSyncModules;
  lastSyncByModule?: LogoServerSyncJob['lastSyncByModule'];
}): Promise<{ ok: boolean; message: string; status?: unknown }> {
  if (typeof window === 'undefined') {
    return { ok: false, message: 'Yalnızca istemciden çağrılır.' };
  }
  const { loadLogoRestSyncSettings } = await import('./logoRestSyncService');
  const s = settings
    ? { ...loadLogoRestSyncSettings(), ...settings, modules: settings.modules }
    : loadLogoRestSyncSettings();
  const logoConfig = loadLogoRestConfig();
  const params = loadLogoErpIntegrationParams();
  const firmNr = String(ERP_SETTINGS.firmNr || '001');
  const periodNr = String(ERP_SETTINGS.periodNr || '01');
  const postgrestUrl = String(DB_SETTINGS.remoteRestUrl || '').trim() || undefined;

  const body: LogoServerSyncJob = {
    enabled: s.enabled,
    intervalMinutes: s.intervalMinutes,
    pullMode: s.pullMode,
    modules: s.modules as LogoRestSyncModules,
    logoConfig: logoConfig as LogoRestConfig,
    firmNr,
    periodNr,
    postgrestUrl,
    documentTransferDays: params.documentTransferDays,
    lastSyncByModule: s.lastSyncByModule,
    updatedAt: new Date().toISOString(),
  };

  try {
    const bridge = getBridgeUrl();
    const res = await fetch(`${bridge}/api/logo/autosync/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      status?: unknown;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        message: data.error || `Köprü kaydı başarısız (${res.status})`,
      };
    }
    return {
      ok: true,
      message:
        data.message ||
        (s.enabled
          ? 'Otomatik senkron köprüye kaydedildi — uygulama kapalıyken de çalışır (bridge açık kalmalı).'
          : 'Köprü otomatik senkron kapatıldı.'),
      status: data.status,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message:
        `Köprüye ulaşılamadı: ${msg}. ` +
        'Otomatik senkron için `npm run bridge` (veya retailex_bridge) çalışır durumda olmalı.',
    };
  }
}
