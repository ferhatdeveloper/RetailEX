import { IS_TAURI, safeInvoke, getBridgeUrl } from '../utils/env';
import { logger } from './loggingService';
import { setGlobalCurrency } from '../utils/currency';

const IS_PRODUCTION = typeof window !== 'undefined' && window.location.hostname === 'retailex.app';

export type ConnectionMode = 'online' | 'offline' | 'hybrid';
export type ConnectionProvider = 'db' | 'rest_api';

// Remote PostgreSQL (Global/Main Server)
export let REMOTE_CONFIG = {
  host: '127.0.0.1',
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: 'Yq7xwQpt6c',
};

// Local PostgreSQL (Branch/Local Offline Server)
export let LOCAL_CONFIG = {
  host: '127.0.0.1', // Use 127.0.0.1 for better stability on Windows
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: 'Yq7xwQpt6c',
  isConfigured: false
};

// System Settings
export let DB_SETTINGS = {
  activeMode: 'hybrid' as ConnectionMode,
  systemType: 'retail' as 'retail' | 'market' | 'wms',
  // Remote tarafı DB mi yoksa PostgREST mü kullanacak?
  connectionProvider: 'db' as ConnectionProvider,
  // PostgREST base URL (örn: http://172.20.0.10:3002)
  remoteRestUrl: '' as string,
  lastSync: null as string | null,
};

// ERP Settings (Logo integration)
export let ERP_SETTINGS = {
  firmNr: '001', // Default to 001
  periodNr: '01',
  selected_cash_registers: [] as string[]
};

/** Kurulum / config.db varsayılan para (firma yokken ve başlangıç) */
export let APP_DEFAULT_CURRENCY = 'IQD';

export function getAppDefaultCurrency(): string {
  const c = (APP_DEFAULT_CURRENCY || 'IQD').trim().toUpperCase();
  return c.length >= 3 ? c.slice(0, 10) : 'IQD';
}

function applyDefaultCurrencyFromConfig(config: any): void {
  const raw = config?.default_currency ?? config?.base_currency;
  if (raw != null && String(raw).trim() !== '') {
    APP_DEFAULT_CURRENCY = String(raw).trim().toUpperCase().slice(0, 10);
  }
  setGlobalCurrency(getAppDefaultCurrency(), getAppDefaultCurrency());
}

/**
 * `host:port/dbname` biçimi (Tauri + Login web — `remote_db` tek alanda).
 */
function applyRemoteFromHostPortDbString(remoteDb: string): void {
  if (!remoteDb || typeof remoteDb !== 'string' || !remoteDb.includes(':') || !remoteDb.includes('/')) return;
  const host = remoteDb.split(':')[0] || '127.0.0.1';
  REMOTE_CONFIG.host = host;
  const portPart = remoteDb.split(':')[1] || '';
  const portStr = portPart.split('/')[0];
  if (portStr) REMOTE_CONFIG.port = parseInt(portStr, 10) || 5432;
  const dbPart = remoteDb.split('/').slice(1).join('/');
  if (dbPart) REMOTE_CONFIG.database = dbPart;
}

/**
 * Web: `exretail_pg_config` ve/veya `retailex_web_config` nesnesini uygular (ikinci kaynak birincinin üzerine yazar).
 */
function applyWebLocalStorageConfig(config: any): void {
  if (!config || typeof config !== 'object') return;
  DB_SETTINGS.activeMode = 'online';
  DB_SETTINGS.connectionProvider = (config.connection_provider === 'rest_api' ? 'rest_api' : 'db') as ConnectionProvider;
  DB_SETTINGS.remoteRestUrl = typeof config.remote_rest_url === 'string' ? config.remote_rest_url : '';

  if (config.local_host) {
    LOCAL_CONFIG.host = config.local_host;
  } else if (config.local_db && typeof config.local_db === 'string' && config.local_db.includes(':')) {
    LOCAL_CONFIG.host = config.local_db.split(':')[0] || '127.0.0.1';
    const portPart = config.local_db.split(':')[1] || '';
    if (portPart) LOCAL_CONFIG.port = parseInt(portPart.split('/')[0], 10) || 5432;
    if (config.local_db.includes('/')) {
      LOCAL_CONFIG.database = config.local_db.split('/').slice(1).join('/') || LOCAL_CONFIG.database;
    }
  }
  if (config.local_port != null) LOCAL_CONFIG.port = Number(config.local_port) || LOCAL_CONFIG.port;
  if (config.local_db && typeof config.local_db === 'string' && !config.local_db.includes(':')) {
    LOCAL_CONFIG.database = config.local_db;
  }
  if (config.pg_local_user) LOCAL_CONFIG.user = config.pg_local_user;
  if (config.pg_local_pass != null && config.pg_local_pass !== '') LOCAL_CONFIG.password = config.pg_local_pass;
  if (config.is_configured === true) LOCAL_CONFIG.isConfigured = true;

  if (config.remote_host) {
    REMOTE_CONFIG.host = config.remote_host;
    if (config.remote_port != null) REMOTE_CONFIG.port = Number(config.remote_port) || REMOTE_CONFIG.port;
    if (config.remote_db && typeof config.remote_db === 'string' && !config.remote_db.includes(':')) {
      REMOTE_CONFIG.database = config.remote_db;
    }
  } else if (config.remote_db && typeof config.remote_db === 'string') {
    if (config.remote_db.includes(':') && config.remote_db.includes('/')) {
      applyRemoteFromHostPortDbString(config.remote_db);
    } else {
      REMOTE_CONFIG.database = config.remote_db;
    }
  }
  if (config.pg_remote_user) REMOTE_CONFIG.user = config.pg_remote_user;
  if (config.pg_remote_pass != null && config.pg_remote_pass !== '') REMOTE_CONFIG.password = config.pg_remote_pass;

  // Production web'de bridge, container içinden DB'ye bağlanır.
  // 127.0.0.1/localhost bridge konteynerinin kendisini işaret ettiği için ECONNREFUSED üretir.
  if (
    IS_PRODUCTION &&
    (REMOTE_CONFIG.host === '127.0.0.1' || REMOTE_CONFIG.host === 'localhost')
  ) {
    REMOTE_CONFIG.host = 'saas_postgres';
    if (!REMOTE_CONFIG.database || REMOTE_CONFIG.database === 'retailex_local') {
      REMOTE_CONFIG.database = 'retailex_demo';
    }
  }

  const dFw = String(config.erp_firm_nr ?? '').replace(/\D/g, '');
  const dPw = String(config.erp_period_nr ?? '').replace(/\D/g, '');
  if (dFw) ERP_SETTINGS.firmNr = dFw.length <= 3 ? dFw.padStart(3, '0') : dFw;
  if (dPw) ERP_SETTINGS.periodNr = dPw.length <= 2 ? dPw.padStart(2, '0') : dPw;

  applyDefaultCurrencyFromConfig(config);
}

/**
 * Initialize all configurations from SQLite backend.
 * @param preloadedConfig - Optional config from App startup (Tauri); avoids duplicate get_app_config call.
 */
export async function initializeFromSQLite(preloadedConfig?: any) {
  if (!IS_TAURI) {
    const pgFlat = localStorage.getItem('exretail_pg_config');
    const webFull = localStorage.getItem('retailex_web_config');
    try {
      if (pgFlat) {
        applyWebLocalStorageConfig(JSON.parse(pgFlat));
      } else {
        DB_SETTINGS.activeMode = 'online';
        DB_SETTINGS.connectionProvider = 'db';
        DB_SETTINGS.remoteRestUrl = '';
      }
      if (webFull) applyWebLocalStorageConfig(JSON.parse(webFull));
      if (pgFlat || webFull) {
        console.log('🌐 Web Config Loaded (exretail_pg_config + retailex_web_config)');
      } else {
        console.log('🌐 Web Mode: Defaulting to Online (127.0.0.1)');
      }
    } catch (e) {
      console.warn('Failed to parse web localStorage config', e);
    }
    return;
  }

  try {
    const config: any = preloadedConfig ?? (await safeInvoke('get_app_config'));
    if (config) {
      // Load System Settings
      DB_SETTINGS.activeMode = config.db_mode as ConnectionMode;
      DB_SETTINGS.systemType = config.system_type || 'retail';
      DB_SETTINGS.connectionProvider = (config.connection_provider === 'rest_api' ? 'rest_api' : 'db') as ConnectionProvider;
      DB_SETTINGS.remoteRestUrl = typeof config.remote_rest_url === 'string' ? config.remote_rest_url : '';

      // Load ERP Settings — firma/dönem biçimi Logo/SQLite ile aynı (2 ↔ 002; cari tablo rex_{nr}_customers)
      const dF = String(config.erp_firm_nr ?? '').replace(/\D/g, '');
      const dP = String(config.erp_period_nr ?? '').replace(/\D/g, '');
      ERP_SETTINGS.firmNr = !dF ? '001' : (dF.length <= 3 ? dF.padStart(3, '0') : dF);
      ERP_SETTINGS.periodNr = !dP ? '01' : (dP.length <= 2 ? dP.padStart(2, '0') : dP);
      ERP_SETTINGS.selected_cash_registers = config.selected_cash_registers || [];

      console.log('📦 SQLite Config Loaded:', JSON.stringify(config, null, 2));
      console.log('🏢 Applied ERP Settings:', ERP_SETTINGS);

      // Load Local DB Settings
      if (config.local_db && typeof config.local_db === 'string') {
          LOCAL_CONFIG.host = config.local_db.split(':')[0] || 'localhost';
          if (config.local_db.includes(':')) {
            const portPart = config.local_db.split(':')[1];
            if (portPart) LOCAL_CONFIG.port = parseInt(portPart.split('/')[0]) || 5432;
            if (config.local_db.includes('/')) LOCAL_CONFIG.database = config.local_db.split('/')[1];
          }
      }

      if (config.pg_local_user) LOCAL_CONFIG.user = config.pg_local_user;
      if (config.pg_local_pass) LOCAL_CONFIG.password = config.pg_local_pass;

      // Load Remote DB Settings
      if (config.remote_db && typeof config.remote_db === 'string') {
          // Format: host:port/dbname
          const host = config.remote_db.split(':')[0] || '26.154.3.237';
          REMOTE_CONFIG.host = host;
          if (config.remote_db.includes(':')) {
            const portPart = config.remote_db.split(':')[1] || '';
            const portStr = portPart.split('/')[0];
            if (portStr) REMOTE_CONFIG.port = parseInt(portStr, 10) || 5432;
            const dbPart = config.remote_db.split('/').slice(1).join('/');
            if (dbPart) REMOTE_CONFIG.database = dbPart;
          }
      }
      if (config.pg_remote_user) REMOTE_CONFIG.user = config.pg_remote_user;
      if (config.pg_remote_pass) REMOTE_CONFIG.password = config.pg_remote_pass;

      LOCAL_CONFIG.isConfigured = config.is_configured === true;

      applyDefaultCurrencyFromConfig(config);

      console.log('✅ Configurations Loaded from SQLite:', {
        mode: DB_SETTINGS.activeMode,
        firm: ERP_SETTINGS.firmNr,
        local_db: LOCAL_CONFIG.host,
        local_user: LOCAL_CONFIG.user,
        default_currency: getAppDefaultCurrency(),
      });
    }
  } catch (err) {
    console.error('Failed to load SQL config:', err);
  }
}

/**
 * Update configurations and persist (Now syncs to SQLite/localStorage too)
 */
export async function updateConfigs(updates: {
  local?: Partial<typeof LOCAL_CONFIG>,
  remote?: Partial<typeof REMOTE_CONFIG>,
  settings?: Partial<typeof DB_SETTINGS>,
  erp?: Partial<typeof ERP_SETTINGS>
}) {
  if (updates.local) LOCAL_CONFIG = { ...LOCAL_CONFIG, ...updates.local };
  if (updates.remote) REMOTE_CONFIG = { ...REMOTE_CONFIG, ...updates.remote };
  if (updates.settings) DB_SETTINGS = { ...DB_SETTINGS, ...updates.settings };
  if (updates.erp) ERP_SETTINGS = { ...ERP_SETTINGS, ...updates.erp };

  if (!IS_TAURI) {
    // Web: Sync to localStorage
    const webConfig = {
      db_mode: DB_SETTINGS.activeMode,
      system_type: DB_SETTINGS.systemType,
      connection_provider: DB_SETTINGS.connectionProvider,
      remote_rest_url: DB_SETTINGS.remoteRestUrl,
      erp_firm_nr: ERP_SETTINGS.firmNr,
      erp_period_nr: ERP_SETTINGS.periodNr,
      default_currency: getAppDefaultCurrency(),
      is_configured: LOCAL_CONFIG.isConfigured,
      local_host: LOCAL_CONFIG.host,
      local_port: LOCAL_CONFIG.port,
      local_db: LOCAL_CONFIG.database,
      pg_local_user: LOCAL_CONFIG.user,
      pg_local_pass: LOCAL_CONFIG.password,
      remote_host: REMOTE_CONFIG.host,
      remote_port: REMOTE_CONFIG.port,
      pg_remote_user: REMOTE_CONFIG.user,
      pg_remote_pass: REMOTE_CONFIG.password,
      remote_db: REMOTE_CONFIG.database
    };
    localStorage.setItem('exretail_pg_config', JSON.stringify(webConfig));
    console.log('🌐 Web Config Saved to localStorage');
    return;
  }

  // Sync back to SQLite
  try {
    const currentConfig: any = await safeInvoke('get_app_config');
    const localDbStr = `${LOCAL_CONFIG.host}:${LOCAL_CONFIG.port}/${LOCAL_CONFIG.database}`;
    const remoteDbStr = `${REMOTE_CONFIG.host}:${REMOTE_CONFIG.port}/${REMOTE_CONFIG.database}`;
    const newConfig = {
      ...currentConfig,
      db_mode: DB_SETTINGS.activeMode,
      system_type: DB_SETTINGS.systemType,
      connection_provider: DB_SETTINGS.connectionProvider,
      remote_rest_url: DB_SETTINGS.remoteRestUrl,
      local_db: localDbStr,
      remote_db: remoteDbStr,
      pg_local_user: LOCAL_CONFIG.user,
      pg_local_pass: LOCAL_CONFIG.password,
      pg_remote_user: REMOTE_CONFIG.user,
      pg_remote_pass: REMOTE_CONFIG.password,
      erp_firm_nr: ERP_SETTINGS.firmNr,
      erp_period_nr: ERP_SETTINGS.periodNr,
      selected_cash_registers: ERP_SETTINGS.selected_cash_registers,
      is_configured: LOCAL_CONFIG.isConfigured
    };
    await safeInvoke('save_app_config', {
      config: {
        ...newConfig,
        default_currency: getAppDefaultCurrency(),
      },
    });
  } catch (err) {
    console.error('Failed to sync config to SQLite:', err);
  }
}

export type PostgresStatus = {
  connected: boolean;
  host: string;
  port: number;
  database: string;
  mode: ConnectionMode;
  error?: string;
  version?: string;
};

/**
 * Test a specific configuration
 */
export async function testDbConfig(config: typeof LOCAL_CONFIG | typeof REMOTE_CONFIG): Promise<PostgresStatus> {
  try {
    if (!IS_TAURI) {
      // Browser: Check bridge status first
      try {
        const bridgeStatus = await fetch(`${getBridgeUrl()}/api/status`).then(r => r.json());
        if (bridgeStatus.status !== 'RUNNING') throw new Error('Bridge is not running');
      } catch (e) {
        throw new Error(
          'PostgreSQL Bridge yanıt vermiyor (port 3001). Proje kökünde ayrı terminalde `npm run bridge` çalıştırın veya `npm run dev:with-bridge` kullanın.'
        );
      }

      // Connectivity test via bridge (try a simple query)
      const effectiveHost = config.host === 'localhost' ? '127.0.0.1' : config.host;
      const connStr = `postgresql://${config.user}:${config.password}@${effectiveHost}:${config.port}/${config.database}`;
      
      const response = await fetch(`${getBridgeUrl()}/api/pg_query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connStr, sql: 'SELECT version()', params: [] })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Bağlantı hatası');
      }

      const res = await response.json();
      return {
        connected: true,
        host: config.host,
        port: config.port,
        database: config.database,
        mode: DB_SETTINGS.activeMode,
        version: res.rows[0].version,
      };
    }

    // Use backend to check connection (Browser cannot check TCP ports reliably)
    const currentConfig = await safeInvoke('get_app_config');
    const status: string = await safeInvoke('check_db_status', {
      config: currentConfig
    });

    if (status === 'RUNNING') {
      return {
        connected: true,
        host: config.host,
        port: config.port,
        database: config.database,
        mode: DB_SETTINGS.activeMode,
        version: 'PostgreSQL 16.x',
      };
    } else {
      throw new Error(status);
    }
  } catch (error: any) {
    return {
      connected: false,
      host: config.host,
      port: config.port,
      database: config.database,
      mode: DB_SETTINGS.activeMode,
      error: error.message || 'Bağlantı başarısız',
    };
  }
}

/**
 * Kayıt etmeden önce: verilen host/kimlik bilgileriyle doğrudan `SELECT version()` çalıştırır.
 * Tauri: `pg_query`; tarayıcı: bridge. (Mevcut `testDbConfig` Tauri’de yalnızca kayıtlı local_db’ye bakıyordu.)
 */
export async function testPostgresEndpoint(config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): Promise<PostgresStatus> {
  const effectiveHost = config.host === 'localhost' ? '127.0.0.1' : config.host;
  const connStr = `postgresql://${config.user}:${config.password}@${effectiveHost}:${config.port}/${config.database}`;

  try {
    if (!IS_TAURI) {
      try {
        const bridgeStatus = await fetch(`${getBridgeUrl()}/api/status`).then((r) => r.json());
        if (bridgeStatus.status !== 'RUNNING') throw new Error('Bridge is not running');
      } catch (e) {
        throw new Error(
          'PostgreSQL Bridge yanıt vermiyor (port 3001). Proje kökünde ayrı terminalde `npm run bridge` çalıştırın veya `npm run dev:with-bridge` kullanın.'
        );
      }

      const response = await fetch(`${getBridgeUrl()}/api/pg_query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connStr, sql: 'SELECT version() AS version', params: [] }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).error || 'Bağlantı hatası');
      }

      const res = await response.json();
      const row = res.rows?.[0];
      const version = row?.version != null ? String(row.version) : undefined;
      return {
        connected: true,
        host: config.host,
        port: config.port,
        database: config.database,
        mode: DB_SETTINGS.activeMode,
        version,
      };
    }

    const resultJson: string = await safeInvoke('pg_query', {
      connStr,
      sql: 'SELECT version() AS version',
      params: [],
    });
    const rows = JSON.parse(resultJson) as { version?: string }[];
    const version = rows[0]?.version != null ? String(rows[0].version) : undefined;
    return {
      connected: true,
      host: config.host,
      port: config.port,
      database: config.database,
      mode: DB_SETTINGS.activeMode,
      version,
    };
  } catch (error: any) {
    return {
      connected: false,
      host: config.host,
      port: config.port,
      database: config.database,
      mode: DB_SETTINGS.activeMode,
      error: error.message || 'Bağlantı başarısız',
    };
  }
}

export type PostgrestStatus = {
  connected: boolean;
  baseUrl: string;
  error?: string;
  httpStatus?: number;
};

function normalizeBaseUrl(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

/**
 * PostgREST için basit erişilebilirlik testi.
 * Not: PostgREST root yolunda 404 dönebilir; bu durumda da bağlantı “var” sayıyoruz.
 */
export async function testPostgrestUrl(baseUrl: string): Promise<PostgrestStatus> {
  const url = normalizeBaseUrl(baseUrl);
  if (!url) return { connected: false, baseUrl, error: 'PostgREST URL boş' };
  try {
    // root açık değilse 404 da dönebilir; fetch'in hata vermemesi önemli.
    const res = await fetch(`${url}/`, { method: 'GET', headers: { Accept: 'application/json' } });
    return { connected: true, baseUrl: url, httpStatus: res.status };
  } catch (e: any) {
    return { connected: false, baseUrl: url, error: e?.message || String(e) };
  }
}

/**
 * Web / çok istemci: `public.system_settings` (tek satır) üzerinden açılış varsayılanlarını PG’den alır,
 * çalışma zamanına ve (web’de) localStorage’a yazar. PostgREST-only modda atlanır.
 */
async function syncRuntimeSettingsFromPostgres(): Promise<void> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') return;

  const pg = PostgresConnection.getInstance();
  let rows: { default_currency?: string; primary_firm_nr?: string | null; primary_period_nr?: string | null }[];
  try {
    const res = await pg.query(
      `SELECT default_currency, primary_firm_nr, primary_period_nr FROM public.system_settings WHERE id = 1`,
      []
    );
    rows = res.rows as typeof rows;
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    if (e?.code === '42P01' || msg.includes('system_settings') || msg.includes('does not exist')) {
      console.warn('[syncRuntimeSettingsFromPostgres] system_settings tablosu yok; migration 010 çalıştırın.');
      return;
    }
    throw e;
  }

  const row = rows[0];
  if (!row) return;

  const cur = String(row.default_currency || 'IQD').trim().toUpperCase().slice(0, 10) || 'IQD';
  APP_DEFAULT_CURRENCY = cur;
  setGlobalCurrency(getAppDefaultCurrency(), getAppDefaultCurrency());

  const fn = String(row.primary_firm_nr || ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
  const pn = String(row.primary_period_nr || ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
  ERP_SETTINGS = { ...ERP_SETTINGS, firmNr: fn, periodNr: pn };

  await updateConfigs({ erp: { firmNr: fn, periodNr: pn } });
  console.log('[syncRuntimeSettingsFromPostgres] PG → runtime:', { default_currency: cur, firmNr: fn, periodNr: pn });
}

export class PostgresConnection {
  private static instance: PostgresConnection;
  private status: PostgresStatus = {
    connected: false,
    host: '',
    port: 0,
    database: '',
    mode: 'hybrid'
  };

  private constructor() { }

  static getInstance(): PostgresConnection {
    if (!PostgresConnection.instance) {
      PostgresConnection.instance = new PostgresConnection();
    }
    return PostgresConnection.instance;
  }

  async connect(): Promise<PostgresStatus> {
    // Ensure we have latest config before connecting
    await initializeFromSQLite();

    // Rest API modunda (PostgREST) DB üzerinden SQL bağlantısı kurmaya çalışma.
    // Şimdilik bu mod, PostgREST endpoint'inin erişilebilirliğini doğrular.
    if (DB_SETTINGS.connectionProvider === 'rest_api' && DB_SETTINGS.activeMode !== 'offline') {
      const pr = await testPostgrestUrl(DB_SETTINGS.remoteRestUrl);
      this.status = {
        connected: pr.connected,
        host: pr.baseUrl,
        port: 0,
        database: 'postgrest',
        mode: DB_SETTINGS.activeMode,
        error: pr.error
      };
      console.log(`🔌 Connected in ${DB_SETTINGS.activeMode} mode to PostgREST: ${pr.baseUrl}`);
      return this.status;
    }

    const targetConfig = DB_SETTINGS.activeMode === 'online' ? REMOTE_CONFIG : LOCAL_CONFIG;
    this.status = await testDbConfig(targetConfig);
    console.log(`🔌 Connected in ${DB_SETTINGS.activeMode} mode to ${this.status.host}`);

    if (this.status.connected && DB_SETTINGS.connectionProvider === 'db') {
      try {
        await syncRuntimeSettingsFromPostgres();
      } catch (e: any) {
        console.warn('[connect] syncRuntimeSettingsFromPostgres:', e?.message || String(e));
      }
    }

    return this.status;
  }

  getStatus() { return this.status; }

  private static CARD_TABLES = [
    'products', 'customers', 'suppliers', 'sales_reps', 'cash_registers', 'cash_register_transactions',
    'categories', 'brands', 'units', 'tax_rates', 'special_codes',
    'unitsets', 'unitsetl',
    'campaigns', 'product_variants', 'product_barcodes', 'product_unit_conversions', 'lots', 'bank_registers', 'expense_cards',
    'services',
    // Restaurant card tables (rest schema)
    'rest_tables', 'rest_recipes', 'rest_recipe_ingredients', 'rest_staff',
    // Beauty card tables (beauty schema)
    'beauty_specialists', 'beauty_services', 'beauty_packages', 'beauty_devices', 'beauty_leads',
    'beauty_satisfaction_surveys', 'beauty_satisfaction_questions',
    'beauty_branches', 'beauty_rooms', 'beauty_portal_settings', 'beauty_corporate_accounts',
    'beauty_consent_templates', 'beauty_memberships', 'beauty_service_consumables', 'beauty_customer_health',
    'beauty_product_batches', 'beauty_marketing_campaigns', 'beauty_integration_settings'
  ];
  private static MOVEMENT_TABLES = [
    'sales', 'sale_items', 'stock_moves', 'cash_lines', 'stock_movements', 'stock_movement_items', 'invoices', 'invoice_items', 'bank_lines',
    'virman_operations', 'virman_items',
    // Restaurant movement tables (rest schema)
    'rest_orders', 'rest_order_items', 'rest_kitchen_orders', 'rest_kitchen_items', 'rest_reservations',
    // Beauty movement tables (beauty schema)
    'beauty_appointments', 'beauty_sessions', 'beauty_session_logs',
    'beauty_package_purchases', 'beauty_package_sales', 'beauty_device_usage',
    'beauty_device_alerts', 'beauty_customer_feedback', 'beauty_sales', 'beauty_sale_items',
    'beauty_waitlist', 'beauty_booking_requests', 'beauty_notification_queue', 'beauty_consent_submissions',
    'beauty_clinical_notes', 'beauty_patient_photos', 'beauty_membership_subscriptions', 'beauty_audit_log',
    'beauty_consumable_usage_log'
  ];

  // Tables that live in a dedicated schema (not public)
  private static TABLE_SCHEMA: Record<string, string> = {
    'rest_tables': 'rest', 'rest_recipes': 'rest', 'rest_recipe_ingredients': 'rest', 'rest_staff': 'rest',
    'rest_orders': 'rest', 'rest_order_items': 'rest', 'rest_kitchen_orders': 'rest', 'rest_kitchen_items': 'rest', 'rest_reservations': 'rest',
    'beauty_specialists': 'beauty', 'beauty_services': 'beauty', 'beauty_packages': 'beauty', 'beauty_devices': 'beauty',
    'beauty_appointments': 'beauty', 'beauty_sessions': 'beauty', 'beauty_session_logs': 'beauty',
    'beauty_package_purchases': 'beauty', 'beauty_package_sales': 'beauty', 'beauty_device_usage': 'beauty',
    'beauty_leads': 'beauty', 'beauty_satisfaction_surveys': 'beauty', 'beauty_satisfaction_questions': 'beauty',
    'beauty_device_alerts': 'beauty', 'beauty_customer_feedback': 'beauty',
    'beauty_sales': 'beauty', 'beauty_sale_items': 'beauty',
    'beauty_branches': 'beauty', 'beauty_rooms': 'beauty', 'beauty_portal_settings': 'beauty',
    'beauty_corporate_accounts': 'beauty', 'beauty_consent_templates': 'beauty', 'beauty_memberships': 'beauty',
    'beauty_service_consumables': 'beauty', 'beauty_customer_health': 'beauty', 'beauty_product_batches': 'beauty',
    'beauty_marketing_campaigns': 'beauty', 'beauty_integration_settings': 'beauty',
    'beauty_waitlist': 'beauty', 'beauty_booking_requests': 'beauty', 'beauty_notification_queue': 'beauty',
    'beauty_consent_submissions': 'beauty', 'beauty_clinical_notes': 'beauty', 'beauty_patient_photos': 'beauty',
    'beauty_membership_subscriptions': 'beauty', 'beauty_audit_log': 'beauty', 'beauty_consumable_usage_log': 'beauty',
    'products': 'public', 'customers': 'public', 'suppliers': 'public', 'categories': 'public'
  };

  /** Returns schema-qualified prefixed name for a firm-level card table.
   *  e.g. getCardTableName('rest_tables', 'rest') → 'rest.rex_001_rest_tables'
   */
  getCardTableName(table: string, schema = 'public'): string {
    const firmRaw = String(ERP_SETTINGS.firmNr || '001').trim();
    const firm = firmRaw.padStart(3, '0').slice(0, 10);
    const prefixed = `rex_${firm}_${table}`;
    return schema === 'public' ? prefixed : `${schema}.${prefixed}`;
  }

  /** Returns schema-qualified prefixed name for a period movement table.
   *  e.g. getMovementTableName('beauty_appointments', 'beauty') → 'beauty.rex_001_01_beauty_appointments'
   */
  getMovementTableName(table: string, schema = 'public'): string {
    const firmRaw = String(ERP_SETTINGS.firmNr || '001').trim();
    const firm = firmRaw.padStart(3, '0').slice(0, 10);
    const periodRaw = String(ERP_SETTINGS.periodNr || '01').trim();
    const period = periodRaw.padStart(2, '0').slice(0, 10);
    const prefixed = `rex_${firm}_${period}_${table}`;
    return schema === 'public' ? prefixed : `${schema}.${prefixed}`;
  }

  async query<T = any>(sql: string, params: any[] = [], options?: { firmNr?: string, periodNr?: string }): Promise<{ rows: T[]; rowCount: number }> {
    // rest_api modunda bile bu method çağrılabilir (legacy akışlar).
    // Şimdilik burada hard-stop yapmıyoruz; SQL tarafı erişilebilir değilse hata dönecektir.

    // 1. Resolve Dynamic Table Names (Query Rewriting)
    let resolvedSql = sql;

    // Normalizasyon: Postgres bridge için tipleri koru (booleans/numbers ham iletilir).
    // Dizileri stringify etme — ANY($1) ve array parametreleri için gerçek dizi gönderilmeli (Tauri/Rust tarafında doğru bind edilsin).
    const normalizedParams = params.map((p: any) => {
      if (p === null || p === undefined) return null;
      if (typeof p === 'boolean' || typeof p === 'number') return p;
      if (typeof p === 'bigint') return p.toString();
      if (Array.isArray(p)) return p;

      if (typeof p === 'object') {
        if (p instanceof Date) return p.toISOString();
        if (typeof (p as any).toISOString === 'function') return (p as any).toISOString();
        try { return JSON.stringify(p); } catch (e) { return String(p); }
      }

      return String(p);
    });

    const effectiveFirmNr = (options?.firmNr || ERP_SETTINGS.firmNr || '001')
      .toString().padStart(3, '0');
    const effectivePeriodNr = (options?.periodNr || ERP_SETTINGS.periodNr || '01')
      .toString().padStart(2, '0');

    PostgresConnection.CARD_TABLES.forEach(table => {
      const schema = PostgresConnection.TABLE_SCHEMA[table] || 'public';
      const prefixed = `rex_${effectiveFirmNr}_${table}`;
      const fullName = schema === 'public' ? prefixed : `${schema}.${prefixed}`;
      // 1. Rewrite plain table name: rest_tables → rest.rex_001_rest_tables
      const plainRegex = new RegExp(`(?<!\\.)\\b${table}\\b`, 'gi');
      resolvedSql = resolvedSql.replace(plainRegex, fullName);
      // 2. Rewrite explicit schema.tablename: rest.rest_tables → rest.rex_001_rest_tables
      const schemaRegex = new RegExp(`\\b${schema}\\.${table}\\b`, 'gi');
      resolvedSql = resolvedSql.replace(schemaRegex, `${schema}.${prefixed}`);
    });

    PostgresConnection.MOVEMENT_TABLES.forEach(table => {
      const schema = PostgresConnection.TABLE_SCHEMA[table];
      const prefixed = `rex_${effectiveFirmNr}_${effectivePeriodNr}_${table}`;
      const fullName = schema ? `${schema}.${prefixed}` : prefixed;
      // 1. Rewrite plain table name
      const plainRegex = new RegExp(`(?<!\\.)\\b${table}\\b`, 'gi');
      resolvedSql = resolvedSql.replace(plainRegex, fullName);
      // 2. Rewrite explicit schema.tablename
      if (schema) {
        const schemaRegex = new RegExp(`\\b${schema}\\.${table}\\b`, 'gi');
        resolvedSql = resolvedSql.replace(schemaRegex, `${schema}.${prefixed}`);
      }
    });

    // Attempt to log to a file for AI to read (no-op if Tauri backend has no log_to_file command)
    if (IS_TAURI) {
      void safeInvoke('log_to_file', {
        fileName: 'pg_queries.log',
        content: `[${new Date().toISOString()}] SQL: ${resolvedSql} PARAMS: ${JSON.stringify(normalizedParams)}\n`
      }, null as any);
    }

    const startTime = Date.now();
    try {
      const config = DB_SETTINGS.activeMode === 'online' ? REMOTE_CONFIG : LOCAL_CONFIG;
      // Localhost stability: Use 127.0.0.1 instead of localhost for Windows
      const effectiveHost = config.host === 'localhost' ? '127.0.0.1' : config.host;
      const connStr = `postgresql://${config.user}:${config.password}@${effectiveHost}:${config.port}/${config.database}`;

      let rows: any[];
      if (IS_TAURI) {
        const resultJson: string = await safeInvoke('pg_query', { connStr, sql: resolvedSql, params: normalizedParams });
        rows = JSON.parse(resultJson);
      } else {
        // Web Environment: Use Bridge
        const response = await fetch(`${getBridgeUrl()}/api/pg_query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connStr, sql: resolvedSql, params: normalizedParams })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Database query failed');
        }

        const data = await response.json();
        rows = data.rows;
      }

      const duration = Date.now() - startTime;
      logger.sql('Postgres', resolvedSql, normalizedParams, duration);

      return {
        rows: rows as T[],
        rowCount: rows.length
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[Postgres] Query Detail Error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      logger.error('Postgres', `Query Failed: ${resolvedSql}`, {
        message: error.message,
        stack: error.stack,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        params,
        duration
      });
      throw error;
    }
  }

  /**
   * Run migrations using the backend's migration system
   */
  async runMigrations(loadDemo: boolean = false): Promise<{ success: boolean; message: string }> {
    try {
      if (!IS_TAURI) {
        return { success: true, message: 'Web environment: Migrations handled via bridge or pre-configured' };
      }
      console.log(`🛠 Running Database Migrations (Demo: ${loadDemo ? 'YES' : 'NO'})...`);

      const config: any = await safeInvoke('get_app_config');
      const target = DB_SETTINGS.activeMode === 'online' ? 'remote' : 'local';

      const message: string = await safeInvoke('run_migrations', {
        config,
        target,
        loadDemoData: loadDemo
      });

      return { success: true, message };
    } catch (error: any) {
      console.error('Migration error:', error);
      return { success: false, message: `Hata: ${error}` };
    }
  }

  /**
   * Şema migrasyonları (demo verisi değil). Örnek veri yalnızca açıkça `runMigrations(true)` veya Demo Veri ekranından istenir.
   */
  async initializeDatabase(): Promise<{ success: boolean; message: string }> {
    return this.runMigrations(false);
  }

  /**
   * Get unique device ID (Hardware based if possible)
   */
  async getDeviceId(): Promise<string> {
    try {
      // In Tauri, we'd use something like:
      // return await invoke('get_device_hwid');

      // Fallback: Persistent UUID in localStorage
      let deviceId = localStorage.getItem('retailex_device_id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('retailex_device_id', deviceId);
      }
      return deviceId;
    } catch (e) {
      return 'RE-GLOBAL-001';
    }
  }

  /**
   * Register this device to a store
   */
  async registerDevice(name: string, storeId: string): Promise<{ success: boolean; message: string }> {
    try {
      const deviceId = await this.getDeviceId();
      console.log(`📡 Registering device ${name} (${deviceId}) to store ${storeId}`);

      await this.query(
        `INSERT INTO terminals (device_id, name, store_id, firm_nr) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (device_id) DO UPDATE SET name = $2, store_id = $3, firm_nr = $4`,
        [deviceId, name, storeId, ERP_SETTINGS.firmNr]
      );

      localStorage.setItem('retailex_registered_device', JSON.stringify({ name, storeId }));

      return { success: true, message: 'Cihaz başarıyla kaydedildi.' };
    } catch (error: any) {
      console.error('Device registration error:', error);
      return { success: false, message: `Hata: ${error.message}` };
    }
  }

  /**
   * Get active firm details
   */
  async getFirmDetails(firmNr: string): Promise<any> {
    try {
      const result = await this.query(
        'SELECT * FROM firms WHERE firm_nr = $1 AND is_active = true',
        [firmNr]
      );
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (e) {
      console.error('Failed to get firm details:', e);
      return null;
    }
  }

  /**
   * Verify local database password
   */
  async verifyPassword(password: string): Promise<boolean> {
    // In a real implementation, this would try to connect with the given password
    // For now, we compare with the local config password
    return password === LOCAL_CONFIG.password;
  }

  async sync(): Promise<{ success: boolean; totalSynced: number }> {
    if (DB_SETTINGS.activeMode !== 'hybrid') return { success: false, totalSynced: 0 };
    console.log('🔄 Hybrid Sync: Local -> Remote');
    return { success: true, totalSynced: 12 }; // Mock
  }
}

export const postgres = PostgresConnection.getInstance();
postgres.connect().catch(console.error);

// Legacy exports for compatibility
export const DB_CONFIG = REMOTE_CONFIG;
export const CONNECTION_STRING = `postgresql://${REMOTE_CONFIG.user}:***@${REMOTE_CONFIG.host}:${REMOTE_CONFIG.port}/${REMOTE_CONFIG.database}`;

export const TABLES = {
  USERS: 'users',
  STORES: 'stores',
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  SALES: 'sales',
  SALE_ITEMS: 'sale_items',
  CUSTOMERS: 'customers',
  INVOICES: 'invoices',
  CAMPAIGNS: 'campaigns',
} as const;
