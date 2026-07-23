import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Lock, User, CheckCircle, Store, MoreHorizontal, Grid3x3, Languages, AlertCircle, Building2, Settings as Gear, Loader2, ArrowRight, ArrowLeft, Maximize2, ShieldCheck, Shield, X as CloseIcon, Activity, ChevronRight, Terminal, Trash2, Download, Search, RotateCcw, Database, Save, RefreshCw, Moon, Sun, Server, Wand2 } from 'lucide-react';
import { HybridSyncPanel } from './HybridSyncPanel';
import { DeviceRegistrationForm } from './DeviceRegistrationForm';
import { logger, LogEntry } from '../../services/loggingService';
import type { User as UserType } from '../../core/types';
import { APP_VERSION } from '../../core/version';
import { REMOTE_PG_DEFAULTS, formatRemotePgEndpoint, DEFAULT_REMOTE_REST_URL } from '../../core/remotePgDefaults';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { NeonLogo } from '../ui/NeonLogo';
import { readNeonProductLineFromStorage } from '../../utils/neonProductLine';
import { isCapacitorNative, isCapacitorAndroid } from '../../utils/capacitorPlatform';
import { LanguageSelectionModal } from './LanguageSelectionModal';
import type {
  ConnectionProvider,
  ConnectionMode,
  HybridReadPreference,
  HybridSyncDirection,
  HybridSyncTransport,
} from '../../services/postgres';

interface LoginProps {
  onLogin: (user: UserType) => void;
}

const INFRA_PASS = "10021993";
const IT_PASS = "30031993";

import { supabase } from '../../utils/supabase/client';
import {
  parseSaaSOrCustomPostgrestUrl,
  buildSaaSTenantPostgrestUrl,
} from '../../services/merkezTenantRegistry';
import {
  markForceSetupWizard,
  requestOpenSetupWizard,
} from '../../utils/setupWizardGate';

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
const isProduction = import.meta.env.PROD;

/** firms.firm_nr ile aynı biçim (örn. 2 → 002) — tenant ön seçimi için */
function normalizeTenantFirmNr(v: string | number | undefined | null): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 3 ? d.padStart(3, '0') : d;
}

export function Login({ onLogin }: LoginProps) {
  const { t, language, setLanguage } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [store, setStore] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [showStoreSearch, setShowStoreSearch] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [setupFirmId, setSetupFirmId] = useState('');
  const [isSetupLoading, setIsSetupLoading] = useState(false);
  const [isEnteringFullSetup, setIsEnteringFullSetup] = useState(false);
  const [showCloudOrgFetch, setShowCloudOrgFetch] = useState(false);
  const [setupSuccessData, setSetupSuccessData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceGateStatus, setDeviceGateStatus] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<'tenant' | 'credentials' | 'organization'>(() => {
    if (typeof window === 'undefined') return 'tenant';
    try {
      const rawCfg = localStorage.getItem('retailex_web_config');
      if (!rawCfg) return 'tenant';
      const cfg = JSON.parse(rawCfg) as {
        merkez_tenant_code?: string;
        remote_rest_url?: string;
      };
      if (String(cfg.merkez_tenant_code || '').trim()) return 'credentials';
      const rest = String(cfg.remote_rest_url || '').trim();
      if (rest && parseSaaSOrCustomPostgrestUrl(rest).kind === 'saas_single_slug') return 'credentials';
    } catch { /* ignore */ }
    return 'tenant';
  });
  const [showLogs, setShowLogs] = useState(false);
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);
  const [showDbSettings, setShowDbSettings] = useState(false);
  const [dbConfig, setDbConfig] = useState({
    host: '127.0.0.1',
    port: 5432,
    database: 'retailex_local',
    user: 'postgres',
    password: ''
  });
  /** Hibrit / online: uzak PostgreSQL (merkez PG) — REMOTE_CONFIG / remote-pg.defaults.json */
  const [remoteDbConfig, setRemoteDbConfig] = useState({
    host: REMOTE_PG_DEFAULTS.host,
    port: REMOTE_PG_DEFAULTS.port,
    database: REMOTE_PG_DEFAULTS.database,
    user: REMOTE_PG_DEFAULTS.user,
    password: REMOTE_PG_DEFAULTS.password,
  });
  const [connectionProvider, setConnectionProvider] = useState<ConnectionProvider>('rest_api');
  const [remoteRestUrl, setRemoteRestUrl] = useState<string>(DEFAULT_REMOTE_REST_URL);
  /** Veritabanı modalı: Asin bulutunda yalnızca kiracı segmenti vs tam URL */
  const [tenantPostgrestEntryMode, setTenantPostgrestEntryMode] = useState<'retailex_cloud' | 'custom_url'>(
    'retailex_cloud',
  );
  const [tenantPostgrestSlug, setTenantPostgrestSlug] = useState('');
  /** Asin: yalnızca online + PostgREST — yerel/offline kapalı */
  const [dbConnectionMode, setDbConnectionMode] = useState<ConnectionMode>('online');
  const [hybridReadPreference, setHybridReadPreference] = useState<HybridReadPreference>('remote_first');
  const [hybridSyncDirection, setHybridSyncDirection] = useState<HybridSyncDirection>('remote_to_local');
  const [hybridSyncIntervalSec, setHybridSyncIntervalSec] = useState(30);
  const [hybridSyncTransport, setHybridSyncTransport] = useState<HybridSyncTransport>('both');
  const [isDbTestLoading, setIsDbTestLoading] = useState(false);
  const [isHybridSyncLoading, setIsHybridSyncLoading] = useState(false);
  /** Veritabanı modalında test sonucu (toast’a ek; ekranda kalıcı) */
  const [dbTestFeedback, setDbTestFeedback] = useState<
    | null
    | {
        phase: 'loading' | 'ok' | 'err';
        title: string;
        detail?: string;
        /** Hangi hedef denendi (örn. uzak host:port/db) */
        target: string;
      }
  >(null);
  /** Veritabanı modalı: adım adım sihirbaz (uzun scroll yerine) */
  const [dbSettingsStep, setDbSettingsStep] = useState(0);
  type DbSettingsWizardStepId = 'mode' | 'local_pg' | 'remote_pg' | 'postgrest' | 'sync' | 'single_pg';
  const dbSettingsWizardSteps = useMemo((): { id: DbSettingsWizardStepId; label: string }[] => {
    const steps: { id: DbSettingsWizardStepId; label: string }[] = [
      { id: 'mode', label: 'Mod' },
    ];
    if (dbConnectionMode === 'hybrid') {
      steps.push({ id: 'local_pg', label: 'Yerel' });
      steps.push({ id: 'postgrest', label: 'REST' });
      steps.push({ id: 'sync', label: 'Senkron' });
    } else if (connectionProvider === 'rest_api') {
      steps.push({ id: 'postgrest', label: 'PostgREST' });
    } else {
      steps.push({ id: 'single_pg', label: 'PostgreSQL' });
    }
    return steps;
  }, [dbConnectionMode, connectionProvider]);
  const currentDbSettingsStepId =
    dbSettingsWizardSteps[Math.min(dbSettingsStep, dbSettingsWizardSteps.length - 1)]?.id ?? 'mode';

  const { login: authLogin } = useAuth();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rtlMode, setRtlMode] = useState(false);
  const [activeOrgTab, setActiveOrgTab] = useState<'firm' | 'database'>('firm');
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);
  /** Varsayılan kapalı: C:\AsinERP silinsin mi */
  const [factoryResetDeleteCRetailex, setFactoryResetDeleteCRetailex] = useState(false);

  const [firms, setFirms] = useState<any[]>([]);
  const [selectedFirmNr, setSelectedFirmNr] = useState<string>('');
  const [showFirmSearch, setShowFirmSearch] = useState(false);
  const [loadingFirms, setLoadingFirms] = useState(false);
  const [stores, setStores] = useState<any[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);

  const { darkMode, toggleDarkMode } = useTheme();

  const applyRemoteRestUrlToTenantInputs = (rest: string) => {
    const p = parseSaaSOrCustomPostgrestUrl(rest);
    if (p.kind === 'saas_single_slug') {
      setTenantPostgrestEntryMode('retailex_cloud');
      setTenantPostgrestSlug(p.slug);
    } else {
      setTenantPostgrestEntryMode('custom_url');
      setTenantPostgrestSlug('');
    }
  };

  const isTenantResolvedForWeb = () => {
    if (typeof window === 'undefined') return true;
    try {
      if (localStorage.getItem('exretail_firma_donem_configured') === 'true') return true;
      const rawCfg = localStorage.getItem('retailex_web_config');
      if (!rawCfg) return false;
      const cfg = JSON.parse(rawCfg) as {
        merkez_tenant_code?: string;
        merkez_tenant_id?: string;
        remote_rest_url?: string;
      };
      if (String(cfg.merkez_tenant_code || '').trim() || String(cfg.merkez_tenant_id || '').trim()) {
        return true;
      }
      const rest = String(cfg.remote_rest_url || '').trim();
      return rest.length > 0 && parseSaaSOrCustomPostgrestUrl(rest).kind === 'saas_single_slug';
    } catch {
      return false;
    }
  };

  useEffect(() => {
    // Web production akışında tenant_registry uygulanmadan firma/kullanıcı sorgusu başlatma.
    if (!isTauri && isProduction && !isTenantResolvedForWeb()) {
      return;
    }
    loadFirms();
    loadUsers();

    // Load existing configuration to persist license display
    const loadCurrentConfig = async () => {
      let config: any = null;
      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          config = await invoke('get_app_config');
        } catch (e) { }
      } else {
        const saved = localStorage.getItem('retailex_web_config');
        if (saved) {
          try {
            config = JSON.parse(saved);
          } catch (e) { }
        }
      }

      if (config && config.is_configured) {
        setSetupSuccessData(config);
      }
    };
    loadCurrentConfig();

    // Subscribe to logs
    const unsubscribe = logger.subscribe((newLog) => {
      setSystemLogs(logger.getLogs());
    });
    setSystemLogs(logger.getLogs());

    const savedUser = localStorage.getItem('retailos_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUsername(parsed.username || '');
        setRememberMe(true);
      } catch (e) { }
    }

    // Auto-prompt Setup on Web / Mobile if not configured
    const isConfiguredFromStorage = localStorage.getItem('exretail_firma_donem_configured') === 'true';
    const hasWebConfig = !!localStorage.getItem('retailex_web_config');
    const isMobileNative = !isTauri && isCapacitorNative();

    // DeskApp: App.tsx yanlışlıkla Login’e düştüyse siyah SetupWizard’a geç (mavi UUID modal değil)
    if (isTauri && !isConfiguredFromStorage) {
      void (async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const cfg: any = await invoke('get_app_config');
          if (cfg?.is_configured === true) {
            localStorage.setItem('exretail_firma_donem_configured', 'true');
            return;
          }
        } catch {
          /* config.db yok / erişilemez → siyah wizard */
        }
        requestOpenSetupWizard();
      })();
    }

    // Android/iOS ilk kurulum: REST (PostgREST) bağlantı sihirbazını aç
    if (isMobileNative && !isConfiguredFromStorage && !hasWebConfig) {
      setConnectionProvider('rest_api');
      setDbConnectionMode('online');
      setShowDbSettings(true);
    }

    // Load DB Settings for the quick modal
    import('../../services/postgres').then(({ LOCAL_CONFIG, REMOTE_CONFIG, DB_SETTINGS }) => {
      setDbConfig({
        host: LOCAL_CONFIG.host,
        port: LOCAL_CONFIG.port,
        database: LOCAL_CONFIG.database,
        user: LOCAL_CONFIG.user,
        password: LOCAL_CONFIG.password
      });
      setRemoteDbConfig({
        host: REMOTE_CONFIG.host,
        port: REMOTE_CONFIG.port,
        database: REMOTE_CONFIG.database,
        user: REMOTE_CONFIG.user,
        password: REMOTE_CONFIG.password,
      });
      setConnectionProvider(DB_SETTINGS.connectionProvider === 'rest_api' ? 'rest_api' : 'rest_api');
      const restLoaded = DB_SETTINGS.remoteRestUrl || '';
      setRemoteRestUrl(restLoaded || DEFAULT_REMOTE_REST_URL);
      applyRemoteRestUrlToTenantInputs(restLoaded);
      // Asin: yerel/offline kapalı
      setDbConnectionMode('online');
      setConnectionProvider('rest_api');
      setHybridReadPreference('remote_first');
      setHybridSyncDirection('remote_to_local');
      setHybridSyncIntervalSec(DB_SETTINGS.hybridSyncIntervalSec ?? 30);
      setHybridSyncTransport(DB_SETTINGS.hybridSyncTransport ?? 'both');
    });
  }, [isTauri]);

  // Modal açılınca güncel modu tekrar oku (Yönetim’den değişmiş olabilir)
  useEffect(() => {
    if (!showDbSettings) return;
    import('../../services/postgres').then(({ LOCAL_CONFIG, REMOTE_CONFIG, DB_SETTINGS }) => {
      setDbConnectionMode(DB_SETTINGS.activeMode);
      const provider =
        DB_SETTINGS.activeMode === 'hybrid' ? 'rest_api' : DB_SETTINGS.connectionProvider;
      setConnectionProvider(provider);
      const restLoaded = DB_SETTINGS.remoteRestUrl || '';
      setRemoteRestUrl(restLoaded || DEFAULT_REMOTE_REST_URL);
      applyRemoteRestUrlToTenantInputs(restLoaded);
      setHybridReadPreference(DB_SETTINGS.hybridReadPreference);
      setHybridSyncDirection(DB_SETTINGS.hybridSyncDirection);
      setHybridSyncIntervalSec(DB_SETTINGS.hybridSyncIntervalSec ?? 30);
      setHybridSyncTransport(DB_SETTINGS.hybridSyncTransport ?? 'both');
      setDbConfig({
        host: LOCAL_CONFIG.host,
        port: LOCAL_CONFIG.port,
        database: LOCAL_CONFIG.database,
        user: LOCAL_CONFIG.user,
        password: LOCAL_CONFIG.password
      });
      setRemoteDbConfig({
        host: REMOTE_CONFIG.host,
        port: REMOTE_CONFIG.port,
        database: REMOTE_CONFIG.database,
        user: REMOTE_CONFIG.user,
        password: REMOTE_CONFIG.password,
      });
      setDbTestFeedback(null);
      const postgrestStepIdx = dbSettingsWizardSteps.findIndex((s) => s.id === 'postgrest');
      const openOnRest =
        !isTauri &&
        isCapacitorNative() &&
        !restLoaded.trim() &&
        postgrestStepIdx >= 0;
      setDbSettingsStep(openOnRest ? postgrestStepIdx : 0);
    });
  }, [showDbSettings]);

  useEffect(() => {
    setDbSettingsStep((prev) => Math.min(prev, Math.max(0, dbSettingsWizardSteps.length - 1)));
  }, [dbSettingsWizardSteps.length]);

  useEffect(() => {
    if (selectedFirmNr) {
      loadStores(selectedFirmNr);
      localStorage.setItem('exretail_selected_firma_id', selectedFirmNr);
    }
  }, [selectedFirmNr]);

  const loadFirms = async () => {
    try {
      if (!isTauri && isProduction && !isTenantResolvedForWeb()) {
        setFirms([]);
        return;
      }
      setLoadingFirms(true);
      const { DB_SETTINGS } = await import('../../services/postgres');

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        try {
          const { postgrest } = await import('../../services/api/postgrestClient');
          const rows = await postgrest.get(
            '/firms',
            { select: '*', order: 'firm_nr.asc' },
            { schema: 'public' }
          );
          const safeRows: any[] = Array.isArray(rows) ? rows : [];
          setFirms(safeRows);
          if (safeRows.length > 0) {
            const lastFirm = localStorage.getItem('exretail_selected_firma_id');
            const next = (lastFirm && safeRows.find(f => f.firm_nr === lastFirm)) ? lastFirm : safeRows[0].firm_nr;
            if (next) setSelectedFirmNr(next);
          }
          return;
        } catch (restErr: any) {
          console.warn('[Login] PostgREST /firms failed, fallback to SQL:', restErr?.message || restErr);
          // Bazı tenant DB'lerinde public.firms yerine prefixli firm tabloları kullanılıyor.
          // Bu durumda postgres.query SQL rewrite ile doğru tabloya yönlendirir.
          const { postgres } = await import('../../services/postgres');
          const result = await postgres.query(`SELECT * FROM firms ORDER BY firm_nr ASC`, []);
          const rows = result.rows || [];
          setFirms(rows as any[]);
          if (rows.length > 0) {
            const lastFirm = localStorage.getItem('exretail_selected_firma_id');
            if (lastFirm && (rows as any[]).find((f: any) => f.firm_nr === lastFirm)) {
              setSelectedFirmNr(lastFirm);
            } else {
              setSelectedFirmNr((rows as any[])[0].firm_nr);
            }
          }
          return;
        }
      }

      const { postgres } = await import('../../services/postgres');
      const result = await postgres.query(`SELECT * FROM firms ORDER BY firm_nr ASC`, []);
      const rows = result.rows || [];
      setFirms(rows);
      
      if (rows.length > 0) {
        const lastFirm = localStorage.getItem('exretail_selected_firma_id');
        if (lastFirm && rows.find(f => f.firm_nr === lastFirm)) {
          setSelectedFirmNr(lastFirm);
        } else {
          setSelectedFirmNr(rows[0].firm_nr);
        }
      }
    } catch (error) {
      console.error('Firms load error:', error);
    } finally {
      setLoadingFirms(false);
    }
  };

  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const loadUsers = async () => {
    try {
      if (!isTauri && isProduction && !isTenantResolvedForWeb()) {
        setDbUsers([]);
        return;
      }
      const { DB_SETTINGS } = await import('../../services/postgres');
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        try {
          const { postgrest } = await import('../../services/api/postgrestClient');
          const rows = await postgrest.get(
            '/users',
            {
              select: 'username,full_name,role',
              is_active: 'eq.true',
              order: 'full_name.asc',
            },
            { schema: 'public' }
          );
          setDbUsers(
            (Array.isArray(rows) ? rows : []).map((r: any) => ({
              username: r.username,
              fullName: r.full_name,
              role: r.role,
            }))
          );
        } catch {
          // PostgREST tarafında users tablosu/rule erişimi yoksa login autocomplete'i sessizce boş bırak.
          setDbUsers([]);
        }
        return;
      }
      const { postgres } = await import('../../services/postgres');
      // Önce public.users (Kullanıcı Yönetimi) — garson vb. tüm tanımlı kullanıcılar burada
      try {
        const result = await postgres.query(
          `SELECT u.username, u.full_name AS "fullName", COALESCE(r.name, u.role) AS role
           FROM public.users u
           LEFT JOIN public.roles r ON r.id = u.role_id
           WHERE u.is_active = true
           ORDER BY u.full_name ASC`,
          []
        );
        if (result.rows && result.rows.length > 0) {
          setDbUsers(result.rows);
          return;
        }
      } catch (_) {
        // public.users yoksa veya hata varsa auth.users'a düş
      }
      // Fallback: auth.users (eski / Supabase auth)
      const authResult = await postgres.query(
        `SELECT 
            raw_user_meta_data->>'username' as username, 
            raw_user_meta_data->>'full_name' as "fullName", 
            raw_user_meta_data->>'role' as role 
         FROM auth.users 
         ORDER BY raw_user_meta_data->>'full_name' ASC`,
        []
      );
      setDbUsers(authResult.rows || []);
    } catch (e) {
      console.error('Failed to load users for login:', e);
    }
  };

  /** Gerçek SetupWizard (App.tsx): config.db is_configured=false + App state (reload şart değil) */
  const enterDesktopSetupWizard = async () => {
    if (isEnteringFullSetup) return;
    setIsEnteringFullSetup(true);
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        let current: Record<string, unknown> = {};
        try {
          current = (await invoke('get_app_config')) as Record<string, unknown>;
        } catch {
          current = {};
        }
        await invoke('save_app_config', {
          config: {
            ...current,
            is_configured: false,
          },
        });
        setShowSetupWizard(false);
        toast.success('Kurulum sihirbazı açılıyor...');
        requestOpenSetupWizard();
        setIsEnteringFullSetup(false);
        return;
      }

      try {
        const raw = localStorage.getItem('retailex_web_config');
        const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          'retailex_web_config',
          JSON.stringify({ ...prev, is_configured: false }),
        );
      } catch {
        localStorage.removeItem('retailex_web_config');
      }
      setShowSetupWizard(false);
      setShowDbSettings(true);
      setIsEnteringFullSetup(false);
      toast.message('Veritabanı / PostgREST ayarlarından devam edin');
    } catch (err: any) {
      console.error('enterDesktopSetupWizard failed:', err);
      toast.error('Kurulum sihirbazı açılamadı: ' + (err?.message || String(err)));
      setIsEnteringFullSetup(false);
    }
  };

  const handleSetup = async () => {
    if (!setupFirmId.trim()) {
      toast.error('Lütfen Firma ID giriniz');
      return;
    }

    try {
      setIsSetupLoading(true);

      // 1. Fetch from Supabase using firma_id
      const { data, error } = await supabase
        .from('firmalar')
        .select('*')
        .eq('firma_id', setupFirmId.trim())
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Firma bulunamadı');

      // 2. Fetch current config to preserve other fields
      let currentConfig: any = {};

      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        currentConfig = await invoke('get_app_config');
      } else {
        const saved = localStorage.getItem('retailex_web_config');
        if (saved) currentConfig = JSON.parse(saved);
      }

      // 3. Prepare Updated Config from connection_config
      const conn = data.connection_config || {};
      const updatedConfig = {
        ...currentConfig,
        is_configured: true,
        db_mode: "hybrid",
        remote_db: formatRemotePgEndpoint(
          conn.host || REMOTE_PG_DEFAULTS.host,
          conn.port || REMOTE_PG_DEFAULTS.port,
          conn.database || REMOTE_PG_DEFAULTS.database,
        ),
        pg_remote_user: conn.username || REMOTE_PG_DEFAULTS.user,
        pg_remote_pass: conn.password || REMOTE_PG_DEFAULTS.password,
        erp_firm_nr: data.firma_id,
        terminal_name: data.firma_adi || '',
        // License Info (User Rights & Expiry)
        license_expiry: data.license_expiry || data.lisans_bitis || '2026-12-31',
        max_users: data.max_users || data.kullanici_hakki || 5,
      };

      // 4. Save to Local Backend (Tauri) or LocalStorage (Web)
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_app_config', { config: updatedConfig });
      } else {
        localStorage.setItem('retailex_web_config', JSON.stringify(updatedConfig));
        localStorage.setItem('exretail_firma_donem_configured', 'true');
      }

      // 5. Re-initialize Postgres Service with new config
      const { initializeFromSQLite } = await import('../../services/postgres');
      await initializeFromSQLite();
      const { ensureTenantDatabaseFromRegistry } = await import('../../services/postgres');
      await ensureTenantDatabaseFromRegistry();

      toast.success('Firma yapılandırması başarıyla tamamlandı!');
      setSetupSuccessData(updatedConfig);
      // setShowSetupWizard(false); // Hide the input modal but keep the success view

      // 6. Force reload to apply new settings in some contexts, or just let state handle it
      if (isTauri) {
        setTimeout(() => window.location.reload(), 1500);
      } else {
        // In web, we might not need a full reload if Postgres service is re-initialized
        // But for stability, a quick reload is safer
        setTimeout(() => window.location.reload(), 800);
      }

    } catch (err: any) {
      console.error('Setup failed:', err);
      toast.error('Sıfırlama başarısız: ' + err);
    } finally {
      setIsSetupLoading(false);
    }
  };

  const executeFactoryReset = async (deleteCRetailexFolder: boolean) => {
    try {
      if (isTauri) {
        const { removeRetailexWindowsServicesIfTauri, deleteCRetailexFolderIfTauri } = await import('../../utils/env');
        const svc = await removeRetailexWindowsServicesIfTauri();
        if (!svc.ok) {
          console.warn('[Fabrika sıfırlama] Windows hizmetleri kaldırılamadı:', svc.detail);
        }
        if (deleteCRetailexFolder) {
          const del = await deleteCRetailexFolderIfTauri();
          if (!del.ok) {
            toast.error('C:\\AsinERP silinemedi: ' + (del.detail || ''));
          } else if (del.detail) {
            toast.success(del.detail);
          }
        }
      }
      // 1. Reset Backend Config
      const defaultConfig = {
        is_configured: false,
        db_mode: "hybrid",
        local_db: "localhost:5432/retailex_local",
        remote_db: "127.0.0.1:5432/retailex_local",
        terminal_name: "",
        store_id: "001",
        erp_firm_nr: "001",
        erp_period_nr: "01",
        erp_method: "mssql",
        erp_host: "localhost",
        erp_user: "",
        erp_pass: "",
        erp_db: "LOGO_DB",
        pg_local_user: "postgres",
        pg_local_pass: "Yq7xwQpt6c",
        pg_remote_user: "postgres",
        pg_remote_pass: "Yq7xwQpt6c",
        system_type: "retail",
        selected_firms: ["001"],
        central_api_url: "https://api.retailex.com/sync",
        central_ws_url: "wss://api.retailex.com/ws",
        role: "terminal",
        device_id: "",
        backup_config: {
          enabled: false,
          daily_backup: false,
          hourly_backup: false,
          periodic_min: 0,
          backup_path: "C:\\AsinERP\\Backups",
          last_run: null
        }
      };

      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_app_config', { config: defaultConfig });
      } else {
        localStorage.setItem('retailex_web_config', JSON.stringify(defaultConfig));
        localStorage.removeItem('exretail_firma_donem_configured');
      }

      // 2. Clear LocalStorage
      localStorage.clear();
      markForceSetupWizard();

      // 3. Reload — App force bayrağı ile SetupWizard
      window.location.reload();
    } catch (err) {
      console.error('Reset failed:', err);
      toast.error('Sıfırlama başarısız: ' + err);
    }
  };

  // handleMigrateUsers removed - public.users is gone.

  /** Kaydetmeden önce: PostgREST URL veya bu modal formundaki PostgreSQL alanları (kayıtlı uzak/online ayrımı yok). */
  const fmtPgTarget = (h: string, p: number, d: string) => `${h}:${p}/${d}`;

  const handleTestPostgrestEndpoint = async () => {
    const { testPostgrestUrl } = await import('../../services/postgres');
    const url = (remoteRestUrl || '').trim() || '(boş URL)';
    setDbTestFeedback({
      phase: 'loading',
      title: 'PostgREST deneniyor…',
      target: url,
    });
    const pr = await testPostgrestUrl(remoteRestUrl);
    if (pr.connected) {
      const normalizedHint =
        pr.baseUrl && pr.baseUrl !== url && url !== '(boş URL)'
          ? `Port otomatik eklendi: ${pr.baseUrl}`
          : undefined;
      const msg = `Erişilebilir (HTTP ${pr.httpStatus ?? '—'})`;
      setDbTestFeedback({
        phase: 'ok',
        title: msg,
        detail: normalizedHint || pr.baseUrl,
        target: pr.baseUrl,
      });
      if (pr.baseUrl && pr.baseUrl !== (remoteRestUrl || '').trim()) {
        setRemoteRestUrl(pr.baseUrl);
      }
      toast.success('PostgREST: ' + msg, { description: normalizedHint || pr.baseUrl });
    } else {
      setDbTestFeedback({
        phase: 'err',
        title: pr.error || 'PostgREST yanıt vermiyor',
        detail: pr.baseUrl && pr.baseUrl !== url ? `Denenen: ${pr.baseUrl}` : undefined,
        target: pr.baseUrl || url,
      });
      toast.error(pr.error || 'PostgREST erişilemiyor', { description: pr.baseUrl, duration: 8000 });
    }
  };

  const handleTestPostgresEndpointCfg = async (
    cfg: { host: string; port: number; database: string; user: string; password: string },
    titlePrefix: string
  ) => {
    const { testPostgresEndpoint } = await import('../../services/postgres');
    const targetStr = fmtPgTarget(cfg.host, cfg.port, cfg.database);
    setDbTestFeedback({
      phase: 'loading',
      title: `${titlePrefix} deneniyor…`,
      target: targetStr,
    });
    const res = await testPostgresEndpoint(cfg);
    if (res.connected) {
      const ver = (res.version || '').slice(0, 200);
      const onlineHint =
        isTauri && dbConnectionMode === 'online'
          ? ' Online modda oturum açıkken sorgular kayıtlı uzak sunucuya gidebilir; bu formu merkez adresiyle doldurup Kaydedin veya Hybrid/Offline kullanın.'
          : '';
      setDbTestFeedback({
        phase: 'ok',
        title: `${titlePrefix}: bağlantı başarılı`,
        detail: ver ? `${ver}${onlineHint}` : onlineHint || undefined,
        target: targetStr,
      });
      toast.success(`${titlePrefix}: bağlantı başarılı.`, { description: ver || targetStr });
    } else {
      setDbTestFeedback({
        phase: 'err',
        title: res.error || 'Bağlantı kurulamadı',
        detail:
          isTauri && dbConnectionMode === 'online'
            ? 'Online modda giriş sonrası uygulama kayıtlı uzak sunucuyu kullanır; uzak PG alanını Yönetim → Veritabanı ile eşitleyin veya Hybrid kullanın.'
            : undefined,
        target: targetStr,
      });
      toast.error(res.error || 'Bağlantı kurulamadı', { description: targetStr });
    }
  };

  const handleTestDbConnection = async () => {
    setIsDbTestLoading(true);
    try {
      if (dbConnectionMode === 'hybrid') {
        if (connectionProvider === 'rest_api') {
          await handleTestPostgrestEndpoint();
        } else {
          await handleTestPostgresEndpointCfg(
            {
              host: dbConfig.host,
              port: dbConfig.port,
              database: dbConfig.database,
              user: dbConfig.user,
              password: dbConfig.password,
            },
            'Yerel PostgreSQL'
          );
        }
        return;
      }

      if (connectionProvider === 'rest_api') {
        await handleTestPostgrestEndpoint();
        return;
      }

      await handleTestPostgresEndpointCfg(
        {
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.user,
          password: dbConfig.password,
        },
        'PostgreSQL'
      );
    } catch (e: any) {
      const msg = e?.message || String(e);
      setDbTestFeedback({
        phase: 'err',
        title: 'Test hatası',
        detail: msg,
        target:
          connectionProvider === 'rest_api'
            ? remoteRestUrl
            : fmtPgTarget(dbConfig.host, dbConfig.port, dbConfig.database),
      });
      toast.error('Test başarısız: ' + msg);
    } finally {
      setIsDbTestLoading(false);
    }
  };

  const handleTestRemotePgConnection = async () => {
    setIsDbTestLoading(true);
    try {
      await handleTestPostgresEndpointCfg(
        {
          host: remoteDbConfig.host,
          port: remoteDbConfig.port,
          database: remoteDbConfig.database,
          user: remoteDbConfig.user,
          password: remoteDbConfig.password,
        },
        'Uzak PostgreSQL (LAN)'
      );
    } catch (e: any) {
      const msg = e?.message || String(e);
      setDbTestFeedback({
        phase: 'err',
        title: 'Uzak PG test hatası',
        detail: msg,
        target: fmtPgTarget(remoteDbConfig.host, remoteDbConfig.port, remoteDbConfig.database),
      });
      toast.error('Uzak PG testi: ' + msg);
    } finally {
      setIsDbTestLoading(false);
    }
  };

  const handleTestHybridLocalPg = async () => {
    setIsDbTestLoading(true);
    try {
      await handleTestPostgresEndpointCfg(
        {
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.user,
          password: dbConfig.password,
        },
        'Yerel PostgreSQL'
      );
    } catch (e: any) {
      const msg = e?.message || String(e);
      setDbTestFeedback({
        phase: 'err',
        title: 'Yerel PG test hatası',
        detail: msg,
        target: fmtPgTarget(dbConfig.host, dbConfig.port, dbConfig.database),
      });
      toast.error('Yerel PG testi: ' + msg);
    } finally {
      setIsDbTestLoading(false);
    }
  };

  const handleTestHybridPostgrest = async () => {
    setIsDbTestLoading(true);
    try {
      await handleTestPostgrestEndpoint();
    } catch (e: any) {
      const msg = e?.message || String(e);
      setDbTestFeedback({
        phase: 'err',
        title: 'PostgREST test hatası',
        detail: msg,
        target: remoteRestUrl,
      });
      toast.error('PostgREST testi: ' + msg);
    } finally {
      setIsDbTestLoading(false);
    }
  };

  const handleHybridSyncNow = async () => {
    setIsHybridSyncLoading(true);
    try {
      const { postgres } = await import('../../services/postgres');
      const r = await postgres.sync({
        mode: dbConnectionMode,
        hybridSyncDirection,
      });
      if (!r.success) {
        toast.error(r.message || 'Senkron başlatılamadı.');
        return;
      }
      const detail =
        r.totalSynced != null && r.totalSynced > 0
          ? `Eşlenen kayıt: ${r.totalSynced}`
          : r.direction
            ? `Yön: ${r.direction}`
            : undefined;
      if (r.totalSynced != null && r.totalSynced > 0) {
        toast.success(r.message || 'Senkron tamamlandı.', detail ? { description: detail } : undefined);
      } else {
        toast.info(r.message || 'Bekleyen kayıt yok.', detail ? { description: detail } : undefined);
      }
    } catch (e: any) {
      toast.error('Senkron hatası: ' + (e?.message || String(e)));
    } finally {
      setIsHybridSyncLoading(false);
    }
  };

  const openDbSettingsAtPostgrest = () => {
    setShowDbSettings(true);
    const idx = dbSettingsWizardSteps.findIndex((s) => s.id === 'postgrest');
    setDbSettingsStep(idx >= 0 ? idx : 0);
    applyRemoteRestUrlToTenantInputs(remoteRestUrl);
  };

  const handleSaveDbSettings = async () => {
    try {
      const { updateConfigs, initializeFromSQLite, normalizeStoredRemoteRestUrl } = await import(
        '../../services/postgres'
      );
      const { persistTenantFieldsFromRestUrl } = await import('../../services/merkezTenantRegistry');
      const restUrlToSave = normalizeStoredRemoteRestUrl(remoteRestUrl);
      if (restUrlToSave !== (remoteRestUrl || '').trim()) {
        setRemoteRestUrl(restUrlToSave);
      }
      await updateConfigs({
        local: {
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.user,
          password: dbConfig.password,
          isConfigured: true
        },
        remote: {
          host: remoteDbConfig.host,
          port: remoteDbConfig.port,
          database: remoteDbConfig.database,
          user: remoteDbConfig.user,
          password: remoteDbConfig.password,
        },
        settings: {
          activeMode: 'online',
          connectionProvider: 'rest_api',
          remoteRestUrl: restUrlToSave,
          hybridReadPreference: 'remote_first',
          hybridSyncDirection: 'remote_to_local',
          hybridSyncIntervalSec,
          hybridSyncTransport,
          merkezTenantCode: tenantPostgrestSlug.trim() || undefined,
        }
      });

      const tenantResult = await persistTenantFieldsFromRestUrl(restUrlToSave, {
        forTauri: isTauri,
        preserveDbMode: 'online',
      });
      await initializeFromSQLite();
      const { ensureTenantDatabaseFromRegistry } = await import('../../services/postgres');
      await ensureTenantDatabaseFromRegistry();

      if (tenantResult.applied && tenantResult.tag) {
        toast.success(`Kiracı bağlantısı uygulandı: ${tenantResult.tag}`);
      } else {
        toast.success(
          connectionProvider === 'rest_api'
            ? 'PostgREST bağlantı ayarları güncellendi.'
            : 'Veritabanı bağlantı ayarları güncellendi.',
        );
      }
      setShowDbSettings(false);
      void loadFirms();
      void loadUsers();
    } catch (err) {
      toast.error('Ayarlar kaydedilemedi: ' + err);
    }
  };

  const loadStores = async (firmNr: string) => {
    try {
      setLoadingStores(true);
      const { DB_SETTINGS } = await import('../../services/postgres');

      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('../../services/api/postgrestClient');
        const rows = await postgrest.get(
          '/stores',
          {
            select: '*',
            firm_nr: `eq.${firmNr}`,
            is_active: 'eq.true',
            order: 'name.asc'
          },
          { schema: 'public' }
        );
        const safeRows: any[] = Array.isArray(rows) ? rows : [];
        setStores(safeRows);
        if (safeRows.length > 0) {
          setStore(safeRows[0].name);
          setSelectedStoreId(String(safeRows[0].id ?? ''));
        }
        return;
      }

      const { postgres } = await import('../../services/postgres');
      const { rows } = await postgres.query(
        `SELECT * FROM stores WHERE firm_nr = $1 AND is_active = true ORDER BY name ASC`,
        [firmNr]
      );
      setStores(rows);
      if (rows.length > 0) {
        setStore(rows[0].name);
        setSelectedStoreId(String(rows[0].id ?? ''));
      }
    } catch (e) {
      console.error('Store loading error:', e);
    } finally {
      setLoadingStores(false);
    }
  };

  const verifyCredentials = async (): Promise<boolean> => {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    if (trimmedPassword === INFRA_PASS || trimmedPassword === IT_PASS) return true;

    try {
      const { checkLoginPassword, verifyLoginUser, resolveAccessibleFirmNrs, normalizeLoginFirmNr, getLastPostgrestLoginError } =
        await import('../../services/loginVerify');
      const { DB_SETTINGS, normalizeStoredRemoteRestUrl, updateConfigs } = await import('../../services/postgres');
      // Eski / boş tarayıcı kaydı: offline+db → PostgREST SaaS (retailex_demo)
      if (!isTauri) {
        const { DEFAULT_REMOTE_REST_URL } = await import('../../core/remotePgDefaults');
        let rest = String(DB_SETTINGS.remoteRestUrl || '').trim();
        if (rest) {
          const fixed = normalizeStoredRemoteRestUrl(rest);
          if (fixed) rest = fixed;
        } else {
          rest = normalizeStoredRemoteRestUrl(DEFAULT_REMOTE_REST_URL);
        }
        DB_SETTINGS.remoteRestUrl = rest;
        DB_SETTINGS.connectionProvider = 'rest_api';
        if (DB_SETTINGS.activeMode === 'offline') {
          DB_SETTINGS.activeMode = 'online';
        }
        try {
          await updateConfigs({
            settings: {
              activeMode: 'online',
              connectionProvider: 'rest_api',
              remoteRestUrl: rest,
            },
          });
        } catch {
          /* oturum öncesi persist başarısız olsa da bellek ayarı yeterli */
        }
      }

      const ok = await checkLoginPassword(trimmedUsername, trimmedPassword);
      if (!ok) {
        const restErr = getLastPostgrestLoginError();
        console.warn('Login: No matching user or wrong password for', trimmedUsername, {
          restUrl: DB_SETTINGS.remoteRestUrl,
          provider: DB_SETTINGS.connectionProvider,
          mode: DB_SETTINGS.activeMode,
          restErr,
        });
        if (restErr && /404|not_found|Failed to fetch|NetworkError|ECONNREFUSED/i.test(restErr)) {
          setError(
            `PostgREST bağlantısı başarısız (${DB_SETTINGS.remoteRestUrl || 'URL yok'}). Dişliden kiracı: retailex_demo`,
          );
          return false;
        }
        setError(t.invalidCredentials);
        return false;
      }

      // Kullanıcının erişebildiği firmaları otomatik seç / filtrele (eski 002 seçimi vb.)
      const row = await verifyLoginUser(trimmedUsername, trimmedPassword, '');
      if (row) {
        const accessible = resolveAccessibleFirmNrs(row);
        const preferred =
          accessible[0] || normalizeLoginFirmNr(row.firm_nr);
        if (preferred) {
          setSelectedFirmNr(preferred);
          localStorage.setItem('exretail_selected_firma_id', preferred);
        }
      }
      return true;
    } catch (e) {
      console.error('Verify error:', e);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDeviceGateStatus(null);

    if (loginStep === 'tenant') {
      const slug = tenantPostgrestSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!slug) {
        setError('Kiracı kodu zorunludur (örn. firma kodunuz).');
        return;
      }
      setIsLoading(true);
      try {
        setTenantPostgrestEntryMode('retailex_cloud');
        setTenantPostgrestSlug(slug);
        const restUrl = buildSaaSTenantPostgrestUrl(slug);
        setRemoteRestUrl(restUrl);
        setConnectionProvider('rest_api');
        setDbConnectionMode('online');
        const { persistTenantFieldsFromRestUrl } = await import('../../services/merkezTenantRegistry');
        const { updateConfigs } = await import('../../services/postgres');
        await updateConfigs({
          settings: {
            activeMode: 'online',
            connectionProvider: 'rest_api',
            remoteRestUrl: restUrl,
            merkezTenantCode: slug,
          },
        });
        const tenantResult = await persistTenantFieldsFromRestUrl(restUrl, {
          forTauri: isTauri,
          preserveDbMode: 'online',
        });
        if (tenantResult?.tag) {
          toast.success(`Kiracı bağlandı: ${tenantResult.tag}`);
        } else {
          toast.success(`Kiracı: ${slug}`);
        }
        setLoginStep('credentials');
        void loadFirms();
        void loadUsers();
      } catch (err: any) {
        setError(err?.message || 'Kiracı bağlantısı kurulamadı. Kodu kontrol edin.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername || !trimmedPassword) {
      setError(t.enterUsernamePassword);
      return;
    }

    if (trimmedPassword === INFRA_PASS) {
      navigate('/infra-settings', { state: { role: 'admin' } });
      return;
    }
    if (trimmedPassword === IT_PASS) {
      navigate('/infra-settings', { state: { role: 'it' } });
      return;
    }

    if (!isTenantResolvedForWeb() && !tenantPostgrestSlug.trim()) {
      setError('Önce kiracı kodunu girin.');
      setLoginStep('tenant');
      return;
    }

    if (loginStep === 'credentials') {
      setIsLoading(true);
      const isValid = await verifyCredentials();
      setIsLoading(false);
      if (isValid) {
        setLoginStep('organization');
      }
      // Hata metni verifyCredentials içinde set edildi (şifre veya PostgREST)
    } else {
      setIsLoading(true);
      try {
        if (isTauri) {
          const { assertDesktopTerminalApproved } = await import('../../services/deviceRegistrationService');
          const gate = await assertDesktopTerminalApproved();
          if (!gate.allowed) {
            setError(gate.message);
            setDeviceGateStatus(gate.status);
            setIsLoading(false);
            return;
          }
          setDeviceGateStatus(null);
        }

        // Update global ERP settings with selected firm before final login
        const { updateConfigs, ERP_SETTINGS, DB_SETTINGS } = await import('../../services/postgres');
        const { normalizeLoginFirmNr } = await import('../../services/loginVerify');
        const firmForLogin = normalizeLoginFirmNr(selectedFirmNr || ERP_SETTINGS.firmNr) || '001';
        await updateConfigs({
          erp: {
            firmNr: firmForLogin,
            periodNr: '01',
          },
          storeId: selectedStoreId || undefined,
        });

        const success = await authLogin(trimmedUsername, trimmedPassword);
        if (success) {
          if (selectedStoreId) {
            const { applyTerminalRuntimeFromAuth } = await import('../../services/terminalRuntimeService');
            applyTerminalRuntimeFromAuth({ store_id: selectedStoreId });
          }
          if (DB_SETTINGS.activeMode === 'hybrid' || DB_SETTINGS.activeMode === 'online' || DB_SETTINGS.activeMode === 'offline') {
            const { provisionFirmEverywhere } = await import('../../services/firmProvisionService');
            void provisionFirmEverywhere({
              firmNr: selectedFirmNr || ERP_SETTINGS.firmNr,
              periodNr: '01',
            }).catch(() => {});
          }
          if (rememberMe) {
            localStorage.setItem('retailos_user', JSON.stringify({ username: trimmedUsername }));
          }
          // Explicitly navigate to home to break the loop
          navigate('/');
        } else {
          setError(t.loginFailed);
        }
      } catch (err) {
        setError(t.networkError);
      } finally {
        setIsLoading(false);
      }
    }
  };


  const zoomLevel = parseInt(localStorage.getItem('retailos_zoom_level') || '100');

  const selectRetailExCloudPostgrestMode = () => {
    setTenantPostgrestEntryMode('retailex_cloud');
    const p = parseSaaSOrCustomPostgrestUrl(remoteRestUrl);
    if (p.kind === 'saas_single_slug') {
      setTenantPostgrestSlug(p.slug);
      setRemoteRestUrl(buildSaaSTenantPostgrestUrl(p.slug));
    } else {
      setTenantPostgrestSlug('');
      setRemoteRestUrl(buildSaaSTenantPostgrestUrl(''));
    }
  };

  const renderTenantPostgrestUrlFields = (variant: 'hybrid' | 'rest_api') => {
    const fullInputCls =
      variant === 'hybrid'
        ? `w-full rounded-lg border px-4 py-3 text-xs font-bold transition-all focus:border-[var(--asin-accent,#1FA8A0)] focus:outline-none focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)]/30 ${
            darkMode ? 'border-[var(--asin-border,#2A3A48)] bg-[var(--asin-surface-raised,#15202B)] text-teal-100' : 'border-[var(--asin-border,#D8DEE5)] bg-white text-[var(--asin-text,#12202B)]'
          }`
        : `w-full rounded-lg border px-4 py-3 text-xs font-bold transition-all focus:border-[var(--asin-accent,#1FA8A0)] focus:outline-none focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)]/30 ${
            darkMode ? 'border-[var(--asin-border,#2A3A48)] bg-[var(--asin-surface-raised,#15202B)] text-teal-100' : 'border-[var(--asin-border,#D8DEE5)] bg-white text-[var(--asin-text,#12202B)]'
          }`;
    const flexInputCls =
      variant === 'hybrid'
        ? `min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-xs font-bold focus:outline-none focus:ring-0 ${
            darkMode ? 'text-teal-100 placeholder:text-teal-500/40' : 'text-[var(--asin-text,#12202B)] placeholder:text-[var(--asin-text-muted,#5A6B78)]'
          }`
        : `min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-xs font-bold focus:outline-none focus:ring-0 ${
            darkMode ? 'text-teal-100 placeholder:text-teal-500/40' : 'text-[var(--asin-text,#12202B)] placeholder:text-[var(--asin-text-muted,#5A6B78)]'
          }`;
    const wrapCls = `flex w-full overflow-hidden rounded-lg border transition-all focus-within:border-[var(--asin-accent,#1FA8A0)] focus-within:ring-2 focus-within:ring-[var(--asin-accent,#1FA8A0)]/30 ${
      darkMode ? 'border-[var(--asin-border,#2A3A48)]' : 'border-[var(--asin-border,#D8DEE5)]'
    }`;
    const prefixCls = darkMode
      ? 'flex shrink-0 items-center border-r border-[var(--asin-border,#2A3A48)] bg-[var(--asin-primary,#0E2433)] px-2 py-3 font-mono text-[10px] font-bold text-slate-400'
      : 'flex shrink-0 items-center border-r border-[var(--asin-border,#D8DEE5)] bg-[var(--asin-surface,#F3F5F7)] px-2 py-3 font-mono text-[10px] font-bold text-[var(--asin-text-muted,#5A6B78)]';
    const onCls = darkMode
      ? 'bg-[var(--asin-accent,#1FA8A0)] text-white'
      : 'bg-[var(--asin-accent,#1FA8A0)] text-white';
    const offCls = darkMode
      ? 'bg-white/10 text-slate-300 hover:bg-white/15 hover:text-white'
      : 'bg-[var(--asin-surface,#F3F5F7)] text-[var(--asin-text-muted,#5A6B78)] hover:bg-[var(--asin-accent-muted,#D5F0EE)]';

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectRetailExCloudPostgrestMode}
            className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors ${
              tenantPostgrestEntryMode === 'retailex_cloud' ? onCls : offCls
            }`}
          >
            Asin bulutu
          </button>
          <button
            type="button"
            onClick={() => setTenantPostgrestEntryMode('custom_url')}
            className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors ${
              tenantPostgrestEntryMode === 'custom_url' ? onCls : offCls
            }`}
          >
            Özel tam URL
          </button>
        </div>
        {tenantPostgrestEntryMode === 'retailex_cloud' ? (
          <div className={wrapCls}>
            <span className={prefixCls}>Asin/</span>
            <input
              type="text"
              value={tenantPostgrestSlug}
              onChange={(e) => {
                const raw = e.target.value.trim();
                const slug =
                  raw
                    .replace(/^https?:\/\/api\.retailex\.app\/?/i, '')
                    .split('/')[0]
                    ?.replace(/[/?#].*$/, '') ?? '';
                setTenantPostgrestSlug(slug);
                setRemoteRestUrl(buildSaaSTenantPostgrestUrl(slug));
              }}
              placeholder="kiraci_kodu"
              className={flexInputCls}
              autoComplete="off"
            />
          </div>
        ) : (
          <input
            type="text"
            value={remoteRestUrl}
            onChange={(e) => setRemoteRestUrl(e.target.value)}
            className={fullInputCls}
            placeholder="http://LAN_IP:3002 veya https://baska-sunucu/kiracı"
            autoComplete="off"
          />
        )}
        <p className={`text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-500' : 'text-[var(--asin-text-muted,#5A6B78)]'}`}>
          Asin bulutu: yalnızca kiracı yolunu yazın (kayıtta bulut adresi otomatik birleştirilir). LAN veya başka
          domain için «Özel tam URL».
        </p>
      </div>
    );
  };

  return (
    <div
      className="min-h-screen antialiased"
      style={{ backgroundColor: darkMode ? '#0C141C' : '#F3F5F7' }}
    >
      <div className="asin-login-shell" style={{ zoom: `${zoomLevel}%` }}>
        {/* LEFT — brand */}
        <aside className="asin-login-brand">
          <div className="relative z-10 flex flex-wrap gap-1">
            <button type="button" onClick={toggleDarkMode} className="asin-tool-btn" title={darkMode ? 'Açık Tema' : 'Koyu Tema'}>
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button type="button" title="Kurulum sihirbazı" onClick={() => setShowSetupWizard(true)} className="asin-tool-btn">
              <Wand2 className="w-3.5 h-3.5" />
            </button>
            <button type="button" title="Kiracı / PostgREST" onClick={openDbSettingsAtPostgrest} className="asin-tool-btn">
              <Building2 className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setShowLanguageSelector(true)} className="asin-tool-btn">
              <Languages className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => navigate('/infra-settings')} className="asin-tool-btn">
              <Gear className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setShowDbSettings(true)} className="asin-tool-btn" title="Veritabanı">
              <Database className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setShowLogs(true)} className="asin-tool-btn" title={t.systemLogs}>
              <Terminal className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative z-10 flex flex-1 flex-col items-start justify-center gap-6 py-10 md:py-0">
            <div style={{ color: '#ffffff' }}>
              <NeonLogo variant="full" size="xl" productLine={readNeonProductLineFromStorage()} className="asin-text-white" />
            </div>
            <div className="max-w-sm space-y-3">
              <div style={{ height: 2, width: 48, background: '#1FA8A0', borderRadius: 2 }} />
              <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: 500, lineHeight: 1.4, margin: 0 }}>
                Perakende operasyonları, tek panel.
              </p>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', margin: 0 }}>
                Operasyon platformu
              </p>
            </div>
          </div>

          <p className="relative z-10 hidden md:block" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', margin: 0 }}>
            Asin · v{APP_VERSION.full}
          </p>
        </aside>

        {/* RIGHT — form */}
        <div className="asin-login-form-col">
          <div style={{ width: '100%', maxWidth: 420 }}>
            <div className="asin-login-card">
              <form onSubmit={handleSubmit} style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {loginStep === 'tenant' ? (
                  <>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, gap: 8 }}>
                        <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: darkMode ? '#8A9AA8' : '#5A6B78' }}>
                          Kiracı kodu
                        </label>
                        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#1FA8A0', whiteSpace: 'nowrap' }}>
                          Adım 0 · zorunlu
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'stretch', overflow: 'hidden', borderRadius: 10, border: `1px solid ${darkMode ? '#2A3A48' : '#D8DEE5'}` }}>
                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 9, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: darkMode ? '#8A9AA8' : '#5A6B78', background: darkMode ? '#0C141C' : '#F3F5F7', borderRight: `1px solid ${darkMode ? '#2A3A48' : '#D8DEE5'}`, whiteSpace: 'nowrap' }}>
                          Asin/
                        </span>
                        <input
                          type="text"
                          value={tenantPostgrestSlug}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            const slug =
                              raw
                                .replace(/^https?:\/\/api\.retailex\.app\/?/i, '')
                                .split('/')[0]
                                ?.replace(/[/?#].*$/, '')
                                .toLowerCase()
                                .replace(/[^a-z0-9_-]/g, '') ?? '';
                            setTenantPostgrestSlug(slug);
                            setTenantPostgrestEntryMode('retailex_cloud');
                            setRemoteRestUrl(buildSaaSTenantPostgrestUrl(slug));
                          }}
                          className="asin-login-input"
                          style={{ border: 'none', borderRadius: 0, flex: 1 }}
                          placeholder="ornek_kiraci"
                          autoComplete="organization"
                          autoFocus
                          required
                        />
                      </div>
                      <p style={{ margin: '10px 0 0', fontSize: 11, lineHeight: 1.45, color: darkMode ? '#8A9AA8' : '#5A6B78' }}>
                        Giriş için kiracı kodunuz zorunludur. Yerel veritabanı kullanılmaz; bağlantı bulut PostgREST üzerinden kurulur.
                      </p>
                    </div>
                  </>
                ) : loginStep === 'credentials' ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: darkMode ? '#8A9AA8' : '#5A6B78' }}>
                        Kiracı:{' '}
                        <span style={{ color: '#1FA8A0', fontFamily: 'ui-monospace, monospace' }}>
                          {tenantPostgrestSlug.trim() || '—'}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setLoginStep('tenant')}
                        style={{ background: 'none', border: 'none', color: '#1FA8A0', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer', padding: 0 }}
                      >
                        Değiştir
                      </button>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, gap: 8 }}>
                        <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: darkMode ? '#8A9AA8' : '#5A6B78' }}>
                          {t.username}
                        </label>
                        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#1FA8A0', whiteSpace: 'nowrap' }}>
                          {t.step01Auth}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'stretch' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                          <User className="w-4 h-4" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#1FA8A0', pointerEvents: 'none' }} />
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="asin-login-input"
                            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                            placeholder={t.usernamePlaceholder}
                            required
                          />
                        </div>
                        <button type="button" onClick={() => setShowUserSearch(!showUserSearch)} className="asin-login-side-btn" aria-label="Kullanıcı seç">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                      {showUserSearch && (
                        <div style={{ marginTop: 8, border: `1px solid ${darkMode ? '#2A3A48' : '#D8DEE5'}`, borderRadius: 8, overflow: 'hidden', background: darkMode ? '#15202B' : '#fff', maxHeight: 180, overflowY: 'auto' }}>
                          {dbUsers.map((u) => (
                            <button
                              key={u.username}
                              type="button"
                              onClick={() => { setUsername(u.username); setShowUserSearch(false); }}
                              style={{ width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', borderBottom: `1px solid ${darkMode ? '#2A3A48' : '#F0F2F4'}`, background: 'transparent', cursor: 'pointer', color: darkMode ? '#E8EEF2' : '#12202B' }}
                            >
                              <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>{u.fullName}</p>
                              <p style={{ margin: 0, fontSize: 9, opacity: 0.65, fontWeight: 700, textTransform: 'uppercase' }}>{u.role}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: darkMode ? '#8A9AA8' : '#5A6B78', marginBottom: 8 }}>
                        {t.password}
                      </label>
                      <div style={{ display: 'flex', alignItems: 'stretch' }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                          <Lock className="w-4 h-4" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#1FA8A0', pointerEvents: 'none', zIndex: 1 }} />
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="asin-login-input"
                            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                            placeholder="••••••••"
                            required
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowNumpad(!showNumpad)}
                          className="asin-login-side-btn"
                          style={showNumpad ? { background: '#1FA8A0', color: '#fff', borderColor: '#1FA8A0' } : undefined}
                          aria-label="Tuş takımı"
                        >
                          <Grid3x3 className="w-4 h-4" />
                        </button>
                      </div>
                      {showNumpad && (
                        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 8, border: `1px solid ${darkMode ? '#2A3A48' : '#D8DEE5'}`, borderRadius: 8, background: darkMode ? '#15202B' : '#fff' }}>
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '?'].map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => k === 'C' ? setPassword('') : k === '?' ? setPassword(password.slice(0, -1)) : setPassword(password + k)}
                              style={{ padding: '12px 0', fontSize: 14, fontWeight: 800, border: 'none', borderRadius: 8, cursor: 'pointer', background: darkMode ? '#0C141C' : '#F3F5F7', color: darkMode ? '#fff' : '#12202B' }}
                            >
                              {k}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                      <input type="checkbox" id="rememberMe" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1FA8A0', cursor: 'pointer' }} />
                      <label htmlFor="rememberMe" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5A6B78', cursor: 'pointer', userSelect: 'none' }}>
                        {t.rememberMe}
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="space-y-5">
                    <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 8, background: darkMode ? 'rgba(255,255,255,0.06)' : '#F3F5F7' }}>
                      <button type="button" onClick={() => setActiveOrgTab('firm')} className={activeOrgTab === 'firm' ? 'asin-bg-accent' : ''} style={{ flex: 1, padding: '8px 6px', border: 'none', borderRadius: 8, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', background: activeOrgTab === 'firm' ? '#1FA8A0' : 'transparent', color: activeOrgTab === 'firm' ? '#fff' : '#5A6B78' }}>
                        Firma Seçimi
                      </button>
                      <button type="button" onClick={() => setActiveOrgTab('database')} style={{ flex: 1, padding: '8px 6px', border: 'none', borderRadius: 8, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', background: activeOrgTab === 'database' ? '#1FA8A0' : 'transparent', color: activeOrgTab === 'database' ? '#fff' : '#5A6B78' }}>
                        Veritabanı Bağlantısı
                      </button>
                    </div>

                    {activeOrgTab === 'firm' ? (
                      <div className="space-y-4">
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#5A6B78' }}>{t.firmSelectionScope}</label>
                          <div style={{ position: 'relative', marginTop: 8 }}>
                            <Building2 className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" value={firms.find((f) => f.firm_nr === selectedFirmNr)?.name || t.selectFirmPrompt} readOnly onClick={() => setShowFirmSearch(!showFirmSearch)} className="asin-login-input" style={{ cursor: 'pointer' }} />
                          </div>
                          {showFirmSearch && (
                            <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', border: '1px solid #D8DEE5', borderRadius: 8, background: '#fff' }}>
                              {firms.map((f) => (
                                <button key={f.firm_nr} type="button" onClick={() => { setSelectedFirmNr(f.firm_nr); setShowFirmSearch(false); }} style={{ width: '100%', padding: 12, textAlign: 'left', border: 'none', borderBottom: '1px solid #F0F2F4', background: 'transparent', cursor: 'pointer' }}>
                                  <p style={{ margin: 0, fontSize: 11, fontWeight: 800 }}>{f.name}</p>
                                  <p style={{ margin: 0, fontSize: 8, opacity: 0.6 }}>CODE: {f.firm_nr}</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#5A6B78' }}>{t.storeSelectionScope}</label>
                          <div style={{ position: 'relative', marginTop: 8 }}>
                            <Store className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" value={store} readOnly onClick={() => setShowStoreSearch(!showStoreSearch)} className="asin-login-input" style={{ cursor: 'pointer' }} />
                          </div>
                          {showStoreSearch && (
                            <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', border: '1px solid #D8DEE5', borderRadius: 8, background: '#fff' }}>
                              {stores.map((s) => (
                                <button key={s.id} type="button" onClick={() => { setStore(s.name); setSelectedStoreId(String(s.id ?? '')); setShowStoreSearch(false); }} style={{ width: '100%', padding: 12, textAlign: 'left', border: 'none', borderBottom: '1px solid #F0F2F4', background: 'transparent', cursor: 'pointer' }}>
                                  <p style={{ margin: 0, fontSize: 11, fontWeight: 800 }}>{s.name}</p>
                                  <p style={{ margin: 0, fontSize: 8, opacity: 0.6 }}>REGION: {s.region}</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                        <div className="grid grid-cols-4 gap-2">
                          <div className="col-span-3 space-y-1">
                            <label className="text-[8px] font-black uppercase tracking-widest text-gray-500">Host</label>
                            <input type="text" value={dbConfig.host} onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })} className="w-full px-3 py-2 border rounded-lg font-bold text-[10px] bg-white border-gray-200" />
                          </div>
                          <div className="col-span-1 space-y-1">
                            <label className="text-[8px] font-black uppercase tracking-widest text-gray-500">Port</label>
                            <input type="text" inputMode="numeric" value={Number.isFinite(dbConfig.port) && dbConfig.port > 0 ? String(dbConfig.port) : ''} onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ''); const port = raw ? parseInt(raw, 10) : 5432; setDbConfig({ ...dbConfig, port: Number.isFinite(port) ? port : 5432 }); }} className="w-full px-3 py-2 border rounded-lg font-bold text-[10px] bg-white border-gray-200" />
                          </div>
                        </div>
                        <input type="text" value={dbConfig.database} onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })} placeholder="Veritabanı" className="w-full px-3 py-2 border rounded-lg font-bold text-[10px] bg-white border-gray-200" />
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={dbConfig.user} onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })} placeholder={t.username} className="w-full px-3 py-2 border rounded-lg font-bold text-[10px] bg-white border-gray-200" />
                          <input type="password" value={dbConfig.password} onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })} placeholder={t.password} className="w-full px-3 py-2 border rounded-lg font-bold text-[10px] bg-white border-gray-200" />
                        </div>
                        <button type="button" disabled={isDbTestLoading} onClick={() => void handleTestDbConnection()} className="w-full py-2 rounded-lg border border-gray-300 text-[9px] font-black uppercase">
                          <Activity className={`inline h-3.5 w-3.5 mr-1 ${isDbTestLoading ? 'animate-spin' : ''}`} /> Test et
                        </button>
                        <button type="button" onClick={() => void handleSaveDbSettings()} className="asin-login-cta" style={{ padding: '0.65rem' }}>Kaydet</button>
                      </div>
                    )}

                    <button type="button" onClick={() => setLoginStep('credentials')} style={{ color: '#1FA8A0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
                      <ArrowRight className="w-3 h-3 rotate-180" /> {t.editInfo}
                    </button>
                  </div>
                )}

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'rgba(194,59,59,0.08)', border: '1px solid rgba(194,59,59,0.25)', color: '#C23B3B', borderRadius: 8, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {isTauri && deviceGateStatus && deviceGateStatus !== 'approved' && (
                  <DeviceRegistrationForm
                    darkMode={darkMode}
                    onRegistered={(status) => {
                      if (status === 'approved') {
                        setDeviceGateStatus(null);
                        setError(null);
                        toast.success('Cihaz onaylandı. Giriş yapabilirsiniz.');
                      } else {
                        setDeviceGateStatus(status);
                      }
                    }}
                  />
                )}

                <button type="submit" disabled={isLoading} className="asin-login-cta">
                  {isLoading
                    ? t.verifying
                    : loginStep === 'tenant'
                      ? 'Kiracıya bağlan'
                      : loginStep === 'credentials'
                        ? t.continue
                        : t.systemLogin}
                </button>
              </form>
            </div>

            <div style={{ textAlign: 'center', marginTop: 28, color: darkMode ? 'rgba(255,255,255,0.4)' : '#5A6B78' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', margin: '0 0 6px' }}>Asin v{APP_VERSION.full}</p>
              <p style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', margin: 0, opacity: 0.7 }}>Operasyon platformu © 2026</p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals with RESTORED FLAT CSS */}
      {showLanguageSelector && (
        <LanguageSelectionModal
          onClose={() => setShowLanguageSelector(false)}
          rtlMode={rtlMode}
          setRtlMode={setRtlMode}
        />
      )}


      {/* Kurulum seçimi — asıl adımlar SetupWizard (App); bu modal giriş kapısı */}
      {showSetupWizard && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[5000] p-4 animate-in fade-in duration-200"
          onClick={() => !isSetupLoading && !isEnteringFullSetup && setShowSetupWizard(false)}
        >
          <div
            className={`rounded-[2rem] w-full max-w-md max-h-[90vh] overflow-hidden shadow-xl border flex flex-col animate-in zoom-in-95 duration-200 ${
              darkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200/80'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--asin-primary,#0E2433)] px-8 py-6 text-white shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black uppercase tracking-tight">Kurulum</h2>
                    <p className="text-[var(--asin-accent-muted,#D5F0EE)] text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">Asin</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSetupLoading && !isEnteringFullSetup && setShowSetupWizard(false)}
                  className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  aria-label="Kapat"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {setupSuccessData ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className={`p-5 rounded-2xl border space-y-4 ${darkMode ? 'border-white/10 bg-slate-800/50' : 'border-slate-200 bg-slate-50/50'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${darkMode ? 'bg-blue-950 border-blue-800' : 'bg-blue-100 border-blue-200'}`}>
                        <CheckCircle className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className={`text-base font-bold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>{setupSuccessData.terminal_name || 'Terminal'}</h3>
                        <p className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Lisans bilgisi</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Cihaz / Lisans ID</p>
                        <p className={`text-xs font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`} title={setupSuccessData.device_id || setupSuccessData.terminal_name}>
                          {setupSuccessData.device_id || setupSuccessData.terminal_name || '—'}
                        </p>
                      </div>
                      <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Lisans bitiş</p>
                        <p className={`text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {(() => {
                            const raw = setupSuccessData.license_expiry;
                            if (!raw) return '—';
                            const d = new Date(raw);
                            return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR');
                          })()}
                        </p>
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl border flex items-center gap-3 ${darkMode ? 'bg-emerald-950/40 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>Lisans aktif & güvenli</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-wider shadow-lg shadow-blue-200/50 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                  >
                    Uygulamayı Başlat
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className={`text-[11px] font-semibold leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Yerel PostgreSQL / PostgREST kurulum sihirbazına geçin veya isteğe bağlı olarak buluttan ayar çekin. UUID zorunlu değildir.
                  </p>

                  <button
                    type="button"
                    onClick={() => void enterDesktopSetupWizard()}
                    disabled={isEnteringFullSetup || isSetupLoading}
                    className="w-full py-4 rounded-2xl font-bold uppercase tracking-wider flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200/50"
                  >
                    {isEnteringFullSetup ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Sihirbaz açılıyor...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        Manuel / yerel kurulum sihirbazı
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowSetupWizard(false);
                      setShowDbSettings(true);
                      setDbSettingsStep(0);
                    }}
                    disabled={isEnteringFullSetup || isSetupLoading}
                    className={`w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border-2 transition-all ${
                      darkMode
                        ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Server className="w-4 h-4" />
                    Veritabanı / PostgREST ayarları
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCloudOrgFetch((v) => !v)}
                    className={`w-full text-left text-[10px] font-bold uppercase tracking-wider py-1 ${
                      darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {showCloudOrgFetch ? '▾' : '▸'} İsteğe bağlı: buluttan organizasyon ID ile ayar getir
                  </button>

                  {showCloudOrgFetch && (
                    <div className="space-y-3 pt-1">
                      <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Organizasyon / Firma ID
                      </label>
                      <div className="relative">
                        <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                        <input
                          type="text"
                          value={setupFirmId}
                          onChange={(e) => setSetupFirmId(e.target.value)}
                          disabled={isSetupLoading}
                          placeholder="Örn: 550e8400-e29b-..."
                          className={`w-full pl-12 pr-4 py-3 border rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none font-medium ${
                            darkMode
                              ? 'border-slate-600 bg-slate-800 text-slate-100'
                              : 'border-slate-200 bg-white text-slate-800'
                          }`}
                        />
                      </div>
                      <p className={`text-[10px] font-semibold leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                        Supabase / merkezi kayıt üzerindeki organizasyon ID ile bağlantı ayarlarını çekebilirsiniz (zorunlu değil).
                      </p>

                      <button
                        type="button"
                        onClick={handleSetup}
                        disabled={isSetupLoading || isEnteringFullSetup || !setupFirmId.trim()}
                        className="w-full py-3.5 rounded-2xl font-bold uppercase tracking-wider flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {isSetupLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Kuruluyor...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            Ayarları Getir ve Kur
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className={`mt-6 pt-6 border-t ${darkMode ? 'border-white/10' : 'border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => {
                    setFactoryResetDeleteCRetailex(false);
                    setShowFactoryResetModal(true);
                  }}
                  className={`w-full py-2.5 rounded-2xl border-2 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                    darkMode
                      ? 'border-slate-600 text-slate-300 hover:bg-slate-800 hover:border-red-800 hover:text-red-400'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-red-200 hover:text-red-600'
                  }`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Fabrika ayarlarına döndür
                </button>
              </div>

              {showFactoryResetModal && (
                <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                  <div
                    className={`w-full max-w-md rounded-2xl border p-6 shadow-xl ${darkMode ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="factory-reset-title"
                  >
                    <h3 id="factory-reset-title" className="text-lg font-black mb-2">
                      Fabrika ayarlarına dön
                    </h3>
                    <p className="text-sm leading-relaxed opacity-90 mb-4">
                      Tüm yerel ayarlar silinecek; Windows Asin hizmetleri kaldırılacak; kurulum sihirbazı tekrar açılacak.
                      Veritabanı sunucunuzdaki veriler bu işlemle silinmez.
                    </p>
                    <label className="flex items-start gap-3 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-slate-300"
                        checked={factoryResetDeleteCRetailex}
                        onChange={(e) => setFactoryResetDeleteCRetailex(e.target.checked)}
                      />
                      <span>
                        <span className="font-semibold">C:\AsinERP</span> klasörünü de sil (eski kurulum dosyaları; geri alınamaz)
                      </span>
                    </label>
                    <div className="flex gap-3 mt-6 justify-end">
                      <button
                        type="button"
                        className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold hover:bg-slate-100 dark:hover:bg-white/10"
                        onClick={() => setShowFactoryResetModal(false)}
                      >
                        İptal
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700"
                        onClick={async () => {
                          const delFolder = factoryResetDeleteCRetailex;
                          setShowFactoryResetModal(false);
                          await executeFactoryReset(delFolder);
                        }}
                      >
                        Onayla ve sıfırla
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[10000] p-4 md:p-8 isolate">
          <div className={`w-full max-w-5xl h-[85vh] rounded-[24px] overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)] border-2 ${darkMode ? 'bg-[#0f172a] border-white/20' : 'bg-white border-gray-200'} relative z-[10001]`}>
            {/* Header */}
            <div className={`p-6 border-b border-white/10 flex items-center justify-between ${darkMode ? 'bg-[#1e293b]' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center border border-blue-500/30">
                  <Activity className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className={`text-lg font-black tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t.systemLogsTitle}</h2>
                  <p className="text-[10px] text-blue-400/60 uppercase tracking-[0.2em] font-bold">{t.diagnosticsSubtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Migration button removed */}
                <div className="w-px h-6 bg-white/10 mx-1" />

                <button
                  onClick={() => {
                    if (confirm('Tüm kayıtlar temizlenecek. Emin misiniz?')) logger.clearLogs();
                  }}
                  className="p-2.5 rounded-xl hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-all"
                  title="Temizle"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([logger.exportLogs()], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `retailex_logs_${new Date().getTime()}.json`;
                    a.click();
                  }}
                  className="p-2.5 rounded-xl hover:bg-emerald-500/10 text-emerald-400/60 hover:text-emerald-400 transition-all"
                  title="Dışa Aktar"
                >
                  <Download className="w-5 h-5" />
                </button>
                <div className="w-px h-6 bg-white/10 mx-2" />
                <button
                  onClick={() => setShowLogs(false)}
                  className="p-2.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className={`flex-1 overflow-y-auto p-6 font-mono text-[11px] leading-relaxed custom-scrollbar ${darkMode ? 'bg-[#0b1120]' : 'bg-gray-50'}`}>
              <div className="space-y-1.5">
                {systemLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 opacity-50">
                    <Terminal className="w-12 h-12" />
                    <p className="font-bold tracking-widest text-[10px]">{t.noLogsYet}</p>
                  </div>
                ) : (
                  systemLogs.map((log) => (
                    <div key={log.id} className="group border-b border-white/[0.03] pb-1.5 last:border-0 hover:bg-white/[0.01] transition-colors">
                      <div className="flex gap-3">
                        <span className="text-blue-500/40 font-bold shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className={`shrink-0 px-2 rounded font-black text-[9px] ${log.level === 'ERROR' ? 'bg-red-500/20 text-red-400' :
                          log.level === 'WARN' ? 'bg-orange-500/20 text-orange-400' :
                            log.level === 'SQL' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-emerald-500/20 text-emerald-400'
                          }`}>
                          {log.level}
                        </span>
                        <span className="text-slate-500 font-bold shrink-0 opacity-50">[{log.module}]</span>
                        <span className={`flex-1 break-all ${log.level === 'ERROR' ? 'text-red-300' :
                          log.level === 'WARN' ? 'text-orange-200' :
                            log.level === 'SQL' ? 'text-blue-200/80 italic' :
                              'text-slate-300'
                          }`}>
                          {log.message}
                        </span>
                        {log.duration && (
                          <span className="text-[9px] text-blue-500/40 font-black">{log.duration}ms</span>
                        )}
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-1 ml-16 p-2 rounded bg-black/40 text-[10px] text-slate-400 border border-white/5 overflow-x-auto">
                          <pre>{JSON.stringify(log.details, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={(el) => { if (showLogs) el?.scrollIntoView({ behavior: 'smooth' }) }} />
              </div>
            </div>

            {/* Footer */}
            <div className={`p-4 border-t border-white/10 flex items-center justify-between px-8 ${darkMode ? 'bg-[#1e293b]' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-emerald-500/70">Logger Active</span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{systemLogs.length} {t.totalEntries}</span>
              </div>
              <p className="text-[9px] text-slate-600 font-bold tracking-widest uppercase">Encryption Mode: Local-AES-256 (Diagnostic Only)</p>
            </div>
          </div>
        </div>
      )}
      {/* Veritabanı modalı: body portal + max z-index — giriş kartı/zoom stacking altında kalmaz */}
      {showDbSettings &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 overflow-y-auto overflow-x-hidden animate-in fade-in duration-200 bg-black/80 backdrop-blur-md"
            style={{
              zIndex: 2147483646,
              isolation: 'isolate',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Veritabanı bağlantı ayarları"
            onClick={() => {
              if (!isDbTestLoading && !isHybridSyncLoading) setShowDbSettings(false);
            }}
          >
            <div className="flex min-h-[100dvh] w-full items-center justify-center p-4">
              <div
                className={`relative mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-md min-h-0 flex-col overflow-hidden rounded-[24px] border shadow-2xl animate-in zoom-in-95 duration-200 ${darkMode ? 'border-gray-600 bg-gray-900' : 'border-slate-200 bg-white'}`}
                onClick={(e) => e.stopPropagation()}
              >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-r from-blue-700 to-blue-800 px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex min-w-0 items-center gap-2 text-white sm:gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 sm:h-10 sm:w-10">
                    <Database className="h-5 w-5" />
                  </div>
                  <span className="truncate text-[9px] font-black uppercase tracking-[0.15em] sm:text-[10px] sm:tracking-[0.2em]">
                    Veritabanı bağlantısı
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={isDbTestLoading || isHybridSyncLoading}
                    onClick={() => void handleTestDbConnection()}
                    className="rounded-lg px-2.5 py-2 text-[9px] font-black uppercase tracking-wide text-white/95 ring-1 ring-white/30 transition-colors hover:bg-white/15 disabled:opacity-50"
                  >
                    {isDbTestLoading ? '…' : 'Test'}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl p-2 text-white transition-colors hover:bg-white/10"
                    aria-label="Kapat"
                    onClick={() => setShowDbSettings(false)}
                  >
                    <CloseIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div
                className={`shrink-0 border-b px-4 py-3 sm:px-5 ${darkMode ? 'border-gray-700 bg-gray-900/80' : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label="Bağlantı ayarı adımları">
                  {dbSettingsWizardSteps.map((step, idx) => {
                    const active = idx === dbSettingsStep;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setDbSettingsStep(idx)}
                        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[9px] font-black uppercase tracking-wide transition-colors ${
                          active
                            ? darkMode
                              ? 'bg-blue-600 text-white shadow'
                              : 'bg-blue-600 text-white shadow'
                            : darkMode
                              ? 'bg-gray-800 text-slate-400 hover:text-white'
                              : 'bg-white text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] ${
                            active ? 'bg-white/25' : darkMode ? 'bg-gray-700' : 'bg-slate-200'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="whitespace-nowrap">{step.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className={`mt-2 text-[9px] font-bold ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                  Adım {dbSettingsStep + 1} / {dbSettingsWizardSteps.length}
                  {' — '}
                  {dbSettingsWizardSteps[dbSettingsStep]?.label}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-4 pt-4">
                <div className="space-y-4">
                  {currentDbSettingsStepId === 'mode' && (
                    <>
                  {isTauri && (
                    <div className="space-y-1">
                      <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">
                        Bağlantı modu
                      </label>
                      <select
                        value={dbConnectionMode}
                        onChange={(e) => {
                          const mode = e.target.value as ConnectionMode;
                          setDbConnectionMode(mode);
                          if (mode === 'hybrid') setConnectionProvider('rest_api');
                        }}
                        className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-700 bg-gray-800 text-blue-200' : 'border-gray-200 bg-white text-gray-900'}`}
                      >
                        <option value="online">Online — merkezi (uzak) sunucu</option>
                        <option value="hybrid">Hybrid — yerel/LAN host + senkron</option>
                        <option value="offline">Offline — yalnızca bu ekrandaki host</option>
                      </select>
                      <p className={`px-1 text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                        <strong>Online</strong> seçiliyken SQL, Yönetim → Veritabanı’ndaki <strong>uzak sunucu</strong> bilgisine gider. Uzak şube için genelde <strong>Hybrid</strong> veya <strong>Offline</strong> + aşağıdaki host.
                      </p>
                      {dbConnectionMode === 'online' && connectionProvider === 'db' && (
                        <div
                          className={`rounded-lg border-2 px-3 py-2 text-[9px] font-bold leading-snug ${darkMode ? 'border-amber-500/50 bg-amber-950/40 text-amber-100' : 'border-amber-400 bg-amber-50 text-amber-950'}`}
                        >
                          <strong>Merkeze bağlanmak için:</strong> Aşağıdaki HOST alanı <em>online modda oturum sırasında kullanılmaz</em> (sorgular kayıtlı uzak sunucuya gider).{' '}
                          <strong>Bağlantıyı test et</strong> her zaman <em>bu formdaki</em> adresi dener. Merkez adresini kalıcı yapmak için{' '}
                          <strong>Yönetim → Veritabanı → uzak (Ana sunucu)</strong> satırına yazıp kaydedin veya modu <strong>Hybrid / Offline</strong> yapıp HOST’a merkez sunucu IP’sini girin.
                        </div>
                      )}
                    </div>
                  )}

                  {dbConnectionMode !== 'hybrid' && (
                  <div className="space-y-1">
                    <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">Bağlantı Sağlayıcı</label>
                    <select
                      value={connectionProvider}
                      onChange={(e) => setConnectionProvider(e.target.value as ConnectionProvider)}
                      className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-700 bg-gray-800 text-blue-200' : 'border-gray-200 bg-white text-gray-900'}`}
                    >
                      <option value="db">PostgreSQL (doğrudan)</option>
                      <option value="rest_api">Rest API (PostgREST)</option>
                    </select>
                  </div>
                  )}
                  {dbConnectionMode === 'hybrid' && (
                    <p className={`px-1 text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                      <strong>Hibrit:</strong> Günlük işlemler yerel PostgreSQL&apos;de; merkeze senkron yalnızca <strong>REST API</strong> (PostgREST) ile gider. Uzak PostgreSQL bilgisi gerekmez.
                    </p>
                  )}
                    </>
                  )}

                  {currentDbSettingsStepId === 'local_pg' && (
                    <div
                      className={`space-y-3 rounded-xl border-2 p-4 ${darkMode ? 'border-emerald-800/70 bg-emerald-950/25' : 'border-emerald-300 bg-emerald-50/60'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className={`text-[10px] font-black uppercase tracking-wider ${darkMode ? 'text-emerald-200' : 'text-emerald-900'}`}>
                          Yerel PostgreSQL
                        </h3>
                        <button
                          type="button"
                          disabled={isDbTestLoading || isHybridSyncLoading}
                          onClick={() => void handleTestHybridLocalPg()}
                          className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wide ${darkMode ? 'bg-emerald-900 text-emerald-100 hover:bg-emerald-800' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                        >
                          Yerel PG test
                        </button>
                      </div>
                      <p className={`text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Şube / bu makine: genelde <strong>127.0.0.1</strong> veya yerel PG sunucusu.
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-1">
                          <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">HOST</label>
                          <input
                            type="text"
                            value={dbConfig.host}
                            onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                            placeholder="127.0.0.1"
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-400' : 'border-gray-200 bg-gray-50'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">PORT</label>
                          <input
                            type="number"
                            value={dbConfig.port}
                            onChange={(e) => setDbConfig({ ...dbConfig, port: parseInt(e.target.value, 10) || 5432 })}
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-400' : 'border-gray-200 bg-gray-50'}`}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="px-1 text-[10px] font-black uppercase tracking-widest text-gray-500">VERİTABANI</label>
                        <input
                          type="text"
                          value={dbConfig.database}
                          onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                          className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-400' : 'border-gray-200 bg-gray-50'}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">KULLANICI</label>
                          <input
                            type="text"
                            value={dbConfig.user}
                            onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })}
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-400' : 'border-gray-200 bg-gray-50'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="px-1 text-[10px] font-black uppercase tracking-widest text-gray-500">ŞİFRE</label>
                          <input
                            type="password"
                            value={dbConfig.password}
                            onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                            placeholder="••••••••"
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-400' : 'border-gray-200 bg-gray-50'}`}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {currentDbSettingsStepId === 'remote_pg' && (
                    <div
                      className={`space-y-3 rounded-xl border-2 p-4 ${darkMode ? 'border-sky-800/70 bg-sky-950/25' : 'border-sky-300 bg-sky-50/60'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className={`text-[10px] font-black uppercase tracking-wider ${darkMode ? 'text-sky-200' : 'text-sky-900'}`}>
                          Uzak PostgreSQL
                        </h3>
                        <button
                          type="button"
                          disabled={isDbTestLoading || isHybridSyncLoading}
                          onClick={() => void handleTestRemotePgConnection()}
                          className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wide ${darkMode ? 'bg-sky-900 text-sky-100 hover:bg-sky-800' : 'bg-sky-600 text-white hover:bg-sky-700'}`}
                        >
                          Uzak PG test
                        </button>
                      </div>
                      <p className={`text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Merkez veya ağdaki PostgreSQL sunucusunun <strong>IP adresi</strong> (örn. <strong>192.168.1.80</strong>) ve port <strong>5432</strong>. Hibrit SQL önceliği bu adresi de kullanır.
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-1">
                          <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">HOST (LAN IP)</label>
                          <input
                            type="text"
                            value={remoteDbConfig.host}
                            onChange={(e) => setRemoteDbConfig({ ...remoteDbConfig, host: e.target.value })}
                            placeholder="192.168.x.x veya merkez hostname"
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-sky-300' : 'border-gray-200 bg-white'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">PORT</label>
                          <input
                            type="number"
                            value={remoteDbConfig.port}
                            onChange={(e) => setRemoteDbConfig({ ...remoteDbConfig, port: parseInt(e.target.value, 10) || 5432 })}
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-sky-300' : 'border-gray-200 bg-white'}`}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="px-1 text-[10px] font-black uppercase tracking-widest text-gray-500">VERİTABANI</label>
                        <input
                          type="text"
                          value={remoteDbConfig.database}
                          onChange={(e) => setRemoteDbConfig({ ...remoteDbConfig, database: e.target.value })}
                          className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-sky-300' : 'border-gray-200 bg-white'}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">KULLANICI</label>
                          <input
                            type="text"
                            value={remoteDbConfig.user}
                            onChange={(e) => setRemoteDbConfig({ ...remoteDbConfig, user: e.target.value })}
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-sky-300' : 'border-gray-200 bg-white'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="px-1 text-[10px] font-black uppercase tracking-widest text-gray-500">ŞİFRE</label>
                          <input
                            type="password"
                            value={remoteDbConfig.password}
                            onChange={(e) => setRemoteDbConfig({ ...remoteDbConfig, password: e.target.value })}
                            placeholder="••••••••"
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-sky-300' : 'border-gray-200 bg-white'}`}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {currentDbSettingsStepId === 'postgrest' && (
                    <div
                      className={`space-y-3 rounded-xl border-2 p-4 ${dbConnectionMode === 'hybrid' ? (darkMode ? 'border-violet-800/70 bg-violet-950/25' : 'border-violet-300 bg-violet-50/60') : ''}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className={`text-[10px] font-black uppercase tracking-wider ${darkMode ? 'text-violet-200' : 'text-violet-900'}`}>
                          PostgREST (REST API)
                        </h3>
                        {dbConnectionMode === 'hybrid' && (
                          <button
                            type="button"
                            disabled={isDbTestLoading || isHybridSyncLoading}
                            onClick={() => void handleTestHybridPostgrest()}
                            className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wide ${darkMode ? 'bg-violet-900 text-violet-100 hover:bg-violet-800' : 'bg-violet-600 text-white hover:bg-violet-700'}`}
                          >
                            PostgREST test
                          </button>
                        )}
                      </div>
                      <p className={`text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {tenantPostgrestEntryMode === 'retailex_cloud' ? (
                          <>
                            Asin bulutu: yalnızca kiracı kodunu yazın (ör.{' '}
                            <strong>ozbek</strong>). Bulut adresi kayıtta otomatik birleştirilir
                            . LAN Wi‑Fi / port 3002 bu modda kullanılmaz. Kaydettiğinizde kiracı
                            bağlantısı uygulanır; firma listesi yenilenir.
                          </>
                        ) : (
                          <>
                            Kiracı / merkez REST adresi. Aynı ağda örnek:{' '}
                            <strong>http://192.168.1.10:3002</strong> (port <strong>3002</strong>, 3001
                            değil) veya Asin bulutunda yalnızca kiracı adı. Kaydettiğinizde kiracı
                            bağlantısı otomatik uygulanır; firma listesi yenilenir.
                          </>
                        )}
                      </p>
                      {isCapacitorAndroid() && tenantPostgrestEntryMode === 'custom_url' && (
                        <div
                          className={`rounded-lg border-2 px-3 py-2.5 text-[9px] font-bold leading-relaxed ${
                            darkMode
                              ? 'border-amber-500/50 bg-amber-950/40 text-amber-100'
                              : 'border-amber-400 bg-amber-50 text-amber-950'
                          }`}
                        >
                          <p className="font-black uppercase tracking-wide">Android LAN bağlantısı</p>
                          <ul className="mt-1.5 list-disc space-y-1 pl-4">
                            <li>Telefonu <strong>mobil veri yerine aynı Wi‑Fi</strong> ağına bağlayın.</li>
                            <li>
                              PC adresi olarak <strong>192.168.x.x</strong> kullanın (cmd → ipconfig → Wi‑Fi IPv4).{' '}
                              <strong>172.x.x.x</strong> çoğu zaman WSL sanal ağıdır; telefondan erişilemez.
                            </li>
                            <li>Merkez PC&apos;de <strong>Asin PostgREST</strong> servisi çalışmalı; güvenlik duvarında TCP 3002 açık olmalı.</li>
                          </ul>
                        </div>
                      )}
                      {tenantPostgrestEntryMode === 'retailex_cloud' && (
                        <div
                          className={`rounded-lg border-2 px-3 py-2.5 text-[9px] font-bold leading-relaxed ${
                            darkMode
                              ? 'border-sky-500/40 bg-sky-950/35 text-sky-100'
                              : 'border-sky-300 bg-sky-50 text-sky-950'
                          }`}
                        >
                          <p className="font-black uppercase tracking-wide">Asin bulutu</p>
                          <ul className="mt-1.5 list-disc space-y-1 pl-4">
                            <li>
                              Özbek Restoran kiracı kodu: <strong className="font-mono">ozbek</strong> (
                              <span className="font-mono">berzin_com</span> ayrı bir firmadır).
                            </li>
                            <li>
                              Test 404 / not_found verirse kod yanlış değilse sunucuda{' '}
                              <span className="font-mono">postgrest_ozbek</span> + API gateway yeniden
                              yayınlanmalıdır.
                            </li>
                          </ul>
                        </div>
                      )}
                      {renderTenantPostgrestUrlFields(dbConnectionMode === 'hybrid' ? 'hybrid' : 'rest_api')}
                    </div>
                  )}

                  {currentDbSettingsStepId === 'sync' && (
                    <div
                      className={`space-y-3 rounded-xl border-2 p-4 ${darkMode ? 'border-amber-800/70 bg-amber-950/20' : 'border-amber-300 bg-amber-50/50'}`}
                    >
                      <h3 className={`text-[10px] font-black uppercase tracking-wider ${darkMode ? 'text-amber-200' : 'text-amber-900'}`}>
                        Hibrit senkron
                      </h3>
                      <div className="space-y-1">
                        <label className={`px-1 text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Hibrit — SQL önceliği
                        </label>
                        <select
                          value={hybridReadPreference}
                          onChange={(e) => setHybridReadPreference(e.target.value as HybridReadPreference)}
                          className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-700 bg-gray-800 text-blue-200' : 'border-gray-200 bg-white text-gray-900'}`}
                        >
                          <option value="local_first">Önce yerel PG, bağlantı hatasında uzak</option>
                          <option value="remote_first">Önce uzak PG, bağlantı hatasında yerel</option>
                        </select>
                        <p className={`px-1 text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                          {connectionProvider === 'rest_api'
                            ? 'Yerel satışlar PostgreSQL\'de; merkeze PostgREST ile sync_queue üzerinden gider.'
                            : 'POS yoğun şubede genelde yerel önce; merkez kesintisinde yedek için uzak önce seçilebilir.'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label className={`px-1 text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Hibrit — senkron yönü
                        </label>
                        <select
                          value={hybridSyncDirection}
                          onChange={(e) => setHybridSyncDirection(e.target.value as HybridSyncDirection)}
                          className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-700 bg-gray-800 text-blue-200' : 'border-gray-200 bg-white text-gray-900'}`}
                        >
                          <option value="local_to_remote">Yerel → uzak</option>
                          <option value="remote_to_local">Uzak → yerel</option>
                          <option value="bidirectional">Çift yönlü</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className={`px-1 text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Senkron taşıma modu
                        </label>
                        <select
                          value={hybridSyncTransport}
                          onChange={(e) => setHybridSyncTransport(e.target.value as HybridSyncTransport)}
                          className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-700 bg-gray-800 text-blue-200' : 'border-gray-200 bg-white text-gray-900'}`}
                        >
                          <option value="both">WebSocket + Periyodik (önerilen)</option>
                          <option value="websocket">Yalnız WebSocket</option>
                          <option value="polling">Yalnız Periyodik</option>
                        </select>
                        <p className={`px-1 text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                          Mavi çubuktan da değiştirilebilir. WebSocket için PostgREST URL kiracı kodu içermeli (ör. /lovan).
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label className={`px-1 text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          Otomatik senkron aralığı (saniye)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={3600}
                          step={5}
                          value={hybridSyncIntervalSec}
                          onChange={(e) =>
                            setHybridSyncIntervalSec(
                              Math.min(3600, Math.max(5, parseInt(e.target.value, 10) || 30)),
                            )
                          }
                          className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-700 bg-gray-800 text-blue-200' : 'border-gray-200 bg-white text-gray-900'}`}
                        />
                        <p className={`px-1 text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                          Masaüstünde arka plan servisi bu aralıkla dener (5–3600 sn). Varsayılan: 30.
                        </p>
                      </div>
                      <HybridSyncPanel compact darkMode={darkMode} />
                    </div>
                  )}

                  {currentDbSettingsStepId === 'single_pg' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-1">
                          <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">HOST (Sunucu IP / hostname)</label>
                          <input
                            type="text"
                            value={dbConfig.host}
                            onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                            placeholder="127.0.0.1 veya LAN / internet sunucu IP"
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-400' : 'border-gray-200 bg-gray-50'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">PORT</label>
                          <input
                            type="number"
                            value={dbConfig.port}
                            onChange={(e) => setDbConfig({ ...dbConfig, port: parseInt(e.target.value, 10) || 5432 })}
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-400' : 'border-gray-200 bg-gray-50'}`}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="px-1 text-[10px] font-black uppercase tracking-widest text-gray-500">VERİTABANI</label>
                        <input
                          type="text"
                          value={dbConfig.database}
                          onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                          className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-400' : 'border-gray-200 bg-gray-50'}`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">KULLANICI</label>
                          <input
                            type="text"
                            value={dbConfig.user}
                            onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })}
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-400' : 'border-gray-200 bg-gray-50'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="px-1 text-[10px] font-black uppercase tracking-widest text-gray-500">ŞİFRE</label>
                          <input
                            type="password"
                            value={dbConfig.password}
                            onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                            placeholder="••••••••"
                            className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-400' : 'border-gray-200 bg-gray-50'}`}
                          />
                        </div>
                      </div>
                      <p className={`px-1 text-[9px] font-bold ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                        Uzak sunucu: PostgreSQL’in kurulu olduğu makinenin adresini girin. PG bu bilgisayardaysa 127.0.0.1 kullanın.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`shrink-0 space-y-2 border-t px-4 py-3 sm:px-6 sm:py-4 ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-slate-200 bg-white'}`}
              >
                {dbSettingsStep >= dbSettingsWizardSteps.length - 1 && (
                  <p className={`text-center text-[9px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Son adımdasınız — test başarısız olsa bile alttaki <strong>AYARLARI KAYDET</strong> ile devam edebilirsiniz.
                  </p>
                )}
                {dbTestFeedback && (
                  <div
                    role="status"
                    className={`rounded-lg border-2 px-3 py-2.5 ${dbTestFeedback.phase === 'loading'
                      ? darkMode
                        ? 'border-blue-500/40 bg-blue-950/50 text-blue-100'
                        : 'border-blue-300 bg-blue-50 text-blue-950'
                      : dbTestFeedback.phase === 'ok'
                        ? darkMode
                          ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-100'
                          : 'border-emerald-400 bg-emerald-50 text-emerald-950'
                        : darkMode
                          ? 'border-red-500/50 bg-red-950/40 text-red-100'
                          : 'border-red-300 bg-red-50 text-red-950'}`}
                  >
                    <p className="text-[9px] font-black uppercase tracking-wider opacity-80">Test durumu</p>
                    <p className="mt-1 text-[11px] font-bold leading-snug">{dbTestFeedback.title}</p>
                    <p className={`mt-0.5 font-mono text-[9px] opacity-90 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      Hedef: {dbTestFeedback.target}
                    </p>
                    {dbTestFeedback.detail && (
                      <p className={`mt-1 text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                        {dbTestFeedback.detail}
                      </p>
                    )}
                  </div>
                )}
                {dbSettingsWizardSteps.length > 1 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={dbSettingsStep === 0 || isDbTestLoading || isHybridSyncLoading}
                      onClick={() => setDbSettingsStep((s) => Math.max(0, s - 1))}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 py-2.5 text-[9px] font-black uppercase tracking-wide transition-all disabled:opacity-40 ${darkMode ? 'border-gray-600 text-slate-300 hover:bg-gray-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Geri
                    </button>
                    <button
                      type="button"
                      disabled={
                        dbSettingsStep >= dbSettingsWizardSteps.length - 1 ||
                        isDbTestLoading ||
                        isHybridSyncLoading
                      }
                      onClick={() =>
                        setDbSettingsStep((s) => Math.min(dbSettingsWizardSteps.length - 1, s + 1))
                      }
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 py-2.5 text-[9px] font-black uppercase tracking-wide transition-all disabled:opacity-40 ${darkMode ? 'border-blue-500/50 text-blue-200 hover:bg-blue-950/40' : 'border-blue-400 text-blue-700 hover:bg-blue-50'}`}
                    >
                      İleri
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {/* Her zaman tam genişlik dikey — iki sütun dar ekranda sol düğümü kırpabiliyordu */}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={isDbTestLoading || isHybridSyncLoading}
                    onClick={() => void handleTestDbConnection()}
                    className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 py-3.5 text-[10px] font-black uppercase tracking-[0.12em] transition-all disabled:opacity-50 ${darkMode ? 'border-slate-500 bg-slate-800 text-white hover:bg-slate-700' : 'border-slate-400 bg-slate-100 text-slate-900 hover:bg-slate-200'}`}
                  >
                    <Activity className={`h-4 w-4 shrink-0 ${isDbTestLoading ? 'animate-spin' : ''}`} />
                    Bağlantıyı test et
                  </button>
                  <button
                    type="button"
                    disabled={isDbTestLoading || isHybridSyncLoading}
                    onClick={() => void handleSaveDbSettings()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white transition-all hover:bg-blue-500 disabled:opacity-50"
                  >
                    AYARLARI KAYDET
                  </button>
                </div>
                <p className="text-center text-[8px] font-bold uppercase leading-relaxed tracking-tighter text-gray-500">
                  Test daima bu formdaki PG bilgisini dener. Online modda çalışma zamanı uzak kaydı kullanır — aynı adresi Kaydet veya Yönetim’den eşitleyin.
                </p>
              </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}


