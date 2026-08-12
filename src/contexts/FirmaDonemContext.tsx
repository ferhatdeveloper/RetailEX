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
import { postgres, ERP_SETTINGS, DB_SETTINGS, getAppDefaultCurrency } from '../services/postgres';
import {
  clearFirmScopedCachesOnly,
  refreshFirmScopedStores,
  refreshPeriodScopedStores,
} from '../store/refreshFirmScopedStores';
import { toSqlDateInputString } from '../utils/localCalendarDate';

/** firms.firm_nr ile SQLite erp_firm_nr aynı biçimde eşlensin (2 ↔ 002); rex_{nr}_customers için şart */
function normalizeFirmNr(v: string | number | undefined | null): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 3 ? d.padStart(3, '0') : d;
}

/** Giriş oturumu / kullanıcı meta (localStorage seçimi hariç) */
function resolveLoginPreferredFirmNr(): string {
  try {
    const sessionStr = localStorage.getItem('exretail_session');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      const userFirm = session?.user?.firm_nr;
      if (userFirm) return normalizeFirmNr(userFirm);
    }
  } catch {
    /* ignore */
  }
  try {
    const metaStr = localStorage.getItem('exretail_user_meta');
    if (metaStr) {
      const meta = JSON.parse(metaStr);
      if (meta.firm_nr) return normalizeFirmNr(meta.firm_nr);
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** Kullanıcının UI'da seçtiği firma (üst çubuk / firma seçici) */
function resolveStoredFirmNr(): string {
  return normalizeFirmNr(localStorage.getItem('exretail_selected_firma_id'));
}

function resolveDefaultPeriodNr(): number {
  try {
    const metaStr = localStorage.getItem('exretail_user_meta');
    if (metaStr) {
      const meta = JSON.parse(metaStr);
      const p = parseInt(String(meta.period_nr ?? ''), 10);
      if (Number.isFinite(p) && p > 0) return p;
    }
  } catch {
    /* ignore */
  }
  const fromSettings = parseInt(String(ERP_SETTINGS.periodNr || '01'), 10);
  return Number.isFinite(fromSettings) && fromSettings > 0 ? fromSettings : 1;
}

function buildFallbackPeriod(firmId: number, periodNr: number): Period {
  return {
    logicalref: periodNr,
    nr: periodNr,
    firm_id: firmId,
    donem_no: periodNr,
    active: true,
    beg_date: '',
    end_date: '',
  };
}
import { eTransformService } from '../services/eTransformService';
import { subscribeInvalidate } from '../services/retailexDataSync';

// Types matching ROS tables
export interface Firm {
  logicalref: number;
  nr: number;
  name: string;
  title?: string;
  id?: string; // Modern UUID
  firm_nr?: string; // Standard Logo Firm No
  firma_kodu?: string; // Alias for backward compatibility
  /** Rapor başlıkları için görünen ad */
  firma_adi?: string;
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
  /** Rapor bileşenleri için Türkçe takma adlar */
  baslangic_tarihi?: string;
  bitis_tarihi?: string;
  /** Trial balance vb. — `donem_adi` yoksa kullanılır */
  name?: string;
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
  /** Realtime / polling: güncel refreshFirms + fetchPeriods + seçili firma */
  const firmaDonemSyncRef = useRef({
    refreshFirms: async () => {},
    fetchPeriods: async (_firmIdOrNr: string) => {},
    selectedFirm: null as Firm | null,
  });
  const selectedFirmRef = useRef<Firm | null>(null);

  useEffect(() => {
    selectedFirmRef.current = selectedFirm;
  }, [selectedFirm]);

  // --- Initial Load ---
  useEffect(() => {
    refreshFirms();
  }, []);

  // --- Dependencies ---

  // When Firm changes -> Load Periods & Branches
  useEffect(() => {
    if (selectedFirm) {
      setSelectedPeriod(null);
      setPeriods([]);
      fetchPeriods(selectedFirm.id || selectedFirm.firm_nr || selectedFirm.logicalref.toString());
      fetchBranches(selectedFirm.logicalref);
      setGlobalCurrency(
        selectedFirm.ana_para_birimi || getAppDefaultCurrency(),
        selectedFirm.raporlama_para_birimi || selectedFirm.ana_para_birimi || getAppDefaultCurrency()
      );

      // Sync ERP_SETTINGS — cari/stok rex_{firmNr}_* tabloları için normalize kod gerekli
      if (selectedFirm.firm_nr) {
        ERP_SETTINGS.firmNr = normalizeFirmNr(selectedFirm.firm_nr) || String(selectedFirm.firm_nr);
        if (import.meta.env.DEV) console.log('[FirmaDonemContext] ERP_SETTINGS.firmNr updated to:', ERP_SETTINGS.firmNr);
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
      if (import.meta.env.DEV) console.log('[FirmaDonemContext] ERP_SETTINGS.periodNr synced to:', ERP_SETTINGS.periodNr);
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
    const effectivePeriodNr =
      selectedPeriod?.nr != null
        ? selectedPeriod.nr
        : resolveDefaultPeriodNr();

    if (selectedPeriod?.nr != null) {
      ERP_SETTINGS.periodNr = String(selectedPeriod.nr).padStart(2, '0');
    } else if (!ERP_SETTINGS.periodNr) {
      ERP_SETTINGS.periodNr = String(effectivePeriodNr).padStart(2, '0');
    }

    if (selectedPeriod?.nr == null && periods.length === 0) {
      return;
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
          { firm: fn, period: effectivePeriodNr }
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedFirm?.firm_nr, selectedPeriod?.nr, periods.length]);

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
      if (import.meta.env.DEV) console.log('[FirmaDonemContext] Fetching all firms...');
      let rows: any[] = [];

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        try {
          const { postgrest } = await import('../services/api/postgrestClient');
          const data = await postgrest.get(
            '/firms',
            { select: '*', order: 'firm_nr.asc' },
            { schema: 'public' }
          );
          rows = Array.isArray(data) ? data : [];
        } catch (restErr: any) {
          console.warn('[FirmaDonemContext] PostgREST /firms failed, SQL fallback:', restErr?.message || restErr);
          const result = await postgres.query('SELECT * FROM firms ORDER BY firm_nr ASC', []);
          rows = result.rows || [];
        }
      } else {
        const result = await postgres.query('SELECT * FROM firms ORDER BY firm_nr ASC', []);
        rows = result.rows || [];
      }

      if (import.meta.env.DEV) console.log('[FirmaDonemContext] Raw firms rows:', rows);

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

        const storedPreferredNr = resolveStoredFirmNr();
        const loginPreferredNr = resolveLoginPreferredFirmNr();
        const currentSelectedNr = selectedFirmRef.current
          ? normalizeFirmNr(selectedFirmRef.current.firm_nr)
          : '';
        const matchNr = (nr: string) => nr && mappedFirms.find((f: any) => normalizeFirmNr(f.firm_nr) === nr);

        const isTemplateRetailEx = (f: any) => String(f.firm_nr) === '001' && f.name === 'RetailEx OS';
        const nonTemplate = mappedFirms.filter((f: any) => !isTemplateRetailEx(f));

        const targetFirma =
          (storedPreferredNr && matchNr(storedPreferredNr)) ||
          (currentSelectedNr && matchNr(currentSelectedNr)) ||
          (cfgPreferredNr && matchNr(cfgPreferredNr)) ||
          (loginPreferredNr && matchNr(loginPreferredNr)) ||
          (nonTemplate.length > 0 ? nonTemplate.find((f: any) => f.default) : mappedFirms.find((f: any) => f.default)) ||
          (nonTemplate.length > 0 ? nonTemplate[0] : mappedFirms[0]);

        if (targetFirma) {
          const nr = normalizeFirmNr(targetFirma.firm_nr) || String(targetFirma.firm_nr);
          const prevNr = selectedFirmRef.current
            ? normalizeFirmNr(selectedFirmRef.current.firm_nr)
            : '';
          if (!prevNr || prevNr !== nr) {
            ERP_SETTINGS.firmNr = nr || ERP_SETTINGS.firmNr;
            localStorage.setItem('exretail_selected_firma_id', nr);
            setSelectedFirm(targetFirma);
          }
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
      if (import.meta.env.DEV) console.log('[FirmaDonemContext] ========== FETCHING PERIODS ==========');
      if (import.meta.env.DEV) console.log('[FirmaDonemContext] firmIdOrNr parameter:', firmIdOrNr);

      let rows: any[] = [];

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        try {
          const { postgrest } = await import('../services/api/postgrestClient');
          const UUID_RE =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          let firmUuid = firmIdOrNr.trim();
          if (!UUID_RE.test(firmUuid)) {
            const fnr = normalizeFirmNr(firmIdOrNr) || firmIdOrNr;
            const fr = await postgrest.get(
              '/firms',
              { select: 'id', firm_nr: `eq.${fnr}` },
              { schema: 'public' }
            );
            const farr = Array.isArray(fr) ? fr : [];
            firmUuid = farr[0]?.id ? String(farr[0].id) : '';
          }
          if (firmUuid) {
            const pr = await postgrest.get(
              '/periods',
              { select: '*', order: 'nr.asc', firm_id: `eq.${firmUuid}` },
              { schema: 'public' }
            );
            rows = Array.isArray(pr) ? pr : [];
          }
        } catch (restErr: any) {
          console.warn('[FirmaDonemContext] PostgREST /periods failed, SQL fallback:', restErr?.message || restErr);
          const query = `
            SELECT * FROM periods 
            WHERE firm_id = (
              SELECT id FROM firms 
              WHERE id::text = $1 OR firm_nr = $1
            ) 
            ORDER BY nr ASC
          `;
          const result = await postgres.query(query, [firmIdOrNr]);
          rows = result.rows || [];
        }
      } else {
        const query = `
          SELECT * FROM periods 
          WHERE firm_id = (
            SELECT id FROM firms 
            WHERE id::text = $1 OR firm_nr = $1
          ) 
          ORDER BY nr ASC
        `;
        const result = await postgres.query(query, [firmIdOrNr]);
        rows = result.rows || [];
      }

      if (import.meta.env.DEV) console.log('[FirmaDonemContext] ========== PERIOD DEBUG ==========');
      if (import.meta.env.DEV) console.log('[FirmaDonemContext] Raw periods from DB:', rows);
      if (import.meta.env.DEV) console.log('[FirmaDonemContext] Row count:', rows?.length);

      if (rows && rows.length > 0) {
        if (import.meta.env.DEV) console.log('[FirmaDonemContext] First period raw data:', rows[0]);
        if (import.meta.env.DEV) console.log('[FirmaDonemContext] is_active value:', rows[0].is_active);
        if (import.meta.env.DEV) console.log('[FirmaDonemContext] is_active type:', typeof rows[0].is_active);
      }

      let mappedPeriods = (rows || []).map((p: any) => {
        const isActive = p.is_active === true || p.is_active === 1 || p.is_active === 'true';

        const mapped = {
          ...p,
          logicalref: p.nr,
          nr: p.nr,
          donem_no: p.nr, // Alias
          active: isActive,
          // Her zaman YYYY-MM-DD: input[type=date], SQL $n::date ve raporlar için (tr-TR kısa format kullanma)
          beg_date: toSqlDateInputString(p.beg_date) || '',
          end_date: toSqlDateInputString(p.end_date) || ''
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
            const effectiveFirmNr =
              normalizeFirmNr(selectedFirm?.firm_nr) ||
              (typeof firmIdOrNr === 'string' && !firmIdOrNr.match(/^[0-9a-f-]{36}$/i)
                ? normalizeFirmNr(firmIdOrNr)
                : null);
            if (effectiveFirmNr) {
              const allowedNrsForFirm = allowedPeriods.filter((x: any) => x.firm_nr === effectiveFirmNr).map((x: any) => x.period_nr);
              if (allowedNrsForFirm.length > 0) {
                mappedPeriods = mappedPeriods.filter((p: any) => allowedNrsForFirm.includes(p.nr));
              }
            }
          }
        }
      } catch (_) { /* ignore */ }

      if (import.meta.env.DEV) console.log('[FirmaDonemContext] Total mapped periods:', mappedPeriods.length);
      if (import.meta.env.DEV) console.log('[FirmaDonemContext] ========== END DEBUG ==========');

      if (mappedPeriods.length === 0) {
        const fallbackNr = resolveDefaultPeriodNr();
        const fallback = buildFallbackPeriod(selectedFirm?.logicalref ?? 0, fallbackNr);
        mappedPeriods = [fallback];
      }

      setPeriods(mappedPeriods);

      const storedId = localStorage.getItem('exretail_selected_donem_id');
      const active =
        mappedPeriods.find((p: any) => p.nr.toString() === storedId) ||
        mappedPeriods.find((p: any) => p.nr === resolveDefaultPeriodNr()) ||
        mappedPeriods.find((p: any) => p.default) ||
        mappedPeriods[0];

      if (active) {
        if (import.meta.env.DEV) console.log('[FirmaDonemContext] Selected period:', active);
        if (import.meta.env.DEV) console.log('[FirmaDonemContext] Period active status:', active.active);
        setSelectedPeriod(active);
        ERP_SETTINGS.periodNr = String(active.nr).padStart(2, '0');
        localStorage.setItem('exretail_selected_donem_id', String(active.nr));
      }
    } catch (err: any) {
      console.error('Error fetching periods:', err);
    }
  };

  const fetchBranches = async (firmNr: number) => {
    try {
      let rows: any[] = [];
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('../services/api/postgrestClient');
        const data = await postgrest.get(
          '/stores',
          {
            select: '*',
            type: 'eq.BRANCH',
            firm_nr: `eq.${firmNr.toString().padStart(3, '0')}`,
            is_active: 'eq.true',
            order: 'code.asc',
          },
          { schema: 'public' }
        );
        rows = Array.isArray(data) ? data : [];
      } else {
        const result = await postgres.query(
          'SELECT * FROM stores WHERE type = $1 AND firm_nr = $2 AND is_active = true ORDER BY code ASC',
          ['BRANCH', firmNr.toString()]
        );
        rows = result.rows || [];
      }

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
      let rows: any[] = [];
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('../services/api/postgrestClient');
        const data = await postgrest.get(
          '/stores',
          {
            select: '*',
            type: 'eq.WAREHOUSE',
            firm_nr: `eq.${firmNr.toString().padStart(3, '0')}`,
            is_active: 'eq.true',
            order: 'code.asc',
          },
          { schema: 'public' }
        );
        rows = Array.isArray(data) ? data : [];
      } else {
        const result = await postgres.query(
          'SELECT * FROM stores WHERE type = $1 AND firm_nr = $2 AND is_active = true ORDER BY code ASC',
          ['WAREHOUSE', firmNr.toString()]
        );
        rows = result.rows || [];
      }

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
    if (import.meta.env.DEV) console.log('[FirmaDonemContext] selectFirm called with:', id);
    const idStr = id.toString();
    const idNorm = normalizeFirmNr(idStr);
    const found = firms.find(
      (f) =>
        normalizeFirmNr(f.firm_nr) === idNorm ||
        f.firm_nr === idStr ||
        f.nr.toString() === idStr ||
        f.logicalref.toString() === idStr ||
        f.id === idStr,
    );
    if (found) {
      if (import.meta.env.DEV) console.log('[FirmaDonemContext] Found firm:', found);
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
    if (import.meta.env.DEV) console.log('[FirmaDonemContext] selectPeriod called with:', id);
    const idStr = id.toString();
    const found = periods.find(p => p.nr.toString() === idStr || p.logicalref?.toString() === idStr || p.id === idStr);
    if (found) {
      if (import.meta.env.DEV) console.log('[FirmaDonemContext] Found period:', found);
      setSelectedPeriod(found);
      localStorage.setItem('exretail_selected_donem_id', found.nr.toString());

      // Immediate sync
      ERP_SETTINGS.periodNr = found.nr.toString().padStart(2, '0');
      if (import.meta.env.DEV) console.log('[FirmaDonemContext] ERP_SETTINGS.periodNr updated to:', ERP_SETTINGS.periodNr);
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

  useEffect(() => {
    firmaDonemSyncRef.current = { refreshFirms, fetchPeriods, selectedFirm };
  });

  useEffect(() => {
    const unsub = subscribeInvalidate((scope) => {
      const r = firmaDonemSyncRef.current;
      if (scope === 'all' || scope === 'firms') void r.refreshFirms();
      if (scope === 'all' || scope === 'periods') {
        const sf = r.selectedFirm;
        if (sf) void r.fetchPeriods(String(sf.id ?? sf.logicalref ?? ''));
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (DB_SETTINGS.connectionProvider !== 'rest_api') return;
    const id = window.setInterval(() => {
      const r = firmaDonemSyncRef.current;
      void r.refreshFirms();
      const sf = r.selectedFirm;
      if (sf) void r.fetchPeriods(String(sf.id ?? sf.logicalref ?? ''));
    }, 45_000);
    return () => window.clearInterval(id);
  }, []);

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

/** Login / ayar ekranı gibi FirmaDonemProvider dışı ağaçlarda güvenli kullanım */
export const useOptionalFirmaDonem = () => useContext(FirmaDonemContext);
