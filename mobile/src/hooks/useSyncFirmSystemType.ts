import { useEffect } from 'react';
import { fetchFirms } from '../api/pgClient';
import { loginBusinessProfile } from '../config/systemTypeFields';
import { useAuthStore } from '../store/authStore';
import { useConfigStore } from '../store/configStore';
import { usePreferencesStore } from '../store/preferencesStore';

/**
 * Oturumdaki firmanın modülleri ve kayıtlı kiracı modülü işletme tipini kilitler.
 * Kullanıcıdan her ekranda tip istenmez.
 */
export function useSyncFirmSystemType(): void {
  const firmNr = useAuthStore((s) => s.user?.firmNr);
  const tenantModule = useConfigStore((s) => s.config.merkezTenantModule);
  const setBusinessProfile = usePreferencesStore((s) => s.setBusinessProfile);
  const setBusinessProfileLocked = usePreferencesStore((s) => s.setBusinessProfileLocked);

  useEffect(() => {
    if (!firmNr) return;
    let cancel = false;
    void (async () => {
      try {
        const firms = await fetchFirms();
        if (cancel) return;
        const firm = firms.find((row) => String(row.firm_nr) === String(firmNr));
        const resolved = loginBusinessProfile({
          tenantModule,
          enabledModules: firm?.enabled_modules,
        });
        if (!resolved.profile) {
          setBusinessProfileLocked(false);
          return;
        }
        setBusinessProfile(resolved.profile);
        setBusinessProfileLocked(true);
      } catch {
        /* Firma okunamazsa kayıtlı profil durur. */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [firmNr, tenantModule, setBusinessProfile, setBusinessProfileLocked]);
}
