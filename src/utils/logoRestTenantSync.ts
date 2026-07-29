/**
 * Kiracı bağlantısı / sistem yüklemesi sonrası Logo REST bağlamını
 * merkez tenant_registry (web_config önbelleği) üzerinden uygular.
 */
import {
  clearLogoRestUrlManualOverride,
  syncLogoRestFromWebConfig,
} from '../services/logoRestApi';

export function applyLogoRestAfterTenantMerge(
  prev: Record<string, unknown>,
  merged: Record<string, unknown>
): void {
  const prevKey = String(prev.merkez_tenant_code || prev.merkez_tenant_id || '').trim();
  const newKey = String(merged.merkez_tenant_code || merged.merkez_tenant_id || '').trim();
  const prevUrl = String(prev.logo_rest_api_url || '').trim();
  const newUrl = String(merged.logo_rest_api_url || '').trim();
  const prevFirm = Number(prev.logo_firm_nr ?? 0);
  const newFirm = Number(merged.logo_firm_nr ?? 0);

  if (newKey && newKey !== prevKey) {
    clearLogoRestUrlManualOverride();
  }
  // Kiracı veya Logo URL/firma merkezi değiştiyse yerel override'ı bırak, merkez kazanır.
  if ((newUrl && newUrl !== prevUrl) || (newFirm > 0 && newFirm !== prevFirm)) {
    clearLogoRestUrlManualOverride();
  }

  syncLogoRestFromWebConfig(true);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('retailex:logo-rest-from-merkez', {
        detail: {
          logo_rest_api_url: merged.logo_rest_api_url,
          logo_firm_nr: merged.logo_firm_nr,
          logo_period_nr: merged.logo_period_nr,
          logo_db: merged.logo_db,
        },
      })
    );
  }
}
