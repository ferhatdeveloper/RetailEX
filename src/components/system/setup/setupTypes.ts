import type { HybridReadPreference, HybridSyncDirection, HybridSyncTransport } from '../../../services/postgres';

export type SetupDbMode = 'online' | 'offline' | 'hybrid';
export type SetupDbTarget = 'local' | 'remote';
export type SetupConnectionProvider = 'db' | 'rest_api';
export type SetupSystemType = 'retail' | 'market' | 'wms' | 'restaurant' | 'beauty' | 'bayi';
export type SetupRole = 'center' | 'client';

export interface SetupAppConfig {
  is_configured: boolean;
  db_mode: SetupDbMode | string;
  local_db: string;
  remote_db: string;
  connection_provider?: SetupConnectionProvider;
  remote_rest_url?: string;
  hybrid_read_preference?: HybridReadPreference;
  hybrid_sync_direction?: HybridSyncDirection;
  hybrid_sync_interval_sec?: number;
  hybrid_sync_transport?: HybridSyncTransport;
  merkez_tenant_code?: string;
  terminal_name: string;
  store_id: string;
  erp_firm_nr: string;
  erp_period_nr: string;
  erp_method: string;
  erp_host: string;
  erp_user: string;
  erp_pass: string;
  erp_db: string;
  title: string;
  pg_local_user: string;
  pg_local_pass: string;
  pg_remote_user: string;
  pg_remote_pass: string;
  skip_integration: boolean;
  system_type: SetupSystemType;
  role: SetupRole;
  selected_firms: string[];
  device_id?: string;
  central_api_url?: string;
  central_ws_url?: string;
  logo_objects_user?: string;
  logo_objects_pass?: string;
  logo_objects_path?: string;
  logo_objects_active: boolean;
  selected_cash_registers: string[];
  backup_config?: SetupBackupConfig;
  is_nebim_migration?: boolean;
  license_expiry?: string;
  max_users?: number;
  enabled_modules: string[];
  bayi_seti: boolean;
  default_currency: string;
  regulatory_region: 'TR' | 'IQ';
}

export interface SetupCompany {
  id: string;
  name: string;
  title?: string;
  tax_nr?: string;
  tax_office?: string;
  city?: string;
  periods: SetupPeriod[];
  stores: SetupStore[];
  users: SetupAppUser[];
  license_expiry?: string;
  max_users?: number;
}

export interface SetupPeriod {
  nr: number;
  start_date: string;
  end_date: string;
}

export interface SetupStore {
  id?: string;
  code: string;
  name: string;
  type: 'WH' | 'BR';
}

export interface SetupAppUser {
  id?: string;
  username: string;
  email?: string;
  password?: string;
  full_name: string;
  role: string;
}

export interface SetupBackupConfig {
  enabled: boolean;
  daily_backup: boolean;
  hourly_backup: boolean;
  periodic_min: number;
  backup_path: string;
  last_run?: string;
}

export interface SetupMigrationStatus {
  name: string;
  status: 'Applied' | 'Already Applied' | 'Error' | 'Demo Skipped';
  error?: string;
}

export type SetupInstallationPhase =
  | 'PENDING'
  | 'CONFIGURING'
  | 'DATABASE'
  | 'MIGRATIONS'
  | 'ENTITIES'
  | 'USERS'
  | 'SYNC'
  | 'DEVICE'
  | 'COMPLETED'
  | 'ERROR';

/** SetupWizard.tsx uyumluluk alias'ları */
export type AppConfig = SetupAppConfig;
export type Company = SetupCompany;
export type Period = SetupPeriod;
export type Store = SetupStore;
export type AppUser = SetupAppUser;
export type BackupConfig = SetupBackupConfig;
export type MigrationStatus = SetupMigrationStatus;
