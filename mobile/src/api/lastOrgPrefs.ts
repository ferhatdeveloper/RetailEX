/**
 * Son seçilen firma/dönem/mağaza — logout sonrası login seed (R12).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OrgFields } from '../store/authStore';

const KEY = 'retailex_mobile_last_org';

export type OrgListRefs = {
  firms: { firm_nr: string }[];
  stores: { id: string }[];
  periods: { nr: string }[];
};

export async function loadLastOrg(): Promise<OrgFields | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<OrgFields>;
    const firmNr = String(o.firmNr || '').trim();
    const periodNr = String(o.periodNr || '').replace(/\D/g, '');
    if (!firmNr) return null;
    return {
      firmNr,
      periodNr: periodNr ? periodNr.padStart(2, '0').slice(0, 2) : '',
      storeId: o.storeId != null && String(o.storeId).trim() ? String(o.storeId) : null,
      storeName: o.storeName ?? null,
      anaParaBirimi: o.anaParaBirimi ?? null,
      raporlamaParaBirimi: o.raporlamaParaBirimi ?? null,
    };
  } catch {
    return null;
  }
}

export async function saveLastOrg(org: OrgFields): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        firmNr: org.firmNr,
        periodNr: org.periodNr,
        storeId: org.storeId ?? null,
        storeName: org.storeName ?? null,
        anaParaBirimi: org.anaParaBirimi ?? null,
        raporlamaParaBirimi: org.raporlamaParaBirimi ?? null,
      }),
    );
  } catch {
    /* cihazda yazılamazsa sessiz */
  }
}

/**
 * lastOrg firma/mağaza/dönem üçlüsü çekilen listelerde varsa true.
 * Geçerliyse Organization ekranında otomatik giriş yapılabilir.
 */
export function isLastOrgValidAgainstLists(
  org: Pick<OrgFields, 'firmNr' | 'periodNr' | 'storeId'> | null | undefined,
  lists: OrgListRefs,
): boolean {
  if (!org?.firmNr || !org.periodNr || !org.storeId) return false;
  const firmOk = lists.firms.some((f) => String(f.firm_nr) === String(org.firmNr));
  if (!firmOk) return false;
  const storeOk = lists.stores.some((s) => String(s.id) === String(org.storeId));
  if (!storeOk) return false;
  const periodOk = lists.periods.some((p) => String(p.nr) === String(org.periodNr));
  return periodOk;
}
