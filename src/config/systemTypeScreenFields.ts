/**
 * Ekran içi alanlar — web kabuğu ile aynı kaynak.
 *
 * - `system_type` / `tenant_module`: `moduleToSystemType` ve
 *   `shellEnabledModulesForTenantRegistryModule` (`src/services/merkezTenantRegistry.ts`).
 * - Firma `enabled_modules`: güzellik, restoran, depo, market sırası
 *   (`applyFirmShellModules`, `src/utils/firmShellModules.ts`).
 * - Klinik alanları: `CLINIC_OPERATIONAL_MENU_TABS` — takvim, hizmet, personel, cihaz, rapor
 *   (`src/components/beauty/clinicShellNavConfig.ts`). Peşinat randevu
 *   `deposit_amount` alanıdır; ciroya yazılmaz.
 * - Restoran alanları: masa, sipariş, mutfak, paket servis, gel-al.
 *   Restoran kabuğu `pos` içerir; terazi içermez.
 * - Market: POS ve terazi. Depo: lokasyon, mal kabul, sevkiyat, depo.
 * - Ortak ERP (yönetim her tipte): finans, fatura, kasa.
 */

export type ScreenFieldVertical = 'market' | 'restaurant' | 'wms' | 'beauty';

export const SHARED_SCREEN_FIELDS = ['finance', 'invoice', 'cash'] as const;

export const BEAUTY_SCREEN_FIELDS = [
  'appointment',
  'service',
  'specialist',
  'device',
  'deposit',
  'clinic-reports',
  'beauty-sales',
] as const;

export const RESTAURANT_SCREEN_FIELDS = [
  'table',
  'order',
  'kitchen',
  'delivery',
  'takeaway',
  'pos',
] as const;

export const WMS_SCREEN_FIELDS = ['bin', 'receiving', 'dispatch', 'warehouse'] as const;

export const MARKET_SCREEN_FIELDS = ['pos', 'scale'] as const;

const TYPE_ALIASES: Record<string, ScreenFieldVertical> = {
  market: 'market',
  retail: 'market',
  perakende: 'market',
  magaza: 'market',
  mağaza: 'market',
  restaurant: 'restaurant',
  restoran: 'restaurant',
  rest: 'restaurant',
  wms: 'wms',
  depo: 'wms',
  warehouse: 'wms',
  beauty: 'beauty',
  clinic: 'beauty',
  klinik: 'beauty',
  guzellik: 'beauty',
  güzellik: 'beauty',
};

export function screenFieldVertical(
  raw: string | null | undefined,
): ScreenFieldVertical | null {
  const key = String(raw ?? '').trim().toLocaleLowerCase('tr-TR');
  if (!key || key === 'general' || key === 'all' || key === 'none') return null;
  return TYPE_ALIASES[key] ?? null;
}

/** Seçili sistem tipinin ekranda göstereceği alan kimlikleri. */
export function visibleScreenFieldIds(businessType: string | null | undefined): string[] {
  const vertical = screenFieldVertical(businessType);
  const extra =
    vertical === 'beauty'
      ? BEAUTY_SCREEN_FIELDS
      : vertical === 'restaurant'
        ? RESTAURANT_SCREEN_FIELDS
        : vertical === 'wms'
          ? WMS_SCREEN_FIELDS
          : vertical === 'market'
            ? MARKET_SCREEN_FIELDS
            : [];
  return [...SHARED_SCREEN_FIELDS, ...extra];
}
