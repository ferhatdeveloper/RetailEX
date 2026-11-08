/**
 * Ekran içi alanlar. Liste web `src/config/systemTypeScreenFields.ts` ile aynıdır.
 * Kaynak: system_type, tenant_module, firms.enabled_modules.
 */

import {
  normalizeBusinessType,
  primaryFirmVertical,
  type StructureVertical,
} from './businessStructureFilter';

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

export function visibleScreenFieldIds(businessType: string | null | undefined): string[] {
  const vertical = normalizeBusinessType(businessType);
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

export function isScreenFieldVisible(
  fieldId: string,
  businessType: string | null | undefined,
): boolean {
  return visibleScreenFieldIds(businessType).includes(fieldId);
}

export type LoginProfile = 'market' | 'restaurant' | 'wms' | 'beauty' | 'clinic';

function hintVertical(raw: string | null | undefined): StructureVertical | null {
  return normalizeBusinessType(raw);
}

/**
 * Girişte bilinen tip. Firma modülü varsa o kazanır (web firma kabuğu).
 * Yoksa system_type / tenant_module. İkisi de yoksa kilit yok.
 */
export function loginBusinessProfile(input: {
  systemType?: string | null;
  tenantModule?: string | null;
  enabledModules?: unknown;
}): { profile: LoginProfile | null; locked: boolean } {
  const tenant = String(input.tenantModule ?? '').trim().toLocaleLowerCase('tr-TR');
  const system = String(input.systemType ?? '').trim().toLocaleLowerCase('tr-TR');
  const clinic = tenant === 'clinic' || system === 'clinic';
  const fromFirm = primaryFirmVertical(input.enabledModules);
  const fromHint = hintVertical(input.systemType) || hintVertical(input.tenantModule);
  const vertical = fromFirm || fromHint;
  if (!vertical) return { profile: null, locked: false };
  const profile: LoginProfile = vertical === 'beauty' && clinic ? 'clinic' : vertical;
  return { profile, locked: true };
}
