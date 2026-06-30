/**
 * Hibrit senkron taşıma (WebSocket / periyodik) yapılandırma denetimi.
 * Eksik veya hatalı ayarlarda konsola çözüm önerisi yazar.
 */

import { IS_TAURI } from '../utils/env';
import { logger } from '../utils/logger';
import {
  buildSaaSTenantPostgrestUrl,
  DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN,
  parseSaaSOrCustomPostgrestUrl,
  resolveEffectiveRemoteRestUrl,
  resolveTenantSyncUrls,
} from './merkezTenantRegistry';
import {
  DB_SETTINGS,
  type HybridSyncTransport,
  normalizeHybridSyncTransport,
} from './postgres';

export type SyncTransportIssue = {
  code: string;
  severity: 'error' | 'warn' | 'info';
  message: string;
  solution: string;
};

export type SyncTransportAudit = {
  transport: HybridSyncTransport;
  wsUrl: string;
  restUrl: string;
  tenantSlug: string | null;
  hybridMode: boolean;
  issues: SyncTransportIssue[];
  wsRequired: boolean;
  pollingRequired: boolean;
};

function readMerkezTenantCode(): string {
  if (typeof window === 'undefined') return String(DB_SETTINGS.merkezTenantCode || '').trim();
  try {
    const raw = window.localStorage.getItem('retailex_web_config');
    if (raw) {
      const cfg = JSON.parse(raw) as { merkez_tenant_code?: string };
      const c = String(cfg.merkez_tenant_code ?? '').trim();
      if (c) return c;
    }
  } catch {
    /* ignore */
  }
  return String(DB_SETTINGS.merkezTenantCode || '').trim();
}

/** Taşıma moduna göre WS / periyodik senkron gerekli mi */
export function syncTransportNeedsWebSocket(transport?: HybridSyncTransport): boolean {
  const t = transport ?? DB_SETTINGS.hybridSyncTransport;
  return t === 'websocket' || t === 'both';
}

export function syncTransportNeedsPolling(transport?: HybridSyncTransport): boolean {
  const t = transport ?? DB_SETTINGS.hybridSyncTransport;
  return t === 'polling' || t === 'both';
}

/** Etkin WebSocket URL (yapılandırma + kiracı türetme) */
export function resolveEffectiveCentralWsUrl(): string {
  const explicit = String(DB_SETTINGS.centralWsUrl || '').trim();
  if (explicit && explicit !== 'wss://api.retailex.app/ws' && explicit !== 'ws://127.0.0.1:9999/ws') {
    return explicit;
  }
  const urls = resolveTenantSyncUrls({
    merkez_tenant_code: readMerkezTenantCode(),
    remote_rest_url: DB_SETTINGS.remoteRestUrl,
    central_ws_url: DB_SETTINGS.centralWsUrl,
  });
  return urls.central_ws_url || explicit || '';
}

export function auditSyncTransportConfig(): SyncTransportAudit {
  const transport = normalizeHybridSyncTransport(DB_SETTINGS.hybridSyncTransport);
  const hybridMode = DB_SETTINGS.activeMode === 'hybrid';
  const tenantCode = readMerkezTenantCode();
  const restUrl = resolveEffectiveRemoteRestUrl(DB_SETTINGS.remoteRestUrl, tenantCode);
  const wsUrl = resolveEffectiveCentralWsUrl();
  const parsed = restUrl ? parseSaaSOrCustomPostgrestUrl(restUrl) : { kind: 'other' as const, url: '' };
  const tenantSlug = parsed.kind === 'saas_single_slug' ? parsed.slug : null;
  const issues: SyncTransportIssue[] = [];

  if (!hybridMode) {
    issues.push({
      code: 'NOT_HYBRID',
      severity: 'info',
      message: 'Uygulama hibrit modda değil — mavi çubuktaki Senkron düğmesi devre dışı.',
      solution: 'Kurulum veya DB ayarlarında db_mode=hybrid seçin.',
    });
  }

  if (hybridMode && !restUrl) {
    issues.push({
      code: 'REST_URL_MISSING',
      severity: 'error',
      message: 'Merkez PostgREST URL (remote_rest_url) tanımlı değil.',
      solution: `Kurulumda PostgREST URL girin: ${DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN}/{kiracı_kodu}`,
    });
  }

  if (
    hybridMode &&
    restUrl &&
    (String(DB_SETTINGS.remoteRestUrl || '').trim() === DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN ||
      String(DB_SETTINGS.remoteRestUrl || '').trim() === `${DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN}/`)
  ) {
    issues.push({
      code: 'REST_URL_NO_TENANT',
      severity: 'error',
      message: 'PostgREST URL kiracı kodu içermiyor (api.retailex.app kökü).',
      solution: tenantCode
        ? `remote_rest_url → ${buildSaaSTenantPostgrestUrl(tenantCode)}`
        : 'Kiracı kodunu ekleyin: https://api.retailex.app/lovan (örnek)',
    });
  }

  if (hybridMode && syncTransportNeedsWebSocket(transport) && wsUrl && tenantSlug) {
    const apiUrl = String(DB_SETTINGS.centralApiUrl || '').trim();
    if (!apiUrl) {
      issues.push({
        code: 'SYNC_API_URL_MISSING',
        severity: 'warn',
        message: 'Merkez REST senkron URL (central_api_url) tanımlı değil.',
        solution: `https://api.retailex.app/${tenantSlug}/sync — migration 075 + sync-service konteyneri gerekir.`,
      });
    }
  }

  if (hybridMode && syncTransportNeedsWebSocket(transport)) {
    if (!wsUrl) {
      issues.push({
        code: 'WS_URL_MISSING',
        severity: 'error',
        message: 'WebSocket senkron seçildi ancak merkez WS adresi çözülemedi.',
        solution: tenantSlug
          ? `central_ws_url veya remote_rest_url ile otomatik: wss://api.retailex.app/${tenantSlug}/ws`
          : 'remote_rest_url içine kiracı slug ekleyin veya central_ws_url alanını doldurun.',
      });
    } else if (wsUrl.startsWith('ws://127.0.0.1:9999') && !IS_TAURI) {
      issues.push({
        code: 'WS_LOCAL_FALLBACK_WEB',
        severity: 'warn',
        message: 'Tarayıcıda yerel WS yedek adresi (127.0.0.1:9999) kullanılıyor.',
        solution: 'Merkez kiracı bağlantısı yapın veya senkron modunu "Periyodik" seçin.',
      });
    }
  }

  if (hybridMode && transport === 'websocket' && !syncTransportNeedsPolling(transport)) {
    issues.push({
      code: 'WS_ONLY_MODE',
      severity: 'info',
      message: 'Yalnızca WebSocket modu — periyodik senkron kapalı; anlık çekim WS üzerinden.',
      solution: 'Merkez api_gateway ve sync-service ayakta olmalı; WS bağlantısı yeşil olmalı.',
    });
  }

  return {
    transport,
    wsUrl,
    restUrl,
    tenantSlug,
    hybridMode,
    issues,
    wsRequired: hybridMode && syncTransportNeedsWebSocket(transport),
    pollingRequired: hybridMode && syncTransportNeedsPolling(transport),
  };
}

/** Konsola yapılandırma denetimi yazar (F12 → Console) */
export function logSyncTransportDiagnostics(context = 'SyncTransport'): SyncTransportAudit {
  const audit = auditSyncTransportConfig();
  const prefix = `[${context}]`;
  const errors = audit.issues.filter((i) => i.severity === 'error');
  const warns = audit.issues.filter((i) => i.severity === 'warn');

  logger.info(
    prefix,
    `mod=${audit.transport} hibrit=${audit.hybridMode} ws=${audit.wsUrl || '(yok)'} rest=${audit.restUrl || '(yok)'}`,
  );

  for (const issue of audit.issues) {
    const line = `${issue.message} → Çözüm: ${issue.solution}`;
    if (issue.severity === 'error') logger.error(prefix, line);
    else if (issue.severity === 'warn') logger.warn(prefix, line);
    else logger.info(prefix, line);
  }

  if (errors.length === 0 && warns.length === 0 && audit.hybridMode) {
    logger.info(prefix, 'Yapılandırma denetimi tamam — senkron uçları tanımlı görünüyor.');
  }

  return audit;
}

export function formatSyncTransportLabel(transport?: HybridSyncTransport): string {
  const t = transport ?? DB_SETTINGS.hybridSyncTransport;
  if (t === 'websocket') return 'WebSocket';
  if (t === 'polling') return 'Periyodik';
  return 'WS + Periyodik';
}
