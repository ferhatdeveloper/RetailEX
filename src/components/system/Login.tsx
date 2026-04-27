import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Lock, User, CheckCircle, Store, MoreHorizontal, Grid3x3, Languages, AlertCircle, Building2, Settings as Gear, Loader2, ArrowRight, Maximize2, ShieldCheck, Shield, X as CloseIcon, Activity, ChevronRight, Terminal, Trash2, Download, Search, RotateCcw, Database, Save } from 'lucide-react';
import { logger, LogEntry } from '../../services/loggingService';
import type { User as UserType } from '../../core/types';
import { APP_VERSION } from '../../core/version';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { NeonLogo } from '../ui/NeonLogo';
import { readNeonProductLineFromStorage } from '../../utils/neonProductLine';
import { LanguageSelectionModal } from './LanguageSelectionModal';
import type { ConnectionProvider, ConnectionMode } from '../../services/postgres';

interface LoginProps {
  onLogin: (user: UserType) => void;
}

const INFRA_PASS = "10021993";
const IT_PASS = "30031993";

import { supabase } from '../../utils/supabase/client';

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

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
  const [rememberMe, setRememberMe] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [showStoreSearch, setShowStoreSearch] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [setupFirmId, setSetupFirmId] = useState('');
  const [isSetupLoading, setIsSetupLoading] = useState(false);
  const [setupSuccessData, setSetupSuccessData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<'credentials' | 'organization'>('credentials');
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
  const [connectionProvider, setConnectionProvider] = useState<ConnectionProvider>('db');
  const [remoteRestUrl, setRemoteRestUrl] = useState<string>('http://172.20.0.10:3002');
  /** Tauri: online = uzak PG, offline/hybrid = bu formdaki host (yerel veya VPN) */
  const [dbConnectionMode, setDbConnectionMode] = useState<ConnectionMode>('hybrid');
  const [isDbTestLoading, setIsDbTestLoading] = useState(false);
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

  const { login: authLogin } = useAuth();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTenantFirmIdModal, setShowTenantFirmIdModal] = useState(false);
  const [tenantFirmIdDraft, setTenantFirmIdDraft] = useState('');
  const [merkezBaseUrlDraft, setMerkezBaseUrlDraft] = useState('');
  const [isMerkezTenantLoading, setIsMerkezTenantLoading] = useState(false);
  const [rtlMode, setRtlMode] = useState(false);
  const [activeOrgTab, setActiveOrgTab] = useState<'firm' | 'database'>('firm');
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);
  /** Varsayılan kapalı: C:\RetailEX silinsin mi */
  const [factoryResetDeleteCRetailex, setFactoryResetDeleteCRetailex] = useState(false);

  const [firms, setFirms] = useState<any[]>([]);
  const [selectedFirmNr, setSelectedFirmNr] = useState<string>('');
  const [showFirmSearch, setShowFirmSearch] = useState(false);
  const [loadingFirms, setLoadingFirms] = useState(false);
  const [stores, setStores] = useState<any[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);

  const { darkMode } = useTheme();

  const isTenantResolvedForWeb = () => {
    if (typeof window === 'undefined') return true;
    try {
      if (localStorage.getItem('exretail_firma_donem_configured') === 'true') return true;
      const rawCfg = localStorage.getItem('retailex_web_config');
      if (!rawCfg) return false;
      const cfg = JSON.parse(rawCfg) as { merkez_tenant_code?: string; merkez_tenant_id?: string };
      return Boolean(String(cfg.merkez_tenant_code || '').trim() || String(cfg.merkez_tenant_id || '').trim());
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
    const isDesktopApp = isTauri && window.innerWidth >= 1024;

    // Fixed: Web version should NOT show wizard, always login screen
    if (!isConfiguredFromStorage && isDesktopApp) {
      setShowSetupWizard(true);
    }

    // Load DB Settings for the quick modal
    import('../../services/postgres').then(({ LOCAL_CONFIG, DB_SETTINGS }) => {
      setDbConfig({
        host: LOCAL_CONFIG.host,
        port: LOCAL_CONFIG.port,
        database: LOCAL_CONFIG.database,
        user: LOCAL_CONFIG.user,
        password: LOCAL_CONFIG.password
      });
      setConnectionProvider(DB_SETTINGS.connectionProvider);
      setRemoteRestUrl(DB_SETTINGS.remoteRestUrl || 'http://172.20.0.10:3002');
      setDbConnectionMode(DB_SETTINGS.activeMode);
    });
  }, [isTauri]);

  // Modal açılınca güncel modu tekrar oku (Yönetim’den değişmiş olabilir)
  useEffect(() => {
    if (!showDbSettings) return;
    import('../../services/postgres').then(({ LOCAL_CONFIG, DB_SETTINGS }) => {
      setDbConnectionMode(DB_SETTINGS.activeMode);
      setConnectionProvider(DB_SETTINGS.connectionProvider);
      setRemoteRestUrl(DB_SETTINGS.remoteRestUrl || 'http://172.20.0.10:3002');
      setDbConfig({
        host: LOCAL_CONFIG.host,
        port: LOCAL_CONFIG.port,
        database: LOCAL_CONFIG.database,
        user: LOCAL_CONFIG.user,
        password: LOCAL_CONFIG.password
      });
      setDbTestFeedback(null);
    });
  }, [showDbSettings]);

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
        remote_db: `${conn.host || '91.205.41.130'}:${conn.port || 5432}/${conn.database || 'EXFINOPS'}`,
        pg_remote_user: conn.username || 'postgres',
        pg_remote_pass: conn.password || '',
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
            toast.error('C:\\RetailEX silinemedi: ' + (del.detail || ''));
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
        enable_mesh: false,
        device_id: "",
        private_key: "",
        public_key: "",
        vpn_config: null,
        backup_config: {
          enabled: false,
          daily_backup: false,
          hourly_backup: false,
          periodic_min: 0,
          backup_path: "C:\\RetailEx\\Backups",
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

      // 3. Reload
      window.location.reload();
    } catch (err) {
      console.error('Reset failed:', err);
      toast.error('Sıfırlama başarısız: ' + err);
    }
  };

  // handleMigrateUsers removed - public.users is gone.

  /** Kaydetmeden önce: PostgREST URL veya bu modal formundaki PostgreSQL alanları (kayıtlı uzak/online ayrımı yok). */
  const handleTestDbConnection = async () => {
    setIsDbTestLoading(true);
    const { testPostgresEndpoint, testPostgrestUrl } = await import('../../services/postgres');

    const fmtTarget = (h: string, p: number, d: string) => `${h}:${p}/${d}`;

    try {
      if (connectionProvider === 'rest_api') {
        const url = (remoteRestUrl || '').trim() || '(boş URL)';
        setDbTestFeedback({
          phase: 'loading',
          title: 'PostgREST deneniyor…',
          target: url,
        });
        const pr = await testPostgrestUrl(remoteRestUrl);
        if (pr.connected) {
          const msg = `Erişilebilir (HTTP ${pr.httpStatus ?? '—'})`;
          setDbTestFeedback({ phase: 'ok', title: msg, detail: pr.baseUrl, target: pr.baseUrl });
          toast.success('PostgREST: ' + msg, { description: pr.baseUrl });
        } else {
          setDbTestFeedback({
            phase: 'err',
            title: pr.error || 'PostgREST yanıt vermiyor',
            target: pr.baseUrl || url,
          });
          toast.error(pr.error || 'PostgREST erişilemiyor', { description: pr.baseUrl });
        }
        return;
      }

      const cfg = {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
        password: dbConfig.password,
      };

      const targetStr = fmtTarget(cfg.host, cfg.port, cfg.database);
      setDbTestFeedback({
        phase: 'loading',
        title: 'Formdaki sunucu bilgileri deneniyor…',
        target: targetStr,
      });

      const res = await testPostgresEndpoint(cfg);
      if (res.connected) {
        const ver = (res.version || '').slice(0, 200);
        const onlineHint =
          isTauri && dbConnectionMode === 'online'
            ? ' Online modda oturum açıkken sorgular hâlâ Yönetim → Veritabanı’ndaki kayıtlı uzak sunucuya gidebilir; aynı adresi orada da güncelleyin veya Hybrid/Offline kullanın.'
            : '';
        setDbTestFeedback({
          phase: 'ok',
          title: 'Bağlantı başarılı (form adresi)',
          detail: ver ? `${ver}${onlineHint}` : onlineHint || undefined,
          target: targetStr,
        });
        toast.success('PostgreSQL (form): bağlantı başarılı.', {
          description: ver || targetStr,
        });
      } else {
        setDbTestFeedback({
          phase: 'err',
          title: res.error || 'Bağlantı kurulamadı',
          detail:
            isTauri && dbConnectionMode === 'online'
              ? 'Online modda giriş sonrası uygulama kayıtlı uzak sunucuyu kullanır; bu formu merkez adresiyle doldurup Kaydet veya Yönetim’de uzak satırı bu adresle eşitleyin.'
              : undefined,
          target: targetStr,
        });
        toast.error(res.error || 'Bağlantı kurulamadı', { description: targetStr });
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      setDbTestFeedback({
        phase: 'err',
        title: 'Test hatası',
        detail: msg,
        target: connectionProvider === 'rest_api' ? remoteRestUrl : fmtTarget(dbConfig.host, dbConfig.port, dbConfig.database),
      });
      toast.error('Test başarısız: ' + msg);
    } finally {
      setIsDbTestLoading(false);
    }
  };

  const handleSaveDbSettings = async () => {
    try {
      const { updateConfigs } = await import('../../services/postgres');
      await updateConfigs({
        local: {
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.user,
          password: dbConfig.password,
          isConfigured: true
        },
        settings: {
          ...(isTauri ? { activeMode: dbConnectionMode } : {}),
          connectionProvider,
          remoteRestUrl
        }
      });
      toast.success(connectionProvider === 'rest_api' ? 'PostgREST bağlantı ayarları güncellendi.' : 'Veritabanı bağlantı ayarları güncellendi.');
      setShowDbSettings(false);
      // Re-load firms to verify connection
      loadFirms();
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
        if (safeRows.length > 0) setStore(safeRows[0].name);
        return;
      }

      const { postgres } = await import('../../services/postgres');
      const { rows } = await postgres.query(
        `SELECT * FROM stores WHERE firm_nr = $1 AND is_active = true ORDER BY name ASC`,
        [firmNr]
      );
      setStores(rows);
      if (rows.length > 0) setStore(rows[0].name);
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
      const { DB_SETTINGS } = await import('../../services/postgres');
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('../../services/api/postgrestClient');
        const rpcRes: any = await postgrest.post(
          '/rpc/verify_login',
          {
            username: trimmedUsername,
            password: trimmedPassword,
            // Credentials aşamasında firmayı henüz bilmiyoruz: tüm firmalarda kabul et.
            firm_nr: ''
          },
          { schema: 'logic' }
        );
        const row = Array.isArray(rpcRes) ? rpcRes[0] : (rpcRes?.[0] ?? rpcRes);
        return !!row;
      }

      const { postgres } = await import('../../services/postgres');
      const sqlAuth = `
        SELECT id, raw_user_meta_data->>'username' as username
        FROM auth.users
        WHERE LOWER(raw_user_meta_data->>'username') = LOWER($1)
        AND encrypted_password = crypt($2, encrypted_password)
      `;
      console.log('Login: Verifying credentials for', trimmedUsername);
      const result = await postgres.query(sqlAuth, [trimmedUsername, trimmedPassword]);
      if (result.rowCount > 0) return true;

      // Kullanıcı Yönetimi (public.users) — liste buradan geliyor, şifre password_hash
      const sqlPublic = `
        SELECT 1 FROM public.users u
        WHERE LOWER(u.username) = LOWER($1) AND u.is_active = true
        AND u.password_hash IS NOT NULL
        AND u.password_hash = crypt($2, u.password_hash)
        LIMIT 1
      `;
      const pub = await postgres.query(sqlPublic, [trimmedUsername, trimmedPassword]);
      if (pub.rowCount > 0) return true;

      console.warn('Login: No matching user or wrong password for', trimmedUsername);
      return false;
    } catch (e) {
      console.error('Verify error:', e);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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

    if (loginStep === 'credentials') {
      setIsLoading(true);
      const isValid = await verifyCredentials();
      setIsLoading(false);
      if (isValid) {
        setLoginStep('organization');
      } else {
        setError(t.invalidCredentials);
      }
    } else {
      setIsLoading(true);
      try {
        // Update global ERP settings with selected firm before final login
        const { updateConfigs, ERP_SETTINGS } = await import('../../services/postgres');
        await updateConfigs({
          erp: {
            firmNr: selectedFirmNr || ERP_SETTINGS.firmNr,
            periodNr: '01' // Default period
          }
        });

        const success = await authLogin(trimmedUsername, trimmedPassword);
        if (success) {
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

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 antialiased transition-colors duration-500 ${darkMode ? 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-blue-950 to-gray-900' : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700'}`}>
      <div className="w-full max-w-md" style={{ zoom: `${zoomLevel}%` }}>
        {/* Main Card */}
        <div className={`shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-transparent'} border rounded-sm`}>

          {/* Header Area */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white px-8 py-12 text-center relative overflow-hidden flex flex-col items-center">
            {/* Glossy Overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/10"></div>

            {/* Toolpad */}
            <div className="absolute top-4 right-4 z-20 flex gap-1">
              <button
                type="button"
                title="Tenant bağlantısı"
                onClick={() => {
                  let fromStorage = localStorage.getItem('exretail_selected_tenant') || '';
                  if (!fromStorage) {
                    try {
                      const rawCfg = localStorage.getItem('retailex_web_config');
                      if (rawCfg) {
                        const cfg = JSON.parse(rawCfg) as { merkez_tenant_code?: string; merkez_tenant_id?: string };
                        fromStorage = String(cfg.merkez_tenant_code || cfg.merkez_tenant_id || '');
                      }
                    } catch {
                      // ignore parse errors
                    }
                  }
                  setTenantFirmIdDraft(fromStorage);
                  setMerkezBaseUrlDraft(localStorage.getItem('merkez_postgrest_base_url') || '');
                  setShowTenantFirmIdModal(true);
                }}
                className="p-2.5 bg-white/10 hover:bg-white/20 rounded-sm border border-white/10 transition-all backdrop-blur-md group"
              >
                <Building2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              </button>
              <button type="button" onClick={() => setShowLanguageSelector(true)} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-sm border border-white/10 transition-all backdrop-blur-md">
                <Languages className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => navigate('/infra-settings')} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-sm border border-white/10 transition-all backdrop-blur-md">
                <Gear className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowDbSettings(true)}
                className="p-2.5 bg-blue-500/20 hover:bg-blue-500/30 rounded-sm border border-blue-500/10 transition-all backdrop-blur-md group"
                title="Dışa Aktar"
              >
                <Database className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              </button>
              <button
                type="button"
                onClick={() => setShowLogs(true)}
                className="p-2.5 bg-blue-500/20 hover:bg-blue-500/30 rounded-sm border border-blue-500/10 transition-all backdrop-blur-md group"
                title={t.systemLogs}
              >
                <Terminal className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
              </button>
            </div>

            {/* Logo Group */}
            <div className="relative z-10 flex flex-col items-center py-10">
              <div className="relative flex flex-col items-center gap-6">
                {/* Unified Neon Logo from SetupWizard */}
                <NeonLogo variant="full" size="xl" productLine={readNeonProductLineFromStorage()} />

                {/* Secondary Accent */}
                <div className="flex items-center gap-4 w-full opacity-80">
                  <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
                  <p className="text-blue-200 text-[10px] font-black uppercase tracking-[0.4em] whitespace-nowrap text-shadow-sm">
                    ERP CORE ENGINE
                  </p>
                  <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-blue-400 to-transparent"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Form Area */}
          <form onSubmit={handleSubmit} className="p-8 md:p-10 space-y-6">

            {loginStep === 'credentials' ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                {/* USERNAME */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end px-1">
                    <label className={`text-[10px] font-black uppercase tracking-[0.2em] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.username}</label>
                    <span className="text-[8px] font-bold text-blue-500 uppercase">{t.step01Auth}</span>
                  </div>
                  <div className="relative flex group">
                    <User className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${darkMode ? 'text-blue-400' : 'text-gray-400 group-focus-within:text-blue-600'}`} />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={`w-full pl-12 pr-4 py-4 border-2 focus:outline-none focus:border-blue-600 transition-all rounded-sm font-bold text-sm ${darkMode ? 'bg-gray-800/50 border-gray-700 text-white placeholder-white/20' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                      placeholder={t.usernamePlaceholder}
                      required
                    />
                    <button type="button" onClick={() => setShowUserSearch(!showUserSearch)} className={`px-4 py-4 border-2 border-l-0 transition-colors rounded-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-400 hover:text-blue-600'}`}>
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                  {showUserSearch && (
                    <div className={`mt-2 border-2 shadow-2xl relative z-50 rounded-sm overflow-hidden ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
                      {dbUsers.map(u => (
                        <button key={u.username} type="button" onClick={() => { setUsername(u.username); setShowUserSearch(false); }} className={`w-full px-4 py-3 text-left border-b last:border-0 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-3`}>
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <User className="w-4 h-4 opacity-50" />
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-tight">{u.fullName}</p>
                            <p className="text-[9px] opacity-70 font-bold uppercase">{u.role}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* PASSWORD */}
                <div className="space-y-2">
                  <label className={`block text-[10px] font-black uppercase tracking-[0.2em] px-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.password}</label>
                  <div className="relative flex group">
                    <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${darkMode ? 'text-blue-400' : 'text-gray-400 group-focus-within:text-blue-600'}`} />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full pl-12 pr-4 py-4 border-2 focus:outline-none focus:border-blue-600 transition-all rounded-sm font-bold text-sm ${darkMode ? 'bg-gray-800/50 border-gray-700 text-white placeholder-white/20' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                      placeholder="••••••••"
                      required
                    />
                    <button type="button" onClick={() => setShowNumpad(!showNumpad)} className={`px-4 py-4 border-2 border-l-0 transition-colors rounded-sm ${showNumpad ? 'bg-blue-600 text-white border-blue-600' : darkMode ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-400 hover:text-blue-600'}`}>
                      <Grid3x3 className="w-4 h-4" />
                    </button>
                  </div>
                  {showNumpad && (
                    <div className={`mt-2 border-2 p-2 grid grid-cols-3 gap-1 shadow-2xl rounded-sm ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '?'].map(k => (
                        <button key={k} type="button" onClick={() => k === 'C' ? setPassword('') : k === '?' ? setPassword(password.slice(0, -1)) : setPassword(password + k)} className={`py-3.5 text-sm font-black hover:bg-blue-600 hover:text-white transition-all rounded-sm active:scale-95 ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-900'}`}>{k}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input type="checkbox" id="rememberMe" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 accent-blue-600 cursor-pointer" />
                  <label htmlFor="rememberMe" className="text-[10px] font-black uppercase tracking-widest text-gray-500 cursor-pointer select-none">{t.rememberMe}</label>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Tab Switcher */}
                <div className="flex p-1 bg-black/10 rounded-sm border border-white/5">
                  <button
                    type="button"
                    onClick={() => setActiveOrgTab('firm')}
                    className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-sm transition-all ${activeOrgTab === 'firm' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                  >
                    Firma Seçimi
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveOrgTab('database')}
                    className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-sm transition-all ${activeOrgTab === 'database' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                  >
                    Veritabanı Bağlantısı
                  </button>
                </div>

                {activeOrgTab === 'firm' ? (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    {/* FIRM SELECTION */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-end px-1">
                        <label className={`text-[10px] font-black uppercase tracking-[0.2em] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.firmSelectionScope}</label>
                        <span className="text-[8px] font-bold text-blue-500 uppercase">{t.step02Scope}</span>
                      </div>
                      <div className="relative flex">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={firms.find(f => f.firm_nr === selectedFirmNr)?.name || t.selectFirmPrompt}
                          readOnly
                          onClick={() => setShowFirmSearch(!showFirmSearch)}
                          className={`w-full pl-12 pr-4 py-4 border-2 transition-all cursor-pointer font-bold text-xs uppercase tracking-tight rounded-sm ${darkMode ? 'bg-gray-900 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                        />
                      </div>
                      {showFirmSearch && (
                        <div className="mt-1 max-h-40 overflow-y-auto border-2 shadow-2xl z-50 rounded-sm">
                          {firms.map(f => (
                            <button key={f.firm_nr} type="button" onClick={() => { setSelectedFirmNr(f.firm_nr); setShowFirmSearch(false); }} className={`w-full px-4 py-4 text-left border-b last:border-0 hover:bg-blue-600 hover:text-white transition-all ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                              <p className="text-[10px] font-black uppercase tracking-tight">{f.name}</p>
                              <p className="text-[8px] opacity-60 font-bold">CODE: {f.firm_nr}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* STORE SELECTION */}
                    <div className="space-y-2">
                      <label className={`block text-[10px] font-black uppercase tracking-[0.2em] px-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.storeSelectionScope}</label>
                      <div className="relative flex">
                        <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={store}
                          readOnly
                          onClick={() => setShowStoreSearch(!showStoreSearch)}
                          className={`w-full pl-12 pr-4 py-4 border-2 transition-all cursor-pointer font-bold text-xs uppercase tracking-tight rounded-sm ${darkMode ? 'bg-gray-800/50 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                        />
                      </div>
                      {showStoreSearch && (
                        <div className="mt-1 max-h-40 overflow-y-auto border-2 shadow-2xl z-50 rounded-sm">
                          {stores.map(s => (
                            <button key={s.id} type="button" onClick={() => { setStore(s.name); setShowStoreSearch(false); }} className={`w-full px-4 py-4 text-left border-b last:border-0 hover:bg-blue-600 hover:text-white transition-all ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                              <p className="text-[10px] font-black uppercase tracking-tight">{s.name}</p>
                              <p className={`text-[8px] font-bold opacity-60 ${darkMode ? 'text-blue-200' : ''}`}>REGION: {s.region}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="space-y-4 p-4 bg-black/5 rounded-sm border border-white/5">
                      <div className="grid grid-cols-4 gap-2">
                        <div className="col-span-3 space-y-1">
                          <label className="text-[8px] font-black uppercase tracking-widest text-gray-500">Host (sunucu / VPN IP)</label>
                          <input
                            type="text"
                            value={dbConfig.host}
                            onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                            placeholder="Örn. 10.x veya 26.x sunucu IP"
                            className={`w-full px-3 py-2 border-2 focus:border-blue-600 rounded-sm font-bold text-[10px] ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                          />
                        </div>
                        <div className="col-span-1 space-y-1">
                          <label className="text-[8px] font-black uppercase tracking-widest text-gray-500">Port</label>
                          <input
                            type="number"
                            value={dbConfig.port}
                            onChange={(e) => setDbConfig({ ...dbConfig, port: parseInt(e.target.value) })}
                            className={`w-full px-3 py-2 border-2 focus:border-blue-600 rounded-sm font-bold text-[10px] ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Veritabanı adı</label>
                        <input
                          type="text"
                          value={dbConfig.database}
                          onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                          className={`w-full px-3 py-2 border-2 focus:border-blue-600 rounded-sm font-bold text-[10px] ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">{t.username}</label>
                          <input
                            type="text"
                            value={dbConfig.user}
                            onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })}
                            className={`w-full px-3 py-2 border-2 focus:border-blue-600 rounded-sm font-bold text-[10px] ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">{t.password}</label>
                          <input
                            type="password"
                            value={dbConfig.password}
                            onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                            className={`w-full px-3 py-2 border-2 focus:border-blue-600 rounded-sm font-bold text-[10px] ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                          />
                        </div>
                      </div>

                      <div className="mt-2 flex flex-col gap-2">
                        <button
                          type="button"
                          disabled={isDbTestLoading}
                          onClick={() => void handleTestDbConnection()}
                          className={`flex w-full items-center justify-center gap-2 rounded-sm border-2 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] transition-all disabled:opacity-50 ${darkMode ? 'border-slate-500 bg-slate-800 text-white hover:bg-slate-700' : 'border-slate-400 bg-slate-100 text-slate-900 hover:bg-slate-200'}`}
                        >
                          <Activity className={`h-3.5 w-3.5 shrink-0 ${isDbTestLoading ? 'animate-spin' : ''}`} /> Bağlantıyı test et
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveDbSettings()}
                          className="flex w-full items-center justify-center gap-2 rounded-sm bg-blue-600 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] text-white transition-all hover:bg-blue-500"
                        >
                          <Save className="h-3.5 w-3.5 shrink-0" /> Kaydet
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <button type="button" onClick={() => setLoginStep('credentials')} className="text-[9px] font-black uppercase text-blue-600 hover:text-blue-500 transition-colors flex items-center gap-1.5 pt-2 group">
                  <ArrowRight className="w-3 h-3 rotate-180 group-hover:-translate-x-1 transition-transform" /> {t.editInfo}
                </button>
              </div>
            )}


            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-600/5 border border-red-600/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-sm animate-in shake-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-5 text-white font-black uppercase tracking-[0.4em] shadow-xl hover:shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-4 rounded-sm ${isLoading ? 'bg-gray-600 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 hover:-translate-y-0.5'}`}
            >
              {isLoading ? (
                <>
                  <NeonLogo variant="badge" size="sm" className="scale-75 origin-center animate-pulse" />
                  {t.verifying}
                </>
              ) : (
                loginStep === 'credentials' ? t.continue : t.systemLogin
              )}
            </button>
          </form>
        </div>

        {/* Branding Footer */}
        <div className="text-center mt-12 space-y-2 opacity-50">
          <div className="flex items-center justify-center gap-4">
            <div className="h-[1px] w-8 bg-white/20"></div>
            <p className="text-white text-[10px] font-black uppercase tracking-[0.5em]">RetailEX v{APP_VERSION.full}</p>
            <div className="h-[1px] w-8 bg-white/20"></div>
          </div>
          <p className="text-white text-[8px] font-bold uppercase tracking-[0.2em] opacity-70">Sistem Mühendisliği & Altyapı Hizmetleri © 2025</p>
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

      {showTenantFirmIdModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowTenantFirmIdModal(false)}
        >
          <div className="flex min-h-[100dvh] min-h-screen w-full items-center justify-center p-4 py-6">
            <div
              className="bg-white rounded-[2rem] w-full max-w-md max-h-[min(90vh,100dvh)] min-h-0 overflow-hidden shadow-xl border border-slate-200/80 flex flex-col animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-black uppercase tracking-tight truncate">Kiracı / firma bağlantısı</h2>
                      <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">Merkez tenant kaydı</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTenantFirmIdModal(false)}
                    className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors shrink-0"
                    aria-label="Kapat"
                  >
                    <CloseIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-8">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Merkez kiracı kodu veya kayıt UUID
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={tenantFirmIdDraft}
                  onChange={(e) => setTenantFirmIdDraft(e.target.value)}
                  placeholder="Örn. aqua_beauty veya tenant_registry.id"
                  className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium"
                />
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 mt-4">
                  Merkez PostgREST adresi (opsiyonel)
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={merkezBaseUrlDraft}
                  onChange={(e) => setMerkezBaseUrlDraft(e.target.value)}
                  placeholder="Örn: https://api.retailex.app/merkez (PostgREST tabanı; /merkez şart)"
                  className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-mono text-xs"
                />
                <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                  <strong className="text-slate-600">Merkezden bağlan:</strong> merkez_db PostgREST üzerinden tenant_registry okunur; hedef kiracının{' '}
                  <code className="text-[10px] bg-slate-100 px-1 rounded">rest_base_url</code> ve bağlantı bilgileri uygulanır.
                </p>
                <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                  Tenant uygulanmadan firma ve kullanıcı listeleri yüklenmez.
                </p>
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-3 shrink-0">
                <button
                  type="button"
                  disabled={isMerkezTenantLoading}
                  onClick={async () => {
                    const raw = tenantFirmIdDraft.trim();
                    if (!raw) {
                      toast.error('Kiracı kodu veya UUID girin.');
                      return;
                    }
                    const merkezUrl = merkezBaseUrlDraft.trim();
                    if (merkezUrl) {
                      const { sanitizeMerkezRestUrlInput } = await import(
                        '../../services/merkezTenantRegistry'
                      );
                      const clean = sanitizeMerkezRestUrlInput(merkezUrl).replace(/\/+$/, '');
                      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && /^http:\/\//i.test(clean)) {
                        toast.error('HTTPS sayfada HTTP merkez adresi kullanılamaz. HTTPS URL girin.');
                        return;
                      }
                      localStorage.setItem('merkez_postgrest_base_url', clean);
                    }
                    setIsMerkezTenantLoading(true);
                    try {
                      const { fetchTenantRegistryRow, tenantRowToAppConfigPatch } = await import(
                        '../../services/merkezTenantRegistry'
                      );
                      const row = await fetchTenantRegistryRow(raw);
                      let preserve = '';
                      let prev: Record<string, unknown> = {};
                      if (isTauri) {
                        const { invoke } = await import('@tauri-apps/api/core');
                        prev = (await invoke('get_app_config')) as Record<string, unknown>;
                        preserve = String(prev.pg_remote_pass ?? '');
                      } else {
                        const s = localStorage.getItem('retailex_web_config');
                        if (s) {
                          try {
                            prev = JSON.parse(s) as Record<string, unknown>;
                            preserve = String(prev.pg_remote_pass ?? '');
                          } catch {
                            prev = {};
                          }
                        }
                      }
                      const patch = tenantRowToAppConfigPatch(row, {
                        preserveDbPassword: preserve,
                        forTauri: isTauri,
                      });
                      const merged = { ...prev, ...patch, is_configured: true, db_mode: 'online' };
                      if (isTauri) {
                        const { invoke } = await import('@tauri-apps/api/core');
                        await invoke('save_app_config', { config: merged });
                      } else {
                        localStorage.setItem('retailex_web_config', JSON.stringify(merged));
                        localStorage.setItem('exretail_firma_donem_configured', 'true');
                      }
                      const { initializeFromSQLite } = await import('../../services/postgres');
                      await initializeFromSQLite(isTauri ? merged : undefined);
                      setConnectionProvider(
                        (merged.connection_provider as ConnectionProvider) || 'rest_api'
                      );
                      setRemoteRestUrl(String(merged.remote_rest_url || ''));
                      setDbConnectionMode('online');
                      localStorage.setItem('exretail_selected_tenant', row.code || row.id);
                      setShowTenantFirmIdModal(false);
                      toast.success(`Kiracı uygulandı: ${row.display_name} (${row.code})`);
                      void loadFirms();
                      void loadUsers();
                    } catch (e: any) {
                      toast.error(e?.message || String(e));
                    } finally {
                      setIsMerkezTenantLoading(false);
                    }
                  }}
                  className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-indigo-200/40 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                >
                  {isMerkezTenantLoading ? 'Merkez sorgulanıyor…' : 'Merkezden bağlan'}
                </button>
                <div className="flex gap-4">
                  <button
                    type="button"
                    disabled={isMerkezTenantLoading}
                    onClick={() => setShowTenantFirmIdModal(false)}
                    className="w-full py-3.5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 active:scale-[0.98]"
                  >
                    İptal
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Setup Wizard Modal — flat modal standard */}
      {showSetupWizard && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[5000] p-4 animate-in fade-in duration-200" onClick={() => !isSetupLoading && setShowSetupWizard(false)}>
          <div
            className="bg-white rounded-[2rem] w-full max-w-md max-h-[90vh] overflow-hidden shadow-xl border border-slate-200/80 flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black uppercase tracking-tight">Kurulum</h2>
                    <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">ERP Core Engine</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSetupLoading && setShowSetupWizard(false)}
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
                  <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center border border-blue-200">
                        <CheckCircle className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold tracking-tight text-slate-900">{setupSuccessData.terminal_name || 'Terminal'}</h3>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">Lisans bilgisi</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-4 rounded-xl bg-white border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cihaz / Lisans ID</p>
                        <p className="text-xs font-medium text-slate-800 truncate" title={setupSuccessData.device_id || setupSuccessData.terminal_name}>
                          {setupSuccessData.device_id || setupSuccessData.terminal_name || '—'}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-white border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Lisans bitiş</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {(() => {
                            const raw = setupSuccessData.license_expiry;
                            if (!raw) return '—';
                            const d = new Date(raw);
                            return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR');
                          })()}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Lisans aktif & güvenli</p>
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
                <div className="space-y-5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Organizasyon / Firma ID</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={setupFirmId}
                      onChange={(e) => setSetupFirmId(e.target.value)}
                      disabled={isSetupLoading}
                      placeholder="Örn: 550e8400-e29b-..."
                      className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none font-medium text-slate-800 bg-white"
                    />
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
                    Supabase üzerindeki organizasyon ID'sini girerek veritabanı ayarlarını otomatik çekebilirsiniz.
                  </p>

                  <button
                    type="button"
                    onClick={handleSetup}
                    disabled={isSetupLoading || !setupFirmId.trim()}
                    className="w-full py-4 rounded-2xl font-bold uppercase tracking-wider flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200/50"
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

              <div className="mt-6 pt-6 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setFactoryResetDeleteCRetailex(false);
                    setShowFactoryResetModal(true);
                  }}
                  className="w-full py-2.5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-100 hover:border-red-200 hover:text-red-600 transition-all flex items-center justify-center gap-2"
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
                      Tüm yerel ayarlar silinecek; Windows RetailEX hizmetleri kaldırılacak; kurulum sihirbazı tekrar açılacak.
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
                        <span className="font-semibold">C:\RetailEX</span> klasörünü de sil (eski kurulum dosyaları; geri alınamaz)
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
              if (!isDbTestLoading) setShowDbSettings(false);
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
                    disabled={isDbTestLoading}
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

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-4 pt-6">
                <div className="space-y-4">
                  {isTauri && (
                    <div className="space-y-1">
                      <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">
                        Bağlantı modu
                      </label>
                      <select
                        value={dbConnectionMode}
                        onChange={(e) => setDbConnectionMode(e.target.value as ConnectionMode)}
                        className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-700 bg-gray-800 text-blue-200' : 'border-gray-200 bg-white text-gray-900'}`}
                      >
                        <option value="online">Online — merkezi (uzak) sunucu</option>
                        <option value="hybrid">Hybrid — yerel/VPN host + senkron</option>
                        <option value="offline">Offline — yalnızca bu ekrandaki host</option>
                      </select>
                      <p className={`px-1 text-[9px] font-bold leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                        <strong>Online</strong> seçiliyken SQL, Yönetim → Veritabanı’ndaki <strong>uzak sunucu</strong> bilgisine gider. VPN’li şube için genelde <strong>Hybrid</strong> veya <strong>Offline</strong> + aşağıdaki host.
                      </p>
                      {dbConnectionMode === 'online' && connectionProvider === 'db' && (
                        <div
                          className={`rounded-lg border-2 px-3 py-2 text-[9px] font-bold leading-snug ${darkMode ? 'border-amber-500/50 bg-amber-950/40 text-amber-100' : 'border-amber-400 bg-amber-50 text-amber-950'}`}
                        >
                          <strong>Merkeze bağlanmak için:</strong> Aşağıdaki HOST alanı <em>online modda oturum sırasında kullanılmaz</em> (sorgular kayıtlı uzak sunucuya gider).{' '}
                          <strong>Bağlantıyı test et</strong> her zaman <em>bu formdaki</em> adresi dener. Merkez adresini kalıcı yapmak için{' '}
                          <strong>Yönetim → Veritabanı → uzak (Ana sunucu)</strong> satırına yazıp kaydedin veya modu <strong>Hybrid / Offline</strong> yapıp HOST’a merkez VPN IP’sini girin.
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">Bağlantı Sağlayıcı</label>
                    <select
                      value={connectionProvider}
                      onChange={(e) => setConnectionProvider(e.target.value as ConnectionProvider)}
                      className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-700 bg-gray-800 text-blue-200' : 'border-gray-200 bg-white text-gray-900'}`}
                    >
                      <option value="db">DB Connection</option>
                      <option value="rest_api">Rest API (PostgREST)</option>
                    </select>
                  </div>

                  {connectionProvider === 'rest_api' ? (
                    <div className="space-y-2">
                      <label className="px-1 text-[10px] font-black uppercase tracking-widest text-gray-500">PostgREST API URL</label>
                      <input
                        type="text"
                        value={remoteRestUrl}
                        onChange={(e) => setRemoteRestUrl(e.target.value)}
                        className={`w-full rounded-sm border-2 px-4 py-3 text-xs font-bold transition-all focus:border-blue-600 focus:outline-none ${darkMode ? 'border-gray-800 bg-black text-blue-200' : 'border-gray-200 bg-white text-gray-900'}`}
                        placeholder="http://IP:3002"
                      />
                      <p className={`text-[9px] font-bold ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                        VPN olmadan IP üzerinden PostgREST erişimi için.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-1">
                          <label className="px-1 text-[9px] font-black uppercase tracking-widest text-gray-500">HOST (Sunucu IP / hostname)</label>
                          <input
                            type="text"
                            value={dbConfig.host}
                            onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                            placeholder="127.0.0.1 veya VPN/LAN sunucu IP"
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
                        VPN veya uzak sunucu: PostgreSQL’in kurulu olduğu makinenin adresini girin. PG bu bilgisayardaysa 127.0.0.1 kullanın.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`shrink-0 space-y-2 border-t px-4 py-3 sm:px-6 sm:py-4 ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-slate-200 bg-white'}`}
              >
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
                {/* Her zaman tam genişlik dikey — iki sütun dar ekranda sol düğümü kırpabiliyordu */}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={isDbTestLoading}
                    onClick={() => void handleTestDbConnection()}
                    className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 py-3.5 text-[10px] font-black uppercase tracking-[0.12em] transition-all disabled:opacity-50 ${darkMode ? 'border-slate-500 bg-slate-800 text-white hover:bg-slate-700' : 'border-slate-400 bg-slate-100 text-slate-900 hover:bg-slate-200'}`}
                  >
                    <Activity className={`h-4 w-4 shrink-0 ${isDbTestLoading ? 'animate-spin' : ''}`} />
                    Bağlantıyı test et
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveDbSettings()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white transition-all hover:bg-blue-500"
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


