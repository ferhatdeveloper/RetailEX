/**
 * Oturumda ana_para_birimi yoksa public.firms kaydından yükler (eski session / login seed).
 */
import { fetchFirms } from './pgClient';
import { useAuthStore } from '../store/authStore';
import { APP_DEFAULT_CURRENCY, normalizeCurrencyCode } from '../utils/currency';

let inflight: Promise<void> | null = null;

export async function ensureFirmCurrency(): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user?.firmNr) return;
  if (user.anaParaBirimi && String(user.anaParaBirimi).trim().length >= 3) return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const firms = await fetchFirms();
      const u = useAuthStore.getState().user;
      if (!u) return;
      const firm = firms.find((f) => f.firm_nr === u.firmNr) || firms[0];
      const ana = normalizeCurrencyCode(firm?.ana_para_birimi || APP_DEFAULT_CURRENCY);
      const rapor = normalizeCurrencyCode(
        firm?.raporlama_para_birimi || firm?.ana_para_birimi || ana,
      );
      useAuthStore.getState().updateOrg({
        anaParaBirimi: ana,
        raporlamaParaBirimi: rapor,
      });
    } catch (err) {
      if (__DEV__) {
        console.warn(
          '[ensureFirmCurrency]',
          err instanceof Error ? err.message : err,
        );
      }
      const u = useAuthStore.getState().user;
      if (u && !u.anaParaBirimi) {
        useAuthStore.getState().updateOrg({
          anaParaBirimi: APP_DEFAULT_CURRENCY,
          raporlamaParaBirimi: APP_DEFAULT_CURRENCY,
        });
      }
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
