import React, { useState } from 'react';
import {
    Database,
    Server,
    Wifi,
    WifiOff,
    RefreshCw,
    Save,
    Play,
    CheckCircle2,
    AlertTriangle,
    Globe,
    HardDrive,
    Layers,
    Activity,
    Smartphone,
    Users,
    Building2,
    Shield,
    UserPlus,
    Key,
    Trash2,
    Edit2,
    Check,
    X,
    Loader2,
    Plus
} from 'lucide-react';
import {
    postgres,
    updateConfigs,
    LOCAL_CONFIG,
    REMOTE_CONFIG,
    DB_SETTINGS,
    testDbConfig,
    ConnectionMode,
    ConnectionProvider,
    testPostgrestUrl
} from '../../services/postgres';
import { organizationAPI } from '../../services/api/organization';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { IS_TAURI } from '../../utils/env';

type TabType = 'database' | 'users' | 'firms';

interface User {
    id: string;
    username: string;
    full_name: string;
    email: string;
    role: string;
    firm_nr: string;
    is_active: boolean;
}

interface Firm {
    id: string;
    firm_nr: string;
    name: string;
    tax_nr: string;
    is_active: boolean;
}

export function DatabaseSettings() {
    const [activeTab, setActiveTab] = useState<TabType>('database');
    const [activeMode, setActiveMode] = useState<ConnectionMode>(DB_SETTINGS.activeMode);
    const [connectionProvider, setConnectionProvider] = useState<ConnectionProvider>(DB_SETTINGS.connectionProvider);
    const [local, setLocal] = useState(LOCAL_CONFIG);
    const [remote, setRemote] = useState(REMOTE_CONFIG);
    const [remoteRestUrl, setRemoteRestUrl] = useState<string>(DB_SETTINGS.remoteRestUrl);
    const [isTesting, setIsTesting] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [testResults, setTestResults] = useState<{
        local?: boolean;
        remote?: boolean;
    }>({});
    const { darkMode } = useTheme();

    // Data Listing States
    const [users, setUsers] = useState<User[]>([]);
    const [firms, setFirms] = useState<Firm[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    // User Management States
    const [showUserForm, setShowUserForm] = useState(false);
    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('cashier');
    const [firmNr, setFirmNr] = useState('001');

    // Firm Management States
    const [showFirmForm, setShowFirmForm] = useState(false);
    const [firmaKodu, setFirmaKodu] = useState('FRM001');
    const [firmaAdi, setFirmaAdi] = useState('');
    const [vergiNo, setVergiNo] = useState('');
    const [loadingFirm, setLoadingFirm] = useState(false);

    /** PostgreSQL `system_settings` — web açılışında tek doğruluk kaynağı */
    const [sysSettings, setSysSettings] = useState({
        default_currency: 'IQD',
        primary_firm_nr: '001',
        primary_period_nr: '01'
    });
    const [loadingSys, setLoadingSys] = useState(false);

    const fetchUsers = async () => {
        setLoadingData(true);
        try {
            const result = await postgres.query<any>('SELECT id, email, raw_user_meta_data, created_at FROM auth.users ORDER BY created_at DESC');
            const mappedUsers: User[] = result.rows.map(row => ({
                id: row.id,
                username: row.raw_user_meta_data?.username || 'unknown',
                full_name: row.raw_user_meta_data?.full_name || '',
                email: row.email || '',
                role: row.raw_user_meta_data?.role || 'cashier',
                firm_nr: row.raw_user_meta_data?.firm_nr || '',
                is_active: true
            }));
            setUsers(mappedUsers);
        } catch (error) {
            console.error(error);
            toast.error('Kullanıcı listesi alınamadı');
        } finally {
            setLoadingData(false);
        }
    };

    const fetchFirms = async () => {
        setLoadingData(true);
        try {
            const result = await postgres.query<Firm>('SELECT id, firm_nr, name, tax_nr, is_active FROM firms');
            setFirms(result.rows);
        } catch (error) {
            console.error(error);
            toast.error('Firma listesi alınamadı');
        } finally {
            setLoadingData(false);
        }
    };

    React.useEffect(() => {
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'firms') fetchFirms();
    }, [activeTab]);

    React.useEffect(() => {
        if (activeTab !== 'database' || connectionProvider !== 'db') return;
        let cancelled = false;
        (async () => {
            setLoadingSys(true);
            try {
                const row = await organizationAPI.getSystemSettings();
                if (cancelled || !row) return;
                setSysSettings({
                    default_currency: row.default_currency,
                    primary_firm_nr: row.primary_firm_nr || '001',
                    primary_period_nr: row.primary_period_nr || '01'
                });
            } catch {
                /* tablo yok veya bağlantı yok */
            } finally {
                if (!cancelled) setLoadingSys(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [activeTab, connectionProvider]);

    const handleSave = () => {
        updateConfigs({
            local,
            remote,
            settings: { activeMode, connectionProvider, remoteRestUrl }
        });
        toast.success('Veritabanı ayarları kaydedildi ve uygulandı.');
        postgres.connect();
    };

    const handleTest = async () => {
        setIsTesting(true);
        const localRes = await testDbConfig(local);
        const remoteRes = connectionProvider === 'rest_api'
            ? await testPostgrestUrl(remoteRestUrl)
            : await testDbConfig(remote);

        setTestResults({
            local: localRes.connected,
            remote: remoteRes.connected
        });

        setIsTesting(false);

        if (localRes.connected && remoteRes.connected) {
            toast.success('Tüm bağlantılar başarılı!');
        } else if (localRes.connected || remoteRes.connected) {
            toast.warning('Bazı bağlantılar kurulamadı.');
        } else {
            toast.error('Hiçbir veritabanına bağlanılamadı.');
        }
    };

    const handleSaveSystemSettings = async () => {
        try {
            setLoadingSys(true);
            await organizationAPI.saveSystemSettings({
                default_currency: sysSettings.default_currency,
                primary_firm_nr: sysSettings.primary_firm_nr.trim() || null,
                primary_period_nr: sysSettings.primary_period_nr.trim() || null
            });
            await postgres.connect();
            toast.success('Sunucu varsayılanları PostgreSQL’e kaydedildi ve oturuma uygulandı.');
        } catch (e: any) {
            toast.error('Kayıt başarısız: ' + (e?.message || String(e)));
        } finally {
            setLoadingSys(false);
        }
    };

    const handleInitialize = async () => {
        if (!IS_TAURI) {
            toast.info(
                'Tarayıcı (web) ortamında şema güncellemesi bu ekrandan çalışmaz. Yönetici, PostgreSQL’e erişebildiği makinede proje kökünde `npm run db:migrate` çalıştırmalıdır (`npm run db:migrate:dry` ile önce listeyi görebilir).',
                { duration: 14000 }
            );
            return;
        }

        const confirmMsg =
            'Henüz uygulanmamış migration SQL dosyaları veritabanına işlenecek. Var olan tablolar silinmez; çoğunlukla yeni kolon/indeks eklenir. Devam edilsin mi?';

        if (!window.confirm(confirmMsg)) return;

        setIsInitializing(true);
        const result = await postgres.runMigrations(false);
        setIsInitializing(false);

        if (result.success) {
            toast.success(result.message);
        } else {
            toast.error(result.message);
        }
    };

    const handleCreateUser = async () => {
        if (!username || !fullName) {
            toast.error('Kullanıcı adı ve tam ad gerekli!');
            return;
        }

        try {
            const userEmail = email || `${username}@retailex.local`;
            const userPassword = password || '123456';

            const metadata = {
                username,
                full_name: fullName,
                role,
                firm_nr: firmNr
            };

            await postgres.query(
                `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data) 
                 VALUES ($1, crypt($2, gen_salt('bf')), $3)`,
                [userEmail, userPassword, JSON.stringify(metadata)]
            );

            toast.success(`Kullanıcı ${username} oluş turuldu!`);
            setShowUserForm(false);
            fetchUsers();
            // Reset form
            setUsername('');
            setFullName('');
            setEmail('');
            setPassword('');
        } catch (error: any) {
            toast.error('Kullanıcı oluşturulamadı: ' + error.message);
        }
    };

    const handleCreateFirm = async () => {
        if (!firmaAdi) {
            toast.error('Firma adı gerekli!');
            return;
        }

        setLoadingFirm(true);
        try {
            await postgres.query(
                `INSERT INTO firms (firm_nr, name, tax_nr) VALUES ($1, $2, $3)`,
                [firmaKodu, firmaAdi, vergiNo]
            );

            toast.success(`Firma ${firmaAdi} oluşturuldu!`);
            setShowFirmForm(false);
            fetchFirms();
            setFirmaKodu('FRM001');
            setFirmaAdi('');
            setVergiNo('');
        } catch (error: any) {
            toast.error('Firma oluşturulamadı: ' + error.message);
        } finally {
            setLoadingFirm(false);
        }
    };

    const ModeCard = ({ mode, icon: Icon, title, desc }: { mode: ConnectionMode, icon: any, title: string, desc: string }) => (
        <button
            onClick={() => setActiveMode(mode)}
            className={`group relative flex flex-col items-start p-6 rounded-2xl border-2 transition-all text-left overflow-hidden ${activeMode === mode
                ? darkMode
                    ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.3)]'
                    : 'border-blue-500 bg-blue-50/80 shadow-[0_0_30px_rgba(59,130,246,0.2)]'
                : darkMode
                    ? 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
        >
            {activeMode === mode && (
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-transparent to-purple-500/20 animate-pulse" />
            )}

            <div className={`relative z-10 p-3 rounded-xl mb-4 transition-all ${activeMode === mode
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg'
                : darkMode
                    ? 'bg-white/10 text-blue-400'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                <Icon className="w-7 h-7" />
            </div>

            <h3 className={`relative z-10 font-black text-lg mb-2 tracking-tight ${activeMode === mode
                ? darkMode ? 'text-blue-400' : 'text-blue-700'
                : darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                {title}
            </h3>

            <p className={`relative z-10 text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                {desc}
            </p>

            {activeMode === mode && (
                <div className="absolute top-4 right-4 z-10">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
                </div>
            )}
        </button>
    );

    const [deviceName, setDeviceName] = useState('');
    const [targetStoreId, setTargetStoreId] = useState('');

    const handleRegisterDevice = async () => {
        if (!deviceName || !targetStoreId) {
            toast.error('Lütfen cihaz adını ve mağazayı giriniz.');
            return;
        }
        const res = await postgres.registerDevice(deviceName, targetStoreId);
        if (res.success) toast.success(res.message);
        else toast.error(res.message);
    };

    return (
        <div className={`p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {/* Modern Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className={`relative w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl transform hover:scale-105 transition-all ${darkMode
                        ? 'bg-gradient-to-br from-blue-600 to-purple-600'
                        : 'bg-gradient-to-br from-blue-500 to-blue-600'
                        }`}>
                        <Database className="w-10 h-10 text-white" />
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-4 border-gray-900 animate-pulse" />
                    </div>
                    <div>
                        <h1 className={`text-4xl font-black tracking-tight mb-1 ${darkMode
                            ? 'bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent'
                            : 'text-gray-900'
                            }`}>
                            Sistem Yönetimi
                        </h1>
                        <p className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-blue-400/60' : 'text-gray-500'
                            }`}>
                            Veritabanı, Kullanıcılar \u0026 Firma Yönetimi
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className={`flex gap-3 border-b-2 pb-2 ${darkMode ? 'border-white/10' : 'border-gray-200'}`}>
                <button
                    onClick={() => setActiveTab('database')}
                    className={`flex items-center gap-3 px-6 py-3 rounded-t-2xl font-black text-sm uppercase tracking-wider transition-all ${activeTab === 'database'
                        ? darkMode
                            ? 'bg-blue-500/20 text-blue-400 border-b-4 border-blue-500'
                            : 'bg-blue-100 text-blue-700 border-b-4 border-blue-600'
                        : darkMode
                            ? 'text-gray-500 hover:text-gray-300'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                >
                    <Database className="w-5 h-5" />
                    Veritabanı
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`flex items-center gap-3 px-6 py-3 rounded-t-2xl font-black text-sm uppercase tracking-wider transition-all ${activeTab === 'users'
                        ? darkMode
                            ? 'bg-purple-500/20 text-purple-400 border-b-4 border-purple-500'
                            : 'bg-purple-100 text-purple-700 border-b-4 border-purple-600'
                        : darkMode
                            ? 'text-gray-500 hover:text-gray-300'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                >
                    <Users className="w-5 h-5" />
                    Kullanıcılar
                </button>
                <button
                    onClick={() => setActiveTab('firms')}
                    className={`flex items-center gap-3 px-6 py-3 rounded-t-2xl font-black text-sm uppercase tracking-wider transition-all ${activeTab === 'firms'
                        ? darkMode
                            ? 'bg-green-500/20 text-green-400 border-b-4 border-green-500'
                            : 'bg-green-100 text-green-700 border-b-4 border-green-600'
                        : darkMode
                            ? 'text-gray-500 hover:text-gray-300'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                >
                    <Building2 className="w-5 h-5" />
                    Firmalar
                </button>
            </div>

            {/* Database Tab Content */}
            {activeTab === 'database' && (
                <div className="space-y-8">
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={handleTest}
                            disabled={isTesting}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 border-2 ${darkMode
                                ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                                : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                                } active:scale-95 shadow-lg`}
                        >
                            <Activity className={`w-5 h-5 ${isTesting ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Bağlantıyı Test Et</span>
                        </button>

                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 shadow-[0_0_30px_rgba(59,130,246,0.4)] hover:shadow-[0_0_40px_rgba(59,130,246,0.6)] transition-all active:scale-95"
                        >
                            <Save className="w-5 h-5" />
                            Yapılandırmayı Kaydet
                        </button>
                    </div>

                    {/* Connection Mode Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <ModeCard
                            mode="online"
                            icon={Globe}
                            title="Remote (Online)"
                            desc="Merkezi sunucuya doğrudan bağlanır. Tüm veri trafiği bulut üzerinden yönetilir."
                        />
                        <ModeCard
                            mode="offline"
                            icon={HardDrive}
                            title="Standalone (Offline)"
                            desc="Tamamen yerel veritabanında çalışır. İnternet bağımsızlığı sağlar."
                        />
                        <ModeCard
                            mode="hybrid"
                            icon={Layers}
                            title="RetailEx Hybrid"
                            desc="Yerel hız ile bulut gücünü birleştirir. Arka planda otomatik senkronizasyon yapar."
                        />
                    </div>

                    {connectionProvider === 'db' && (
                        <div
                            className={`rounded-3xl p-8 shadow-2xl backdrop-blur-xl border-2 space-y-6 ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
                                }`}
                        >
                            <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4" style={{
                                borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                            }}>
                                <div>
                                    <h2 className={`text-lg font-black tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                        Sunucu varsayılanları (PostgreSQL)
                                    </h2>
                                    <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Web ve diğer istemciler bağlantı kurulunca bu değerler yüklenir; tarayıcı önbelleği yerine veritabanı tek kaynak olur.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSaveSystemSettings}
                                    disabled={loadingSys}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 border-2 ${darkMode
                                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                                        }`}
                                >
                                    {loadingSys ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Kaydet ve oturuma uygula
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                        Varsayılan para birimi
                                    </label>
                                    <select
                                        value={sysSettings.default_currency}
                                        onChange={e => setSysSettings(s => ({ ...s, default_currency: e.target.value }))}
                                        disabled={loadingSys}
                                        className={`w-full px-4 py-3 rounded-xl text-sm border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white'
                                            : 'bg-gray-50 border-gray-200 text-gray-900'
                                            }`}
                                    >
                                        <option value="IQD">Irak Dinarı (IQD)</option>
                                        <option value="TRY">Türk Lirası (TRY)</option>
                                        <option value="USD">Amerikan Doları (USD)</option>
                                        <option value="EUR">Euro (EUR)</option>
                                        <option value="GBP">İngiliz Sterlini (GBP)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                        Birincil firma no
                                    </label>
                                    <input
                                        value={sysSettings.primary_firm_nr}
                                        onChange={e =>
                                            setSysSettings(s => ({
                                                ...s,
                                                primary_firm_nr: e.target.value.replace(/\D/g, '').slice(0, 6)
                                            }))
                                        }
                                        placeholder="001"
                                        disabled={loadingSys}
                                        className={`w-full px-4 py-3 rounded-xl font-mono text-sm border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white'
                                            : 'bg-gray-50 border-gray-200 text-gray-900'
                                            }`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                        Birincil dönem no
                                    </label>
                                    <input
                                        value={sysSettings.primary_period_nr}
                                        onChange={e =>
                                            setSysSettings(s => ({
                                                ...s,
                                                primary_period_nr: e.target.value.replace(/\D/g, '').slice(0, 4)
                                            }))
                                        }
                                        placeholder="01"
                                        disabled={loadingSys}
                                        className={`w-full px-4 py-3 rounded-xl font-mono text-sm border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white'
                                            : 'bg-gray-50 border-gray-200 text-gray-900'
                                            }`}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Database Configuration Cards */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Remote Settings */}
                        <div className={`rounded-3xl p-8 shadow-2xl backdrop-blur-xl border-2 space-y-6 transition-all hover:shadow-[0_0_50px_rgba(59,130,246,0.3)] ${darkMode
                            ? 'bg-white/5 border-white/10'
                            : 'bg-white border-gray-200'
                            }`}>
                            <div className="flex items-center justify-between border-b pb-6" style={{
                                borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                            }}>
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl ${darkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                                        }`}>
                                        <Server className={`w-6 h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                    </div>
                                    <div>
                                        <h2 className={`text-xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                            Ana Sunucu
                                        </h2>
                                        <p className={`text-xs font-bold uppercase tracking-wider mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'
                                            }`}>
                                            Remote Database
                                        </p>
                                    </div>
                                </div>

                                {testResults.remote !== undefined && (
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black ${testResults.remote
                                        ? 'bg-green-500/20 text-green-400 border-2 border-green-500/30'
                                        : 'bg-red-500/20 text-red-400 border-2 border-red-500/30'
                                        }`}>
                                        {testResults.remote ? (
                                            <>
                                                <Wifi className="w-4 h-4 animate-pulse" />
                                                <span>Erişilebilir</span>
                                            </>
                                        ) : (
                                            <>
                                                <WifiOff className="w-4 h-4" />
                                                <span>Erişilemiyor</span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Remote provider selection */}
                            <div className="space-y-2">
                                <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Bağlantı Sağlayıcı
                                </label>
                                <select
                                    value={connectionProvider}
                                    onChange={(e) => setConnectionProvider(e.target.value as ConnectionProvider)}
                                    className={`w-full px-5 py-3.5 rounded-xl text-sm transition-all border-2 ${darkMode
                                        ? 'bg-white/5 border-white/10 text-white focus:border-blue-500 focus:bg-white/10'
                                        : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500 focus:bg-white'
                                        } focus:ring-4 focus:ring-blue-500/20 focus:outline-none`}
                                >
                                    <option value="db">DB Connection</option>
                                    <option value="rest_api">Rest API (PostgREST)</option>
                                </select>
                            </div>

                            {connectionProvider === 'rest_api' ? (
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                        PostgREST API URL
                                    </label>
                                    <input
                                        value={remoteRestUrl}
                                        onChange={(e) => setRemoteRestUrl(e.target.value)}
                                        placeholder="http://IP:3002"
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-blue-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-blue-500/20 focus:outline-none`}
                                    />
                                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                        VPN olmadan doğrudan IP üzerinden PostgREST'e bağlanmak için kullanılır.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                            Sunucu (Host)
                                        </label>
                                        <input
                                            value={remote.host}
                                            onChange={e => setRemote({ ...remote, host: e.target.value })}
                                            className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                                ? 'bg-white/5 border-white/10 text-white focus:border-blue-500 focus:bg-white/10'
                                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500 focus:bg-white'
                                                } focus:ring-4 focus:ring-blue-500/20 focus:outline-none`}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                            Port
                                        </label>
                                        <input
                                            value={remote.port}
                                            onChange={e => setRemote({ ...remote, port: parseInt(e.target.value) })}
                                            className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                                ? 'bg-white/5 border-white/10 text-white focus:border-blue-500 focus:bg-white/10'
                                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500 focus:bg-white'
                                                } focus:ring-4 focus:ring-blue-500/20 focus:outline-none`}
                                        />
                                    </div>
                                    <div className="col-span-2 space-y-2">
                                        <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                            Veritabanı
                                        </label>
                                        <input
                                            value={remote.database}
                                            onChange={e => setRemote({ ...remote, database: e.target.value })}
                                            className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                                ? 'bg-white/5 border-white/10 text-white focus:border-blue-500 focus:bg-white/10'
                                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500 focus:bg-white'
                                                } focus:ring-4 focus:ring-blue-500/20 focus:outline-none`}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                            Kullanıcı
                                        </label>
                                        <input
                                            value={remote.user}
                                            onChange={e => setRemote({ ...remote, user: e.target.value })}
                                            className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                                ? 'bg-white/5 border-white/10 text-white focus:border-blue-500 focus:bg-white/10'
                                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500 focus:bg-white'
                                                } focus:ring-4 focus:ring-blue-500/20 focus:outline-none`}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                            Şifre
                                        </label>
                                        <input
                                            type="password"
                                            value={remote.password}
                                            onChange={e => setRemote({ ...remote, password: e.target.value })}
                                            className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                                ? 'bg-white/5 border-white/10 text-white focus:border-blue-500 focus:bg-white/10'
                                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500 focus:bg-white'
                                                } focus:ring-4 focus:ring-blue-500/20 focus:outline-none`}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Local Settings */}
                        <div className={`rounded-3xl p-8 shadow-2xl backdrop-blur-xl border-2 space-y-6 transition-all hover:shadow-[0_0_50px_rgba(168,85,247,0.3)] ${darkMode
                            ? 'bg-white/5 border-white/10'
                            : 'bg-white border-gray-200'
                            }`}>
                            <div className="flex items-center justify-between border-b pb-6" style={{
                                borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                            }}>
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl ${darkMode ? 'bg-purple-500/20' : 'bg-purple-100'
                                        }`}>
                                        <HardDrive className={`w-6 h-6 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                                    </div>
                                    <div>
                                        <h2 className={`text-xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                            Yerel (Local) DB
                                        </h2>
                                        <p className={`text-xs font-bold uppercase tracking-wider mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'
                                            }`}>
                                            Local Database
                                        </p>
                                    </div>
                                </div>

                                {testResults.local !== undefined && (
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black ${testResults.local
                                        ? 'bg-green-500/20 text-green-400 border-2 border-green-500/30'
                                        : 'bg-red-500/20 text-red-400 border-2 border-red-500/30'
                                        }`}>
                                        {testResults.local ? (
                                            <>
                                                <CheckCircle2 className="w-4 h-4 animate-pulse" />
                                                <span>Bağlantı Hazır</span>
                                            </>
                                        ) : (
                                            <>
                                                <AlertTriangle className="w-4 h-4" />
                                                <span>Bağlantı Yok</span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Sunucu
                                    </label>
                                    <input
                                        value={local.host}
                                        onChange={e => setLocal({ ...local, host: e.target.value })}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Port
                                    </label>
                                    <input
                                        value={local.port}
                                        onChange={e => setLocal({ ...local, port: parseInt(e.target.value) })}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                    />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Veritabanı
                                    </label>
                                    <input
                                        value={local.database}
                                        onChange={e => setLocal({ ...local, database: e.target.value })}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Kullanıcı
                                    </label>
                                    <input
                                        value={local.user}
                                        onChange={e => setLocal({ ...local, user: e.target.value })}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Şifre
                                    </label>
                                    <input
                                        type="password"
                                        value={local.password}
                                        onChange={e => setLocal({ ...local, password: e.target.value })}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* System Tools & Migration */}
                    <div className={`rounded-3xl p-10 shadow-[0_0_60px_rgba(0,0,0,0.3)] backdrop-blur-2xl border border-white/10 overflow-hidden relative ${darkMode
                        ? 'bg-gradient-to-br from-indigo-900/60 via-purple-900/60 to-pink-900/60'
                        : 'bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600'
                        }`}>
                        {/* Animated background elements */}
                        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px] animate-pulse" />
                        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px] animate-pulse delay-1000" />

                        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
                            <div className="flex-1 text-center lg:text-left space-y-6">
                                <div className="flex items-center gap-4 justify-center lg:justify-start">
                                    <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl border border-white/30">
                                        <Layers className="w-8 h-8 text-white" />
                                    </div>
                                    <h2 className="text-3xl font-black text-white tracking-tight">
                                        Sistem Altyapı Araçları
                                    </h2>
                                </div>

                                <p className="text-white/80 text-base leading-relaxed max-w-2xl">
                                    {IS_TAURI ? (
                                        <>
                                            Masaüstü uygulaması, paketlenmiş <code className="px-2 py-1 bg-black/30 rounded font-mono text-sm">database/migrations</code> dosyalarını okur;
                                            daha önce işlenmemiş olanları PostgreSQL’e uygular (Node veya terminal gerekmez).
                                        </>
                                    ) : (
                                        <>
                                            Web istemcisi migration çalıştıramaz. Şema güncellemesi sunucuda{' '}
                                            <code className="px-2 py-1 bg-black/30 rounded font-mono text-sm">npm run db:migrate</code> ile yapılır.
                                        </>
                                    )}
                                </p>

                                <div className="flex flex-wrap items-center gap-6 justify-center lg:justify-start">
                                    {IS_TAURI ? (
                                        <button
                                            onClick={handleInitialize}
                                            disabled={isInitializing}
                                            className="flex items-center gap-3 px-10 py-4 bg-white text-indigo-900 rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-blue-50 transition-all active:scale-95 disabled:opacity-50 shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:shadow-[0_0_40px_rgba(255,255,255,0.5)]"
                                        >
                                            {isInitializing ? (
                                                <>
                                                    <RefreshCw className="w-6 h-6 animate-spin" />
                                                    MİGRATİON ÇALIŞIYOR...
                                                </>
                                            ) : (
                                                <>
                                                    <Play className="w-6 h-6" />
                                                    BEKLEYEN ŞEMA GÜNCELLEMESİNİ UYGULA
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <p className="text-white/90 text-sm font-medium max-w-xl">
                                            Bu ekranı tarayıcıda açtıysanız güncellemeyi sunucu yöneticisi yapmalıdır. Log: <code className="px-1 bg-black/30 rounded">migration_log.json</code> yalnızca
                                            masaüstü uygulamasında oluşur.
                                        </p>
                                    )}
                                </div>

                                {/* Device Registration */}
                                <div className="pt-8 mt-8 border-t border-white/20 space-y-5">
                                    <h3 className="text-xl font-black flex items-center gap-3 text-white">
                                        <Smartphone className="w-6 h-6" />
                                        Cihaz Kayıt (Terminal Tanımlama)
                                    </h3>
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <input
                                            placeholder="Cihaz Adı (Örn: Kasa 1)"
                                            value={deviceName}
                                            onChange={e => setDeviceName(e.target.value)}
                                            className="flex-1 px-5 py-3.5 bg-white/10 border-2 border-white/20 rounded-xl focus:bg-white/20 focus:border-white/40 focus:outline-none placeholder:text-white/40 text-white text-sm font-medium backdrop-blur-sm transition-all"
                                        />
                                        <input
                                            placeholder="Mağaza ID"
                                            value={targetStoreId}
                                            onChange={e => setTargetStoreId(e.target.value)}
                                            className="flex-1 px-5 py-3.5 bg-white/10 border-2 border-white/20 rounded-xl focus:bg-white/20 focus:border-white/40 focus:outline-none placeholder:text-white/40 text-white text-sm font-medium backdrop-blur-sm transition-all"
                                        />
                                        <button
                                            onClick={handleRegisterDevice}
                                            className="px-8 py-3.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-black hover:from-green-600 hover:to-emerald-600 transition-all active:scale-95 text-sm shadow-[0_0_30px_rgba(34,197,94,0.4)]"
                                        >
                                            Cihazı Kaydet
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="flex-shrink-0 grid grid-cols-2 gap-5">
                                <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 text-center hover:bg-white/15 transition-all group">
                                    <div className="text-4xl font-black mb-2 bg-gradient-to-br from-white to-blue-200 bg-clip-text text-transparent group-hover:scale-110 transition-transform">
                                        12
                                    </div>
                                    <div className="text-xs uppercase tracking-widest font-black text-white/60">
                                        Tablo Sayısı
                                    </div>
                                </div>
                                <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 text-center hover:bg-white/15 transition-all group">
                                    <div className="flex items-center justify-center mb-2">
                                        <div className="text-3xl font-black bg-gradient-to-br from-green-400 to-emerald-400 bg-clip-text text-transparent group-hover:scale-110 transition-transform">
                                            Live
                                        </div>
                                        <div className="ml-2 w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
                                    </div>
                                    <div className="text-xs uppercase tracking-widest font-black text-white/60">
                                        Sync Statüsü
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Users Tab Content */}
            {activeTab === 'users' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            Kullanıcı Yönetimi
                        </h2>
                        <button
                            onClick={() => setShowUserForm(!showUserForm)}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-bold hover:from-purple-700 hover:to-purple-800 shadow-lg transition-all active:scale-95"
                        >
                            <UserPlus className="w-5 h-5" />
                            Yeni Kullanıcı Ekle
                        </button>
                    </div>

                    {showUserForm && (
                        <div className={`rounded-3xl p-8 shadow-2xl backdrop-blur-xl border-2 ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
                            }`}>
                            <h3 className={`text-xl font-black mb-6 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                Yeni Kullanıcı Formu
                            </h3>
                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Kullanıcı Adı *
                                    </label>
                                    <input
                                        value={username}
                                        onChange={e => setUsername(e.target.value)}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                        placeholder="jdoe"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Tam Ad *
                                    </label>
                                    <input
                                        value={fullName}
                                        onChange={e => setFullName(e.target.value)}
                                        className={`w-full px-5 py-3.5 rounded-xl text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                        placeholder="jdoe@retailex.local"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Şifre (boş bırakılırsa: 123456)
                                    </label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Rol
                                    </label>
                                    <select
                                        value={role}
                                        onChange={e => setRole(e.target.value)}
                                        className={`w-full px-5 py-3.5 rounded-xl text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                    >
                                        <option value="admin">Admin</option>
                                        <option value="manager">Manager</option>
                                        <option value="cashier">Cashier</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Firma No
                                    </label>
                                    <input
                                        value={firmNr}
                                        onChange={e => setFirmNr(e.target.value)}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-purple-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-purple-500/20 focus:outline-none`}
                                        placeholder="001"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-4 mt-8">
                                <button
                                    onClick={() => setShowUserForm(false)}
                                    className={`flex-1 px-6 py-3 rounded-xl font-bold transition-all ${darkMode
                                        ? 'bg-white/10 text-white hover:bg-white/20'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        }`}
                                >
                                    <X className="w-5 h-5 inline mr-2" />
                                    İptal
                                </button>
                                <button
                                    onClick={handleCreateUser}
                                    className="flex-[2] px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-bold hover:from-purple-700 hover:to-purple-800 transition-all active:scale-95"
                                >
                                    <Check className="w-5 h-5 inline mr-2" />
                                    Kullanıcı Oluştur
                                </button>
                            </div>
                        </div>
                    )}

                    {loadingData ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className={`w-10 h-10 animate-spin ${darkMode ? 'text-purple-500' : 'text-purple-600'}`} />
                        </div>
                    ) : users.length === 0 ? (
                        <div className={`text-center py-20 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            <Users className="w-20 h-20 mx-auto mb-4 opacity-30" />
                            <p className="text-lg font-bold">Henüz kullanıcı bulunmuyor.</p>
                            <p className="text-sm">Yeni bir kullanıcı ekleyerek başlayın.</p>
                        </div>
                    ) : (
                        <div className={`rounded-3xl overflow-hidden border-2 shadow-xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-100'}`}>
                            <table className="w-full text-left">
                                <thead className={`${darkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                                    <tr>
                                        <th className="p-5 text-xs font-black uppercase tracking-wider">Kullanıcı</th>
                                        <th className="p-5 text-xs font-black uppercase tracking-wider">Rol</th>
                                        <th className="p-5 text-xs font-black uppercase tracking-wider">Firma</th>
                                        <th className="p-5 text-xs font-black uppercase tracking-wider">Email</th>
                                        <th className="p-5 text-xs font-black uppercase tracking-wider text-right">Durum</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-gray-100'}`}>
                                    {users.map((user) => (
                                        <tr key={user.id} className={`group transition-colors ${darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}>
                                            <td className="p-5">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${darkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-600'
                                                        }`}>
                                                        {user.username.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{user.username}</div>
                                                        <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{user.full_name}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${user.role === 'admin'
                                                    ? 'bg-red-500/20 text-red-500'
                                                    : user.role === 'manager'
                                                        ? 'bg-blue-500/20 text-blue-500'
                                                        : 'bg-green-500/20 text-green-500'
                                                    }`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="p-5 font-mono text-sm opacity-70">
                                                {user.firm_nr}
                                            </td>
                                            <td className="p-5 text-sm opacity-70">
                                                {user.email}
                                            </td>
                                            <td className="p-5 text-right">
                                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${user.is_active
                                                    ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                                                    : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                                                    }`}>
                                                    <div className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                                                    {user.is_active ? 'Aktif' : 'Pasif'}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Firms Tab Content */}
            {activeTab === 'firms' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            Firma Yönetimi
                        </h2>
                        <button
                            onClick={() => setShowFirmForm(!showFirmForm)}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-bold hover:from-green-700 hover:to-green-800 shadow-lg transition-all active:scale-95"
                        >
                            <Plus className="w-5 h-5" />
                            Yeni Firma Ekle
                        </button>
                    </div>

                    {showFirmForm && (
                        <div className={`rounded-3xl p-8 shadow-2xl backdrop-blur-xl border-2 ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'
                            }`}>
                            <h3 className={`text-xl font-black mb-6 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                Yeni Firma Formu
                            </h3>
                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Firma Kodu *
                                    </label>
                                    <input
                                        value={firmaKodu}
                                        onChange={e => setFirmaKodu(e.target.value)}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-green-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-green-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-green-500/20 focus:outline-none`}
                                        placeholder="FRM001"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Firma Ünvanı *
                                    </label>
                                    <input
                                        value={firmaAdi}
                                        onChange={e => setFirmaAdi(e.target.value)}
                                        className={`w-full px-5 py-3.5 rounded-xl text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-green-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-green-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-green-500/20 focus:outline-none`}
                                        placeholder="RetailEx Mağazacılık A.Ş."
                                    />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <label className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-600'
                                        }`}>
                                        Vergi/TC No
                                    </label>
                                    <input
                                        value={vergiNo}
                                        onChange={e => setVergiNo(e.target.value)}
                                        className={`w-full px-5 py-3.5 rounded-xl font-mono text-sm transition-all border-2 ${darkMode
                                            ? 'bg-white/5 border-white/10 text-white focus:border-green-500 focus:bg-white/10'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-green-500 focus:bg-white'
                                            } focus:ring-4 focus:ring-green-500/20 focus:outline-none`}
                                        placeholder="1234567890"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-4 mt-8">
                                <button
                                    onClick={() => setShowFirmForm(false)}
                                    className={`flex-1 px-6 py-3 rounded-xl font-bold transition-all ${darkMode
                                        ? 'bg-white/10 text-white hover:bg-white/20'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        }`}
                                >
                                    <X className="w-5 h-5 inline mr-2" />
                                    İptal
                                </button>
                                <button
                                    onClick={handleCreateFirm}
                                    disabled={loadingFirm}
                                    className="flex-[2] px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-bold hover:from-green-700 hover:to-green-800 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {loadingFirm ? (
                                        <>
                                            <Loader2 className="w-5 h-5 inline mr-2 animate-spin" />
                                            Oluşturuluyor...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-5 h-5 inline mr-2" />
                                            Firma Oluştur
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {loadingData ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className={`w-10 h-10 animate-spin ${darkMode ? 'text-green-500' : 'text-green-600'}`} />
                        </div>
                    ) : firms.length === 0 ? (
                        <div className={`text-center py-20 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            <Building2 className="w-20 h-20 mx-auto mb-4 opacity-30" />
                            <p className="text-lg font-bold">Henüz firma bulunmuyor.</p>
                            <p className="text-sm">Yeni bir firma ekleyerek başlayın.</p>
                        </div>
                    ) : (
                        <div className={`rounded-3xl overflow-hidden border-2 shadow-xl ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-gray-100'}`}>
                            <table className="w-full text-left">
                                <thead className={`${darkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                                    <tr>
                                        <th className="p-5 text-xs font-black uppercase tracking-wider">Firma Kodu</th>
                                        <th className="p-5 text-xs font-black uppercase tracking-wider">Ünvan</th>
                                        <th className="p-5 text-xs font-black uppercase tracking-wider">Vergi No</th>
                                        <th className="p-5 text-xs font-black uppercase tracking-wider text-right">Durum</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-gray-100'}`}>
                                    {firms.map((firm) => (
                                        <tr key={firm.id} className={`group transition-colors ${darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}>
                                            <td className="p-5 font-mono font-bold text-blue-500">
                                                {firm.firm_nr}
                                            </td>
                                            <td className="p-5 font-bold">
                                                {firm.name}
                                            </td>
                                            <td className="p-5 font-mono text-sm opacity-70">
                                                {firm.tax_nr}
                                            </td>
                                            <td className="p-5 text-right">
                                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${(firm.is_active !== false)
                                                    ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                                                    : 'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                                                    }`}>
                                                    <div className={`w-2 h-2 rounded-full ${(firm.is_active !== false) ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                                                    {(firm.is_active !== false) ? 'Aktif' : 'Pasif'}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


