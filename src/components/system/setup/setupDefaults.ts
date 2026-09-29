import { DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN } from '../../../services/merkezTenantRegistry';
import { isTauriApp } from '../../../utils/env';
import type { SetupAppConfig } from './setupTypes';

/** Kurulum sihirbazı başlangıç yapılandırması — Rust AppConfig ile uyumlu db_mode / provider.
 * Tauri (masaüstü) kurulumunda varsayılan **Yerel / Standalone** olur:
 *   db_mode='offline', connection_provider='db', remote_rest_url=''.
 * Bu sayede «Server kodu» ve PostgREST URL adımı zorunlu gelmez; kullanıcı isterse
 * Hibrit veya Cloud-Only moduna sihirbaz içinden geçebilir. Web'de (SaaS) varsayılan
 * hibrit+rest_api korunur — bulut kurulumu varsayılanı değişmez.
 */
export function createInitialSetupConfig(): SetupAppConfig {
  const isTauri = isTauriApp();
  return {
    is_configured: false,
    db_mode: isTauri ? 'offline' : 'hybrid',
    local_db: '127.0.0.1:5432/retailex_local',
    remote_db: '',
    connection_provider: isTauri ? 'db' : 'rest_api',
    // Tauri'de boş bırak: step 6 / ERP adımında zorunlu sorgulamasın.
    // Web SaaS akışı için varsayılan SaaS origin korunur.
    remote_rest_url: isTauri ? '' : DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN,
    hybrid_read_preference: 'local_first',
    hybrid_sync_direction: 'local_to_remote',
    hybrid_sync_interval_sec: 30,
    hybrid_sync_transport: 'both',
    terminal_name: 'TERMINAL-01',
    store_id: '',
    erp_firm_nr: '001',
    erp_period_nr: '01',
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
    // Masaüstünde varsayılan ERP bağlantısız (standalone). Kullanıcı Logo/Nebim
    // isterse sihirbazda seçebilir; zorla Logo'ya bağlama.
    skip_integration: isTauri ? true : false,
    system_type: 'retail',
    role: isTauri ? 'center' : 'client',
    central_api_url: '',
    central_ws_url: '',
    selected_firms: [],
    device_id: '',
    logo_objects_user: '',
    logo_objects_pass: '',
    logo_objects_path: 'C:\\LOGO\\LObjects.dll',
    logo_objects_active: false,
    backup_config: {
      enabled: true,
      daily_backup: true,
      hourly_backup: false,
      periodic_min: 0,
      backup_path: 'C:\\RetailEx_Backups',
      last_run: '',
    },
    selected_cash_registers: [],
    is_nebim_migration: false,
    enabled_modules: ['pos', 'management'],
    bayi_seti: false,
    default_currency: 'IQD',
    regulatory_region: 'IQ',
    /**
     * **Tauri sadeleştirme bayrağı.** `true` ise SetupWizard ilk adımda
     * tam sihirbaz yerine sadece «Yapılandırmayı Aç» ekranını gösterir;
     * kullanıcı şifresini girip kaydedince `is_configured=true` set edilip
     * panele yönlendirilir. Web (SaaS) tarafında bu bayrak `false` kalır —
     * bulut kurulumu için tam sihirbaz (PostgREST, hibrit vb.) açılır.
     */
    simplified_setup: isTauri,
  };
}
