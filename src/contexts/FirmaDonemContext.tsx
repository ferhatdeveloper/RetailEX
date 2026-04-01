/**
 * ExRetailOS - Firma & Dönem Context (Enterprise Edition)
 * 
 * Logo-style Enterprise Architecture:
 * - Firm (ROS_CAPIFIRM)
 * - Period (ROS_CAPIPERIOD)
 * - Branch (ROS_CAPIBRANCH)
 * - Warehouse (ROS_CAPIWHOUSE)
 */

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { setGlobalCurrency } from '../utils/currency';
import { postgres, ERP_SETTINGS, getAppDefaultCurrency } from '../services/postgres';
import {
  clearFirmScopedCachesOnly,
  refreshFirmScopedStores,
  refreshPeriodScopedStores,
} from '../store/refreshFirmScopedStores';

/** firms.firm_nr ile SQLite erp_firm_nr aynı biçimde eşlensin (2 ↔ 002); rex_{nr}_customers için şart */
function normalizeFirmNr(v: string | number | undefined | null): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 3 ? d.padStart(3, '0') : d;
}
import { eTransformService } from '../services/eTransformService';

// Types matching ROS tables
export interface Firm {
  logicalref: number;
  nr: number;
  name: string;
  title?: string;
  id?: string; // Modern UUID
  firm_nr?: string; // Standard Logo Firm No
  firma_kodu?: string; // Alias for backward compatibility
  ana_para_birimi?: string;
  raporlama_para_birimi?: string;
  /** firms.regulatory_region — e-belge mevzuatı */
  regulatory_region?: 'TR' | 'IQ';
  default?: boolean;
}

export interface Period {
  logicalref: number;
  nr: number;
  firm_id: number;
  id?: string; // Modern UUID
  firma_id?: string; // Modern Parent UUID
  beg_date: string;
  end_date: string;
  active: boolean;
  donem_adi?: string;
  donem_no?: number; // Alias for backward compatibility
}

export interface Branch {
  logicalref: number;
  nr: number;
  name: string;
  id?: string;
  firm_id: number;
}

export interface Warehouse {
  logicalref: number;
  nr: number;
  name: string;
  id?: string;
  branch_id?: number | null;
  firm_id: number;
}

interface FirmaDonemContextType {
  // Selected Context
  selectedFirm: Firm | null;
  selectedPeriod: Period | null;
  selectedFirma: Firm | null;   // Alias for backward compatibility
  selectedDonem: Period | null; // Alias for backward compatibility
  selectedBranch: Branch | null;
  selectedWarehouse: Warehouse | null;

  // Available Options
  firms: Firm[];
  periods: Period[];
  branches: Branch[];
  warehouses: Warehouse[];

  // Actions
  selectFirm: (firmId: string | number) => void;
  selectPeriod: (periodId: string | number) => void;
  selectBranch: (branchId: string | number) => void;
  selectWarehouse: (warehouseId: string | number) => void;

  setSelectedFirm: (firm: Firm | null) => void;
  setSelectedPeriod: (period: Period | null) => void;

  setFirmAsDefault: (firmId: string) => Promise<void>;
  setPeriodAsDefault: (periodId: string, firmId: string) => Promise<void>;

  // Data Fetching
  refreshFirms: () => Promise<void>;

  // Status
  loading: boolean;
  error: string | null;
}

const FirmaDonemContext = createContext<FirmaDonemContextType | undefined>(undefined);

export const FirmaDonemProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Selection State
  const [selectedFirm, setSelectedFirm] = useState<Firm | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);

  // Lists
  const [firms, setFirms] = useState<Firm[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  /** Firma değişti mi (dönem değişiminde yalnızca satış yenilenir) */
  const lastRefreshFirmNrRef = useRef<string | undefined>(undefined);

  // --- Initial Load ---
  useEffect(() => {
    refreshFirms();
  }, []);

  // --- Dependencies ---

  // When Firm changes -> Load Periods & Branches
  useEffect(() => {
    if (selectedFirm) {
      fetchPeriods(selectedFirm.id || selectedFirm.logicalref.toString());
      fetchBranches(selectedFirm.logicalref);
      setGlobalCurrency(
        selectedFirm.ana_para_birimi || getAppDefaultCurrency(),
        selectedFirm.raporlama_para_birimi || selectedFirm.ana_para_birimi || getAppDefaultCurrency()
      );

      // Sync ERP_SETTINGS — cari/stok rex_{firmNr}_* tabloları için normalize kod gerekli
      if (selectedFirm.firm_nr) {
        ERP_SETTINGS.firmNr = normalizeFirmNr(selectedFirm.firm_nr) || String(selectedFirm.firm_nr);
        console.log('[FirmaDonemContext] ERP_SETTINGS.firmNr updated to:', ERP_SETTINGS.firmNr);
      }
    } else {
      setPeriods([]);
      setBranches([]);
      setSelectedPeriod(null);
      setSelectedBranch(null);
      const fb = getAppDefaultCurrency();
      setGlobalCurrency(fb, fb);
    }
  }, [selectedFirm]);

  useEffect(() => {
    eTransformService.resetConfigCache();
  }, [selectedFirm?.firm_nr]);

  // When Period changes -> Sync ERP_SETTINGS
  useEffect(() => {
    if (selectedPeriod) {
      ERP_SETTINGS.periodNr = selectedPeriod.nr.toString().padStart(2, '0');
      console.log('[FirmaDonemContext] ERP_SETTINGS.periodNr synced to:', ERP_SETTINGS.periodNr);
    }
  }, [selectedPeriod]);

  // Firma veya dönem değişince önbellek: firma değişiminde tam yenileme; yalnızca dönem değişiminde satışlar (period_nr)
  useEffect(() => {
    if (!selectedFirm?.firm_nr) {
      lastRefreshFirmNrRef.current = undefined;
      clearFirmScopedCachesOnly();
      return;
    }

    const fn = normalizeFirmNr(selectedFirm.firm_nr) || String(selectedFirm.firm_nr);
    if (selectedPeriod?.nr != null && selectedPeriod.nr !== undefined) {
      ERP_SETTINGS.periodNr = String(selectedPeriod.nr).padStart(2, '0');
    }

    const firmChanged = lastRefreshFirmNrRef.current !== fn;
    lastRefreshFirmNrRef.current = fn;

    let cancelled = false;
    const run = firmChanged ? refreshFirmScopedStores() : refreshPeriodScopedStores();

    run.then(() => {
      if (!cancelled) {
        console.log(
          '[FirmaDonemContext] Önbellek yenilendi:',
          firmChanged ? 'firma+dönem (tam)' : 'dönem (satış)',
          { firm: fn, period: selectedPeriod?.nr }
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedFirm?.firm_nr, selectedPeriod?.nr]);

  // When Branch changes -> Load Warehouses
  useEffect(() => {
    if (selectedFirm) {
      fetchWarehouses(selectedFirm.logicalref, selectedBranch?.logicalref);
    }
  }, [selectedFirm, selectedBranch]);

  // --- API Calls ---

  const fetchFirms = async () => {
    try {
      setLoading(true);
      console.log('[FirmaDonemContext] Fetching all firms...');
      const { rows } = await postgres.query('SELECT * FROM firms ORDER BY firm_nr ASC');
      console.log('[FirmaDonemContext] Raw firms rows:', rows);

      let mappedFirms = (rows || []).map((f: any) => ({
        ...f,
        logicalref: parseInt(f.firm_nr) || f.nr || 0,
        nr: parseInt(f.firm_nr) || f.nr || 0,
        firma_kodu: f.firm_nr, // Alias
        name: f.name,
        ana_para_birimi: f.ana_para_birimi || 'IQD',
        raporlama_para_birimi: f.raporlama_para_birimi || 'IQD',
        regulatory_region:
          String(f.regulatory_region || 'IQ').toUpperCase() === 'TR' ? 'TR' : 'IQ',
      }));

      try {
        const sessionStr = localStorage.getItem('exretail_session');
        if (sessionStr) {
          const session = JSON.parse(sessionStr);
          const allowedFirmNrs = session?.user?.allowed_firm_nrs;
          if (Array.isArray(allowedFirmNrs) && allowedFirmNrs.length > 0) {
            mappedFirms = mappedFirms.filter((f: any) => allowedFirmNrs.includes(f.firm_nr));
          }
        }
      } catch (_) { /* ignore */ }
      setFirms(mappedFirms);

      if (mappedFirms.length > 0) {
        let cfgPreferredNr = '';
        try {
          const { IS_TAURI, safeInvoke } = await import('../utils/env');
          if (IS_TAURI) {
            const cfg: any = await safeInvoke('get_app_config');
            if (cfg?.erp_firm_nr != null && String(cfg.erp_firm_nr).trim() !== '') {
              cfgPreferredNr = normalizeFirmNr(cfg.erp_firm_nr);
            }
          } else {
            const w = localStorage.getItem('retailex_web_config');
            if (w) {
              const cfg = JSON.parse(w);
              if (cfg?.erp_firm_nr != null && String(cfg.erp_firm_nr).trim() !== '') {
                cfgPreferredNr = normalizeFirmNr(cfg.erp_firm_nr);
              }
            }
          }
        } catch (_) { /* ignore */ }

        const storedNr = normalizeFirmNr(localStorage.getItem('exretail_selected_firma_id'));
        const matchNr = (nr: string) => nr && mappedFirms.find((f: any) => normalizeFirmNr(f.firm_nr) === nr);

        const isTemplateRetailEx = (f: any) => String(f.firm_nr) === '001' && f.name === 'RetailEx OS';
        const nonTemplate = mappedFirms.filter((f: any) => !isTemplateRetailEx(f));

        const defaultFirma =
          (cfgPreferredNr && matchNr(cfgPreferredNr)) ||
          (storedNr && matchNr(storedNr)) ||
          (nonTemplate.length > 0 ? nonTemplate.find((f: any) => f.default) : mappedFirms.find((f: any) => f.default)) ||
          (nonTemplate.length > 0 ? nonTemplate[0] : mappedFirms[0]);

        if (defaultFirma) {
          const nr = normalizeFirmNr(defaultFirma.firm_nr) || String(defaultFirma.firm_nr);
          ERP_SETTINGS.firmNr = nr || ERP_SETTINGS.firmNr;
          localStorage.setItem('exretail_selected_firma_id', nr);
          setSelectedFirm(defaultFirma);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriods = async (firmIdOrNr: string) => {
    try {
      console.log('[FirmaDonemContext] ========== FETCHING PERIODS ==========');
      console.log('[FirmaDonemContext] firmIdOrNr parameter:', firmIdOrNr);

      // Try searching by UUID first, then by firm_nr
      const query = `
        SELECT * FROM periods 
        WHERE firm_id = (
          SELECT id FROM firms 
          WHERE id::text = $1 OR firm_nr = $1
        ) 
        ORDER BY nr ASC
      `;

      const { rows } = await postgres.query(query, [firmIdOrNr]);

      console.log('[FirmaDonemContext] ========== PERIOD DEBUG ==========');
      console.log('[FirmaDonemContext] Raw periods from DB:', rows);
      console.log('[FirmaDonemContext] Row count:', rows?.length);

      if (rows && rows.length > 0) {
        console.log('[FirmaDonemContext] First period raw data:', rows[0]);
        console.log('[FirmaDonemContext] is_active value:', rows[0].is_active);
        console.log('[FirmaDonemContext] is_active type:', typeof rows[0].is_active);
      }

      // Date formatting function
      const formatDate = (dateInput: any) => {
        if (!dateInput) return '';
        try {
          const date = new Date(dateInput);
          if (isNaN(date.getTime())) return dateInput.toString();
          return date.toLocaleDateString('tr-TR');
        } catch (e) {
          return dateInput.toString();
        }
      };

      let mappedPeriods = (rows || []).map((p: any) => {
        const isActive = p.is_active === true || p.is_active === 1 || p.is_active === 'true';

        const mapped = {
          ...p,
          logicalref: p.nr,
          nr: p.nr,
          donem_no: p.nr, // Alias
          active: isActive,
          beg_date: formatDate(p.beg_date),
          end_date: formatDate(p.end_date)
        };

        console.log('[FirmaDonemContext] Mapped period:', {
          nr: mapped.nr,
          is_active_raw: p.is_active,
          active_converted: mapped.active,
          beg_date: mapped.beg_date,
          end_date: mapped.end_date
        });

        return mapped;
      });

      try {
        const sessionStr = localStorage.getItem('exretail_session');
        if (sessionStr) {
          const session = JSON.parse(sessionStr);
          const allowedPeriods = session?.user?.allowed_periods;
          if (Array.isArray(allowedPeriods) && allowedPeriods.length > 0) {
            const firmNrRow = await postgres.query('SELECT firm_nr FROM firms WHERE id::text = $1 OR firm_nr = $1 LIMIT 1', [firmIdOrNr]);
            const effectiveFirmNr = firmNrRow?.rows?.[0]?.firm_nr || (typeof firmIdOrNr === 'string' && !firmIdOrNr.match(/^[0-9a-f-]{36}$/i) ? firmIdOrNr : null);
            if (effectiveFirmNr) {
              const allowedNrsForFirm = allowedPeriods.filter((x: any) => x.firm_nr === effectiveFirmNr).map((x: any) => x.period_nr);
              if (allowedNrsForFirm.length > 0) {
                mappedPeriods = mappedPeriods.filter((p: any) => allowedNrsForFirm.includes(p.nr));
              }
            }
          }
        }
      } catch (_) { /* ignore */ }

      console.log('[FirmaDonemContext] Total mapped periods:', mappedPeriods.length);
      console.log('[FirmaDonemContext] ========== END DEBUG ==========');

      setPeriods(mappedPeriods);

      if (mappedPeriods.length > 0) {
        const storedId = localStorage.getItem('exretail_selected_donem_id');
        const active = mappedPeriods.find((p: any) => p.nr.toString() === storedId) ||
          mappedPeriods.find((p: any) => p.default) ||
          mappedPeriods[0];

        if (active) {
          console.log('[FirmaDonemContext] Selected period:', active);
          console.log('[FirmaDonemContext] Period active status:', active.active);
          setSelectedPeriod(active);
        }
      }
    } catch (err: any) {
      console.error('Error fetching periods:', err);
    }
  };

  const fetchBranches = async (firmNr: number) => {
    try {
      const { rows } = await postgres.query(
        'SELECT * FROM stores WHERE type = $1 AND firm_nr = $2 AND is_active = true ORDER BY code ASC',
        ['BRANCH', firmNr.toString()]
      );

      const mapped = rows.map((r: any) => ({
        ...r,
        logicalref: parseInt(r.code) || 0,
        nr: parseInt(r.code) || 0,
        name: r.name
      }));

      setBranches(mapped);
      if (mapped.length > 0) setSelectedBranch(mapped[0]);
    } catch (e) {
      console.error('Fetch branches error:', e);
    }
  };

  const fetchWarehouses = async (firmNr: number, branchId?: number) => {
    try {
      const { rows } = await postgres.query(
        'SELECT * FROM stores WHERE type = $1 AND firm_nr = $2 AND is_active = true ORDER BY code ASC',
        ['WAREHOUSE', firmNr.toString()]
      );

      const mapped = rows.map((r: any) => ({
        ...r,
        logicalref: parseInt(r.code) || 0,
        nr: parseInt(r.code) || 0,
        name: r.name
      }));

      setWarehouses(mapped);
      if (mapped.length > 0 && !selectedWarehouse) setSelectedWarehouse(mapped[0]);
    } catch (e) {
      console.error('Fetch warehouses error:', e);
    }
  };

  // --- Actions ---

  const setFirmAsDefault = async (firmId: string) => {
    try {
      // 1. Clear all defaults
      await postgres.query('UPDATE firms SET "default" = false');
      // 2. Set new default
      await postgres.query('UPDATE firms SET "default" = true WHERE firm_nr = $1', [firmId]);
      await refreshFirms();
    } catch (e) {
      console.error('Error setting firm as default:', e);
    }
  };

  const setPeriodAsDefault = async (periodId: string, firmId: string) => {
    try {
      // 1. Clear all defaults for this firm's periods
      await postgres.query(
        'UPDATE periods SET "default" = false WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = $1)',
        [firmId]
      );
      // 2. Set new default
      await postgres.query('UPDATE periods SET "default" = true WHERE nr = $1 AND firm_id = (SELECT id FROM firms WHERE firm_nr = $2)', [parseInt(periodId), firmId]);

      if (selectedFirm) {
        const targetFirmId = selectedFirm.firm_nr || selectedFirm.nr.toString();
        await fetchPeriods(targetFirmId);
      }
    } catch (e) {
      console.error('Error setting period as default:', e);
    }
  };

  const selectFirm = (id: string | number) => {
    console.log('[FirmaDonemContext] selectFirm called with:', id);
    const idStr = id.toString();
    const found = firms.find(f => f.firm_nr === idStr || f.nr.toString() === idStr || f.logicalref.toString() === idStr || f.id === idStr);
    if (found) {
      console.log('[FirmaDonemContext] Found firm:', found);
      setSelectedFirm(found);

      // Immediate sync
      if (found.firm_nr) {
        const nr = normalizeFirmNr(found.firm_nr) || String(found.firm_nr);
        ERP_SETTINGS.firmNr = nr;
        localStorage.setItem('exretail_selected_firma_id', nr);
      } else if (found.id) {
        localStorage.setItem('exretail_selected_firma_id', String(found.id));
      }
    }
  };

  const selectPeriod = (id: string | number) => {
    console.log('[FirmaDonemContext] selectPeriod called with:', id);
    const idStr = id.toString();
    const found = periods.find(p => p.nr.toString() === idStr || p.logicalref?.toString() === idStr || p.id === idStr);
    if (found) {
      console.log('[FirmaDonemContext] Found period:', found);
      setSelectedPeriod(found);
      localStorage.setItem('exretail_selected_donem_id', found.nr.toString());

      // Immediate sync
      ERP_SETTINGS.periodNr = found.nr.toString().padStart(2, '0');
      console.log('[FirmaDonemContext] ERP_SETTINGS.periodNr updated to:', ERP_SETTINGS.periodNr);
    }
  };

  const selectBranch = (id: string | number) => {
    const found = branches.find(b => b.id === id || b.nr === id);
    if (found) setSelectedBranch(found);
  };

  const selectWarehouse = (id: string | number) => {
    const found = warehouses.find(w => w.id === id || w.nr === id);
    if (found) setSelectedWarehouse(found);
  };

  const refreshFirms = async () => {
    await fetchFirms();
  };

  return (
    <FirmaDonemContext.Provider value={{
      selectedFirm,
      selectedPeriod,
      selectedFirma: selectedFirm,
      selectedDonem: selectedPeriod,
      selectedBranch,
      selectedWarehouse,
      firms,
      periods,
      branches,
      warehouses,
      selectFirm,
      selectPeriod,
      selectBranch,
      selectWarehouse,
      setSelectedFirm,
      setSelectedPeriod,
      setFirmAsDefault,
      setPeriodAsDefault,
      refreshFirms,
      loading,
      error
    }}>
      {children}
    </FirmaDonemContext.Provider>
  );
};

export const useFirmaDonem = () => {
  const context = useContext(FirmaDonemContext);
  if (!context) throw new Error('useFirmaDonem must be used within FirmaDonemProvider');
  return context;
};
