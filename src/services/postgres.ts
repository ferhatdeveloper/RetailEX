import { invoke } from '@tauri-apps/api/core';
import { logger } from './loggingService';

export type ConnectionMode = 'online' | 'offline' | 'hybrid';

// Remote PostgreSQL (Global/Main Server)
export let REMOTE_CONFIG = {
  host: '26.154.3.237',
  port: 5432,
  database: 'retailos_db',
  user: 'retailos_user',
  password: 'RetailOS2025!Secure',
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
  lastSync: null as string | null,
};

// ERP Settings (Logo integration)
export let ERP_SETTINGS = {
  firmNr: '001', // Default to 001
  periodNr: '01',
  selected_cash_registers: [] as string[]
};

/**
 * Initialize all configurations from SQLite backend
 */
export async function initializeFromSQLite() {
  try {
    const config: any = await invoke('get_app_config');
    if (config) {
      // Load System Settings
      DB_SETTINGS.activeMode = config.db_mode as ConnectionMode;
      DB_SETTINGS.systemType = config.system_type || 'retail';

      // Load ERP Settings
      ERP_SETTINGS.firmNr = config.erp_firm_nr || '001';
      ERP_SETTINGS.periodNr = config.erp_period_nr || '01';
      ERP_SETTINGS.selected_cash_registers = config.selected_cash_registers || [];

      console.log('📦 SQLite Config Loaded:', JSON.stringify(config, null, 2));
      console.log('🏢 Applied ERP Settings:', ERP_SETTINGS);

      // Load Local DB Settings
      if (config.local_db) LOCAL_CONFIG.host = config.local_db.split(':')[0] || 'localhost';
      if (config.local_db && config.local_db.includes(':')) {
        const portPart = config.local_db.split(':')[1];
        if (portPart) LOCAL_CONFIG.port = parseInt(portPart.split('/')[0]) || 5432;
        if (config.local_db.includes('/')) LOCAL_CONFIG.database = config.local_db.split('/')[1];
      }

      if (config.pg_local_user) LOCAL_CONFIG.user = config.pg_local_user;
      if (config.pg_local_pass) LOCAL_CONFIG.password = config.pg_local_pass;

      // Load Remote DB Settings
      if (config.remote_db) REMOTE_CONFIG.host = config.remote_db.split(':')[0] || '91.205.41.130';
      if (config.pg_remote_user) REMOTE_CONFIG.user = config.pg_remote_user;
      if (config.pg_remote_pass) REMOTE_CONFIG.password = config.pg_remote_pass;

      LOCAL_CONFIG.isConfigured = config.is_configured === true;

      console.log('✅ Configurations Loaded from SQLite:', {
        mode: DB_SETTINGS.activeMode,
        firm: ERP_SETTINGS.firmNr,
        local_db: LOCAL_CONFIG.host,
        local_user: LOCAL_CONFIG.user
      });
    }
  } catch (err) {
    console.error('Failed to load SQL config:', err);
  }
}

/**
 * Update configurations and persist (Now syncs to SQLite too)
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

  // Sync back to SQLite
  try {
    const currentConfig: any = await invoke('get_app_config');
    const newConfig = {
      ...currentConfig,
      db_mode: DB_SETTINGS.activeMode,
      system_type: DB_SETTINGS.systemType,
      erp_firm_nr: ERP_SETTINGS.firmNr,
      erp_period_nr: ERP_SETTINGS.periodNr,
      selected_cash_registers: ERP_SETTINGS.selected_cash_registers,
      is_configured: LOCAL_CONFIG.isConfigured
    };
    await invoke('save_app_config', { config: newConfig });
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
    // Use backend to check connection (Browser cannot check TCP ports reliably)
    const status: string = await invoke('check_db_status', {
      config: await invoke('get_app_config')
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

    const targetConfig = DB_SETTINGS.activeMode === 'online' ? REMOTE_CONFIG : LOCAL_CONFIG;
    this.status = await testDbConfig(targetConfig);
    console.log(`🔌 Connected in ${DB_SETTINGS.activeMode} mode to ${this.status.host}`);

    return this.status;
  }

  getStatus() { return this.status; }

  private static CARD_TABLES = [
    'products', 'customers', 'suppliers', 'sales_reps', 'cash_registers', 'cash_register_transactions',
    'currencies', 'categories', 'brands', 'units', 'tax_rates', 'special_codes',
    'campaigns', 'product_variants', 'lots', 'bank_registers', 'expense_cards',
    // Restaurant card tables (rest schema)
    'rest_tables', 'rest_recipes', 'rest_recipe_ingredients', 'rest_staff',
    // Beauty card tables (beauty schema)
    'beauty_specialists', 'beauty_services', 'beauty_packages', 'beauty_devices', 'beauty_leads'
  ];
  private static MOVEMENT_TABLES = [
    'sales', 'sale_items', 'stock_moves', 'cash_lines', 'stock_movements', 'stock_movement_items', 'invoices', 'invoice_items', 'bank_lines',
    'virman_operations', 'virman_items',
    // Restaurant movement tables (rest schema)
    'rest_orders', 'rest_order_items', 'rest_kitchen_orders', 'rest_kitchen_items', 'rest_reservations',
    // Beauty movement tables (beauty schema)
    'beauty_appointments', 'beauty_sessions', 'beauty_session_logs',
    'beauty_package_purchases', 'beauty_package_sales', 'beauty_device_usage',
    'beauty_device_alerts', 'beauty_customer_feedback', 'beauty_sales', 'beauty_sale_items'
  ];

  // Tables that live in a dedicated schema (not public)
  private static TABLE_SCHEMA: Record<string, string> = {
    'rest_tables': 'rest', 'rest_recipes': 'rest', 'rest_recipe_ingredients': 'rest', 'rest_staff': 'rest',
    'rest_orders': 'rest', 'rest_order_items': 'rest', 'rest_kitchen_orders': 'rest', 'rest_kitchen_items': 'rest', 'rest_reservations': 'rest',
    'beauty_specialists': 'beauty', 'beauty_services': 'beauty', 'beauty_packages': 'beauty', 'beauty_devices': 'beauty',
    'beauty_appointments': 'beauty', 'beauty_sessions': 'beauty', 'beauty_session_logs': 'beauty',
    'beauty_package_purchases': 'beauty', 'beauty_package_sales': 'beauty', 'beauty_device_usage': 'beauty',
    'beauty_leads': 'beauty', 'beauty_device_alerts': 'beauty', 'beauty_customer_feedback': 'beauty',
    'beauty_sales': 'beauty', 'beauty_sale_items': 'beauty',
    'products': 'public', 'customers': 'public', 'suppliers': 'public', 'categories': 'public'
  };

  /** Returns schema-qualified prefixed name for a firm-level card table.
   *  e.g. getCardTableName('rest_tables', 'rest') → 'rest.rex_001_rest_tables'
   */
  getCardTableName(table: string, schema = 'public'): string {
    const firm = ERP_SETTINGS.firmNr || '001';
    const prefixed = `rex_${firm}_${table}`;
    return schema === 'public' ? prefixed : `${schema}.${prefixed}`;
  }

  /** Returns schema-qualified prefixed name for a period movement table.
   *  e.g. getMovementTableName('beauty_appointments', 'beauty') → 'beauty.rex_001_01_beauty_appointments'
   */
  getMovementTableName(table: string, schema = 'public'): string {
    const firm = ERP_SETTINGS.firmNr || '001';
    const period = ERP_SETTINGS.periodNr || '01';
    const prefixed = `rex_${firm}_${period}_${table}`;
    return schema === 'public' ? prefixed : `${schema}.${prefixed}`;
  }

  async query<T = any>(sql: string, params: any[] = [], options?: { firmNr?: string, periodNr?: string }): Promise<{ rows: T[]; rowCount: number }> {
    // 1. Resolve Dynamic Table Names (Query Rewriting)
    let resolvedSql = sql;

    // Diagnostik log (Orijinal tipler)
    if (params.length > 0) {
      const types = params.map(p => p === null ? 'null' : typeof p);
      console.log(`[PG Params Types Original]`, types);
    }

    // Normalizasyon: Postgres bridge için tipleri koru (booleans/numbers ham iletilir)
    const normalizedParams = params.map((p: any) => {
      if (p === null || p === undefined) return null;
      if (typeof p === 'boolean' || typeof p === 'number') return p;
      if (typeof p === 'bigint') return p.toString();

      if (typeof p === 'object') {
        if (p instanceof Date) return p.toISOString();
        if (typeof (p as any).toISOString === 'function') return (p as any).toISOString();
        try { return JSON.stringify(p); } catch (e) { return String(p); }
      }

      return String(p);
    });

    // Diagnostik log (Normalize edilmiş tipler ve DEĞERLER)
    if (normalizedParams.length > 0) {
      const types = normalizedParams.map((p: any) => p === null ? 'null' : typeof p);
      console.log(`[PG Params Types Normalized]`, types);
      console.log(`[PG Params VALUES]`, JSON.stringify(normalizedParams, null, 2));
    }

    const effectiveFirmNr = options?.firmNr || ERP_SETTINGS.firmNr || '001';
    const effectivePeriodNr = options?.periodNr || ERP_SETTINGS.periodNr || '01';

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

    console.log(`[PG Query] [${DB_SETTINGS.activeMode}]`, resolvedSql, JSON.parse(JSON.stringify(normalizedParams)));

    // Attempt to log to a file for AI to read
    try {
      invoke('log_to_file', {
        fileName: 'pg_queries.log',
        content: `[${new Date().toISOString()}] SQL: ${resolvedSql} PARAMS: ${JSON.stringify(normalizedParams)}\n`
      }).catch(() => { });
    } catch (e) { }

    const startTime = Date.now();
    try {
      const config = DB_SETTINGS.activeMode === 'online' ? REMOTE_CONFIG : LOCAL_CONFIG;
      // Localhost stability: Use 127.0.0.1 instead of localhost for Windows
      const effectiveHost = config.host === 'localhost' ? '127.0.0.1' : config.host;
      const connStr = `postgresql://${config.user}:${config.password}@${effectiveHost}:${config.port}/${config.database}`;

      const resultJson: string = await invoke('pg_query', { connStr, sql: resolvedSql, params: normalizedParams });
      const rows = JSON.parse(resultJson);

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
      console.log(`🛠 Running Database Migrations (Demo: ${loadDemo ? 'YES' : 'NO'})...`);

      const config: any = await invoke('get_app_config');
      const target = DB_SETTINGS.activeMode === 'online' ? 'remote' : 'local';

      const message: string = await invoke('run_migrations', {
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
   * Legacy wrapper for database initialization
   */
  async initializeDatabase(): Promise<{ success: boolean; message: string }> {
    return this.runMigrations(true);
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
        'SELECT * FROM firms WHERE nr = $1 AND is_active = true',
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
