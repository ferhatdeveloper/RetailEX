import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, CheckCircle, Store, MoreHorizontal, Grid3x3, Languages, AlertCircle, Building2, Settings as Gear, Monitor, LifeBuoy, Loader2, ArrowRight, Maximize2, ShieldCheck, X as CloseIcon, Activity, ChevronRight, Terminal, Trash2, Download, Search, RotateCcw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { logger, LogEntry } from '../../services/loggingService';
import type { User as UserType } from '../../core/types';
import { APP_VERSION } from '../../core/version';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { NeonLogo } from '../ui/NeonLogo';

interface LoginProps {
  onLogin: (user: UserType) => void;
}

const INFRA_PASS = "10021993";
const IT_PASS = "30031993";

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<'credentials' | 'organization'>('credentials');
  const [showLogs, setShowLogs] = useState(false);
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);

  const { login: authLogin } = useAuth();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [hwId, setHwId] = useState(t.waiting);
  const [p2pStatus, setP2pStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [vpnIp, setVpnIp] = useState<string>('');

  const [firms, setFirms] = useState<any[]>([]);
  const [selectedFirmNr, setSelectedFirmNr] = useState<string>('');
  const [showFirmSearch, setShowFirmSearch] = useState(false);
  const [loadingFirms, setLoadingFirms] = useState(false);
  const [stores, setStores] = useState<any[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);

  const { darkMode } = useTheme();

  useEffect(() => {
    loadFirms();
    import('@tauri-apps/api/tauri').then(({ invoke }) => {
      invoke('get_system_id').then((id: any) => setHwId(id)).catch(() => setHwId('RE-NODE-001'));
    });

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
  }, []);

  useEffect(() => {
    if (selectedFirmNr) {
      loadStores(selectedFirmNr);
      localStorage.setItem('exretail_selected_firma_id', selectedFirmNr);
    }
  }, [selectedFirmNr]);

  const loadFirms = async () => {
    try {
      setLoadingFirms(true);
      const { invoke } = await import('@tauri-apps/api/tauri');
      const { postgres } = await import('../../services/postgres');
      // Fix: Fetch ALL firms from local DB, as it only contains relevant configured firms
      const { rows } = await postgres.query(
        `SELECT * FROM firms ORDER BY firm_nr ASC`,
        []
      );
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

  const handleFactoryReset = async () => {
    if (!confirm('DİKKAT: Uygulama fabrika ayarlarına döndürülecek!\n\n- Tüm yerel ayarlar silinecek.\n- Setup Sihirbazı tekrar açılacak.\n- Veritabanı verileri KORUNACAK.\n\nOnaylıyor musunuz?')) return;

    try {
      // 1. Reset Backend Config
      const defaultConfig = {
        is_configured: false,
        db_mode: "hybrid",
        local_db: "localhost:5432/retailex_local",
        remote_db: "91.205.41.130:5432/retailos_db",
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
        pg_local_pass: "",
        pg_remote_user: "postgres",
        pg_remote_pass: "",
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

      await invoke('save_app_config', { config: defaultConfig });

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

  const loadStores = async (firmNr: string) => {
    try {
      setLoadingStores(true);
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
      const { postgres } = await import('../../services/postgres');
      const sql = `
        SELECT id, raw_user_meta_data->>'username' as db_username
        FROM auth.users
        WHERE LOWER(raw_user_meta_data->>'username') = LOWER($1)
        AND encrypted_password = crypt($2, encrypted_password)
      `;
      console.log('Login: Verifying credentials for', trimmedUsername);
      const result = await postgres.query(sql, [trimmedUsername, trimmedPassword]);

      if (result.rowCount === 0) {
        console.warn('Login: No matching user found or password incorrect for', trimmedUsername);
        // Debug: Check if user exists at all
        const existCheck = await postgres.query("SELECT count(*) FROM auth.users WHERE LOWER(raw_user_meta_data->>'username') = LOWER($1)", [trimmedUsername]);
        console.log('Login: User exists check count:', existCheck.rows[0]?.count);
      }

      return result.rowCount > 0;
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

  const demoUsers = [
    { username: 'admin', fullName: 'Sistem Yöneticisi', role: 'Yönetici' },
    { username: 'kasiyer', fullName: 'Ahmed Al-Maliki', role: 'Kasiyer' }
  ];

  const zoomLevel = parseInt(localStorage.getItem('retailos_zoom_level') || '100');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center p-4 antialiased">
      <div className="w-full max-w-md" style={{ zoom: `${zoomLevel}%` }}>
        {/* Main Card */}
        <div className={`shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-transparent'} border rounded-sm`}>

          {/* Header Area */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white px-8 py-12 text-center relative overflow-hidden flex flex-col items-center">
            {/* Glossy Overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/10"></div>

            {/* Toolpad */}
            <div className="absolute top-4 right-4 z-20 flex gap-1">
              <button type="button" onClick={() => setShowLanguageSelector(true)} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-sm border border-white/10 transition-all backdrop-blur-md">
                <Languages className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => navigate('/infra-settings')} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-sm border border-white/10 transition-all backdrop-blur-md">
                <Gear className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setShowSupport(true)} className="p-2.5 bg-red-500/20 hover:bg-red-500/30 rounded-sm border border-red-500/10 transition-all backdrop-blur-md">
                <Monitor className="w-3.5 h-3.5" />
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
                <NeonLogo variant="full" size="xl" />

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
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={`w-full pl-12 pr-4 py-4 border-2 focus:outline-none focus:border-blue-600 transition-all rounded-sm font-bold text-sm ${darkMode ? 'bg-gray-900 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                      placeholder={t.usernamePlaceholder}
                      required
                    />
                    <button type="button" onClick={() => setShowUserSearch(!showUserSearch)} className={`px-4 py-4 border-2 border-l-0 transition-colors rounded-sm ${darkMode ? 'bg-gray-700 border-gray-700 text-gray-400 hover:text-white' : 'bg-white border-gray-200 text-gray-400 hover:text-blue-600'}`}>
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                  {showUserSearch && (
                    <div className={`mt-2 border-2 shadow-2xl relative z-50 rounded-sm overflow-hidden ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
                      {demoUsers.map(u => (
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
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full pl-12 pr-4 py-4 border-2 focus:outline-none focus:border-blue-600 transition-all rounded-sm font-bold text-sm ${darkMode ? 'bg-gray-900 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                      placeholder="••••••••"
                      required
                    />
                    <button type="button" onClick={() => setShowNumpad(!showNumpad)} className={`px-4 py-4 border-2 border-l-0 transition-colors rounded-sm ${showNumpad ? 'bg-blue-600 text-white border-blue-600' : darkMode ? 'bg-gray-700 border-gray-700 text-gray-400 hover:text-white' : 'bg-white border-gray-200 text-gray-400 hover:text-blue-600'}`}>
                      <Grid3x3 className="w-4 h-4" />
                    </button>
                  </div>
                  {showNumpad && (
                    <div className={`mt-2 border-2 p-2 grid grid-cols-3 gap-1 shadow-2xl rounded-sm ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => (
                        <button key={k} type="button" onClick={() => k === 'C' ? setPassword('') : k === '⌫' ? setPassword(password.slice(0, -1)) : setPassword(password + k)} className={`py-3.5 text-sm font-black hover:bg-blue-600 hover:text-white transition-all rounded-sm active:scale-95 ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-900'}`}>{k}</button>
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
                      className={`w-full pl-12 pr-4 py-4 border-2 transition-all cursor-pointer font-bold text-xs uppercase tracking-tight rounded-sm ${darkMode ? 'bg-gray-900 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                    />
                  </div>
                  {showStoreSearch && (
                    <div className="mt-1 max-h-40 overflow-y-auto border-2 shadow-2xl z-50 rounded-sm">
                      {stores.map(s => (
                        <button key={s.id} type="button" onClick={() => { setStore(s.name); setShowStoreSearch(false); }} className={`w-full px-4 py-4 text-left border-b last:border-0 hover:bg-blue-600 hover:text-white transition-all ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                          <p className="text-[10px] font-black uppercase tracking-tight">{s.name}</p>
                          <p className="text-[8px] opacity-60 font-bold">REGION: {s.region}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                  <Loader2 className="w-5 h-5 animate-spin" />
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
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6" onClick={() => setShowLanguageSelector(false)}>
          {/* Solid deep backdrop */}
          <div className="absolute inset-0 bg-[#000000] opacity-85" />

          <div
            className="relative w-full max-w-lg bg-[#0c1117] border-2 border-[#30363d] rounded-[24px] shadow-[0_32px_128px_-12px_rgba(0,0,0,1)] overflow-hidden animate-in fade-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Header - Solid Flat */}
            <div className="p-8 bg-[#161b22] border-b border-[#30363d] relative">
              <div className="relative flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">Dil Seçimi</h3>
                  <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.3em] mt-1">Select System Language</p>
                </div>
                <button
                  onClick={() => setShowLanguageSelector(false)}
                  className="p-3 bg-[#21262d] hover:bg-[#30363d] rounded-2xl transition-all text-slate-400 hover:text-white border border-[#30363d]"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Area - Solid Buttons */}
            <div className="p-8 space-y-4 bg-[#0c1117]">
              {[
                { c: 'tr', n: 'Türkçe', d: 'Sistem dili Türkçe olarak ayarlanır', icon: '🇹🇷', color: 'from-rose-500 to-red-600' },
                { c: 'en', n: 'English', d: 'Set system language to English', icon: '🇬🇧', color: 'from-blue-500 to-indigo-600' },
                { c: 'ar', n: 'العربية', d: 'ضبط لغة النظام إلى العربية', icon: '🇸🇦', color: 'from-emerald-500 to-green-600' }
              ].map(l => (
                <button
                  key={l.c}
                  onClick={() => { setLanguage(l.c as any); setShowLanguageSelector(false); }}
                  className={`w-full group relative p-6 flex items-center gap-6 rounded-[20px] border-2 transition-all duration-300 active:scale-[0.98] ${language === l.c
                    ? 'bg-[#1e293b] border-blue-500 shadow-xl'
                    : 'bg-[#161b22] border-[#30363d] hover:border-slate-500'
                    }`}
                >
                  {/* Flag Icon */}
                  <div className={`w-14 h-14 rounded-[14px] bg-gradient-to-br ${l.color} flex items-center justify-center text-3xl shadow-lg ring-4 ring-black/20 group-hover:scale-105 transition-transform duration-300`}>
                    {l.icon}
                  </div>

                  {/* Text Details */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-black tracking-tight ${language === l.c ? 'text-white' : 'text-slate-300'}`}>
                        {l.n}
                      </span>
                      {language === l.c && (
                        <div className="px-2.5 py-1 bg-blue-500/20 rounded-full border border-blue-500/30">
                          <CheckCircle className="w-3 h-3 text-blue-400" />
                        </div>
                      )}
                    </div>
                    <p className={`text-[11px] font-medium leading-normal mt-0.5 ${language === l.c ? 'text-blue-200' : 'text-slate-500'}`}>
                      {l.d}
                    </p>
                  </div>

                  {/* Selection Indicator */}
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${language === l.c ? 'bg-blue-600 border-blue-400 scale-110' : 'bg-[#21262d] border-[#30363d]'
                    }`}>
                    <ChevronRight className={`w-4 h-4 transition-all ${language === l.c ? 'text-white' : 'text-slate-600'}`} />
                  </div>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="p-6 bg-[#161b22] border-t border-[#30363d] flex items-center justify-center">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Select language to continue to login</p>
            </div>
          </div>
        </div>
      )}

      {showSupport && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[300] p-4">
          <div className={`w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-gray-900' : 'bg-white'} border shadow-3xl rounded-sm transition-all`}>
            <div className="p-6 bg-red-800 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-4 text-white">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <LifeBuoy className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t.supportCenter}</span>
              </div>
              <CloseIcon className="w-5 h-5 text-white cursor-pointer hover:rotate-90 transition-transform" onClick={() => setShowSupport(false)} />
            </div>
            <div className="p-10 space-y-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">{t.hwid}</label>
                <div className="flex gap-2">
                  <div className={`flex-1 p-6 font-mono text-2xl font-black border-2 tracking-tighter rounded-sm ${darkMode ? 'bg-black border-gray-800 text-blue-400' : 'bg-gray-50 border-gray-200 text-blue-600'}`}>{hwId}</div>
                  <button onClick={() => { navigator.clipboard.writeText(hwId); toast.success('Kimlik Kopyalandı'); }} className="px-6 bg-blue-600 text-white font-black text-[10px] hover:bg-blue-500 transition-colors uppercase rounded-sm">{t.copy}</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-6 border-2 flex flex-col items-center gap-3 rounded-sm ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 ${p2pStatus === 'connected' ? 'bg-green-500 border-green-200' : 'bg-gray-600 border-gray-500 animate-pulse'}`}>
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-center">
                    <span className="block text-[8px] font-black uppercase tracking-tighter leading-none opacity-50 mb-1">{t.status}</span>
                    <span className="text-[10px] font-black uppercase">{p2pStatus === 'connected' ? t.online : t.waiting}</span>
                  </div>
                </div>
                <button onClick={async () => {
                  try {
                    const { invoke } = await import('@tauri-apps/api/tauri');
                    await invoke('enable_remote_support');
                    toast.success('Hızlı destek isteği merkeze iletildi.');
                  } catch (e) { toast.error('Hata: ' + e); }
                }} className="p-6 bg-blue-700 text-white hover:bg-blue-600 transition-all flex flex-col items-center gap-3 font-black uppercase text-[10px] rounded-sm group">
                  <Monitor className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  <span>{t.startSupport}</span>
                </button>
              </div>
              <p className={`p-4 border-l-4 text-[9px] font-bold uppercase leading-relaxed ${darkMode ? 'bg-gray-800 border-yellow-600/50 text-gray-400' : 'bg-yellow-50 border-yellow-500 text-yellow-800'}`}>
                Dikkat: Uzaktan destek başlatıldığında teknik ekibe sınırlı erişim yetkisi vermiş olursunuz.
              </p>
            </div>
            <button onClick={() => setShowSupport(false)} className="w-full py-5 text-[10px] font-black uppercase text-gray-500 border-t border-gray-800 hover:text-white transition-colors tracking-widest">Pencereyi Kapat</button>
          </div>
        </div>
      )}

      {/* Live Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[999999] p-4 md:p-8 isolate">
          <div className={`w-full max-w-5xl h-[85vh] rounded-[24px] overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)] border-2 ${darkMode ? 'bg-[#0f172a] border-white/20' : 'bg-white border-gray-200'} relative z-[100000]`}>
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
    </div>
  );
}
