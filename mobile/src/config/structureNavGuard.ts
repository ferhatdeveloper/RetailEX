/**
 * Girişten sonra açılan işlem — seçili işletme tipinin dikeyi değilse kapalı.
 * Menü süzgeci ile aynı kaynak: `structureVertical`.
 */

import {
  normalizeBusinessType,
  structureVertical,
  type StructureVertical,
} from './businessStructureFilter';

export function operationVertical(screenId: string): StructureVertical | 'shared' {
  return structureVertical({ id: screenId, screen: screenId });
}

/** Ortak (finans, fatura, sistem) işlemler her tipte açık kalır. */
export function isStructureOperationAllowed(
  screenId: string,
  businessType: string | null | undefined,
): boolean {
  const vertical = operationVertical(screenId);
  if (vertical === 'shared') return true;
  const selected = normalizeBusinessType(businessType);
  return selected !== null && vertical === selected;
}
