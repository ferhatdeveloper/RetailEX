/**
 * Logo senkron yönü ve veri akış topolojisi.
 */

import { IS_TAURI } from '../utils/env';

const STORAGE_KEY = 'retailex_logo_erp_sync_flow';

/** Logo ile veri alışverişi yönü */
export type LogoSyncDirection = 'pull_only' | 'push_only' | 'bidirectional';

/**
 * Verinin hangi katmanlardan geçeceği:
 * - logo_merkez: Logo REST → kiracı merkez DB (web SaaS varsayılanı)
 * - logo_desktop_merkez: Logo → yerel PG (masaüstü) → hibrit gönder → merkez
 * - logo_merkez_desktop: Logo → merkez → hibrit al → mağaza yerel PG
 */
export type LogoDataTopology =
  | 'logo_merkez'
  | 'logo_desktop_merkez'
  | 'logo_merkez_desktop';

export type LogoErpSyncFlowSettings = {
  syncDirection: LogoSyncDirection;
  dataTopology: LogoDataTopology;
  /** Logo çekiminden sonra hibrit aktarımı otomatik çalıştır */
  autoHybridAfterPull: boolean;
};

const DEFAULT_SETTINGS: LogoErpSyncFlowSettings = {
  syncDirection: 'pull_only',
  dataTopology: IS_TAURI ? 'logo_desktop_merkez' : 'logo_merkez',
  autoHybridAfterPull: true,
};

export function loadLogoErpSyncFlowSettings(): LogoErpSyncFlowSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<LogoErpSyncFlowSettings>;
    const syncDirection = parsed.syncDirection;
    const dataTopology = parsed.dataTopology;
    return {
      syncDirection:
        syncDirection === 'push_only' || syncDirection === 'bidirectional'
          ? syncDirection
          : 'pull_only',
      dataTopology:
        dataTopology === 'logo_desktop_merkez' || dataTopology === 'logo_merkez_desktop'
          ? dataTopology
          : DEFAULT_SETTINGS.dataTopology,
      autoHybridAfterPull: parsed.autoHybridAfterPull !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveLogoErpSyncFlowSettings(
  patch: Partial<LogoErpSyncFlowSettings>,
): LogoErpSyncFlowSettings {
  const next = { ...loadLogoErpSyncFlowSettings(), ...patch };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('retailex:logo-sync-flow-saved'));
  }
  return next;
}

export function labelSyncDirection(dir: LogoSyncDirection): string {
  switch (dir) {
    case 'pull_only':
      return "Yalnızca Logo'dan çek";
    case 'push_only':
      return "Yalnızca Logo'ya gönder";
    case 'bidirectional':
      return 'Çift yön (çek + gönder)';
    default:
      return dir;
  }
}

export function labelDataTopology(topo: LogoDataTopology): string {
  switch (topo) {
    case 'logo_merkez':
      return 'Logo → Merkez veritabanı';
    case 'logo_desktop_merkez':
      return 'Logo → Masaüstü → Merkez';
    case 'logo_merkez_desktop':
      return 'Logo → Merkez → Mağaza (masaüstü)';
    default:
      return topo;
  }
}

export function describeDataTopology(topo: LogoDataTopology): string {
  switch (topo) {
    case 'logo_merkez':
      return 'Web ve bulut kiracılarında Logo verisi doğrudan merkez PostgreSQL / PostgREST üzerine yazılır.';
    case 'logo_desktop_merkez':
      return 'Masaüstünde Logo verisi önce yerel veritabanına alınır; isteğe bağlı olarak hibrit «Gönder» ile merkeze aktarılır.';
    case 'logo_merkez_desktop':
      return 'Logo verisi merkeze yazılır; mağaza kasası hibrit «Al» ile yerel kopyayı günceller.';
    default:
      return '';
  }
}

export const SYNC_DIRECTION_OPTIONS: { value: LogoSyncDirection; label: string }[] = [
  { value: 'pull_only', label: labelSyncDirection('pull_only') },
  { value: 'push_only', label: labelSyncDirection('push_only') },
  { value: 'bidirectional', label: labelSyncDirection('bidirectional') },
];

export const DATA_TOPOLOGY_OPTIONS: { value: LogoDataTopology; label: string }[] = [
  { value: 'logo_merkez', label: labelDataTopology('logo_merkez') },
  { value: 'logo_desktop_merkez', label: labelDataTopology('logo_desktop_merkez') },
  { value: 'logo_merkez_desktop', label: labelDataTopology('logo_merkez_desktop') },
];
