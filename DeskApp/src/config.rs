#![allow(dead_code)]
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub is_configured: bool,
    pub db_mode: String, // online, offline, hybrid
    pub local_db: String,
    pub remote_db: String,
    #[serde(default = "default_connection_provider")]
    pub connection_provider: String, // db | rest_api
    #[serde(default = "default_remote_rest_url")]
    pub remote_rest_url: String,
    /// SaaS kiracı kodu (PostgREST slug); boşsa remote_rest_url path'inden türetilir
    #[serde(default)]
    pub merkez_tenant_code: String,
    /// Hibrit + DB: SQL için önce hangi PG (local_first | remote_first)
    #[serde(default = "default_hybrid_read_preference")]
    pub hybrid_read_preference: String,
    /// Hibrit senkron yönü (local_to_remote | remote_to_local | bidirectional)
    #[serde(default = "default_hybrid_sync_direction")]
    pub hybrid_sync_direction: String,
    /// Hibrit otomatik senkron aralığı (saniye, 5–3600)
    #[serde(default = "default_hybrid_sync_interval_sec")]
    pub hybrid_sync_interval_sec: i32,
    /// Hibrit senkron taşıma: both | websocket | polling
    #[serde(default = "default_hybrid_sync_transport")]
    pub hybrid_sync_transport: String,
    pub terminal_name: String,
    pub store_id: String,
    pub erp_firm_nr: String,
    pub erp_period_nr: String,
    pub erp_method: String, // mssql, api, rest
    pub erp_host: String,
    pub erp_user: String,
    pub erp_pass: String,
    pub erp_db: String,
    pub pg_local_user: String,
    pub pg_local_pass: String,
    pub pg_remote_user: String,
    pub pg_remote_pass: String,
    pub system_type: String, // retail, market, wms
    #[serde(default)]
    pub skip_integration: bool,
    pub selected_firms: Vec<String>,
    #[serde(default)]
    pub central_api_url: String, // For Sync (HTTP)
    #[serde(default)]
    pub central_ws_url: String, // For Real-Time (WebSocket)
    #[serde(default)]
    pub amqp_url: String,       // For Reliable Sync (RabbitMQ)
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub device_id: String, // Hardware fingerprint / terminal kimligi
    #[serde(default)]
    pub backup_config: Option<BackupConfig>,
    #[serde(default = "default_menu_mode")]
    pub menu_mode: i32,
    #[serde(default)]
    pub logo_objects_user: String,
    #[serde(default)]
    pub logo_objects_pass: String,
    #[serde(default)]
    pub logo_objects_path: String,
    #[serde(default)]
    pub logo_objects_active: bool,
    #[serde(default = "default_update_source")]
    pub update_source: String, // "central" or "github"
    #[serde(default = "default_hidden_modules")]
    pub hidden_modules: Vec<String>,
    /// TR: GİB e-fatura / e-arşiv; IQ: kapalı (yemek agregatörleri ayrı profil)
    #[serde(default = "default_regulatory_region")]
    pub regulatory_region: String,
    /// POS/ekran varsayılan para kodu (firma seçilene kadar ve uygulama geneli)
    #[serde(default = "default_currency")]
    pub default_currency: String,
    /// Beauty takviminde slot aralığı (dakika)
    #[serde(default = "default_beauty_slot_interval_min")]
    pub beauty_slot_interval_min: i32,
    /// Güzellik takviminde sıra (kuyruk) modu
    #[serde(default = "default_true")]
    pub beauty_queue_mode: bool,
    /// POS: güzellik sepetinde her kalem ayrı fiş / satış kaydı
    #[serde(default = "default_true")]
    pub beauty_queue_separate_sale_per_line: bool,
}

fn default_true() -> bool { true }
fn default_menu_mode() -> i32 { 1 }
fn default_update_source() -> String { "central".to_string() }
fn default_connection_provider() -> String { "rest_api".to_string() }
fn default_remote_rest_url() -> String { "https://api.retailex.app".to_string() }

fn default_hybrid_read_preference() -> String {
    "local_first".to_string()
}

fn default_hybrid_sync_direction() -> String {
    "local_to_remote".to_string()
}

fn default_hybrid_sync_interval_sec() -> i32 {
    30
}

fn default_hybrid_sync_transport() -> String {
    "both".to_string()
}

pub fn clamp_hybrid_sync_interval_sec(raw: i32) -> u64 {
    raw.clamp(5, 3600) as u64
}

pub fn should_use_websocket_sync(config: &AppConfig) -> bool {
    let m = config.hybrid_sync_transport.trim().to_lowercase();
    m == "both" || m == "websocket" || m == "ws"
}

pub fn should_use_polling_sync(config: &AppConfig) -> bool {
    let m = config.hybrid_sync_transport.trim().to_lowercase();
    m.is_empty() || m == "both" || m == "polling" || m == "interval"
}

const SAAS_API_HOST: &str = "api.retailex.app";

/// PostgREST URL slug → kiracı kodu (https://api.retailex.app/lovan → lovan)
pub fn tenant_slug_from_rest_url(url: &str) -> Option<String> {
    let trimmed = url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    let without_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .or_else(|| trimmed.strip_prefix("wss://"))
        .or_else(|| trimmed.strip_prefix("ws://"))
        .unwrap_or(trimmed);
    let mut parts = without_scheme.split('/');
    let host = parts.next().unwrap_or("");
    if host != SAAS_API_HOST {
        return None;
    }
    let slug = parts.next()?.trim();
    if slug.is_empty() || slug == "merkez" {
        return None;
    }
    Some(slug.to_string())
}

/// Kiracı kodundan merkez WebSocket: wss://api.retailex.app/{code}/ws
pub fn build_tenant_central_ws_url(code: &str) -> String {
    let slug = code.trim().trim_matches('/');
    if slug.is_empty() || slug == "merkez" {
        return String::new();
    }
    format!("wss://{}/{}/ws", SAAS_API_HOST, slug)
}

/// Kiracı kodundan merkez REST senkron: https://api.retailex.app/{code}/sync
pub fn build_tenant_central_api_url(code: &str) -> String {
    let slug = code.trim().trim_matches('/');
    if slug.is_empty() || slug == "merkez" {
        return String::new();
    }
    format!("https://{}/{}/sync", SAAS_API_HOST, slug)
}

/// central_ws_url boş veya eski global path ise kiracı slug ile türet.
pub fn resolve_central_ws_url(config: &AppConfig) -> String {
    let explicit = config.central_ws_url.trim();
    if !explicit.is_empty()
        && explicit != "wss://api.retailex.app/ws"
        && explicit != "wss://api.retailex.com/ws"
    {
        return explicit.to_string();
    }
    if let Some(slug) = tenant_slug_from_rest_url(&config.remote_rest_url) {
        return build_tenant_central_ws_url(&slug);
    }
    if explicit.is_empty() {
        "ws://127.0.0.1:9999/ws".to_string()
    } else {
        explicit.to_string()
    }
}

pub fn resolve_central_api_url(config: &AppConfig) -> String {
    let explicit = config.central_api_url.trim();
    if !explicit.is_empty()
        && !explicit.contains("api.retailex.com/sync")
        && explicit != "http://localhost:8000/api/v1/sync"
    {
        return explicit.to_string();
    }
    if let Some(slug) = tenant_slug_from_rest_url(&config.remote_rest_url) {
        return build_tenant_central_api_url(&slug);
    }
    if explicit.is_empty() {
        String::new()
    } else {
        explicit.to_string()
    }
}
fn default_regulatory_region() -> String {
    "IQ".to_string()
}

fn default_currency() -> String {
    "IQD".to_string()
}

fn default_beauty_slot_interval_min() -> i32 {
    15
}

fn default_hidden_modules() -> Vec<String> {
    vec![
        "restaurant".to_string(),
        "beauty".to_string(),
        "retail".to_string(),
        "communication-notifications".to_string(),
        "stock-dashboard".to_string(),
        "Teklifler".to_string(),
        "waybill".to_string(),
        "sales-invoice-consignment".to_string(),
        "sales-invoice-wholesale".to_string(),
        "purchaserequest".to_string(),
        "serviceinvoice-received".to_string(),
        "Dashboard".to_string(),
        "store-management-group".to_string(),
        "databroadcast".to_string(),
        "integrations".to_string(),
    ]
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct BackupConfig {
    pub enabled: bool,
    pub daily_backup: bool,   // 00:00 every day
    pub hourly_backup: bool,  // Every hour
    pub periodic_min: i32,    // Custom interval in minutes (e.g., 30)
    pub backup_path: String,  // Target folder
    pub last_run: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DashboardShortcut {
    pub id: Option<i64>,
    pub user_id: String,
    pub shortcut_id: String,
    pub label: String,
    pub icon: String,
    pub color: String,
    pub category: String,
    pub sort_order: i32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            is_configured: false,
            db_mode: "online".to_string(),
            local_db: "localhost:5432/retailex_local".to_string(),
            remote_db: "72.60.182.107:5432/retailex_demo".to_string(), // sync: config/remote-pg.defaults.json
            connection_provider: "db".to_string(),
            remote_rest_url: default_remote_rest_url(),
            merkez_tenant_code: String::new(),
            hybrid_read_preference: "remote_first".to_string(),
            hybrid_sync_direction: "remote_to_local".to_string(),
            hybrid_sync_interval_sec: default_hybrid_sync_interval_sec(),
            hybrid_sync_transport: default_hybrid_sync_transport(),
            terminal_name: "".to_string(),
            store_id: "001".to_string(),
            erp_firm_nr: "001".to_string(),
            erp_period_nr: "01".to_string(),
            erp_method: "mssql".to_string(),
            erp_host: "26.154.3.237".to_string(),
            erp_user: "sa".to_string(),
            erp_pass: "r9hWP3oJoC7cTfr".to_string(),
            erp_db: "LOGO".to_string(),
            pg_local_user: "postgres".to_string(),
            pg_local_pass: "Yq7xwQpt6c".to_string(),
            pg_remote_user: "postgres".to_string(),
            pg_remote_pass: "Yq7xwQpt6c".to_string(),
            system_type: "retail".to_string(),
            skip_integration: false,
            selected_firms: vec!["001".to_string()],
            central_api_url: String::new(),
            central_ws_url: String::new(),
            amqp_url: "amqp://guest:guest@localhost:5672".to_string(),
            role: "terminal".to_string(),
            device_id: "".to_string(),
            backup_config: Some(BackupConfig::default()),
            menu_mode: 1,
            logo_objects_user: "".to_string(),
            logo_objects_pass: "".to_string(),
            logo_objects_path: "C:\\LOGO\\LObjects.dll".to_string(),
            logo_objects_active: false,
            update_source: "central".to_string(),
            hidden_modules: default_hidden_modules(),
            regulatory_region: default_regulatory_region(),
            default_currency: default_currency(),
            beauty_slot_interval_min: default_beauty_slot_interval_min(),
            beauty_queue_mode: true,
            beauty_queue_separate_sale_per_line: true,
        }
    }
}

/// Çalışan exe'nin klasörü (USB harfi değişse bile göreli kök).
pub fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Taşınabilir (USB) mod: `ASIN_PORTABLE=1` / `RETAILEX_PORTABLE=1` veya exe yanında `portable.dat`.
/// Portable çalıştırma: `volume.bind` (writer ile basılır) — bkz. `portable_bind`.
pub fn is_portable_mode() -> bool {
    for key in ["ASIN_PORTABLE", "RETAILEX_PORTABLE"] {
        if let Ok(v) = std::env::var(key) {
            let t = v.trim().to_ascii_lowercase();
            if t == "1" || t == "true" || t == "yes" {
                return true;
            }
        }
    }
    let root = exe_dir();
    root.join("portable.dat").is_file() || root.join("AsinERP.portable").is_file()
}

/// Sabit kurulum: `C:\AsinERP` — portable: `{exe_dir}\data` (flash harfinden bağımsız).
/// Eski kurulumda `config.db` hâlâ `C:\RetailEX` / `C:\RetailEx` altındaysa onu kullanır.
pub fn get_app_data_dir() -> PathBuf {
    if is_portable_mode() {
        let dir = exe_dir().join("data");
        let _ = std::fs::create_dir_all(&dir);
        dir
    } else {
        let app_dir = PathBuf::from(r"C:\AsinERP");
        if app_dir.join("config.db").exists() {
            return app_dir;
        }
        for legacy in [r"C:\RetailEX", r"C:\RetailEx"] {
            let p = PathBuf::from(legacy);
            if p.join("config.db").exists() {
                return p;
            }
        }
        if !app_dir.exists() {
            let _ = std::fs::create_dir_all(&app_dir);
        }
        app_dir
    }
}

pub fn get_logs_dir() -> PathBuf {
    let dir = get_app_data_dir().join("logs");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn get_backups_dir() -> PathBuf {
    let dir = get_app_data_dir().join("backups");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn get_db_path() -> PathBuf {
    get_app_data_dir().join("config.db")
}

pub fn init_config_db() -> Result<(), String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // Create dashboard shortcuts table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS dashboard_shortcuts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT 'default',
            shortcut_id TEXT NOT NULL,
            label TEXT NOT NULL,
            icon TEXT NOT NULL,
            color TEXT NOT NULL,
            category TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, shortcut_id)
        )",
        [],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_app_config(_app_handle: AppHandle) -> Result<AppConfig, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT data FROM config WHERE id = 1").map_err(|e| e.to_string())?;
    let config_json: Result<String, _> = stmt.query_row([], |row| row.get(0));

    match config_json {
        Ok(json) => {
            let mut config: AppConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            // DECRYPT (Base64 Decode)
            config.erp_pass = decode_base64(&config.erp_pass);
            config.pg_remote_pass = decode_base64(&config.pg_remote_pass);
            config.pg_local_pass = decode_base64(&config.pg_local_pass);
            config.logo_objects_pass = decode_base64(&config.logo_objects_pass);

            // Ensure requested material management modules are NOT hidden
            let show_always = vec![
                "material-classes", "variants", "special-codes", 
                "brand-definitions", "group-codes", "product-categories",
                "campaigns"
            ];
            config.hidden_modules.retain(|m| !show_always.contains(&m.as_str()));
            
            Ok(config)
        }
        Err(_) => Ok(AppConfig::default()),
    }
}

pub fn get_app_config_internal() -> Result<AppConfig, String> {
    // Shared version without AppHandle
    let _ = init_config_db(); // Ensure DB and table exist
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT data FROM config WHERE id = 1").map_err(|e| e.to_string())?;
    let config_json: Result<String, _> = stmt.query_row([], |row| row.get(0));

    match config_json {
        Ok(json) => {
            let mut config: AppConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            config.erp_pass = decode_base64(&config.erp_pass);
            config.pg_remote_pass = decode_base64(&config.pg_remote_pass);
            config.pg_local_pass = decode_base64(&config.pg_local_pass);
            config.logo_objects_pass = decode_base64(&config.logo_objects_pass);

            // Ensure requested material management modules are NOT hidden
            let show_always = vec![
                "material-classes", "variants", "special-codes", 
                "brand-definitions", "group-codes", "product-categories",
                "campaigns"
            ];
            config.hidden_modules.retain(|m| !show_always.contains(&m.as_str()));

            Ok(config)
        }
        Err(_) => Ok(AppConfig::default()),
    }
}

#[tauri::command]
pub fn save_app_config(_app_handle: AppHandle, mut config: AppConfig) -> Result<(), String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // ENCRYPT (Base64 Encode)
    config.erp_pass = encode_base64(&config.erp_pass);
    config.pg_remote_pass = encode_base64(&config.pg_remote_pass);
    config.pg_local_pass = encode_base64(&config.pg_local_pass);
    config.logo_objects_pass = encode_base64(&config.logo_objects_pass);

    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    // Self-healing: Ensure table exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )",
        [],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO config (id, data) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET data = ?1",
        params![json],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn save_app_config_internal(mut config: AppConfig) -> Result<(), String> {
     let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Self-healing: Ensure table exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )",
        [],
    ).map_err(|e| e.to_string())?;

    config.erp_pass = encode_base64(&config.erp_pass);
    config.pg_remote_pass = encode_base64(&config.pg_remote_pass);
    config.pg_local_pass = encode_base64(&config.pg_local_pass);
    config.logo_objects_pass = encode_base64(&config.logo_objects_pass);

    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO config (id, data) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET data = ?1",
        params![json],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// Dashboard Shortcuts CRUD Operations

#[tauri::command]
pub fn get_dashboard_shortcuts(user_id: String) -> Result<Vec<DashboardShortcut>, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, user_id, shortcut_id, label, icon, color, category, sort_order 
         FROM dashboard_shortcuts 
         WHERE user_id = ?1 
         ORDER BY sort_order ASC"
    ).map_err(|e| e.to_string())?;

    let shortcuts_iter = stmt.query_map(params![user_id], |row| {
        Ok(DashboardShortcut {
            id: Some(row.get(0)?),
            user_id: row.get(1)?,
            shortcut_id: row.get(2)?,
            label: row.get(3)?,
            icon: row.get(4)?,
            color: row.get(5)?,
            category: row.get(6)?,
            sort_order: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut shortcuts = Vec::new();
    for shortcut in shortcuts_iter {
        shortcuts.push(shortcut.map_err(|e| e.to_string())?);
    }

    Ok(shortcuts)
}

#[tauri::command]
pub fn save_dashboard_shortcuts(user_id: String, shortcuts: Vec<DashboardShortcut>) -> Result<(), String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Delete existing shortcuts for this user
    conn.execute(
        "DELETE FROM dashboard_shortcuts WHERE user_id = ?1",
        params![user_id],
    ).map_err(|e| e.to_string())?;

    // Insert new shortcuts
    for shortcut in shortcuts {
        conn.execute(
            "INSERT INTO dashboard_shortcuts (user_id, shortcut_id, label, icon, color, category, sort_order) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                shortcut.user_id,
                shortcut.shortcut_id,
                shortcut.label,
                shortcut.icon,
                shortcut.color,
                shortcut.category,
                shortcut.sort_order,
            ],
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn reset_dashboard_shortcuts(user_id: String) -> Result<(), String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM dashboard_shortcuts WHERE user_id = ?1",
        params![user_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// Simple Base64 Helper (Obfuscation as requested)
fn encode_base64(s: &str) -> String {
    if s.is_empty() { return String::new(); }
    use base64::{Engine as _, engine::general_purpose};
    general_purpose::STANDARD.encode(s)
}

fn decode_base64(s: &str) -> String {
    if s.is_empty() { return String::new(); }
    use base64::{Engine as _, engine::general_purpose};
    match general_purpose::STANDARD.decode(s) {
        Ok(bytes) => String::from_utf8(bytes).unwrap_or(s.to_string()),
        Err(_) => s.to_string(), // Fallback if not base64
    }
}
