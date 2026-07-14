/**
 * Son seçilen firma/dönem/mağaza — logout sonrası login seed (R12).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OrgFields } from '../store/authStore';

const KEY = 'retailex_mobile_last_org';

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
      storeId: o.storeId ?? null,
      storeName: o.storeName ?? null,
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
      }),
    );
  } catch {
    /* cihazda yazılamazsa sessiz */
  }
}
