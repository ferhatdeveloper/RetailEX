/**
 * Kiracı bağlantısı sonrası terazi köprü ayarlarını web config'den localStorage'a uygular.
 */
import {
  clearScaleBridgeManualOverride,
  setScaleBridgeStoreId,
  syncScaleBridgeFromWebConfig,
} from '../services/scaleBridgeApi';

export function applyScaleBridgeAfterTenantMerge(
  prev: Record<string, unknown>,
  merged: Record<string, unknown>
): void {
  const prevKey = String(prev.merkez_tenant_code || prev.merkez_tenant_id || '').trim();
  const newKey = String(merged.merkez_tenant_code || merged.merkez_tenant_id || '').trim();
  if (newKey && newKey !== prevKey) {
    clearScaleBridgeManualOverride();
    setScaleBridgeStoreId('');
  }
  syncScaleBridgeFromWebConfig(true);
}
