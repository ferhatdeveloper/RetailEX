/**
 * Kiracı bağlantısı sonrası Logo REST API URL'sini tenant_registry'den uygular.
 */
import {
  clearLogoRestUrlManualOverride,
  syncLogoRestUrlFromWebConfig,
} from '../services/logoRestApi';

export function applyLogoRestAfterTenantMerge(
  prev: Record<string, unknown>,
  merged: Record<string, unknown>
): void {
  const prevKey = String(prev.merkez_tenant_code || prev.merkez_tenant_id || '').trim();
  const newKey = String(merged.merkez_tenant_code || merged.merkez_tenant_id || '').trim();
  if (newKey && newKey !== prevKey) {
    clearLogoRestUrlManualOverride();
  }
  syncLogoRestUrlFromWebConfig(true);
}
