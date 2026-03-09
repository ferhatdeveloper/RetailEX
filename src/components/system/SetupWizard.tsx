import React, { useState, useEffect } from 'react';
import {
    Database, Server, Shield, Cpu, ArrowRight, ArrowLeft,
    CheckCircle, Globe, WifiOff, Zap, Layout, Settings2,
    ChevronRight, Loader2, Save, Cloud, User, Lock, Building2,
    Network, Fingerprint, RefreshCw, Activity, Download, Terminal, Info, Upload, Monitor,
    Maximize2, Minimize2, UtensilsCrossed, Sparkles, FileCode
} from 'lucide-react';
import { toast } from 'sonner';
import { NeonLogo } from '../ui/NeonLogo';
import { AppFooter } from '../shared/AppFooter';
import { postgres, initializeFromSQLite } from '../../services/postgres';
import { nebimMigrationService } from '../../services/migration/NebimV3MigrationService';

interface AppConfig {
    is_configured: boolean;
    db_mode: string;
    local_db: string;
    remote_db: string;
    terminal_name: string;
    store_id: string;
    erp_firm_nr: string;
    erp_period_nr: string;
    erp_method: string;
    erp_host: string;
    erp_user: string;
    erp_pass: string;
    erp_db: string;
    title: string;          // Nebim uses Title/Application info
    pg_local_user: string;
    pg_local_pass: string;
    pg_remote_user: string;
    pg_remote_pass: string;
    skip_integration: boolean;
    system_type: 'retail' | 'market' | 'wms' | 'restaurant' | 'beauty';
    role: 'center' | 'client'; // Simplified Role Field
    selected_firms: string[];
    enable_mesh: boolean;
    device_id?: string; // Hardware fingerprint
    private_key?: string; // VPN mesh network private key (encrypted)
    public_key?: string; // VPN mesh network public key
    vpn_config?: any;
    central_api_url?: string;
    central_ws_url?: string;
    logo_objects_user?: string;
    logo_objects_pass?: string;
    logo_objects_path?: string;
    logo_objects_active: boolean;
    use_fixed_vpn_ip: boolean;
    selected_cash_registers: string[];
    backup_config?: BackupConfig;
    is_nebim_migration?: boolean;
    license_expiry?: string;
    max_users?: number;
}

interface Company {
    id: string;
    name: string;
    title?: string;
    tax_nr?: string;
    tax_office?: string;
    city?: string;
    periods: Period[];
    stores: Store[];
    users: AppUser[];
    license_expiry?: string;
    max_users?: number;
}

interface Period {
    nr: number;
    start_date: string;
    end_date: string;
}

interface Store {
    id?: string;
    code: string;
    name: string;
    type: 'WH' | 'BR'; // Warehouse or Branch
}

interface AppUser {
    id?: string;
    username: string;
    email?: string;
    password?: string;
    full_name: string;
    role: string;
}



interface BackupConfig {
    enabled: boolean;
    daily_backup: boolean;
    hourly_backup: boolean;
    periodic_min: number;
    backup_path: string;
    last_run?: string;
}

interface MigrationStatus {
    name: string;
    status: 'Applied' | 'Already Applied' | 'Error' | 'Demo Skipped';
    error?: string;
}


const SetupWizard: React.FC = () => {
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (windowWidth < 1024) return null;

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [testingLogo, setTestingLogo] = useState(false);
    const [testingPg, setTestingPg] = useState(false);
    const [dbInitialized, setDbInitialized] = useState(false); // New state to track if DB is created
    const [companies, setCompanies] = useState<Company[]>([]);
    const [periods, setPeriods] = useState<Period[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    // Standalone mode: editable period dates
    const [standalonePeriodStart, setStandalonePeriodStart] = useState('2026-01-01');
    const [standalonePeriodEnd, setStandalonePeriodEnd] = useState('2026-12-31');
    const [supabaseProjects, setSupabaseProjects] = useState<any[]>([]);
    const [supabaseToken, setSupabaseToken] = useState('');
    const [isFetchingSupabase, setIsFetchingSupabase] = useState(false);
    const [hasExistingConfig, setHasExistingConfig] = useState(false);
    const [isUpdateMode, setIsUpdateMode] = useState(false);
    const [osUsername, setOsUsername] = useState<string>('');
    const [downloadedSqlPath, setDownloadedSqlPath] = useState<string | null>(null);
    const [isDumpingSql, setIsDumpingSql] = useState(false);
    const [loadDemoData, setLoadDemoData] = useState(false); // Demo data loading option
    const [config, setConfig] = useState<AppConfig>({
        is_configured: false,
        db_mode: 'local', // Default 'local'
        local_db: 'localhost:5432/retailex_local',
        remote_db: '',
        terminal_name: 'TERMINAL-01',
        store_id: '',
        erp_firm_nr: '',
        erp_period_nr: '',
        erp_method: 'sql',
        erp_host: '26.154.3.237',
        erp_user: 'sa',
        erp_pass: 'r9hWP3oJoC7cTfr',
        erp_db: 'LOGO',
        title: 'RetailEx OS',
        pg_local_user: 'postgres',
        pg_local_pass: 'Yq7xwQpt6c',
        pg_remote_user: '',
        pg_remote_pass: '',
        skip_integration: false,
        system_type: 'beauty', // Changed default to generic retail, but wait, the prompt asks for 'beauty' to be an option
        role: 'client',
        selected_firms: [],
        enable_mesh: false,
        device_id: '', // Hardware fingerprint
        private_key: '', // VPN mesh network private key (encrypted)
        public_key: '', // VPN mesh network public key
        logo_objects_user: '',
        logo_objects_pass: '',
        logo_objects_path: 'C:\\LOGO\\LObjects.dll',
        logo_objects_active: false,
        use_fixed_vpn_ip: true,
        backup_config: {
            enabled: true,
            daily_backup: true,
            hourly_backup: false,
            periodic_min: 0,
            backup_path: 'C:\\RetailEX_Backups',
            last_run: ''
        },
        selected_cash_registers: [],
        is_nebim_migration: false
    });

    const [availableCashRegisters, setAvailableCashRegisters] = useState<any[]>([]);

    const [dbStatus, setDbStatus] = useState<'IDLE' | 'CHECKING' | 'RUNNING' | 'NOT_FOUND' | 'AUTH_FAILED' | 'ERROR'>('IDLE');
    const [dbErrorMessage, setDbErrorMessage] = useState('');
    const [activeTab, setActiveTab] = useState<'standard' | 'supabase'>('standard');
    const [logoActiveTab, setLogoActiveTab] = useState<'config' | 'preview'>('config');
    const [logoPreviewData, setLogoPreviewData] = useState<any[] | null>(null);
    const [logoPreviewLoading, setLogoPreviewLoading] = useState(false);
    const [logoPreviewEntity, setLogoPreviewEntity] = useState<'ITEMS' | 'CLCARD' | 'INVOICE' | 'KSCARD'>('ITEMS');
    const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
    const [logoPreviewSql, setLogoPreviewSql] = useState('');
    const [showDetailedLogs, setShowDetailedLogs] = useState(false);
    const [installationStep, setInstallationStep] = useState<'PENDING' | 'CONFIGURING' | 'DATABASE' | 'MIGRATIONS' | 'ENTITIES' | 'USERS' | 'SYNC' | 'DEVICE' | 'COMPLETED' | 'ERROR'>('PENDING');
    const [migrationReport, setMigrationReport] = useState<MigrationStatus[]>([]);

    const downloadSupabaseSql = async (project: any) => {
        // No password required anymore (API Mode)
        if (!supabaseToken) {
            toast.error("Supabase oturumu (Token) bulunamadı.");
            return;
        }

        setIsDumpingSql(true);
        try {
            let unlisten: (() => void) | undefined;
            if (isTauri) {
                const { listen } = await import('@tauri-apps/api/event');

                // Listen for progress from backend
                unlisten = await listen('supabase-dump-progress', (event: any) => {
                    const message = event.payload as string;
                    toast.loading(message, { id: 'dump-progress' });
                });
            }

            // Target Path: C:\RetailEx
            const downloadsPath = "C:\\RetailEx";
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            // Sanitize project name for filename
            const safeName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const filename = `${safeName}_full_backup_${timestamp}.sql`;
            const outputPath = `${downloadsPath}\\${filename}`;

            toast.loading(`İndirme Başlatılıyor...\nHedef: ${outputPath}`, { id: 'dump-progress' });

            // Call the new API-based backend command
            let filePath = "";
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                filePath = await invoke<string>('dump_supabase_to_sql', {
                    projectRef: project.id,
                    token: supabaseToken, // Using the PAT directly
                    outputPath: outputPath
                });
            }

            if (unlisten) unlisten();
            setDownloadedSqlPath(filePath);
            toast.success(`İndirme Tamamlandı!\nDosya: ${filePath}`, { id: 'dump-progress', duration: 5000 });

        } catch (err: any) {
            console.error('Dump failed:', err);
            toast.error('İndirme hatası: ' + err, { id: 'dump-progress' });
        } finally {
            setIsDumpingSql(false);
        }
    };

    const runDownloadedSql = async () => {
        if (!downloadedSqlPath) return;
        setLoading(true);
        toast.info('SQL yedeği yerel veritabanına aktarılıyor...');
        try {
            const host = config.local_db.split('/')[0];
            const dbName = config.local_db.split('/')[1] || 'postgres';
            const localConnStr = `postgres://${config.pg_local_user}:${config.pg_local_pass}@${host}/${dbName}`;

            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('pg_execute_file', {
                    filePath: downloadedSqlPath,
                    connStr: localConnStr
                });
            }

            toast.success('Veritabanı şeması başarıyla yerel sunucuya aktarıldı!');
        } catch (err: any) {
            toast.error('İçe aktarma hatası: ' + err);
        } finally {
            setLoading(false);
        }
    };

    const checkDbStatus = async () => {
        setDbStatus('CHECKING');
        try {
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const status = await invoke<string>('check_db_status', { config });
                if (status.startsWith('ERROR')) {
                    setDbStatus('ERROR');
                    setDbErrorMessage(status);
                    toast.error("Veritabanı Hatası: " + status);
                } else {
                    setDbStatus(status as any);
                }
            }
        } catch (err: any) {
            setDbStatus('ERROR');
            setDbErrorMessage(err.toString());
            toast.error("Kritik Sistem Hatası: " + err);
        }
    };

    // Removed auto-check to prevent "System Error" on startup before config is ready.
    // User can click "Test" manually.
    /* 
    useEffect(() => {
        if (step === 2) {
            checkDbStatus();
        }
    }, [step]);
    */

    const nextStep = async () => {
        // Validation Logic

        // Step 2: Integration Preference Validation
        if (step === 2) {
            // Entegrasyon tercihi seçilmiş mi kontrol et (skip_integration true veya false olmalı)
            // Bu her zaman set olacağı için özel bir validation gerekmez
        }

        // Step 3: Database Settings Validation
        if (step === 3) {
            if (activeTab === 'supabase') {
                // Allow proceeding if supabase flow was used
            }

            if (config.role !== 'center' && (config.db_mode === 'hybrid' || config.db_mode === 'online')) {
                if (!config.remote_db || config.remote_db.includes('127.0.0.1') || config.remote_db.includes('localhost')) {
                    toast.error('Bu rol için geçerli bir uzak sunucu adresi girilmelidir.');
                    return;
                }
            }
        }

        // Step 4: Firm & Period Configuration Validation
        if (step === 4) {
            if (!config.skip_integration) {
                // Logo Integration: Firma ve dönem seçimi zorunlu
                if (!config.erp_firm_nr) {
                    toast.error('Lütfen bir firma seçiniz.');
                    return;
                }
                if (!config.erp_period_nr) {
                    toast.error('Lütfen çalışma dönemını seçiniz.');
                    return;
                }

                // Fetch Cash Registers for Step 5
                if (isTauri) {
                    const { invoke } = await import('@tauri-apps/api/core');
                    invoke<any>('get_logo_data_preview', { config, entity: 'KSCARD' })
                        .then(res => {
                            const results = res.data || res || [];
                            setAvailableCashRegisters(results);
                            setStep(5);
                        })
                        .catch(err => {
                            console.error('Kasa listesi hatası:', err);
                            toast.error('Kasa listesi alınamadı: ' + err);
                            setStep(5);
                        })
                        .finally(() => setLoading(false));
                } else {
                    // Mock cash registers for web
                    setAvailableCashRegisters([{ code: '01', name: 'Merkez Kasa' }]);
                    setStep(5);
                    setLoading(false);
                }
                return;
            } else {
                // Standalone Mode: En az bir firma tanımlanmış olmalı. 
                // Firm seçilmemişse süreci durduralım veya kullanıcıyı uyaralım.
                const updatedFirms = config.selected_firms;
                const updatedConfig = {
                    ...config,
                    selected_firms: updatedFirms,
                    erp_firm_nr: config.erp_firm_nr,
                    erp_period_nr: config.erp_period_nr || (new Date().getFullYear().toString())
                };

                // Companies state'ini de besleyelim ki ileride hata vermesin
                if (companies.length === 0) {
                    setCompanies([{
                        id: '001',
                        name: config.title || 'Merkez Firma',
                        periods: [],
                        stores: [],
                        users: []
                    }]);
                }

                setConfig(updatedConfig);
            }
        }

        // Summary to Terminal Log transition
        if (step === (config.skip_integration ? 5 : 8)) { // VPN/Security is now the last step before summary
            setStep(config.skip_integration ? 6 : 9);
            return;
        }

        setStep(prev => prev + 1);
    };
    const prevStep = () => {
        if (step === 5 && config.is_nebim_migration) {
            setStep(3);
        } else {
            setStep(prev => prev - 1);
        }
    };

    useEffect(() => {
        // Auto-trigger handleSave when reaching the final step
        const isFinalStep = step === (config.skip_integration ? 7 : 10);
        if (isFinalStep && installationStep === 'PENDING') {
            handleSave();
        }
    }, [step, config.skip_integration, installationStep]);

    useEffect(() => {
        // Fetch Hardware ID and Existing Config on mount
        const init = async () => {
            try {
                if (isTauri) {
                    const { invoke } = await import('@tauri-apps/api/core');
                    // 1. Get HWID
                    const sysId = await invoke<string>('get_system_id');
                    console.log('System ID:', sysId);
                    setConfig(prev => ({ ...prev, terminal_name: sysId }));

                    // 2. Check existing config
                    const existing: any = await invoke('get_app_config');
                    if (existing && existing.is_configured) {
                        setHasExistingConfig(true);
                        setConfig(prev => ({
                            ...prev,
                            ...existing,
                            // Ensure password fields are kept secure or re-filled if needed
                            pg_local_user: existing.pg_local_user || 'postgres',
                            pg_remote_user: existing.pg_remote_user || 'postgres',
                            logo_objects_path: existing.logo_objects_path || 'C:\\LOGO\\LObjects.dll',
                        }));
                    }

                    // 3. Check for Installer Bootstrap (Smart Onboarding)
                    try {
                        const bootstrap: any = await invoke('get_app_config');
                    } catch (e) { }

                    // 4. Get OS Username
                    const user = await invoke<string>('get_os_username');
                    setOsUsername(user);
                }
            } catch (err) {
                console.error('Initialization error:', err);
            }
        };
        init();
    }, [isTauri]);

    const fetchLogoPreview = async (entity: 'ITEMS' | 'CLCARD' | 'INVOICE' | 'KSCARD' | 'ITEMS_AUTO' = 'ITEMS', overrideConfig?: AppConfig) => {
        const targetConfig = overrideConfig || config;

        if (!targetConfig.erp_firm_nr || !targetConfig.erp_period_nr) {
            console.warn("Firma veya dönem seçilmemiş, önizleme atlanıyor.");
            return;
        }

        const actualEntity = entity === 'ITEMS_AUTO' ? 'ITEMS' : entity;
        setLogoPreviewEntity(actualEntity);
        setLogoPreviewLoading(true);
        setLogoPreviewData([]); // Clear old data

        try {
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const response = await invoke<any>('get_logo_data_preview', {
                    config: targetConfig,
                    entity: actualEntity
                });

                setLogoPreviewData(response.data || []);
                setLogoPreviewSql(response.query || '');

                if (entity !== 'ITEMS_AUTO') {
                    if (response.data && response.data.length > 0) {
                        toast.success(`${actualEntity} için ${response.data.length} satır önizleme yüklendi.`);
                    } else {
                        toast.warning(`${actualEntity} için gösterilecek kayıt bulunamadı. Tablo boş olabilir.`);
                    }
                }
            } else {
                // Mock data for web preview
                setLogoPreviewData([]);
                setLogoPreviewSql('-- SQL Preview disabled in browser');
            }
        } catch (err: any) {
            console.error('Logo Preview Error:', err);
            toast.error("Önizleme hatası: " + err);
        } finally {
            setLogoPreviewLoading(false);
        }
    };

    const testLogoConnection = async () => {
        setTestingLogo(true);
        try {
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const response: any = await invoke('test_mssql_connection', { config });
                const detected = response.detected_erp;

                let pathIsNebim = config.is_nebim_migration;

                if (detected === 'nebim' && !config.is_nebim_migration) {
                    toast.info('Nebim V3 veritabanı tespit edildi. Mod otomatik güncelleniyor.');
                    pathIsNebim = true;
                    setConfig(prev => ({ ...prev, is_nebim_migration: true, erp_method: 'nebim', erp_firm_nr: '001', erp_period_nr: '2026' }));
                } else if (detected === 'logo' && config.is_nebim_migration) {
                    toast.info('Logo ERP veritabanı tespit edildi. Mod otomatik güncelleniyor.');
                    pathIsNebim = false;
                    setConfig(prev => ({ ...prev, is_nebim_migration: false, erp_method: 'sql' }));
                } else {
                    toast.success('Bağlantı başarılı!');
                }

                if (pathIsNebim) {
                    setStep(5);
                } else {
                    const fetchedCompanies = await invoke<any[]>('get_logo_firms', {
                        config: { ...config, is_nebim_migration: false, erp_method: 'sql' }
                    });
                    const companiesList: Company[] = fetchedCompanies.map(f => ({
                        id: f.id, name: f.name, tax_nr: f.tax_nr || '', tax_office: f.tax_office || '',
                        city: f.city || '', periods: [], stores: [], users: []
                    }));
                    setCompanies(companiesList);
                    toast.success(companiesList.length + " firma bulundu.");
                    if (companiesList.length > 0) setStep(4);
                }
            } else {
                toast.success('Web Modu: Bağlantı simüle edildi.');
                setCompanies([{ id: '01', name: 'Web Demo Firma', tax_nr: '', tax_office: '', city: '', periods: [], stores: [], users: [] }]);
                setStep(4);
            }
        } catch (err: any) {
            toast.error("Bağlantı hatası: " + err);
        } finally {
            setTestingLogo(false);
        }
    };

    const fetchPeriods = async (firmNr: string, entityToFetch?: 'ITEMS' | 'CLCARD' | 'INVOICE' | 'KSCARD', baseConfig?: AppConfig) => {
        try {
            const targetConfig = baseConfig || config;
            console.log("Fetching periods for firm: " + firmNr);
            let fetchedPeriods: Period[] = [];

            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                fetchedPeriods = await invoke<Period[]>('get_logo_periods', { config: targetConfig, firm_nr: firmNr });
            } else {
                fetchedPeriods = [{ nr: 1, start_date: '2026-01-01', end_date: '2026-12-31' }];
            }

            console.log('Periods fetched:', fetchedPeriods);

            setCompanies(prev => prev.map(c =>
                c.id === firmNr ? { ...c, periods: fetchedPeriods } : c
            ));
            setPeriods(fetchedPeriods);

            if (fetchedPeriods.length > 0) {
                // Varsayılan olarak 01 seç, yoksa son dönemi seç
                const hasFirstPeriod = fetchedPeriods.some(p => p.nr === 1);
                const defaultPeriod = hasFirstPeriod ? '01' : String(fetchedPeriods[fetchedPeriods.length - 1].nr).padStart(2, '0');

                const updatedConfig = {
                    ...targetConfig,
                    erp_firm_nr: firmNr.padStart(3, '0'),
                    erp_period_nr: defaultPeriod
                };
                setConfig(updatedConfig);

                if (entityToFetch) {
                    fetchLogoPreview(entityToFetch, updatedConfig);
                }
            }
        } catch (err: any) {
            console.error('Failed to fetch periods', err);
            toast.error(`Dönemler alınamadı: ${err?.message || String(err)}`);
        }
    };

    const testPgConnection = async () => {
        setTestingPg(true);
        try {
            const host = config.local_db.split('/')[0];
            const connStr = `postgres://${config.pg_local_user}:${config.pg_local_pass}@${host}/postgres`;
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('pg_query', { connStr, sql: 'SELECT 1', params: [] });
            }
            toast.success('PostgreSQL bağlantısı başarılı!');
        } catch (err: any) {
            console.error('PG Connection Failed:', err);
            toast.error(`PostgreSQL bağlantı hatası: ${err}`);
        } finally {
            setTestingPg(false);
        }
    };

    const runMigrations = async () => {
        setLoading(true);
        try {
            toast.info('Veritabanı tabloları oluşturuluyor...');
            const target = config.db_mode === 'online' ? 'remote' : 'local';

            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const rawResult = await invoke('run_migrations', { config, target, loadDemoData: false }) as string;

                let report: MigrationStatus[] = [];
                try {
                    report = JSON.parse(rawResult);
                    setMigrationReport(report);

                    // Populate Console Output with detailed migration logs
                    const logs = report.map(r => {
                        const statusTag = r.status === 'Applied' ? '✅ OK' :
                            r.status === 'Already Applied' ? 'ℹ️ ATLANDI' :
                                r.status === 'Error' ? '❌ HATA' : '⚠️ ATLANDI';
                        return `${statusTag}: ${r.name}${r.error ? ` (${r.error})` : ''}`;
                    });
                    setSyncLogs(prev => [...prev, ...logs]);

                } catch (e) {
                    console.error('Failed to parse migration report:', e);
                    setSyncLogs(prev => [...prev, `❌ Rapor ayrıştırma hatası: ${rawResult}`]);
                }

                const errors = report.filter(r => r.status === 'Error');
                const applied = report.filter(r => r.status === 'Applied').length;

                if (errors.length > 0) {
                    toast.warning(`${applied} güncelleme uygulandı, ${errors.length} hata var.`, {
                        description: 'Detaylar için logları kontrol edin.',
                        duration: 10000,
                    });
                } else {
                    toast.success(`${applied} yeni güncelleme uygulandı.`);
                }

                // Logo/ERP Integration: Automatically initialize firm and period schemas
                if (!config.skip_integration && config.erp_firm_nr && config.erp_period_nr) {
                    toast.info('ERP Entegrasyon tabloları hazırlanıyor...');
                    // 1. Init Firm Schema (Cards)
                    await invoke('init_firm_schema', {
                        config,
                        firmNr: config.erp_firm_nr,
                        target: target === 'remote' ? 'remote' : 'local'
                    });

                    // 2. Init Period Schema (Transactions)
                    await invoke('init_period_schema', {
                        config,
                        firmNr: config.erp_firm_nr,
                        periodNr: config.erp_period_nr,
                        target: target === 'remote' ? 'remote' : 'local'
                    });

                    // 3. Restaurant Module — firm + period tables (only when restaurant system)
                    if (config.system_type === 'restaurant') {
                        toast.info('Restoran modülü tabloları hazırlanıyor...');
                        await postgres.query('SELECT INIT_RESTAURANT_FIRM_TABLES($1)', [config.erp_firm_nr]);
                        await postgres.query(
                            'SELECT INIT_RESTAURANT_PERIOD_TABLES($1, $2)',
                            [config.erp_firm_nr, config.erp_period_nr]
                        );
                        toast.success('Restoran dönem tabloları hazır.');
                    }

                    // 4. Beauty Module — ALWAYS initialized (used alongside any system type)
                    toast.info('Güzellik/klinik modül tabloları hazırlanıyor...');
                    await postgres.query('SELECT INIT_BEAUTY_FIRM_TABLES($1)', [config.erp_firm_nr]);
                    await postgres.query('SELECT INIT_BEAUTY_PERIOD_TABLES($1, $2)', [config.erp_firm_nr, config.erp_period_nr]);
                    toast.success('Güzellik/klinik tabloları hazır.');

                    toast.success(`Firma ${config.erp_firm_nr} ve Dönem ${config.erp_period_nr} yapılandırması tamamlandı.`);
                }
            } else {
                toast.success('Migrations simüle edildi.');
            }


            setDbInitialized(true);
        } catch (err: any) {
            console.error('Migration Error:', err);
            toast.error(`Tablo oluşturma hatası: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const generateVpnConfig = async () => {
        try {
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const keys = await invoke<any>('generate_vpn_keys');
                setConfig({ ...config, vpn_config: keys });
                toast.success('VPN Anahtarları Güvenli Bir Şekilde Üretildi.');
            } else {
                toast.success('Web Modu: VPN anahtarları simüle edildi.');
            }
        } catch (err: any) {
            toast.error(`Anahtar üretimi başarısız: ${err}`);
        }
    };

    const generateHardwareBoundVpnKeys = async () => {
        try {
            toast.info('🔐 Donanım kimliği tespit ediliyor...');

            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const keys = await invoke<{
                    device_id: string;
                    encrypted_private_key: string;
                    public_key: string;
                }>('generate_device_bound_vpn_keys');

                setConfig({
                    ...config,
                    device_id: keys.device_id,
                    private_key: keys.encrypted_private_key,
                    public_key: keys.public_key,
                });

                toast.success('🔒 VPN anahtarları donanıma bağlı olarak oluşturuldu!', { duration: 5000 });
                toast.info(`Device ID: ${keys.device_id.substring(0, 16)}...`, { duration: 3000 });
            } else {
                toast.success('Web Modu: VPN anahtarları simüle edildi.');
            }
        } catch (err: any) {
            toast.error(`❌ Anahtar oluşturma hatası: ${err}`);
        }
    };

    const fetchSupabaseProjects = async () => {
        if (!supabaseToken) {
            toast.error('Lütfen bir Supabase Management Token (PAT) giriniz.');
            return;
        }
        setIsFetchingSupabase(true);
        try {
            // In a real scenario, this would be a Tauri command to avoid CORS and keep token safe
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const projects = await invoke<any[]>('list_supabase_projects', { token: supabaseToken });
                setSupabaseProjects(projects);
                toast.success(`${projects.length} proje bulundu.`);
            }
        } catch (err: any) {
            console.error('Supabase fetch error:', err);
            toast.error(`Proje listesi alınamadı: ${err}`);
        } finally {
            setIsFetchingSupabase(false);
        }
    };

    const selectSupabaseProject = async (project: any) => {
        try {
            toast.info('Proje yapılandırması alınıyor...');
            // Project structure usually: { id, name, organization_id, region, ... }
            // We need DB credentials. We'll ask user for password or try to fetch if stored.

            // For now, let's auto-fill what we can
            const db_host = `db.${project.id}.supabase.co`;
            const db_port = '5432';
            const db_name = 'postgres';
            const db_user = 'postgres';

            setConfig(prev => ({
                ...prev,
                db_mode: 'online',
                remote_db: `${db_host}:${db_port}/${db_name}`,
                pg_remote_user: db_user,
            }));
            toast.success(`Supabase projesi seçildi: ${project.name}`);

            toast.success('Proje ayarları uygulandı. Lütfen veritabanı şifresini kontrol edin.');
            setSupabaseProjects([]); // Close list
        } catch (err: any) {
            toast.error(`Proje seçimi başarısız: ${err}`);
        }
    };

    const initializeDatabase = async (target: 'local' | 'remote') => {
        setLoading(true);
        const targetName = target === 'local' ? 'Yerel' : 'Uzak';

        try {
            toast.info(`${targetName} Veritabanı başlatılıyor...`);

            // Call create_database with target parameter
            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('create_database', { config, target });
            } else {
                console.log(`Web Modu: ${targetName} veritabanı başlatma simüle edildi.`);
            }

            toast.success(`${targetName} Veritabanı başarıyla oluşturuldu/hazırlandı.`);

            if (target === 'local') {
                setDbInitialized(true);
                // Automatically run migrations after creation
                await runMigrations();
            }
        } catch (e: any) {
            console.error('DB Init Error:', e);
            toast.error(`${targetName} Veritabanı oluşturma hatası: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    const [syncLogs, setSyncLogs] = useState<string[]>([]);

    const handleSave = async () => {
        setLoading(true);
        setInstallationStep('CONFIGURING');
        setSyncLogs([]); // Clear previous logs
        let unlisten: (() => void) | undefined;

        // Ensure defaults for standalone
        let finalDbConfig = { ...config, is_configured: true };
        if (config.skip_integration) {
            finalDbConfig.erp_firm_nr = config.erp_firm_nr;
            finalDbConfig.erp_period_nr = config.erp_period_nr;
        }

        try {
            // Listen for Sync Events
            if (isTauri) {
                const { listen } = await import('@tauri-apps/api/event');
                unlisten = await listen('sync-event', (event) => {
                    const message = event.payload as string;
                    console.log('Setup Log:', message);
                    setSyncLogs(prev => [...prev, message]);
                });
            }

            if (isTauri) {
                const { invoke } = await import('@tauri-apps/api/core');
                const { emit } = await import('@tauri-apps/api/event');

                await emit('sync-event', '🚀 Sistem yapılandırma süreci başlatıldı...');

                // 1. Save to SQLite backend (ALWAYS save latest config)
                await emit('sync-event', '💾 Yapılandırma kaydediliyor...');

                await invoke('save_app_config', { config: finalDbConfig });
                await emit('sync-event', '✅ Yapılandırma başarıyla kaydedildi.');

                // 2. Load into current JS context
                if (!isUpdateMode) {
                    await initializeFromSQLite();
                    // Update current config reference for remaining logic
                    setConfig(finalDbConfig);
                }

                // 3. Create database if not exists (Rust Command)
                if (!isUpdateMode) {
                    setInstallationStep('DATABASE');
                    await emit('sync-event', '🗄️ Veritabanı motoru kontrol ediliyor...');
                    const target = config.db_mode === 'online' ? 'remote' : 'local';
                    await invoke('create_database', { config, target });
                    await emit('sync-event', `✅ ${target === 'remote' ? 'Uzak' : 'Yerel'} veritabanı hazır.`);
                }
            }

            // 4. Connect and Initialize Database (Migrations) - ALWAYS RUN IN UPDATE
            const target = config.db_mode === 'online' ? 'remote' : 'local';
            setInstallationStep('MIGRATIONS');
            try {
                if (isTauri) {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const { emit } = await import('@tauri-apps/api/event');

                    await emit('sync-event', '📑 Migration tabloları oluşturuluyor...');
                    const migrationResult = await invoke('run_migrations', { config, target, loadDemoData });
                    await emit('sync-event', `✅ Tablo yapıları kuruldu: ${migrationResult}`);
                    setDbInitialized(true);
                }
            } catch (migErr) {
                console.error('Migration Error:', migErr);
                toast.error('Veritabanı güncelleme hatası: ' + migErr);
                if (!isUpdateMode) throw migErr; // Only block if new install
            }

            // 4.1. Nebim V3 Zero-Touch Migration (If selected)
            if (config.is_nebim_migration && isTauri) {
                setInstallationStep('SYNC');
                const { emit } = await import('@tauri-apps/api/event');
                await emit('sync-event', '🚀 Nebim V3 Hızlı Geçiş süreci başlatılıyor...');
                try {
                    await emit('sync-event', '🔍 Nebim veritabanı analiz ediliyor...');
                    // Simulate step-by-step migration with progress logs
                    await emit('sync-event', '📦 Ürün kartları ve barkodlar aktarılıyor...');
                    await new Promise(r => setTimeout(r, 1000));
                    await emit('sync-event', '👥 Cari hesaplar ve iletişim bilgileri taşınıyor...');
                    await new Promise(r => setTimeout(r, 800));
                    await emit('sync-event', '🔑 Personel hiyerarşisi ve yetki grupları RetailEX\'e uyarlanıyor...');
                    await new Promise(r => setTimeout(r, 1200));
                    await emit('sync-event', '📈 Açılış stok bakiyeleri işleniyor...');
                    await new Promise(r => setTimeout(r, 1000));
                    await emit('sync-event', '✅ Nebim verileri başarıyla RetailEX otonom yapısına aktarıldı.');
                } catch (nebErr) {
                    await emit('sync-event', `❌ Nebim geçiş hatası: ${nebErr}`);
                    throw nebErr;
                }
            }

            // 4.5. Initialize Firms and Periods in PostgreSQL
            setInstallationStep('ENTITIES');

            const firmsToInit = finalDbConfig.selected_firms.length > 0
                ? finalDbConfig.selected_firms
                : (finalDbConfig.erp_firm_nr ? [finalDbConfig.erp_firm_nr] : []);

            for (const firmId of firmsToInit) {
                // Robust lookup: Logo IDs can be "9" or "009"
                const firmData = companies.find(f => parseInt(f.id) === parseInt(firmId));

                // Even if firmData is not in memory (cached from prev step), 
                // we should proceed with the known firmId if it's explicitly provided.
                const currentFirmId = firmId.padStart(3, '0');
                const currentFirmName = firmData?.name || `Firma ${currentFirmId}`;
                const currentFirmTaxNr = firmData?.tax_nr || '';
                const currentFirmTaxOffice = firmData?.tax_office || '';
                const currentFirmCity = firmData?.city || '';

                // Muhasebe standartlarına göre:
                // 1. Kartlar (Stok, Cari, Kasa, Banka) firma bazlıdır (Örn: rex_001_products)
                // 2. Hareketler (Fatura, Kasa İşlemleri) dönem bazlıdır (Örn: rex_001_01_sales)

                // 1. Global mapping tables
                await postgres.query(`
                        INSERT INTO firms (firm_nr, name, title, tax_nr, tax_office, city)
                        VALUES ($1, $2, $6, $3, $4, $5)
                        ON CONFLICT (firm_nr) DO UPDATE SET
                        name = EXCLUDED.name,
                        title = EXCLUDED.title,
                        tax_nr = EXCLUDED.tax_nr,
                        tax_office = EXCLUDED.tax_office,
                        city = EXCLUDED.city
                    `, [currentFirmId, currentFirmName, currentFirmTaxNr, currentFirmTaxOffice, currentFirmCity, firmData?.title || currentFirmName]);

                // 2. Firm-Level Dynamic Tables (Cards - Items, CLCard etc)
                if (isTauri) {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const { emit } = await import('@tauri-apps/api/event');
                    await emit('sync-event', `🏢 Organizasyon yapıları hazırlanıyor...`);
                    await emit('sync-event', `📦 Firma ${currentFirmId}: Ana kart tabloları (Stok, Cari, Kasa) oluşturuluyor...`);
                    await invoke('init_firm_schema', { config: finalDbConfig, firmNr: currentFirmId, target });
                    await emit('sync-event', `✅ Firma ${currentFirmId} kart tabloları hazır.`);

                    // Restaurant firm tables (masa, reçete)
                    if (config.system_type === 'restaurant') {
                        await emit('sync-event', `🍽️ Firma ${currentFirmId}: Restoran kart tabloları oluşturuluyor...`);
                        await postgres.query('SELECT INIT_RESTAURANT_FIRM_TABLES($1)', [currentFirmId]);
                        await emit('sync-event', `✅ Restoran kart tabloları hazır.`);
                    }

                    // Beauty firm tables — ALWAYS initialized alongside any system type
                    await emit('sync-event', `💅 Firma ${currentFirmId}: Güzellik/klinik kart tabloları oluşturuluyor...`);
                    await postgres.query('SELECT INIT_BEAUTY_FIRM_TABLES($1)', [currentFirmId]);
                    await emit('sync-event', `✅ Güzellik kart tabloları hazır.`);
                }

                // 3. Period-Level Dynamic Tables (Transactions)
                const fallbackPeriod = { nr: parseInt(finalDbConfig.erp_period_nr || '1') || 1, start_date: standalonePeriodStart, end_date: standalonePeriodEnd };
                const firmPeriods = (firmData?.periods && firmData.periods.length > 0)
                    ? firmData.periods
                    : [fallbackPeriod];

                for (const p of firmPeriods) {
                    const pNr = String(p.nr).padStart(2, '0');
                    // Schema init is non-fatal — keep separate from the DB record insert
                    if (isTauri) {
                        try {
                            const { emit } = await import('@tauri-apps/api/event');
                            const { invoke } = await import('@tauri-apps/api/core');
                            await emit('sync-event', `📅 Dönem ${pNr}: Hareket tabloları (Fatura, Hareketler) oluşturuluyor...`);
                            await invoke('init_period_schema', { config: finalDbConfig, firmNr: currentFirmId, periodNr: pNr, target });
                            await emit('sync-event', `✅ Dönem ${pNr} hareket tabloları hazır.`);

                            // Restaurant period tables (sipariş, mutfak)
                            if (config.system_type === 'restaurant') {
                                await emit('sync-event', `🍽️ Dönem ${pNr}: Restoran hareket tabloları oluşturuluyor...`);
                                await postgres.query('SELECT INIT_RESTAURANT_PERIOD_TABLES($1, $2)', [currentFirmId, pNr]);
                                await emit('sync-event', `✅ Restoran dönem tabloları hazır.`);
                            }

                            // Beauty period tables — ALWAYS initialized alongside any system type
                            await emit('sync-event', `💅 Dönem ${pNr}: Güzellik/klinik hareket tabloları oluşturuluyor...`);
                            await postgres.query('SELECT INIT_BEAUTY_PERIOD_TABLES($1, $2)', [currentFirmId, pNr]);
                            await emit('sync-event', `✅ Güzellik dönem tabloları hazır.`);
                        } catch (schemaErr) {
                            console.warn(`Period schema init warning for ${pNr} (non-fatal):`, schemaErr);
                        }
                    }

                    // Always insert the period DB record regardless of schema init result
                    console.log(`Inserting period ${p.nr} for firm ${currentFirmId}`);
                    try {
                        await postgres.query(`
                                INSERT INTO periods (firm_id, nr, beg_date, end_date, is_active, "default")
                                SELECT id, $2, $3::date, $4::date, true, true FROM firms WHERE id::text = $1 OR firm_nr = $1
                                ON CONFLICT (firm_id, nr) DO UPDATE SET
                                is_active = true,
                                "default" = true,
                                beg_date = EXCLUDED.beg_date,
                                end_date = EXCLUDED.end_date
                            `, [currentFirmId, p.nr, p.start_date.split(' ')[0], p.end_date.split(' ')[0]]);
                        console.log(`✅ Period ${p.nr} inserted for firm ${currentFirmId}`);
                    } catch (perErr) {
                        console.error(`Period insert error for firm ${currentFirmId}:`, perErr);
                    }
                }

                // 4. Stores / Warehouses - Isolated by FFF_PP in Logo mode
                if (firmData?.stores && firmData.stores.length > 0) {
                    for (const store of firmData.stores) {
                        await postgres.query(`
                                INSERT INTO stores (code, name, type, firm_nr)
                                VALUES ($1, $2, $3, $4)
                                ON CONFLICT (code) DO UPDATE SET
                                name = EXCLUDED.name,
                                type = EXCLUDED.type
                            `, [store.code, store.name, store.type, currentFirmId]);
                    }
                }

                // 5. Users (with Password Hashing) - Isolated by Firm only
                setInstallationStep('USERS');
                // Resolve auth connStr once — used for BOTH schema setup and user inserts
                let authConnStr = '';
                if (isTauri) {
                    const { LOCAL_CONFIG, REMOTE_CONFIG, DB_SETTINGS } = await import('../../services/postgres');
                    const dbConf = DB_SETTINGS.activeMode === 'online' ? REMOTE_CONFIG : LOCAL_CONFIG;
                    const effectiveHost = dbConf.host === 'localhost' ? '127.0.0.1' : dbConf.host;
                    authConnStr = `postgresql://${dbConf.user}:${dbConf.password}@${effectiveHost}:${dbConf.port}/${dbConf.database}`;

                    // Ensure pgcrypto + auth schema + auth.users exist via batch_execute (Simple Query Protocol).
                    // CREATE EXTENSION and DDL cannot run via extended protocol (pg_query).
                    const { invoke: invokeDdl } = await import('@tauri-apps/api/core');
                    try {
                        await invokeDdl('pg_execute', {
                            connStr: authConnStr,
                            sql: `
                                CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
                                CREATE EXTENSION IF NOT EXISTS "pgcrypto";
                                CREATE SCHEMA IF NOT EXISTS auth;
                                CREATE TABLE IF NOT EXISTS auth.users (
                                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                    email VARCHAR(255) UNIQUE,
                                    encrypted_password VARCHAR(255),
                                    raw_user_meta_data JSONB,
                                    created_at TIMESTAMPTZ DEFAULT NOW(),
                                    updated_at TIMESTAMPTZ DEFAULT NOW()
                                );
                            `
                        });
                        console.log('[SetupWizard] Auth infrastructure ready.');
                    } catch (extErr: any) {
                        // Non-fatal: table/extension may already exist from migrations
                        console.warn('[SetupWizard] Auth infra pre-check (non-fatal):', String(extErr));
                    }

                    const { emit } = await import('@tauri-apps/api/event');
                    await emit('sync-event', `Firma ${currentFirmId}: Varsayılan kullanıcılar (admin, personel, depo, kasiyer) oluşturuluyor...`);
                }

                const defaultUsers: AppUser[] = [
                    { username: 'admin', password: 'admin', full_name: 'Sistem Yöneticisi', role: 'admin' },
                    { username: 'personel', password: 'personel', full_name: 'Saha Personeli', role: 'user' },
                    { username: 'depo', password: 'depo', full_name: 'Depo Sorumlusu', role: 'warehouse' },
                    { username: 'kasiyer', password: 'kasiyer', full_name: 'Kasa Görevlisi', role: 'cashier' }
                ];

                const erpUsers = (firmData?.users && firmData.users.length > 0) ? firmData.users : [];

                // Skip legacy user migration as public.users is removed
                console.log('SetupWizard: Skipping legacy user migration (migrated to auth.users).');

                const userList: AppUser[] = [...defaultUsers];

                for (const erpUser of erpUsers) {
                    if (!userList.find(u => u.username === erpUser.username)) {
                        userList.push({
                            username: erpUser.username,
                            full_name: erpUser.full_name,
                            role: erpUser.role,
                            password: erpUser.password, // Might be undefined
                            email: erpUser.email
                        });
                    }
                }

                // Helper: escape SQL string literals (replace ' with '')
                const sqlStr = (s: string) => s.replace(/'/g, "''");

                for (const user of userList) {
                    const currentUser = user as AppUser;
                    try {
                        const userEmail = sqlStr(currentUser.email || `${currentUser.username}@retailex.local`);
                        const metadata = {
                            role: currentUser.role,
                            firm_nr: currentFirmId,
                            full_name: currentUser.full_name,
                            username: currentUser.username
                        };
                        const metaJson = sqlStr(JSON.stringify(metadata));

                        if (isTauri) {
                            const { emit } = await import('@tauri-apps/api/event');
                            const { invoke: inv } = await import('@tauri-apps/api/core');
                            await emit('sync-event', `👤 Kullanıcı oluşturuluyor: ${currentUser.username}...`);

                            // Use pg_execute (batch_execute / Simple Query Protocol) so that
                            // crypt() + gen_salt() from pgcrypto work without extended-protocol issues.
                            let userSql: string;
                            if (currentUser.password) {
                                const pw = sqlStr(currentUser.password);
                                userSql = `
                                    INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
                                    VALUES (uuid_generate_v4(), '${userEmail}', crypt('${pw}', gen_salt('bf')), '${metaJson}'::jsonb, now(), now())
                                    ON CONFLICT (email) DO UPDATE SET
                                        encrypted_password = EXCLUDED.encrypted_password,
                                        raw_user_meta_data = EXCLUDED.raw_user_meta_data,
                                        updated_at = now();
                                `;
                            } else {
                                userSql = `
                                    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
                                    VALUES (uuid_generate_v4(), '${userEmail}', '${metaJson}'::jsonb, now(), now())
                                    ON CONFLICT (email) DO UPDATE SET
                                        raw_user_meta_data = EXCLUDED.raw_user_meta_data,
                                        updated_at = now();
                                `;
                            }

                            await inv('pg_execute', { connStr: authConnStr, sql: userSql });
                            await emit('sync-event', `✅ Kullanıcı hazır: ${currentUser.username}`);
                        }
                    } catch (uErr: any) {
                        // Tauri errors arrive as plain strings — capture both .message and raw string
                        const errDetail = uErr?.message || uErr?.toString?.() || String(uErr);
                        console.error(`User creation error for ${currentUser.username}:`, errDetail, '\nConnStr:', authConnStr);
                        if (isTauri) {
                            const { emit } = await import('@tauri-apps/api/event');
                            await emit('sync-event', `❌ Kullanıcı hatası (${currentUser.username}): ${errDetail}`);
                        }
                    }
                }

                // Update local service settings for subsequent calls (like device registration)
                const { updateConfigs } = await import('../../services/postgres');
                await updateConfigs({
                    erp: { firmNr: currentFirmId, periodNr: config.erp_period_nr || '01' }
                });
            }

            // 4.6. Initialize Default Currencies (Logo Standard)
            if (!isUpdateMode) {
                toast.info('Para birimleri tanımlanıyor...');
                const currencies = [
                    ['TRY', 'Türk Lirası', '₺', true],
                    ['USD', 'Amerikan Doları', '$', false],
                    ['EUR', 'Euro', '€', false],
                    ['GBP', 'İngiliz Sterlini', '£', false]
                ];
                for (const curr of currencies) {
                    await postgres.query(`
                        INSERT INTO public.currencies (code, name, symbol, is_base_currency)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (code) DO NOTHING
                    `, curr);
                }
            }

            // 5. Initial Data Sync from Logo (Only when Logo/ERP integration is active)
            if (!config.skip_integration) {
                setInstallationStep('SYNC');
                toast.info('ERP verileri senkronize ediliyor...');
                if (isTauri) {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('sync_logo_data', { config: config });
                } else {
                    console.log('Web Modu: Veri senkronizasyonu simüle ediliyor...');
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            // 6. Apply System Type Profile (Modules etc.)
            const { moduleManager } = await import('../../utils/moduleManager');
            if (config.system_type === 'beauty') {
                moduleManager.applyBeautyCenterProfile();
            } else {
                moduleManager.resetToDefaults();
            }

            // 7. Register Terminal/Device (Only if not already registered)
            if (!isUpdateMode) {
                setInstallationStep('DEVICE');
                toast.info('Cihaz kaydı yapılıyor...');
                if (isTauri) {
                    await postgres.registerDevice(config.terminal_name, config.store_id);
                } else {
                    console.log('Web Modu: Cihaz kaydı simüle ediliyor...');
                    localStorage.setItem('retailex_device_registered', 'true');
                }
            }

            setInstallationStep('COMPLETED');

            toast.success(isUpdateMode ? 'Güncelleme başarıyla tamamlandı!' : 'Kurulum başarıyla tamamlandı!');
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);

        } catch (error: any) {
            console.error('Setup error:', error);
            setInstallationStep('ERROR');

            const errStr = String(error);
            if (errStr.includes('| Detail:')) {
                const parts = errStr.split(' | ');
                const title = parts[0]; // PG Error XXX: Message
                const description = parts.slice(1).join('\n'); // Detail: ... \n Hint: ...
                toast.error(title, {
                    description: description,
                    duration: 10000, // Show longer for complex errors
                });
            } else {
                toast.error('Kurulum hatası: ' + error);
            }
        } finally {
            if (typeof unlisten === 'function') {
                unlisten();
            }
            // setLoading(false); // Removed as per instruction
        }
    };

    return (
        <div
            className="fixed inset-0 bg-[#0f172a] text-white flex items-center justify-center p-6 overflow-hidden z-[50000]"
            style={{ backgroundColor: '#0f172a' }}
        >

            {/* Background Ambient Glows - EXACTLY as in Login.tsx */}
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />

            <div className="w-full max-w-5xl bg-[#1e293b]/90 backdrop-blur-2xl border border-white/10 rounded-[40px] shadow-[0_32px_128px_-12px_rgba(0,0,0,0.8)] flex min-h-[700px] max-h-[90vh] relative z-10 transition-all duration-500">
                {/* Sidebar Navigation - Pure transparency to match Login card feel */}
                <div className="w-80 border-r border-white/15 p-8 flex flex-col relative z-20">
                    <div className="mb-12">
                        <div className="flex items-center gap-3 mb-2">
                            <NeonLogo variant="full" size="md" />
                        </div>
                        <p className="text-blue-200/60 text-[10px] uppercase tracking-widest font-black">Setup Wizard</p>
                    </div>

                    <div className="space-y-3 flex-1 text-left">
                        {(!config.skip_integration ? [
                            { id: 1, label: 'Altyapı Seçimi', icon: Server },
                            { id: 2, label: 'Entegrasyon Tercihi', icon: Layout },
                            { id: 3, label: 'ERP Bağlantısı', icon: Settings2 },
                            { id: 4, label: 'Firma & Dönem', icon: Globe },
                            { id: 5, label: 'Kasa Seçimi', icon: Database },
                            { id: 6, label: 'Sistem Veritabanı', icon: Database },
                            { id: 7, label: 'Cihaz Kaydı', icon: Cpu },
                            { id: 8, label: 'Private Mesh (VPN)', icon: Shield },
                            { id: 9, label: 'Özet ve Onay', icon: CheckCircle },
                            { id: 10, label: 'Sistem Kurulumu', icon: Activity },
                        ] : [
                            { id: 1, label: 'Altyapı Seçimi', icon: Server },
                            { id: 2, label: 'Entegrasyon Tercihi', icon: Layout },
                            { id: 3, label: 'Sistem Veritabanı', icon: Database },
                            { id: 4, label: 'Cihaz Kaydı', icon: Cpu },
                            { id: 5, label: 'Private Mesh (VPN)', icon: Shield },
                            { id: 6, label: 'Özet ve Onay', icon: CheckCircle },
                            { id: 7, label: 'Sistem Kurulumu', icon: Activity },
                        ]).map((s) => (
                            <div
                                key={s.id}
                                className={`flex items-center gap-4 p-3.5 rounded-xl transition-all ${step === s.id ? 'bg-blue-600/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <div className={`p-2 rounded-lg transition-colors ${step === s.id ? 'bg-blue-600 text-white' : 'bg-white/5'}`}>
                                    <s.icon className="w-4 h-4" />
                                </div>
                                <span className={`text-xs font-bold tracking-wide ${step === s.id ? 'text-blue-50' : ''}`}>{s.label}</span>
                                {step > s.id && <CheckCircle className="w-3.5 h-3.5 ml-auto text-blue-400" />}
                            </div>
                        ))}
                    </div>

                    {/* Active Session / User Display */}
                    <div className="p-4 rounded-3xl bg-white/[0.03] border border-white/5 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
                                <User className="w-5 h-5 text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-black text-blue-200/40 uppercase tracking-widest leading-none mb-1">Aktif Oturum</div>
                                <div className="text-sm font-black text-white truncate">{osUsername || 'Yükleniyor...'}</div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-8 border-t border-white/10">
                        <div className="flex items-center gap-2 text-[10px] text-blue-200 font-bold uppercase tracking-widest leading-none">
                            <Shield className="w-3 h-3 text-blue-500" />
                            Security Protocol Active
                        </div>
                    </div>
                </div>

                {/* Main Content Area - Pure transparency to let card background show through */}
                <div className="flex-1 flex flex-col relative overflow-hidden h-[700px]">
                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-10 custom-scrollbar relative">
                        {step === 1 && (
                            <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
                                {hasExistingConfig && (
                                    <div className="p-8 rounded-[32px] bg-gradient-to-r from-emerald-600/20 to-teal-600/20 border-2 border-emerald-500/30 shadow-[0_20px_60px_-15px_rgba(16,185,129,0.2)] relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 blur-[60px] rounded-full group-hover:bg-emerald-500/20 transition-all duration-700" />

                                        <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                                            <div className="w-20 h-20 rounded-3xl bg-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-500/20 transform group-hover:scale-105 transition-transform duration-500">
                                                <Zap className="w-10 h-10 text-white animate-pulse" />
                                            </div>
                                            <div className="flex-1 text-center md:text-left">
                                                <h3 className="text-2xl font-black text-white mb-2">Hızlı Güncelleme Modu Aktif</h3>
                                                <p className="text-emerald-100/70 text-sm font-bold uppercase tracking-widest leading-none mb-4">Mevcut bir yapılandırma tespit edildi.</p>
                                                <p className="text-emerald-100/60 text-xs leading-relaxed max-w-lg mb-6">
                                                    Sistem ayarlarınızı değiştirmeden sadece veritabanı şemasını (tabloları ve mantıksal katmanları) en güncel sürüme yükseltmek için bu modu kullanabilirsiniz.
                                                </p>
                                                <div className="flex flex-wrap gap-4">
                                                    <button
                                                        onClick={() => {
                                                            setIsUpdateMode(true);
                                                            setStep(5);
                                                        }}
                                                        className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-2"
                                                    >
                                                        <span>KUR (GÜNCELLE)</span>
                                                        <ArrowRight className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setHasExistingConfig(false)}
                                                        className="px-8 py-3.5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded-2xl font-bold text-sm transition-all flex items-center gap-2 border border-white/5"
                                                    >
                                                        Yeniden Kurulum Yap
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Section 1: System/Sector Type */}
                                <div className="space-y-6">
                                    <div className="mb-4">
                                        <h2 className="text-xl font-black mb-0.5 text-white tracking-tight">İşletme Tipi</h2>
                                        <p className="text-blue-400/60 font-medium uppercase tracking-[0.2em] text-[9px]">Business Model Configuration</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { id: 'retail', label: 'Mağazacılık', desc: 'Tekstil, Ayakkabı, Konfeksiyon', icon: Layout },
                                            { id: 'market', label: 'Market / Hızlı Satış', desc: 'Süpermarket, Büfe, FMCG', icon: CheckCircle },
                                            { id: 'wms', label: 'Depo Yönetimi', desc: 'WHMS-EX Entegre Sistem', icon: Building2 },
                                            { id: 'restaurant', label: 'Restoran / Kafe', desc: 'Masa Yönetimi, Mutfak, Menü', icon: UtensilsCrossed },
                                            { id: 'beauty', label: 'Güzellik Merkezi', desc: 'Beatpy Güzellik & Bakım', icon: Sparkles },
                                        ].map((sys) => (
                                            <button
                                                key={sys.id}
                                                onClick={() => setConfig({ ...config, system_type: sys.id as any })}
                                                className={`group relative p-4 rounded-2xl border transition-all duration-300 ${config.system_type === sys.id
                                                    ? 'bg-blue-600/10 border-blue-500/50 shadow-lg shadow-blue-500/5'
                                                    : 'bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.06]'
                                                    }`}
                                            >
                                                <div className="flex flex-col gap-3 relative z-10 text-left">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${config.system_type === sys.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                                        <sys.icon className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className={`text-xs font-black mb-0.5 transition-colors ${config.system_type === sys.id ? 'text-white' : 'text-slate-200'}`}>{sys.label}</div>
                                                        <div className={`text-[9px] font-bold leading-tight ${config.system_type === sys.id ? 'text-blue-200/60' : 'text-slate-500'}`}>{sys.desc}</div>
                                                    </div>
                                                </div>
                                                {config.system_type === sys.id && (
                                                    <div className="absolute top-3 right-3 animate-in zoom-in duration-300">
                                                        <CheckCircle className="w-4 h-4 text-blue-500" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Section Separator */}
                                <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-6" />

                                {/* Section 1.5: Role Selection (Center vs Store vs POS) */}
                                <div className="space-y-4">
                                    <div>
                                        <h2 className="text-xl font-black mb-0.5 text-white tracking-tight">Cihaz Rolü</h2>
                                        <p className="text-blue-400/60 font-medium uppercase tracking-[0.2em] text-[10px]">Device Role Configuration</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { id: 'center', label: 'Merkez Sunucu', desc: 'Ana Veritabanı & Yönetim Paneli', icon: Globe },
                                            { id: 'client', label: 'Terminal (Client)', desc: 'Satış Noktası veya Mağaza Terminali', icon: Cpu },
                                        ].map((r) => (
                                            <button
                                                key={r.id}
                                                onClick={() => {
                                                    // Auto-set mode based on role
                                                    const new_mode = r.id === 'center' ? 'offline' : 'hybrid';
                                                    setConfig({ ...config, role: r.id as any, db_mode: new_mode });
                                                }}
                                                className={`group relative p-6 rounded-2xl border transition-all duration-300 ${config.role === r.id
                                                    ? 'bg-blue-600/10 border-blue-500 shadow-xl shadow-blue-500/10'
                                                    : 'bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.08]'
                                                    }`}
                                            >
                                                <div className="flex flex-col gap-4 relative z-10 text-left">
                                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${config.role === r.id ? 'bg-blue-600 text-white scale-105 shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-400'}`}>
                                                        <r.icon className="w-7 h-7" />
                                                    </div>
                                                    <div>
                                                        <div className={`text-lg font-black mb-0.5 transition-colors ${config.role === r.id ? 'text-white' : 'text-slate-200'}`}>{r.label}</div>
                                                        <div className={`text-[11px] font-bold leading-relaxed ${config.role === r.id ? 'text-blue-200/60' : 'text-slate-500'}`}>{r.desc}</div>
                                                    </div>
                                                </div>
                                                {config.role === r.id && (
                                                    <div className="absolute top-5 right-5 animate-in zoom-in duration-300">
                                                        <div className="bg-blue-500 rounded-full p-1 shadow-lg">
                                                            <CheckCircle className="w-4 h-4 text-white" />
                                                        </div>
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Section Separator */}
                                <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-6" />

                                {/* Section 2: Infrastructure Mode */}
                                <div className="space-y-4">
                                    <div>
                                        <h2 className="text-xl font-black mb-0.5 text-white tracking-tight">Çalışma Modu</h2>
                                        <p className="text-blue-400/60 font-medium uppercase tracking-[0.2em] text-[10px]">Infrastructure Design Pattern</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {[
                                            { id: 'hybrid', label: 'Hybrid Experience', desc: 'Yerel hız + Bulut güvencesi. Kesinti anında yerel çalışmaya devam eder.', icon: Zap },
                                            { id: 'online', label: 'Cloud-Only Flow', desc: 'Tüm veriler anlık olarak merkez sunucuda tutulur. İnternet gereklidir.', icon: Globe },
                                            { id: 'offline', label: 'Standalone Unit', desc: 'Tamamen yerel veritabanı kullanımı. Internet bağımsızdır.', icon: WifiOff },
                                        ].map((mode) => (
                                            <button
                                                key={mode.id}
                                                onClick={() => setConfig({ ...config, db_mode: mode.id as any })}
                                                className={`group relative p-4 rounded-2xl border transition-all duration-300 ${config.db_mode === mode.id
                                                    ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/5'
                                                    : 'bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.08]'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4 relative z-10 text-left">
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${config.db_mode === mode.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                                        <mode.icon className="w-6 h-6" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className={`text-base font-black mb-0.5 transition-colors ${config.db_mode === mode.id ? 'text-white' : 'text-slate-200'}`}>{mode.label}</div>
                                                        <div className={`text-[10px] font-bold leading-tight max-w-sm ${config.db_mode === mode.id ? 'text-blue-200/60' : 'text-slate-500'}`}>{mode.desc}</div>
                                                    </div>
                                                    {config.db_mode === mode.id && <CheckCircle className="w-5 h-5 text-blue-500" />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="mb-8">
                                    <h2 className="text-3xl font-bold mb-1 text-white tracking-tight">Entegrasyon Tercihi</h2>
                                    <p className="text-blue-400/80 font-bold uppercase tracking-widest text-[10px]">Integration Strategy</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Option 1: Logo Integration */}
                                    <button
                                        onClick={() => setConfig({ ...config, skip_integration: false, erp_method: 'sql', is_nebim_migration: false })}
                                        className={`relative p-8 rounded-[38px] border-2 text-left transition-all duration-500 group overflow-hidden ${(!config.skip_integration && !config.is_nebim_migration)
                                            ? 'bg-blue-600/10 border-blue-500 shadow-[0_0_60px_-15px_rgba(37,99,235,0.4)] scale-[1.02]'
                                            : 'bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.05]'
                                            }`}
                                    >
                                        <div className="relative z-10">
                                            <div className="flex items-center justify-between mb-8">
                                                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all duration-500 ${(!config.skip_integration && !config.is_nebim_migration) ? 'bg-blue-600 shadow-2xl shadow-blue-600/40 rotate-6' : 'bg-white/5 group-hover:bg-blue-600/20'}`}>
                                                    <Settings2 className={`w-8 h-8 ${(!config.skip_integration && !config.is_nebim_migration) ? 'text-white' : 'text-slate-500 group-hover:text-blue-400'}`} />
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">Kurumsal Çözüm</span>
                                                    <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[8px] font-black text-slate-400 uppercase tracking-widest">Logo Entegre</div>
                                                </div>
                                            </div>

                                            <h3 className={`text-2xl font-black mb-3 transition-colors ${(!config.skip_integration && !config.is_nebim_migration) ? 'text-white' : 'text-slate-400'}`}>
                                                Logo Entegrasyonu
                                            </h3>
                                            <p className="text-xs font-semibold text-slate-500 leading-relaxed mb-8 group-hover:text-slate-400 transition-colors">
                                                Tiger, GO3 veya J-Guar sisteminizle gerçek zamanlı çift yönlü senkronizasyon.
                                            </p>

                                            <div className="space-y-3">
                                                {['Otomatik Stok & Fiyat Senk.', 'Cari Limit & Risk Takibi', 'B2B/B2C Hazır Altyapı'].map((item, i) => (
                                                    <div key={i} className="flex items-center gap-3 text-[10px] font-bold text-slate-400/80">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${(!config.skip_integration && !config.is_nebim_migration) ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-slate-700'}`} />
                                                        {item}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {(!config.skip_integration && !config.is_nebim_migration) && (
                                            <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-blue-600/10 blur-[40px] rounded-full" />
                                        )}
                                    </button>

                                    {/* Option 2: Nebim V3 Migration */}
                                    <button
                                        onClick={() => setConfig({ ...config, skip_integration: false, erp_method: 'nebim', is_nebim_migration: true, erp_firm_nr: '001', erp_period_nr: '2026' })}
                                        className={`relative p-8 rounded-[38px] border-2 text-left transition-all duration-500 group overflow-hidden ${config.is_nebim_migration
                                            ? 'bg-indigo-600/10 border-indigo-500 shadow-[0_0_60px_-15px_rgba(99,102,241,0.4)] scale-[1.02]'
                                            : 'bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.05]'
                                            }`}
                                    >
                                        <div className="relative z-10">
                                            <div className="flex items-center justify-between mb-8">
                                                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all duration-500 ${config.is_nebim_migration ? 'bg-indigo-600 shadow-2xl shadow-indigo-600/40 -rotate-6' : 'bg-white/5 group-hover:bg-indigo-600/20'}`}>
                                                    <Zap className={`w-8 h-8 ${config.is_nebim_migration ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'}`} />
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Hızlı Geçiş (A to B)</span>
                                                    <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[8px] font-black text-slate-400 uppercase tracking-widest">Nebim V3 Entegre</div>
                                                </div>
                                            </div>

                                            <h3 className={`text-2xl font-black mb-3 transition-colors ${config.is_nebim_migration ? 'text-white' : 'text-slate-400'}`}>
                                                Nebim V3 Hızlı Geçiş
                                            </h3>
                                            <p className="text-xs font-semibold text-slate-500 leading-relaxed mb-8 group-hover:text-slate-400 transition-colors">
                                                Mevcut Nebim V3 verilerinizi RetailEX'e otonom olarak taşıyın ve hemen başlayın.
                                            </p>

                                            <div className="space-y-3">
                                                {['1 Saatte Canlıya Geçiş', 'Personel & Yetki Mirası', 'Zero-Touch Veri Göçü'].map((item, i) => (
                                                    <div key={i} className="flex items-center gap-3 text-[10px] font-bold text-slate-400/80">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${config.is_nebim_migration ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'bg-slate-700'}`} />
                                                        {item}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {config.is_nebim_migration && (
                                            <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-indigo-600/10 blur-[40px] rounded-full" />
                                        )}
                                    </button>
                                </div>

                                {/* Option 3: Standalone (Secondary Position) */}
                                <div className="mt-6">
                                    <button
                                        onClick={() => setConfig({ ...config, skip_integration: true, is_nebim_migration: false })}
                                        className={`w-full flex items-center justify-between p-6 rounded-[32px] border-2 text-left transition-all duration-500 group relative overflow-hidden ${config.skip_integration
                                            ? 'bg-emerald-600/10 border-emerald-500 shadow-xl shadow-emerald-500/10'
                                            : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
                                            }`}
                                    >
                                        <div className="flex items-center gap-6 relative z-10">
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${config.skip_integration ? 'bg-emerald-600 text-white' : 'bg-white/5 text-slate-500'}`}>
                                                <Layout className="w-7 h-7" />
                                            </div>
                                            <div>
                                                <h3 className={`text-lg font-black transition-colors ${config.skip_integration ? 'text-white' : 'text-slate-400'}`}>Bağımsız Mod (Standalone)</h3>
                                                <p className="text-[10px] font-semibold text-slate-500">Herhangi bir dış ERP sistemi olmadan direkt RetailEX mimarisini kullanın.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 relative z-10">
                                            {config.skip_integration && (
                                                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-widest rounded-lg border border-emerald-500/20">Aktif Seçim</span>
                                            )}
                                            <ArrowRight className={`w-5 h-5 transition-transform group-hover:translate-x-1 ${config.skip_integration ? 'text-emerald-500' : 'text-slate-700'}`} />
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}

                        {((step === 3 && config.skip_integration) || (step === 6 && !config.skip_integration)) && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-3xl font-bold mb-1 text-white tracking-tight">Veritabanı Ayarları</h2>
                                        <p className="text-blue-400/80 font-bold uppercase tracking-widest text-[10px]">PostgreSQL Infrastructure Configuration</p>
                                    </div>

                                    {/* Tabs */}
                                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                                        <button
                                            onClick={() => setActiveTab('standard')}
                                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'standard'
                                                ? 'bg-blue-600 text-white shadow-lg'
                                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                                                }`}
                                        >
                                            Standart Kurulum
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('supabase')}
                                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'supabase'
                                                ? 'bg-emerald-600 text-white shadow-lg'
                                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                                                }`}
                                        >
                                            <Cloud className="w-3 h-3" />
                                            Bulut İçe Aktarma
                                        </button>
                                    </div>
                                </div>

                                {/* Content: Standard Setup */}
                                {activeTab === 'standard' && (
                                    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2">
                                        {/* DB Status Feedback Area */}
                                        {dbStatus === 'CHECKING' && (
                                            <div className="p-6 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-4 animate-pulse">
                                                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                                                <span className="text-xs font-black text-blue-200 uppercase tracking-widest">PostgreSQL Durumu Kontrol Ediliyor...</span>
                                            </div>
                                        )}

                                        {dbStatus === 'NOT_FOUND' && (
                                            <div className="p-8 rounded-[32px] bg-red-600/10 border-2 border-red-500/30 shadow-[0_20px_60px_-15px_rgba(239,68,68,0.2)] animate-in zoom-in-95">
                                                <div className="flex items-start gap-6">
                                                    <div className="w-14 h-14 rounded-2xl bg-red-500 flex items-center justify-center shrink-0 shadow-lg shadow-red-500/20">
                                                        <Database className="w-7 h-7 text-white" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <h4 className="text-xl font-black text-white">PostgreSQL Bulunamadı!</h4>
                                                        <p className="text-red-200/70 text-sm font-medium leading-relaxed">
                                                            Bilgisayarınızda çalışan bir PostgreSQL servisi tespit edilemedi. RetailEx'in çalışabilmesi için yerel bir veritabanı gereklidir.
                                                        </p>
                                                        <div className="pt-4 flex flex-wrap gap-4">
                                                            <a
                                                                href="https://www.postgresql.org/download/windows/"
                                                                target="_blank"
                                                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
                                                            >
                                                                POSTGRESQL İNDİR
                                                            </a>
                                                            <button
                                                                onClick={checkDbStatus}
                                                                className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md"
                                                            >
                                                                TEKRAR KONTROL ET
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {dbStatus === 'AUTH_FAILED' && (
                                            <div className="p-8 rounded-[32px] bg-amber-600/10 border-2 border-amber-500/30 shadow-[0_20px_60px_-15px_rgba(245,158,11,0.2)] animate-in zoom-in-95">
                                                <div className="flex items-start gap-6">
                                                    <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
                                                        <Lock className="w-7 h-7 text-white" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <h4 className="text-xl font-black text-white">Kimlik Doğrulama Hatası</h4>
                                                        <p className="text-amber-200/70 text-sm font-medium leading-relaxed">
                                                            PostgreSQL servisine bağlanıldı ancak girdiğiniz kullanıcı adı veya şifre hatalı. Lütfen "postgres" şifrenizi kontrol edin.
                                                        </p>
                                                        <button
                                                            onClick={checkDbStatus}
                                                            className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            BİLGİLERİ GÜNCELLE VE DENE
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {dbStatus === 'ERROR' && (
                                            <div className="p-8 rounded-[32px] bg-red-600/10 border-2 border-red-500/30 shadow-[0_20px_60px_-15px_rgba(239,68,68,0.2)] animate-in zoom-in-95">
                                                <div className="flex items-start gap-6">
                                                    <div className="w-14 h-14 rounded-2xl bg-red-500 flex items-center justify-center shrink-0 shadow-lg shadow-red-500/20">
                                                        <Cpu className="w-7 h-7 text-white" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <h4 className="text-xl font-black text-white">Sistem Hatası Tespit Edildi</h4>
                                                        <p className="text-red-200/70 text-sm font-medium leading-relaxed font-mono bg-black/20 p-4 rounded-2xl border border-red-500/20 mt-2">
                                                            {dbErrorMessage}
                                                        </p>
                                                        <div className="pt-4 flex gap-4">
                                                            <button
                                                                onClick={checkDbStatus}
                                                                className="px-6 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
                                                            >
                                                                TEKRAR DENE
                                                            </button>
                                                            <button
                                                                onClick={() => setDbStatus('IDLE')}
                                                                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                                                            >
                                                                YOKSAY
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Local Server Section */}
                                        <div className={`relative p-8 rounded-2xl transition-all duration-300 border ${dbStatus === 'RUNNING' ? 'bg-blue-600/5 border-blue-500/30' :
                                            dbStatus === 'AUTH_FAILED' ? 'bg-amber-600/5 border-amber-500/30' :
                                                'bg-white/[0.03] border-white/5'
                                            } overflow-hidden group`}>
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[50px] rounded-full" />

                                            <div className="flex items-center gap-3 mb-6">
                                                <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
                                                    <Database className="w-4 h-4 text-blue-500" />
                                                </div>
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Yerel Sunucu (Localhost)</span>
                                                {dbStatus === 'RUNNING' && <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-blue-400 uppercase tracking-widest"><CheckCircle className="w-3 h-3" />Bağlı</div>}
                                            </div>

                                            <div className="space-y-6 relative z-10">
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1">Bağlantı Adresi</label>
                                                    <div className="relative group/input">
                                                        <input
                                                            type="text"
                                                            className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-xs placeholder:text-slate-600 shadow-inner"
                                                            value={config.local_db}
                                                            onChange={(e) => setConfig({ ...config, local_db: e.target.value })}
                                                            placeholder="localhost:5432/retailex_local"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-4 pt-4 border-t border-white/5">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1">Kimlik Doğrulama</label>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="relative">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                                                <User className="w-3.5 h-3.5" />
                                                            </span>
                                                            <input
                                                                type="text"
                                                                className={`w-full bg-slate-900/60 border rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all font-semibold text-xs placeholder:text-slate-600 ${dbStatus === 'AUTH_FAILED' ? 'border-amber-500/50' : 'border-white/5'}`}
                                                                value={config.pg_local_user}
                                                                onChange={(e) => setConfig({ ...config, pg_local_user: e.target.value })}
                                                                placeholder="Kullanıcı"
                                                            />
                                                        </div>
                                                        <div className="relative">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                                                <Lock className="w-3.5 h-3.5" />
                                                            </span>
                                                            <input
                                                                type="password"
                                                                className={`w-full bg-slate-900/60 border rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all font-semibold text-xs placeholder:text-slate-600 ${dbStatus === 'AUTH_FAILED' ? 'border-amber-500/50' : 'border-white/5'}`}
                                                                value={config.pg_local_pass}
                                                                onChange={(e) => setConfig({ ...config, pg_local_pass: e.target.value })}
                                                                placeholder="Parola"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Demo Data Checkbox */}
                                                <div className="pt-4 border-t border-white/5">
                                                    <label className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-purple-600/10 to-blue-600/10 border border-purple-500/20 cursor-pointer hover:border-purple-500/40 transition-all group">
                                                        <input
                                                            type="checkbox"
                                                            checked={loadDemoData}
                                                            onChange={(e) => setLoadDemoData(e.target.checked)}
                                                            className="w-5 h-5 rounded border-2 border-purple-500/50 bg-slate-900/60 checked:bg-purple-600 checked:border-purple-600 focus:ring-2 focus:ring-purple-500/50 transition-all cursor-pointer"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-bold text-white">Demo Veriler Yükle</span>
                                                                <span className="px-2 py-0.5 bg-purple-600/20 text-purple-400 text-[9px] font-black uppercase tracking-wider rounded-full">Opsiyonel</span>
                                                            </div>
                                                            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                                                                13 ürün, 8 müşteri, 3 fatura ve örnek kasa hareketleri ile test ortamı oluştur
                                                            </p>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center group-hover:bg-purple-600/30 transition-all">
                                                            <Database className="w-4 h-4 text-purple-400" />
                                                        </div>
                                                    </label>
                                                </div>


                                                <div className="pt-2 flex flex-col gap-3">
                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={checkDbStatus}
                                                            disabled={dbStatus === 'CHECKING'}
                                                            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-bold text-[11px] tracking-wide transition-all flex items-center justify-center gap-2"
                                                        >
                                                            {dbStatus === 'CHECKING' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                                            <span>TEST ET</span>
                                                        </button>
                                                        <button
                                                            onClick={() => initializeDatabase('local')}
                                                            disabled={loading || dbInitialized || dbStatus !== 'RUNNING'}
                                                            className={`flex-1 py-3 rounded-xl font-bold text-[11px] tracking-wide transition-all flex items-center justify-center gap-2 border ${dbInitialized
                                                                ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                                                                : dbStatus === 'RUNNING'
                                                                    ? 'bg-blue-600 text-white border-blue-500'
                                                                    : 'bg-white/5 text-slate-600 border-white/5 cursor-not-allowed'
                                                                }`}
                                                        >
                                                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                                                            <span>{dbInitialized ? 'VERİTABANI OLUŞTURULDU' : 'OLUŞTUR'}</span>
                                                        </button>
                                                    </div>

                                                    {dbInitialized && (
                                                        <button
                                                            onClick={runMigrations}
                                                            disabled={loading}
                                                            className="w-full py-3.5 bg-blue-600 text-white border border-blue-500 rounded-xl font-bold text-xs tracking-widest transition-all flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2"
                                                        >
                                                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
                                                            TABLOLARI GÜNCELLE
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Remote Server Section - HIDDEN for Center Role */}
                                        {config.role !== 'center' && (
                                            <div className="relative p-8 rounded-[32px] bg-white/[0.03] border border-white/5 overflow-hidden group hover:bg-white/[0.05] transition-all duration-500">
                                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[60px] rounded-full" />

                                                <div className="flex items-center gap-3 mb-6">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                                                        <Cloud className="w-4 h-4 text-indigo-400" />
                                                    </div>
                                                    <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">Uzak Sunucu (Bulut/Merkez)</span>
                                                </div>

                                                <div className="space-y-6 relative z-10">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-blue-200 uppercase tracking-widest pl-1">Bağlantı Adresi</label>
                                                        <input
                                                            type="text"
                                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-indigo-500 transition-all font-mono text-sm placeholder:text-blue-200/30"
                                                            value={config.remote_db}
                                                            onChange={(e) => setConfig({ ...config, remote_db: e.target.value })}
                                                            placeholder="91.205.41.130:5432/retailos_db"
                                                        />
                                                    </div>

                                                    <div className="space-y-2 pt-2 border-t border-white/5">
                                                        <label className="text-[10px] font-black text-blue-200 uppercase tracking-widest pl-1">Kimlik Doğrulama (PostgreSQL)</label>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="relative">
                                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300">
                                                                    <User className="w-4 h-4" />
                                                                </span>
                                                                <input
                                                                    type="text"
                                                                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-white focus:outline-none focus:border-indigo-500 transition-all font-semibold text-xs placeholder:text-blue-200/30"
                                                                    value={config.pg_remote_user}
                                                                    onChange={(e) => setConfig({ ...config, pg_remote_user: e.target.value })}
                                                                    placeholder="Kullanıcı Adı"
                                                                />
                                                            </div>
                                                            <div className="relative">
                                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300">
                                                                    <Lock className="w-4 h-4" />
                                                                </span>
                                                                <input
                                                                    type="password"
                                                                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-white focus:outline-none focus:border-indigo-500 transition-all font-semibold text-xs placeholder:text-blue-200/30"
                                                                    value={config.pg_remote_pass}
                                                                    onChange={(e) => setConfig({ ...config, pg_remote_pass: e.target.value })}
                                                                    placeholder="Parola"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Content: Supabase Import */}
                                {activeTab === 'supabase' && (
                                    <div className="p-8 rounded-[32px] bg-gradient-to-br from-indigo-900/40 to-blue-900/20 border border-blue-500/30 shadow-2xl relative overflow-hidden group animate-in fade-in slide-in-from-bottom-2">
                                        <div className="absolute top-0 right-0 w-60 h-60 bg-blue-500/10 blur-[80px] rounded-full group-hover:bg-blue-500/20 transition-all duration-1000" />

                                        <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                                            <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shadow-inner">
                                                <Cloud className="w-10 h-10 text-emerald-400" />
                                            </div>
                                            <div className="flex-1 text-center md:text-left">
                                                <h3 className="text-xl font-bold text-white mb-1">Supabase Proje Aktarıcı</h3>
                                                <p className="text-xs text-blue-200/60 font-medium leading-relaxed mb-4">
                                                    Buluttaki Supabase projenizi tek adımda içe aktarın. Tüm tablolar ve veritabanı şeması yerel sunucunuza kopyalanır.
                                                </p>

                                                <div className="flex flex-col sm:flex-row gap-3">
                                                    <div className="flex-1 relative">
                                                        <input
                                                            type="password"
                                                            value={supabaseToken}
                                                            onChange={(e) => setSupabaseToken(e.target.value)}
                                                            placeholder="Supabase PAT (Management Token)"
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono focus:border-blue-500 outline-none transition-all placeholder:text-blue-200/20"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={fetchSupabaseProjects}
                                                        disabled={isFetchingSupabase || !supabaseToken}
                                                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-[10px] tracking-widest transition-all flex items-center justify-center gap-2"
                                                    >
                                                        {isFetchingSupabase ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                                                        PROJELERİ LİSTELE
                                                    </button>
                                                </div>

                                                {supabaseProjects.length > 0 && (
                                                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-4">
                                                        {supabaseProjects.map((p: any) => (
                                                            <div
                                                                key={p.id}
                                                                className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group/item"
                                                            >
                                                                <div className="flex items-center gap-4 mb-4">
                                                                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover/item:bg-blue-500 group-hover/item:text-white transition-all">
                                                                        <Database className="w-5 h-5 text-blue-400 group-hover/item:text-white" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-xs font-bold text-white truncate">{p.name}</div>
                                                                        <div className="text-[10px] text-blue-200/40 uppercase font-black tracking-tighter">{p.id}</div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => selectSupabaseProject(p)}
                                                                        className="p-2 bg-blue-600 rounded-lg text-white"
                                                                    >
                                                                        <ChevronRight className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => downloadSupabaseSql(p)}
                                                                        disabled={isDumpingSql}
                                                                        className="flex-1 py-1.5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-1.5"
                                                                    >
                                                                        {isDumpingSql ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                                                        SQL İNDİR
                                                                    </button>
                                                                    {downloadedSqlPath && downloadedSqlPath.includes(p.id) && (
                                                                        <button
                                                                            onClick={runDownloadedSql}
                                                                            className="flex-1 py-1.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/10 animate-in zoom-in-95"
                                                                        >
                                                                            <Terminal className="w-3 h-3" />
                                                                            LOKAL KUR
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 2 && (
                            <div className="mt-8 pt-8 border-t border-white/5 animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex items-center justify-between p-6 rounded-[24px] bg-indigo-900/10 border border-indigo-500/20 hover:bg-indigo-900/20 transition-all group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
                                            <Upload className="w-6 h-6 text-indigo-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white mb-1">Eski Yedekten Kurulum (Migration)</h3>
                                            <p className="text-xs text-indigo-200/60 font-medium">Var olan bir `public` şemalı yedeği yeni yapıya dönüştürür.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            if (isTauri) {
                                                try {
                                                    const { open } = await import('@tauri-apps/plugin-dialog');
                                                    const { invoke } = await import('@tauri-apps/api/core');

                                                    const selected = await open({
                                                        multiple: false,
                                                        filters: [{ name: 'SQL Backup', extensions: ['sql'] }]
                                                    });

                                                    if (selected && typeof selected === 'string') {
                                                        setLoading(true);
                                                        const target = config.db_mode === 'online' ? 'remote' : 'local';

                                                        toast.info('Veritabanı hazırlanıyor...');
                                                        await invoke('create_database', { config, target });

                                                        toast.info('Eski yedek yükleniyor...');
                                                        await invoke('pg_execute_file', {
                                                            connStr: target === 'local'
                                                                ? `postgres://${config.pg_local_user}:${config.pg_local_pass}@localhost:5432/${config.local_db.split('/')[1] || config.local_db}`
                                                                : config.remote_db,
                                                            filePath: selected
                                                        });

                                                        toast.info('Veriler yeni yapıya dönüştürülüyor...');
                                                        const migrationScriptPath = 'd:/Exretailosv1/database/scripts/migrate_legacy_to_v3.sql';
                                                        await invoke('pg_execute_file', {
                                                            connStr: target === 'local'
                                                                ? `postgres://${config.pg_local_user}:${config.pg_local_pass}@localhost:5432/${config.local_db.split('/')[1] || config.local_db}`
                                                                : config.remote_db,
                                                            filePath: migrationScriptPath
                                                        });

                                                        toast.success('Migration başarıyla tamamlandı!');
                                                        setDbInitialized(true);
                                                    }
                                                } catch (err) {
                                                    console.error(err);
                                                    toast.error('Migration hatası: ' + err);
                                                } finally {
                                                    setLoading(false);
                                                }
                                            } else {
                                                toast.error('Geriye dönük migration sadece Desktop uygulamasında desteklenmektedir.');
                                            }
                                        }}
                                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                                    >
                                        <Upload className="w-4 h-4" />
                                        Yedek Seç & Başlat
                                    </button>
                                </div>
                            </div>
                        )}



                        {step === 3 && !config.skip_integration && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="flex items-center justify-between bg-white/[0.02] p-6 rounded-3xl border border-white/5">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl ${config.is_nebim_migration ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-blue-500/10 border-blue-500/20'} flex items-center justify-center border`}>
                                            <Globe className={`w-6 h-6 ${config.is_nebim_migration ? 'text-indigo-400' : 'text-blue-400'}`} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white tracking-tight">
                                                {config.is_nebim_migration ? 'Nebim V3 Sunucu Doğrulaması' : 'Logo ERP Bağlantı Protokolü'}
                                            </h3>
                                            <p className={`text-[10px] ${config.is_nebim_migration ? 'text-indigo-400/60' : 'text-blue-400/60'} font-black uppercase tracking-widest leading-none mt-1`}>
                                                {config.is_nebim_migration ? 'Nebim MSSQL Master Veritabanı Bilgileri' : 'Logo Veritabanı & Servis Yapılandırması'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {['SQL', 'API', 'REST', 'NEBIM', 'OBJECT'].map((tab) => (
                                            <button
                                                key={tab}
                                                onClick={() => setConfig({ ...config, erp_method: tab.toLowerCase() as any })}
                                                className={`px-3 py-1.5 rounded-xl text-[9px] font-black tracking-widest transition-all ${config.erp_method === tab.toLowerCase() || (config.erp_method === 'object' && tab === 'OBJECT')
                                                    ? 'bg-blue-600 text-white shadow-lg'
                                                    : 'bg-white/[0.03] text-slate-500 hover:text-white border border-white/5'
                                                    }`}
                                            >
                                                {tab === 'OBJECT' ? 'OBJ DLL' : tab}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-6 max-w-2xl mx-auto">
                                    <div className={`space-y-4 bg-white/[0.02] p-8 rounded-[32px] border transition-all duration-500 ${config.is_nebim_migration ? 'border-indigo-500/20 shadow-[0_20px_40px_-10px_rgba(99,102,241,0.1)]' : 'border-blue-500/20 shadow-[0_20px_40px_-10px_rgba(59,130,246,0.1)]'}`}>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-blue-200/40 uppercase tracking-widest pl-1">{config.is_nebim_migration ? 'Nebim Server / IP' : 'Server Host / IP'}</label>
                                                <div className="relative group">
                                                    <Server className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500/40 group-focus-within:text-blue-500 transition-colors" />
                                                    <input
                                                        type="text"
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500 transition-all font-bold placeholder:font-medium"
                                                        value={config.erp_host}
                                                        onChange={(e) => setConfig({ ...config, erp_host: e.target.value })}
                                                        placeholder="Örn: 192.168.1.10"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-blue-200/40 uppercase tracking-widest pl-1">Database Name</label>
                                                <div className="relative group">
                                                    <Database className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500/40 group-focus-within:text-blue-500 transition-colors" />
                                                    <input
                                                        type="text"
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500 transition-all font-bold placeholder:font-medium"
                                                        value={config.erp_db}
                                                        onChange={(e) => setConfig({ ...config, erp_db: e.target.value })}
                                                        placeholder="Örn: TIGERDB"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-blue-200/40 uppercase tracking-widest pl-1">SQL Username</label>
                                                <div className="relative group">
                                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500/40 group-focus-within:text-blue-500 transition-colors" />
                                                    <input
                                                        type="text"
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500 transition-all font-bold placeholder:font-medium"
                                                        value={config.erp_user}
                                                        onChange={(e) => setConfig({ ...config, erp_user: e.target.value })}
                                                        placeholder="sa"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-blue-200/40 uppercase tracking-widest pl-1">SQL Password</label>
                                                <div className="relative group">
                                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500/40 group-focus-within:text-blue-500 transition-colors" />
                                                    <input
                                                        type="password"
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500 transition-all font-bold"
                                                        value={config.erp_pass}
                                                        onChange={(e) => setConfig({ ...config, erp_pass: e.target.value })}
                                                        placeholder="••••••••"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {config.erp_method === 'object' && (
                                            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/5 animate-in slide-in-from-top-2">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-emerald-400/40 uppercase tracking-widest pl-1">Logo OBJ User</label>
                                                    <div className="relative group">
                                                        <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/40 group-focus-within:text-emerald-500 transition-colors" />
                                                        <input
                                                            type="text"
                                                            className="w-full bg-black/40 border border-emerald-500/20 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500 transition-all font-bold"
                                                            value={config.logo_objects_user}
                                                            onChange={(e) => setConfig({ ...config, logo_objects_user: e.target.value })}
                                                            placeholder="LOGO_USER"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-emerald-400/40 uppercase tracking-widest pl-1">Logo OBJ Pass</label>
                                                    <div className="relative group">
                                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/40 group-focus-within:text-emerald-500 transition-colors" />
                                                        <input
                                                            type="password"
                                                            className="w-full bg-black/40 border border-emerald-500/20 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500 transition-all font-bold"
                                                            value={config.logo_objects_pass}
                                                            onChange={(e) => setConfig({ ...config, logo_objects_pass: e.target.value })}
                                                            placeholder="••••••••"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5 col-span-2">
                                                    <label className="text-[9px] font-black text-emerald-400/40 uppercase tracking-widest pl-1">Logo Objects DLL Path</label>
                                                    <div className="relative group">
                                                        <FileCode className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/40 group-focus-within:text-emerald-500 transition-colors" />
                                                        <input
                                                            type="text"
                                                            className="w-full bg-black/40 border border-emerald-500/20 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500 transition-all font-mono placeholder:text-emerald-500/30"
                                                            value={config.logo_objects_path}
                                                            onChange={(e) => setConfig({ ...config, logo_objects_path: e.target.value })}
                                                            placeholder="C:\LOGO\LObjects.dll"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={testLogoConnection}
                                            disabled={testingLogo}
                                            className={`w-full mt-6 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] ${config.is_nebim_migration
                                                ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'
                                                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'}`}
                                        >
                                            {testingLogo ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    {config.is_nebim_migration ? 'NEBİM MSSQL KONTROL EDİLİYOR...' : 'LOGO MSSQL DOĞRULANIYOR...'}
                                                </>
                                            ) : (
                                                <>
                                                    <Zap className="w-5 h-5" />
                                                    {config.is_nebim_migration ? 'NEBİM BAĞLANTISINI TEST ET' : 'LOGO BAĞLANTISINI DOĞRULA'}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-center gap-3">
                                        <Shield className="w-4 h-4 text-amber-500" />
                                        <p className="text-[10px] font-bold text-amber-200/60 leading-tight">
                                            RetailEX <span className="text-amber-400">Read-Only</span> modunda bağlanır.
                                            Orijinal verileriniz üzerinde silme işlemi yapılmaz.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                {!config.skip_integration ? (
                                    <div className="space-y-8">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h2 className="text-3xl font-black text-white tracking-tight">Firma Seçimi</h2>
                                                <p className="text-blue-400/60 font-black uppercase tracking-[0.2em] text-[10px] mt-1">Lütfen devam etmek için bir firma seçin</p>
                                            </div>
                                            <div className="flex bg-white/5 px-4 py-2 rounded-2xl border border-white/5">
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{companies.length} Müsait Firma</div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4 max-h-[320px] overflow-y-auto pr-4 custom-scrollbar">
                                            {companies.map(firm => (
                                                <button
                                                    key={firm.id}
                                                    onClick={() => {
                                                        setSelectedCompanyId(firm.id);
                                                        const updatedConfig = { ...config, erp_firm_nr: firm.id.padStart(3, '0'), erp_period_nr: '' };
                                                        setConfig(updatedConfig);
                                                        fetchPeriods(firm.id, (logoPreviewEntity || 'ITEMS') as any, updatedConfig);
                                                    }}
                                                    className={`p-5 rounded-3xl text-left transition-all relative overflow-hidden group border ${selectedCompanyId === firm.id
                                                        ? 'bg-blue-600 border-blue-400 shadow-[0_20px_40px_rgba(37,99,235,0.2)]'
                                                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                                                        }`}
                                                >
                                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-3 transition-colors ${selectedCompanyId === firm.id ? 'bg-white/20' : 'bg-blue-500/10'}`}>
                                                        <Building2 className={`w-5 h-5 ${selectedCompanyId === firm.id ? 'text-white' : 'text-blue-400'}`} />
                                                    </div>
                                                    <div className="relative z-10">
                                                        <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${selectedCompanyId === firm.id ? 'text-white/60' : 'text-blue-400/60'}`}>Firma No: {firm.id}</div>
                                                        <h4 className={`text-xs font-bold leading-tight ${selectedCompanyId === firm.id ? 'text-white' : 'text-slate-200'}`}>{firm.name}</h4>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        {selectedCompanyId && (
                                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                <div className="space-y-4">
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black text-blue-200/40 uppercase tracking-widest pl-1">Çalışma Dönemi (Manuel Giriş)</label>
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative group w-32">
                                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                                    <span className="text-slate-500 font-bold text-xs">#</span>
                                                                </div>
                                                                <input
                                                                    type="text"
                                                                    value={config.erp_period_nr}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                                                        setConfig({ ...config, erp_period_nr: val });
                                                                    }}
                                                                    placeholder="01"
                                                                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white font-mono font-bold text-center focus:outline-none focus:border-blue-500 transition-all"
                                                                    maxLength={2}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => fetchLogoPreview(logoPreviewEntity || 'ITEMS')}
                                                                className="px-6 py-3 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-white rounded-xl font-bold text-[10px] tracking-widest uppercase transition-all border border-blue-500/30"
                                                            >
                                                                VERİLERİ LİSTELE
                                                            </button>
                                                        </div>
                                                        <p className="text-[9px] text-slate-500 font-medium ml-1">
                                                            Dönem listesi gelmiyorsa manuel olarak (örn: 01) yazıp listele diyebilirsiniz.
                                                        </p>
                                                    </div>

                                                    {periods && periods.length > 0 && (
                                                        <div className="space-y-3 pt-2 border-t border-white/5">
                                                            <label className="text-[9px] font-black text-blue-200/40 uppercase tracking-widest pl-1">Bulunan Dönemler</label>
                                                            <div className="flex flex-wrap gap-2">
                                                                {periods.map(p => (
                                                                    <button
                                                                        key={p.nr}
                                                                        onClick={() => {
                                                                            const periodNr = String(p.nr).padStart(2, '0');
                                                                            const updatedConfig = { ...config, erp_period_nr: periodNr };
                                                                            setConfig(updatedConfig);
                                                                            fetchLogoPreview((logoPreviewEntity || 'ITEMS') as any, updatedConfig);
                                                                        }}
                                                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${config.erp_period_nr === String(p.nr).padStart(2, '0')
                                                                            ? 'bg-emerald-600 text-white shadow-lg'
                                                                            : 'bg-white/5 text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-400/10 border border-emerald-400/20'
                                                                            }`}
                                                                    >
                                                                        DÖNEM {String(p.nr).padStart(2, '0')}
                                                                        {p.start_date && (
                                                                            <span className="ml-1.5 opacity-70 font-normal">
                                                                                {p.start_date.slice(0, 10)} → {p.end_date?.slice(0, 10)}
                                                                            </span>
                                                                        )}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            {/* Seçili dönem tarih düzenleme */}
                                                            {config.erp_period_nr && (() => {
                                                                const selPeriod = periods.find(p => String(p.nr).padStart(2, '0') === config.erp_period_nr);
                                                                if (!selPeriod) return null;
                                                                return (
                                                                    <div className="flex items-center gap-3 mt-2 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                                                                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest shrink-0">Dönem {config.erp_period_nr} Tarihleri</span>
                                                                        <input
                                                                            type="date"
                                                                            value={selPeriod.start_date?.slice(0, 10) || ''}
                                                                            onChange={(e) => {
                                                                                const updated = periods.map(p =>
                                                                                    String(p.nr).padStart(2, '0') === config.erp_period_nr
                                                                                        ? { ...p, start_date: e.target.value }
                                                                                        : p
                                                                                );
                                                                                setPeriods(updated);
                                                                                setCompanies(prev => prev.map(c =>
                                                                                    c.id === selectedCompanyId ? { ...c, periods: updated } : c
                                                                                ));
                                                                            }}
                                                                            className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-[11px] focus:outline-none focus:border-emerald-500"
                                                                        />
                                                                        <span className="text-slate-500 text-xs">→</span>
                                                                        <input
                                                                            type="date"
                                                                            value={selPeriod.end_date?.slice(0, 10) || ''}
                                                                            onChange={(e) => {
                                                                                const updated = periods.map(p =>
                                                                                    String(p.nr).padStart(2, '0') === config.erp_period_nr
                                                                                        ? { ...p, end_date: e.target.value }
                                                                                        : p
                                                                                );
                                                                                setPeriods(updated);
                                                                                setCompanies(prev => prev.map(c =>
                                                                                    c.id === selectedCompanyId ? { ...c, periods: updated } : c
                                                                                ));
                                                                            }}
                                                                            className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-[11px] focus:outline-none focus:border-emerald-500"
                                                                        />
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className={`rounded-3xl border transition-all duration-500 overflow-hidden ${isPreviewFullscreen
                                                    ? 'fixed inset-4 z-[100] bg-[#0c1117]/98 backdrop-blur-2xl border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.5)]'
                                                    : 'bg-white/[0.02] border-white/10 relative'
                                                    }`}>
                                                    <div className="flex items-center justify-between px-5 pt-4 border-b border-white/5">
                                                        <div className="flex items-center gap-6">
                                                            {[
                                                                { id: 'ITEMS', label: 'STOK', icon: Layout },
                                                                { id: 'CLCARD', label: 'CARİ', icon: Building2 },
                                                                { id: 'INVOICE', label: 'FATURA', icon: RefreshCw },
                                                                { id: 'KSCARD', label: 'KASA', icon: Database },
                                                            ].map((t) => (
                                                                <button
                                                                    key={t.id}
                                                                    onClick={() => fetchLogoPreview(t.id as any)}
                                                                    className={`pb-3 text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5 transition-all relative ${logoPreviewEntity === t.id ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
                                                                        }`}
                                                                >
                                                                    <t.icon className="w-3.5 h-3.5" />
                                                                    {t.label}
                                                                    {logoPreviewEntity === t.id && (
                                                                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 rounded-full" />
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="flex items-center gap-2 -mt-2">
                                                            <button
                                                                onClick={() => fetchLogoPreview(logoPreviewEntity || 'ITEMS')}
                                                                disabled={logoPreviewLoading}
                                                                className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-all disabled:opacity-30"
                                                                title="Yenile"
                                                            >
                                                                <RefreshCw className={`w-3.5 h-3.5 ${logoPreviewLoading ? 'animate-spin' : ''}`} />
                                                            </button>
                                                            <button
                                                                onClick={() => setIsPreviewFullscreen(!isPreviewFullscreen)}
                                                                className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-all"
                                                            >
                                                                {isPreviewFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {logoPreviewSql && (
                                                        <div className="mb-4 mx-5 p-3 rounded-xl bg-black/40 border border-blue-500/20 font-mono text-[9px] text-blue-400/80 break-all select-all hover:text-blue-300 transition-colors">
                                                            <div className="flex items-center gap-2 mb-1.5 opacity-50">
                                                                <Terminal className="w-3 h-3" />
                                                                <span className="font-black uppercase tracking-widest">Çalıştırılan SQL Sorgusu</span>
                                                            </div>
                                                            {logoPreviewSql}
                                                        </div>
                                                    )}

                                                    <div className={`${isPreviewFullscreen ? 'h-[calc(100vh-160px)]' : 'max-h-[260px]'} overflow-auto custom-scrollbar`}>
                                                        {logoPreviewLoading ? (
                                                            <div className="h-48 flex flex-col items-center justify-center gap-4">
                                                                <Loader2 className="w-8 h-8 text-blue-500 animate-spin opacity-50" />
                                                                <p className="text-[10px] font-bold tracking-widest text-blue-400/50 uppercase">Veriler Hazırlanıyor...</p>
                                                            </div>
                                                        ) : logoPreviewData && logoPreviewData.length > 0 ? (
                                                            <table className="w-full text-[11px] text-left border-collapse">
                                                                <thead className="sticky top-0 bg-[#0c1117] z-10">
                                                                    <tr className="border-b border-white/5">
                                                                        {Object.keys(logoPreviewData[0]).filter(k =>
                                                                            isPreviewFullscreen ||
                                                                            ['CODE', 'NAME', 'DEFINITION_', 'FICHENO', 'TRCODE', 'GROSSTOTAL', 'DATE_', 'SPECODE', 'CAPIBLOCK_CREADEDDATE'].includes(k)
                                                                        ).map(key => (
                                                                            <th key={key} className="px-4 py-3 font-black text-slate-500 uppercase tracking-tighter text-[9px]">{key}</th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {logoPreviewData.map((row, i) => (
                                                                        <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                                                                            {Object.entries(row).filter(([k]) =>
                                                                                isPreviewFullscreen ||
                                                                                ['CODE', 'NAME', 'DEFINITION_', 'FICHENO', 'TRCODE', 'GROSSTOTAL', 'DATE_', 'SPECODE', 'CAPIBLOCK_CREADEDDATE'].includes(k)
                                                                            ).map(([k, v], j) => (
                                                                                <td key={j} className="px-4 py-2.5 text-slate-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">
                                                                                    {String(v)}
                                                                                </td>
                                                                            ))}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        ) : (
                                                            <div className="h-48 flex flex-col items-center justify-center text-slate-500 gap-4">
                                                                <Activity className="w-12 h-12 opacity-10 animate-pulse" />
                                                                <div className="text-center">
                                                                    <p className="text-[10px] font-bold tracking-widest uppercase opacity-40">FİRMA VE DÖNEM SEÇİLDİĞİNDE</p>
                                                                    <p className="text-[9px] font-medium opacity-30 mt-1 uppercase">ÖNİZLEME VERİLERİ BURADA GÖRÜNTÜLENENECEK</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        <div>
                                            <h2 className="text-4xl font-black mb-2 text-white tracking-tight">Firma ve Dönem Bilgileri</h2>
                                            <p className="text-blue-200 font-medium font-semibold uppercase tracking-wider text-[10px] mb-8">Firm & Period Details</p>
                                        </div>
                                        <div className="p-8 rounded-[32px] bg-emerald-600/10 border border-emerald-500/30 shadow-2xl relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-60 h-60 bg-emerald-500/10 blur-[80px] rounded-full" />
                                            <div className="flex flex-col md:flex-row gap-8 relative z-10">
                                                <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shadow-inner">
                                                    <Building2 className="w-10 h-10 text-emerald-400" />
                                                </div>
                                                <div className="flex-1 space-y-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-emerald-200 uppercase tracking-widest pl-1">Firma Unvanı</label>
                                                        <input
                                                            type="text"
                                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-emerald-500 transition-all font-bold text-sm"
                                                            value={config.title}
                                                            onChange={(e) => setConfig({ ...config, title: e.target.value })}
                                                            placeholder="Örn: Merkez Mağaza A.Ş."
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-white/5">
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] font-black text-emerald-200 uppercase tracking-widest pl-1">Firma Numarası</label>
                                                            <input
                                                                type="text"
                                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-all font-mono font-bold text-xs text-center"
                                                                value={config.erp_firm_nr || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                                                    setConfig({ ...config, erp_firm_nr: val });
                                                                }}
                                                                placeholder="001"
                                                                maxLength={3}
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] font-black text-emerald-200 uppercase tracking-widest pl-1">Çalışma Dönemi</label>
                                                            <div className="relative">
                                                                <input
                                                                    type="text"
                                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-all font-mono font-bold text-xs text-center"
                                                                    value={config.erp_period_nr || ''}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                                                        setConfig({ ...config, erp_period_nr: val });
                                                                    }}
                                                                    placeholder="01"
                                                                    maxLength={2}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] font-black text-emerald-200 uppercase tracking-widest pl-1">Dönem Başlangıcı</label>
                                                            <input
                                                                type="date"
                                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-all font-mono text-xs"
                                                                value={standalonePeriodStart}
                                                                onChange={(e) => setStandalonePeriodStart(e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] font-black text-emerald-200 uppercase tracking-widest pl-1">Dönem Sonu</label>
                                                            <input
                                                                type="date"
                                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-all font-mono text-xs"
                                                                value={standalonePeriodEnd}
                                                                onChange={(e) => setStandalonePeriodEnd(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 5 && !config.skip_integration && (
                            <div className="space-y-12 py-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                                {config.is_nebim_migration ? (
                                    <div className="text-center space-y-3">
                                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black tracking-widest uppercase mb-4">
                                            <Zap className="w-3.5 h-3.5" /> Nebim V3 Analizi
                                        </div>
                                        <h2 className="text-4xl font-black text-white tracking-tight">Geçiş Analizi</h2>
                                        <p className="max-w-xl mx-auto text-slate-400 font-medium leading-relaxed">
                                            Nebim V3 sisteminizdeki veriler analiz edildi. Aktarılacak kayıtların özeti aşağıdadır.
                                            "A noktasından B noktasına" en hızlı geçiş için her şey hazır.
                                        </p>

                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-12 max-w-5xl mx-auto">
                                            {[
                                                { label: 'Ürün Kartı', count: '4,842', icon: Layout, color: 'blue' },
                                                { label: 'Cari Hesap', count: '1,250', icon: Building2, color: 'emerald' },
                                                { label: 'Personel', count: '48', icon: User, color: 'purple' },
                                                { label: 'Yetki Grubu', count: '12', icon: Shield, color: 'amber' }
                                            ].map((item, i) => (
                                                <div key={i} className="bg-white/[0.03] p-8 rounded-[40px] border border-white/5 relative group hover:bg-white/[0.05] transition-all">
                                                    <div className={`w-12 h-12 rounded-2xl bg-${item.color}-500/10 flex items-center justify-center mb-4 mx-auto border border-${item.color}-500/20`}>
                                                        <item.icon className={`w-6 h-6 text-${item.color}-400`} />
                                                    </div>
                                                    <div className="text-3xl font-black text-white mb-2">{item.count}</div>
                                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{item.label}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-12 p-8 rounded-[40px] bg-indigo-600/5 border border-indigo-500/20 max-w-2xl mx-auto text-left relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[60px] rounded-full" />
                                            <div className="relative z-10 flex items-start gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                                                    <CheckCircle className="w-6 h-6 text-indigo-400" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-white mb-1">Zero-Touch Entegrasyon Aktif</h4>
                                                    <p className="text-xs text-slate-400 leading-relaxed">
                                                        Ürün barkodları, cari bakiyeleri ve personel şifreleri RetailEX standartlarına tam uyumlu olarak taşınacaktır. Kurulum sonrası hiçbir ek yapılandırma gerekmez.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="text-center space-y-3">
                                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black tracking-widest uppercase mb-4">
                                                <Database className="w-3.5 h-3.5" /> Veri Senkronizasyonu
                                            </div>
                                            <h2 className="text-4xl font-black text-white tracking-tight">Kasa Seçimi</h2>
                                            <p className="max-w-xl mx-auto text-slate-400 font-medium leading-relaxed font-bold">
                                                RetailEX'in hangi kasalardan gelen hareketleri senkronize etmesini istiyorsunuz?
                                            </p>
                                        </div>

                                        <div className="max-w-2xl mx-auto">
                                            <div className="bg-white/5 border border-white/10 rounded-[40px] p-8 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600/10 blur-[90px] rounded-full" />

                                                <div className="relative z-10 space-y-6">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div>
                                                            <h3 className="text-lg font-bold text-white uppercase tracking-tight">Senkronize Edilecek Kasalar</h3>
                                                            <p className="text-[10px] text-emerald-400/60 font-black uppercase tracking-widest">Çoklu seçim yapabilirsiniz</p>
                                                        </div>
                                                        <button
                                                            onClick={() => setConfig({
                                                                ...config,
                                                                selected_cash_registers: availableCashRegisters.map(k => (k.LOGICALREF || k.logicalref).toString())
                                                            })}
                                                            className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            TÜMÜNÜ SEÇ
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                                        {availableCashRegisters.map((k) => {
                                                            const id = (k.LOGICALREF || k.logicalref || '').toString();
                                                            const isSelected = config.selected_cash_registers?.includes(id);
                                                            return (
                                                                <button
                                                                    key={id}
                                                                    onClick={() => {
                                                                        const current = config.selected_cash_registers || [];
                                                                        const updated = current.includes(id)
                                                                            ? current.filter(x => x !== id)
                                                                            : [...current, id];
                                                                        setConfig({ ...config, selected_cash_registers: updated });
                                                                    }}
                                                                    className={`flex items-center justify-between p-5 rounded-3xl border-2 transition-all ${isSelected
                                                                        ? 'bg-emerald-600/10 border-emerald-500 shadow-[0_0_20px_rgba(168,185,129,0.1)]'
                                                                        : 'bg-white/5 border-white/5 hover:border-white/10'
                                                                        }`}
                                                                >
                                                                    <div className="flex items-center gap-4">
                                                                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isSelected
                                                                            ? 'bg-emerald-500 text-white'
                                                                            : 'bg-white/10 text-slate-400'
                                                                            }`}>
                                                                            <Monitor className="w-5 h-5" />
                                                                        </div>
                                                                        <div className="text-left">
                                                                            <div className="text-xs font-bold text-white">{k.NAME || k.name}</div>
                                                                            <div className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest">{k.CODE || k.code}</div>
                                                                        </div>
                                                                    </div>
                                                                    {isSelected && (
                                                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                        {availableCashRegisters.length === 0 && !loading && (
                                                            <div className="py-20 text-center space-y-4">
                                                                <Activity className="w-10 h-10 text-emerald-500 animate-pulse mx-auto opacity-20" />
                                                                <p className="text-xs text-slate-500 font-medium tracking-tight">Seçilecek kasa bulunamadı veya Logo bağlantısında sorun var.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {step === (config.skip_integration ? 5 : 7) && ( /* Networking & Device Security */
                            <div className="space-y-12 py-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                                <div className="text-center space-y-3">
                                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black tracking-widest uppercase mb-4">
                                        <Shield className="w-3.5 h-3.5" /> Networking & Device Security
                                    </div>
                                    <h2 className="text-4xl font-black text-white tracking-tight">Bağlantı ve Cihaz Güvenliği</h2>
                                    <p className="max-w-xl mx-auto text-slate-400 font-medium leading-relaxed">
                                        Bu cihazın rolünü ve merkez ile olan iletişim yöntemini belirleyin.
                                    </p>
                                </div>

                                <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* Left Column: Device Identity & Role */}
                                    <div className="space-y-6">
                                        <div className="p-8 rounded-[40px] bg-white/5 border border-white/5 relative overflow-hidden group h-full">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 blur-[60px] rounded-full" />
                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="w-14 h-14 rounded-2xl bg-purple-600/20 flex items-center justify-center">
                                                    <Monitor className="w-7 h-7 text-purple-400" />
                                                </div>
                                                <div>
                                                    <div className="text-lg font-bold text-white">Cihaz Yapılandırması</div>
                                                    <div className="text-[10px] text-purple-400/60 font-black uppercase tracking-widest">Device Identity & Role</div>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <button onClick={() => setConfig({ ...config, role: 'center' })} className={`p-4 rounded-2xl border-2 transition-all text-left ${config.role === 'center' ? 'bg-purple-600/10 border-purple-500' : 'bg-white/5 border-white/5'}`}>
                                                        <div className="text-xs font-bold text-white">Merkez Sunucu</div>
                                                        <div className="text-[9px] text-slate-500">Master</div>
                                                    </button>
                                                    <button onClick={() => setConfig({ ...config, role: 'client' })} className={`p-4 rounded-2xl border-2 transition-all text-left ${config.role === 'client' ? 'bg-blue-600/10 border-blue-500' : 'bg-white/5 border-white/5'}`}>
                                                        <div className="text-xs font-bold text-white">Şube Cihazı</div>
                                                        <div className="text-[9px] text-slate-500">Terminal</div>
                                                    </button>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Cihaz Adı</label>
                                                    <input
                                                        type="text"
                                                        value={config.terminal_name || ''}
                                                        onChange={(e) => setConfig({ ...config, terminal_name: e.target.value })}
                                                        placeholder="Cihaz ismi girin..."
                                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-3 text-white text-xs outline-none focus:border-purple-500/50"
                                                    />
                                                </div>

                                                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Fingerprint className="w-4 h-4 text-emerald-400" />
                                                        <span className="text-[10px] font-bold text-white">Donanım Kimliği</span>
                                                    </div>
                                                    <div className="text-[9px] font-mono text-emerald-500/60 break-all">{config.device_id || 'ID üretiliyor...'}</div>
                                                </div>

                                                <button onClick={generateHardwareBoundVpnKeys} className="w-full py-3 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-xl font-black text-[9px] tracking-widest border border-purple-500/20 transition-all flex items-center justify-center gap-2">
                                                    <RefreshCw className="w-3.5 h-3.5" /> KİMLİĞİ YENİLE
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Connection Strategy */}
                                    <div className="space-y-6">
                                        <div className="p-8 rounded-[40px] bg-white/5 border border-white/5 relative overflow-hidden group h-full">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 blur-[60px] rounded-full" />
                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 flex items-center justify-center">
                                                    <Globe className="w-7 h-7 text-indigo-400" />
                                                </div>
                                                <div>
                                                    <div className="text-lg font-bold text-white">Bağlantı Stratejisi</div>
                                                    <div className="text-[10px] text-indigo-400/60 font-black uppercase tracking-widest">Connectivity Method</div>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="flex gap-4">
                                                    <button onClick={() => setConfig({ ...config, enable_mesh: true })} className={`flex-1 p-4 rounded-2xl border-2 transition-all text-left ${config.enable_mesh ? 'bg-indigo-600/10 border-indigo-500' : 'bg-white/5 border-white/5'}`}>
                                                        <div className="text-xs font-bold text-white">Mesh Network</div>
                                                        <div className="text-[9px] text-slate-500">Statik IP Yok</div>
                                                    </button>
                                                    <button onClick={() => setConfig({ ...config, enable_mesh: false })} className={`flex-1 p-4 rounded-2xl border-2 transition-all text-left ${!config.enable_mesh ? 'bg-blue-600/10 border-blue-500' : 'bg-white/5 border-white/5'}`}>
                                                        <div className="text-xs font-bold text-white">Klasik IP</div>
                                                        <div className="text-[9px] text-slate-500">Statik IP Şart</div>
                                                    </button>
                                                </div>

                                                {config.enable_mesh ? (
                                                    <div className="space-y-4 animate-in zoom-in-95 duration-300">
                                                        <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
                                                            <div className="text-[10px] text-indigo-200/50 font-medium leading-relaxed">
                                                                Üstün keşif algoritması ile firewall engellerini aşın. Port yönlendirme gerektirmez.
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1 font-mono">Mesh Identity (Public Key)</label>
                                                            <input
                                                                type="text"
                                                                value={config.vpn_config?.public_key || 'Üretiliyor...'}
                                                                readOnly
                                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-mono text-emerald-400/80"
                                                            />
                                                        </div>
                                                        <button onClick={generateVpnConfig} className="w-full py-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded-xl font-black text-[9px] tracking-widest border border-indigo-500/20 transition-all">
                                                            MESH ANAHTARLARI ÜRET
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4 animate-in zoom-in-95 duration-300">
                                                        <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                                                            <p className="text-[9px] text-blue-200/50 font-medium">Standard TCP. Merkez IP/Domain zorunludur.</p>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Merkez Adresi</label>
                                                            <input
                                                                type="text"
                                                                value={config.central_api_url || ''}
                                                                placeholder="https://merkez.domain.com"
                                                                onChange={(e) => setConfig({ ...config, central_api_url: e.target.value })}
                                                                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-white text-[11px] outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {/* Connection Summary / Info Block - Integrated at bottom of same step */}
                                <div className="lg:col-span-2">
                                    <div className="bg-blue-600/10 border border-blue-500/20 p-6 rounded-[32px] flex items-start gap-5">
                                        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/20">
                                            <Activity className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-white mb-1">
                                                {config.enable_mesh ? 'Tak-Çalıştır Senkronizasyon (Mesh)' : 'Doğrudan Veri Akışı (Standard)'}
                                            </div>
                                            <div className="text-[11px] text-blue-200/60 leading-relaxed font-medium">
                                                {config.enable_mesh
                                                    ? 'Cihazlar kendi aralarında güvenli bir tünel açar. Şirket hattınızda statik IP olmasına gerek yoktur.'
                                                    : 'Sistem doğrudan merkez IP adresine bağlanır. Statik IP ve port yönlendirme gereklidir.'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === (config.skip_integration ? 6 : 9) && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div>
                                    <h2 className="text-4xl font-black mb-2 text-white tracking-tight">
                                        {isUpdateMode ? 'Güncelleme Protokolü' : 'Sistem Başlatmaya Hazır'}
                                    </h2>
                                    <p className="text-blue-200 font-medium font-semibold uppercase tracking-wider text-[10px]">
                                        {isUpdateMode ? 'Database Schema Optimization' : 'System Initialization Protocol'}
                                    </p>
                                </div>

                                <div className="bg-white/[0.03] border border-white/10 rounded-[40px] p-8 space-y-8 shadow-2xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

                                    <div className="grid grid-cols-2 gap-4 relative z-10">
                                        <div className="p-6 bg-black/40 rounded-[24px] border border-white/5 group hover:border-blue-500/30 transition-colors">
                                            <span className="text-blue-300 font-black uppercase text-[10px] tracking-widest block mb-2">Çalışma Modu</span>
                                            <div className="flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse" />
                                                <span className="font-mono text-white font-black text-xl tracking-tight">{config.db_mode.toUpperCase()}</span>
                                            </div>
                                        </div>
                                        <div className="p-6 bg-black/40 rounded-[24px] border border-white/5 group hover:border-indigo-500/30 transition-colors">
                                            <span className="text-blue-300 font-black uppercase text-[10px] tracking-widest block mb-2">Entegrasyon</span>
                                            <div className="flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                                                <span className="font-mono text-white font-black text-xl tracking-tight">{config.erp_method.toUpperCase()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative p-8 bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border border-blue-500/20 rounded-[32px] flex items-center justify-between group overflow-hidden">
                                        <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="relative z-10">
                                            <span className="text-blue-300 font-black uppercase text-[10px] tracking-[0.2em] block mb-2">Hedef Organizasyon</span>
                                            <div className="flex items-baseline gap-2">
                                                {config.is_nebim_migration ? (
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-white text-3xl tracking-tighter shadow-black drop-shadow-lg leading-tight">NEBIM V3 GÖÇÜ</span>
                                                        <span className="text-indigo-400/60 font-black text-[10px] uppercase tracking-widest mt-1">Hedef: Firma 001 / Dönem 2026</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col">
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="font-black text-white text-4xl tracking-tighter shadow-black drop-shadow-lg">{config.erp_firm_nr}</span>
                                                            <span className="text-blue-400/60 font-bold text-xl">/ {config.erp_period_nr}</span>
                                                        </div>
                                                        <span className="text-blue-400/60 font-black text-[10px] uppercase tracking-widest mt-1">Logo Tam Entegrasyon</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="relative z-10 flex flex-col items-end gap-2">
                                            <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                                                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                                                    {config.max_users || 5} Kullanıcı Lisansı
                                                </span>
                                            </div>
                                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                                Bitiş: {config.license_expiry ? new Date(config.license_expiry).toLocaleDateString('tr-TR') : '31.12.2026'}
                                            </div>
                                        </div>
                                        <div className={`relative z-10 w-16 h-16 ${config.is_nebim_migration ? 'bg-indigo-600' : 'bg-blue-600'} rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-600/30 group-hover:scale-110 transition-transform duration-500 border border-white/20`}>
                                            <CheckCircle className="w-8 h-8 text-white" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === (config.skip_integration ? 7 : 10) && (
                            <div className="fixed inset-0 z-[60] bg-[#020617] flex items-center justify-center p-8 lg:p-12 animate-in fade-in zoom-in-95 duration-700">
                                <div className="absolute inset-0 overflow-hidden">
                                    <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[150px] rounded-full animate-pulse" />
                                    <div className="absolute bottom-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent shadow-[0_0_100px_rgba(255,255,255,0.05)]" />
                                </div>

                                <div className="w-full max-w-6xl flex flex-col lg:flex-row items-center gap-16 relative z-10">
                                    {/* Left Side: System Status & Meta */}
                                    <div className="w-full lg:w-1/2 space-y-12">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-16 h-16 rounded-[24px] bg-blue-600 flex items-center justify-center shadow-[0_0_40px_rgba(37,99,235,0.4)]">
                                                    {installationStep === 'COMPLETED' ? <CheckCircle className="w-10 h-10 text-white" /> : <Activity className="w-10 h-10 text-white animate-pulse" />}
                                                </div>
                                                <div>
                                                    <h1 className="text-5xl font-black text-white tracking-tighter">
                                                        {installationStep === 'COMPLETED' ? 'Kurulum Tamamlandı' : 'Sistem Kuruluyor'}
                                                    </h1>
                                                    <div className="text-blue-400 font-black uppercase tracking-[0.3em] text-[10px] opacity-60">System Core Initialization Protocol v0.1.9</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-6">
                                            {[
                                                { label: 'Infrastructure', key: 'DATABASE', status: installationStep === 'DATABASE' ? 'PROCESSING' : ['MIGRATIONS', 'ENTITIES', 'USERS', 'SYNC', 'DEVICE', 'COMPLETED'].includes(installationStep) ? 'COMPLETED' : 'PENDING', icon: Server },
                                                { label: 'Migrations', key: 'MIGRATIONS', status: installationStep === 'MIGRATIONS' ? 'PROCESSING' : ['ENTITIES', 'USERS', 'SYNC', 'DEVICE', 'COMPLETED'].includes(installationStep) ? 'COMPLETED' : 'PENDING', icon: Database },
                                                { label: 'Entities', key: 'ENTITIES', status: installationStep === 'ENTITIES' ? 'PROCESSING' : ['USERS', 'SYNC', 'DEVICE', 'COMPLETED'].includes(installationStep) ? 'COMPLETED' : 'PENDING', icon: Globe },
                                                { label: 'ERP Sync', key: 'SYNC', status: installationStep === 'SYNC' ? 'PROCESSING' : ['DEVICE', 'COMPLETED'].includes(installationStep) ? 'COMPLETED' : 'PENDING', icon: RefreshCw },
                                            ].map((task, i) => (
                                                <div key={i} className={`p-6 rounded-[32px] border transition-all ${task.status === 'COMPLETED' ? 'bg-emerald-500/5 border-emerald-500/20' : task.status === 'PROCESSING' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white/[0.03] border-white/5 opacity-40'}`}>
                                                    <div className="flex items-center justify-between mb-4">
                                                        <task.icon className={`w-5 h-5 ${task.status === 'COMPLETED' ? 'text-emerald-400' : task.status === 'PROCESSING' ? 'text-blue-400' : 'text-slate-600'}`} />
                                                        {task.status === 'COMPLETED' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                                                    </div>
                                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{task.label}</div>
                                                    <div className={`text-sm font-bold ${task.status === 'COMPLETED' ? 'text-white' : task.status === 'PROCESSING' ? 'text-blue-400 animate-pulse' : 'text-slate-700'}`}>
                                                        {task.status}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-6 pt-4">
                                            {installationStep === 'COMPLETED' ? (
                                                <div className="flex items-center gap-4">
                                                    <button
                                                        onClick={() => window.location.href = '/'}
                                                        className="flex items-center gap-3 px-10 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-[11px] tracking-widest uppercase shadow-[0_20px_40px_-10px_rgba(37,99,235,0.5)] transition-all group active:scale-95"
                                                    >
                                                        <Layout className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                                                        PANELİ AÇ
                                                    </button>

                                                    <button
                                                        onClick={async () => {
                                                            if (isTauri) {
                                                                const { invoke } = await import('@tauri-apps/api/core');
                                                                invoke('open_migration_log').catch(e => toast.error(e));
                                                            }
                                                        }}
                                                        className="flex items-center gap-3 px-6 py-5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl font-black text-[11px] tracking-widest uppercase border border-white/10 transition-all hover:text-white"
                                                    >
                                                        <FileCode className="w-4 h-4 text-blue-400" />
                                                        LOGLARI İNCELE
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3 px-8 py-4 bg-white/5 text-white rounded-2xl font-black text-[11px] tracking-widest uppercase border border-white/10">
                                                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                                    {installationStep === 'ERROR' ? 'HATA OLUŞTU' : 'LÜTFEN BEKLEYİNİZ...'}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Side: Professional Terminal */}
                                    <div className="w-full lg:w-1/2 flex flex-col h-[600px]">
                                        <div className="flex-1 bg-[#0c1117] border border-white/10 rounded-[40px] shadow-2xl flex flex-col overflow-hidden relative group/terminal">
                                            <div className="p-6 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex gap-1.5 leading-none">
                                                        <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/20" />
                                                        <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/20" />
                                                        <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/20" />
                                                    </div>
                                                    <div className="h-4 w-px bg-white/10 mx-2" />
                                                    <div className="flex items-center gap-2">
                                                        <Terminal className="w-4 h-4 text-blue-400" />
                                                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Console Output</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex-1 overflow-y-auto p-8 font-mono text-[11px] leading-relaxed custom-scrollbar bg-black/40">
                                                <div className="space-y-2">
                                                    {syncLogs.map((log, i) => (
                                                        <div key={i} className="flex gap-4 animate-in fade-in duration-200 border-b border-white/[0.02] pb-2 mb-2 last:border-0">
                                                            <span className="text-blue-500/40 font-bold shrink-0">[{new Date().toLocaleTimeString()}]</span>
                                                            <span className={`flex-1 ${log.includes('Hata') || log.includes('Error') ? 'text-red-400' :
                                                                log.includes('OK') || log.includes('Tamamlandı') || log.includes('Success') ? 'text-emerald-400' :
                                                                    'text-slate-300'
                                                                }`}>
                                                                {log}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <AppFooter
                        showNavigation={true}
                        onPrev={() => {
                            console.log("Navigating back from step:", step);
                            prevStep();
                        }}
                        onNext={step < (config.skip_integration ? 7 : 10) ? nextStep : undefined}
                        prevDisabled={step === 1 || loading || (step === (config.skip_integration ? 7 : 10) && installationStep !== 'COMPLETED')}
                        nextDisabled={loading || step === (config.skip_integration ? 7 : 10)}
                        nextLabel={step === (config.skip_integration ? 6 : 9) ? (isUpdateMode ? "GÜNCELLE" : "SİSTEMİ KUR") : "DEVAM ET"}
                        prevLabel="GERİ DÖN"
                    />
                </div >
            </div >
        </div >
    );
};

export default SetupWizard;


