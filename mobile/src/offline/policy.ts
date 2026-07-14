import { useConfigStore, type NetworkPolicy } from '../store/configStore';
import { useConnectivityStore } from '../store/connectivityStore';

/** NetInfo: bağlı sayılır mı (null reachability = bağlı kabul) */
export function isNetUp(): boolean {
  const { isConnected, isInternetReachable } = useConnectivityStore.getState();
  if (isConnected === false) return false;
  if (isInternetReachable === false) return false;
  return true;
}

export function getNetworkPolicy(): NetworkPolicy {
  return useConfigStore.getState().config.networkPolicy ?? 'hybrid';
}

/**
 * Canlı PG/bridge kullanılmalı mı?
 * - online → her zaman true
 * - offline → her zaman false
 * - hybrid → NetInfo açıkken true
 */
export function shouldUseLiveData(): boolean {
  const policy = getNetworkPolicy();
  if (policy === 'offline') return false;
  if (policy === 'online') return true;
  return isNetUp();
}

/** Banner / rozet için etkili durum etiketi */
export type EffectiveConnectivity =
  | 'online'
  | 'offline'
  | 'hybrid-live'
  | 'hybrid-cache';

export function getEffectiveConnectivity(): EffectiveConnectivity {
  const policy = getNetworkPolicy();
  if (policy === 'online') return 'online';
  if (policy === 'offline') return 'offline';
  return isNetUp() ? 'hybrid-live' : 'hybrid-cache';
}
