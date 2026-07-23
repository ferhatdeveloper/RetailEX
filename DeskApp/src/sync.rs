use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use serde::{Serialize, Deserialize};
use tokio_postgres::NoTls;
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use url::Url;
use std::sync::OnceLock;
use std::path::PathBuf;
use std::future::Future;
use tauri::{AppHandle, Manager, Emitter};

use crate::remote_input::RemoteInputManager;
use crate::screen_capture::ScreenCaptureService;
use crate::security::SecurityService;
use crate::maintenance::RemoteMaintenanceService;
use crate::db_utils::format_pg_error;

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncItem {
    pub id: String,
    pub table_name: String,
    pub record_id: Option<String>,
    pub action: String,
    pub firm_nr: String,
    pub data: Option<serde_json::Value>,
    pub status: String,
    pub retry_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
struct WrappedWsMessage {
    #[serde(rename = "type")]
    msg_type: String,
    payload: Option<serde_json::Value>,
}

pub struct BackgroundSyncService {
    cancel_token: tokio_util::sync::CancellationToken,
    sender: tokio::sync::mpsc::Sender<String>,
    input_manager: Arc<RemoteInputManager>,
    screen_capture: Arc<ScreenCaptureService>,
    security_service: Arc<SecurityService>,
}

impl BackgroundSyncService {
    pub fn new() -> (Self, tokio::sync::mpsc::Receiver<String>) {
        let (tx, rx) = tokio::sync::mpsc::channel(32);
        (
            Self {
                cancel_token: tokio_util::sync::CancellationToken::new(),
                sender: tx,
                input_manager: Arc::new(RemoteInputManager::new()),
                screen_capture: Arc::new(ScreenCaptureService::new()),
                security_service: Arc::new(SecurityService::new()),
            },
            rx
        )
    }

    pub fn start(&self, app_handle: Option<tauri::AppHandle>, rx: tokio::sync::mpsc::Receiver<String>) {
        let token = self.cancel_token.clone();
        
        println!("🚀 BackgroundSyncService started...");

        // Start Screen Capture Service (if GUI present)
        if let Some(h) = app_handle.clone() {
            self.screen_capture.start(h, crate::sync::SyncSender(self.sender.clone()));
        }
        
        // Start Security Service
        self.security_service.start();

        // 1. Data Sync Loop (Push to Center) — polling / both modunda
        let sync_token = token.clone();
        let sync_app = app_handle.clone();
        spawn_background_task(async move {
            loop {
                if sync_token.is_cancelled() { break; }

                let use_polling = crate::config::get_app_config_internal()
                    .map(|c| crate::config::should_use_polling_sync(&c))
                    .unwrap_or(true);

                if use_polling {
                    if let Err(e) = process_sync_queue_internal(sync_app.clone()).await {
                       eprintln!("Sync Queue Error: {}", e);
                    }
                }

                let interval_secs = crate::config::get_app_config_internal()
                    .map(|c| crate::config::clamp_hybrid_sync_interval_sec(c.hybrid_sync_interval_sec))
                    .unwrap_or(30);
                sleep(Duration::from_secs(interval_secs)).await;
            }
        });

        // 2. Real-Time Listener (WebSocket)
        let ws_token = token.clone();
        let ws_handle = app_handle.clone();
        let input_mgr = self.input_manager.clone();
        let screen_cap = self.screen_capture.clone();
        let security_svc = self.security_service.clone();
        
        spawn_background_task(async move {
            start_websocket_listener(ws_token, ws_handle, rx, input_mgr, screen_cap, security_svc).await;
        });
    }

    pub fn get_sender(&self) -> tokio::sync::mpsc::Sender<String> {
        self.sender.clone()
    }

    pub fn stop(&self) {
        self.cancel_token.cancel();
        self.screen_capture.stop();
    }
}

async fn process_sync_queue(_app: &tauri::AppHandle) -> Result<(), String> {
    process_sync_queue_internal(Some(_app.clone())).await
}

#[derive(Clone, Copy, Default, Serialize, Deserialize)]
pub struct SyncApplyTotals {
    pub synced: i32,
    pub failed: i32,
    pub inserted: i32,
    pub updated: i32,
    pub skipped: i32,
}

impl SyncApplyTotals {
    pub fn record_apply(&mut self, outcome: &str) {
        match outcome {
            "insert" => {
                self.inserted += 1;
                self.synced += 1;
            }
            "update" | "delete" => {
                self.updated += 1;
                self.synced += 1;
            }
            "skip" | "noop" => {
                self.skipped += 1;
            }
            _ => {
                self.synced += 1;
            }
        }
    }

    pub fn merge(&mut self, other: &SyncApplyTotals) {
        self.synced += other.synced;
        self.failed += other.failed;
        self.inserted += other.inserted;
        self.updated += other.updated;
        self.skipped += other.skipped;
    }

    pub fn meaningful(&self) -> i32 {
        self.inserted + self.updated
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct KasaDataArrivedPayload {
    synced: i32,
    failed: i32,
    inserted: i32,
    updated: i32,
    skipped: i32,
    at: String,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct KasaArrivalPendingFile {
    synced: i32,
    failed: i32,
    inserted: i32,
    updated: i32,
    skipped: i32,
    last_at: String,
    events: i32,
    source: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ServiceSyncHistoryEntry {
    pub at: String,
    pub synced: i32,
    pub failed: i32,
    pub inserted: i32,
    pub updated: i32,
    pub skipped: i32,
    pub source: String,
}

static HEADLESS_RUNTIME: OnceLock<tokio::runtime::Handle> = OnceLock::new();

/// Windows servisi (AsinERP_Service) — Tauri olmadan arka plan görevleri için.
pub fn register_headless_runtime(handle: tokio::runtime::Handle) {
    let _ = HEADLESS_RUNTIME.set(handle);
}

fn retail_ex_data_dir() -> PathBuf {
    if crate::config::is_portable_mode() {
        return crate::config::get_app_data_dir();
    }
    #[cfg(windows)]
    {
        PathBuf::from(r"C:\ProgramData\AsinERP")
    }
    #[cfg(not(windows))]
    {
        std::env::var("RETAILEX_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/tmp/AsinERP"))
    }
}

fn kasa_arrival_pending_path() -> PathBuf {
    retail_ex_data_dir().join("kasa_data_arrival_pending.json")
}

fn kasa_service_sync_history_path() -> PathBuf {
    retail_ex_data_dir().join("kasa_service_sync_history.json")
}

const SERVICE_SYNC_HISTORY_MAX: usize = 200;

fn persist_kasa_data_arrived(totals: &SyncApplyTotals, failed: i32, source: &str) {
    if totals.meaningful() <= 0 {
        return;
    }
    let dir = retail_ex_data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let path = kasa_arrival_pending_path();
    let now = chrono::Utc::now().to_rfc3339();

    let mut pending = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<KasaArrivalPendingFile>(&s).ok())
            .unwrap_or_default()
    } else {
        KasaArrivalPendingFile::default()
    };

    pending.synced = pending.synced.saturating_add(totals.synced);
    pending.failed = pending.failed.saturating_add(failed);
    pending.inserted = pending.inserted.saturating_add(totals.inserted);
    pending.updated = pending.updated.saturating_add(totals.updated);
    pending.skipped = pending.skipped.saturating_add(totals.skipped);
    pending.last_at = now.clone();
    pending.events = pending.events.saturating_add(1);
    if pending.source.is_empty() {
        pending.source = source.to_string();
    }

    if let Ok(json) = serde_json::to_string(&pending) {
        let _ = std::fs::write(&path, json);
    }

    append_service_sync_history(totals, failed, source, &now);
}

fn append_service_sync_history(totals: &SyncApplyTotals, failed: i32, source: &str, at: &str) {
    if totals.synced + totals.skipped + failed <= 0 {
        return;
    }
    let path = kasa_service_sync_history_path();
    let mut entries: Vec<ServiceSyncHistoryEntry> = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    entries.insert(
        0,
        ServiceSyncHistoryEntry {
            at: at.to_string(),
            synced: totals.synced,
            failed,
            inserted: totals.inserted,
            updated: totals.updated,
            skipped: totals.skipped,
            source: source.to_string(),
        },
    );
    entries.truncate(SERVICE_SYNC_HISTORY_MAX);

    if let Ok(json) = serde_json::to_string(&entries) {
        let _ = std::fs::write(&path, json);
    }
}

pub fn list_kasa_service_sync_history_internal(limit: usize) -> Vec<ServiceSyncHistoryEntry> {
    let path = kasa_service_sync_history_path();
    if !path.exists() {
        return Vec::new();
    }
    let entries: Vec<ServiceSyncHistoryEntry> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    entries.into_iter().take(limit).collect()
}

#[tauri::command]
pub fn list_kasa_service_sync_history(limit: Option<usize>) -> Vec<ServiceSyncHistoryEntry> {
    list_kasa_service_sync_history_internal(limit.unwrap_or(50).min(200))
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PendingKasaArrival {
    pub synced: i32,
    pub failed: i32,
    pub inserted: i32,
    pub updated: i32,
    pub skipped: i32,
    pub at: String,
    pub events: i32,
    pub source: String,
}

pub fn consume_pending_kasa_data_arrival_internal() -> Option<PendingKasaArrival> {
    let path = kasa_arrival_pending_path();
    if !path.exists() {
        return None;
    }
    let raw = std::fs::read_to_string(&path).ok()?;
    let pending: KasaArrivalPendingFile = serde_json::from_str(&raw).ok()?;
    let _ = std::fs::remove_file(&path);
    if pending.inserted + pending.updated <= 0 && pending.synced <= 0 {
        return None;
    }
    Some(PendingKasaArrival {
        synced: pending.synced,
        failed: pending.failed,
        inserted: pending.inserted,
        updated: pending.updated,
        skipped: pending.skipped,
        at: pending.last_at,
        events: pending.events,
        source: pending.source,
    })
}

#[tauri::command]
pub fn consume_pending_kasa_data_arrival() -> Option<PendingKasaArrival> {
    consume_pending_kasa_data_arrival_internal()
}

fn spawn_background_task<F>(future: F)
where
    F: Future<Output = ()> + Send + 'static,
{
    if let Some(handle) = HEADLESS_RUNTIME.get() {
        handle.spawn(future);
        return;
    }
    tauri::async_runtime::spawn(future);
}

const UI_HEARTBEAT_STALE_SECS: u64 = 45;

#[derive(Clone, Serialize, Deserialize, Default)]
struct AppUiHeartbeat {
    pid: u32,
    at: String,
}

fn app_ui_heartbeat_path() -> PathBuf {
    retail_ex_data_dir().join("app_ui_heartbeat.json")
}

/// Tauri UI açık — Windows servisi bunu görerek gereksiz birikim yapmaz.
pub fn touch_app_ui_heartbeat() {
    let dir = retail_ex_data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let hb = AppUiHeartbeat {
        pid: std::process::id(),
        at: chrono::Utc::now().to_rfc3339(),
    };
    if let Ok(json) = serde_json::to_string(&hb) {
        let _ = std::fs::write(app_ui_heartbeat_path(), json);
    }
}

pub fn clear_app_ui_heartbeat() {
    let _ = std::fs::remove_file(app_ui_heartbeat_path());
}

fn is_app_ui_running() -> bool {
    let raw = match std::fs::read_to_string(app_ui_heartbeat_path()) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let hb: AppUiHeartbeat = match serde_json::from_str(&raw) {
        Ok(h) => h,
        Err(_) => return false,
    };
    let at = match chrono::DateTime::parse_from_rfc3339(&hb.at) {
        Ok(d) => d.with_timezone(&chrono::Utc),
        Err(_) => return false,
    };
    let age = chrono::Utc::now().signed_duration_since(at);
    age.num_seconds() >= 0 && age.num_seconds() <= UI_HEARTBEAT_STALE_SECS as i64
}

fn emit_kasa_data_arrived(app: &Option<tauri::AppHandle>, totals: &SyncApplyTotals, failed: i32) {
    if totals.meaningful() <= 0 {
        return;
    }

    let payload = KasaDataArrivedPayload {
        synced: totals.synced,
        failed,
        inserted: totals.inserted,
        updated: totals.updated,
        skipped: totals.skipped,
        at: chrono::Utc::now().to_rfc3339(),
    };

    if let Some(h) = app {
        let _ = h.emit("kasa-data-arrived", payload);
        return;
    }

    // Uygulama kapalıyken Windows servisi veri çeker — açılışta «Veri alındı» için biriktir
    if !is_app_ui_running() {
        persist_kasa_data_arrived(totals, failed, "app_closed");
    }
}

fn format_service_sync_message(totals: &SyncApplyTotals) -> String {
    format!(
        "Uygulama kapalıyken · Yeni: {} · Güncelleme: {} · Tekrar atlandı: {}",
        totals.inserted, totals.updated, totals.skipped
    )
}

async fn log_service_inbound_sync(
    local: &tokio_postgres::Client,
    config: &crate::config::AppConfig,
    totals: &SyncApplyTotals,
    failed: i32,
) {
    if totals.synced + totals.skipped + failed <= 0 {
        return;
    }

    let firm_nr = config.erp_firm_nr.trim();
    let firm = if firm_nr.is_empty() {
        "001".to_string()
    } else {
        firm_nr.to_string()
    };
    let store_uuid = uuid::Uuid::parse_str(config.store_id.trim()).ok();
    let terminal = if config.terminal_name.trim().is_empty() {
        None
    } else {
        Some(config.terminal_name.as_str())
    };
    let device_id = if config.device_id.trim().is_empty() {
        None
    } else {
        Some(config.device_id.as_str())
    };
    let message = format_service_sync_message(totals);
    let detail = serde_json::json!({
        "inserted": totals.inserted,
        "updated": totals.updated,
        "skipped": totals.skipped,
        "synced": totals.synced,
        "failed": failed,
        "source": "app_closed"
    });

    let status = if failed > 0 && totals.meaningful() == 0 {
        "failed"
    } else if failed > 0 {
        "partial"
    } else {
        "ok"
    };

    let _ = local
        .execute(
            "INSERT INTO terminal_sync_log (
               firm_nr, store_id, terminal_name, terminal_device_id,
               direction, file_type, status, record_count, message, detail
             )
             VALUES ($1, $2::uuid, $3, $4, 'receive', 'service_background', $5, $6, $7, $8::jsonb)",
            &[
                &firm,
                &store_uuid,
                &terminal,
                &device_id,
                &status,
                &totals.meaningful(),
                &message,
                &detail,
            ],
        )
        .await;
}

fn parse_pg_endpoint(db_str: &str) -> (String, u16, String) {
    let host_part = db_str.split(':').next().unwrap_or("127.0.0.1").to_string();
    let host_port_str = db_str.split('/').next().unwrap_or("127.0.0.1:5432");
    let port = host_port_str
        .split(':')
        .nth(1)
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(5432);
    let db_name = db_str
        .split('/')
        .last()
        .unwrap_or("retailex_local")
        .to_string();
    (host_part, port, db_name)
}

async fn connect_pg(
    host: &str,
    port: u16,
    user: &str,
    pass: &str,
    db: &str,
) -> Result<tokio_postgres::Client, String> {
    let mut pg_config = tokio_postgres::Config::new();
    pg_config
        .host(host)
        .port(port)
        .user(user)
        .password(pass)
        .dbname(db)
        .connect_timeout(Duration::from_secs(8));

    let (client, connection) = pg_config
        .connect(NoTls)
        .await
        .map_err(|e| format_pg_error(e))?;

    tauri::async_runtime::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("hybrid sync connection error: {}", e);
        }
    });

    Ok(client)
}

#[derive(Copy, Clone)]
enum QueueSelectMode {
    /// Şubeden merkeze satış/hareket (source_store_id)
    BranchOutbound,
    /// Merkezden kasaya master veri (target_store_id + isteğe terminal_name)
    InboundMaster,
}

async fn fetch_pending_batch(
    source: &tokio_postgres::Client,
    store_uuid: Option<uuid::Uuid>,
    terminal_name: Option<&str>,
    mode: QueueSelectMode,
) -> Result<Vec<tokio_postgres::Row>, tokio_postgres::Error> {
    match (store_uuid, mode) {
        (Some(sid), QueueSelectMode::BranchOutbound) => {
            source
                .query(
                    "SELECT id, table_name, record_id, action, data
                     FROM sync_queue
                     WHERE status = 'pending' AND retry_count < 10
                       AND (
                         source_store_id = $1
                         OR target_store_id = $1
                         OR (data->>'store_id')::uuid = $1
                       )
                     ORDER BY created_at ASC
                     LIMIT 50",
                    &[&sid],
                )
                .await
        }
        (Some(sid), QueueSelectMode::InboundMaster) => {
            if let Some(tn) = terminal_name.filter(|t| !t.trim().is_empty()) {
                source
                    .query(
                        "SELECT id, table_name, record_id, action, data
                         FROM sync_queue
                         WHERE status = 'pending' AND retry_count < 10
                           AND target_store_id = $1
                           AND (
                             terminal_name IS NULL
                             OR btrim(terminal_name) = ''
                             OR terminal_name = $2
                           )
                         ORDER BY created_at ASC
                         LIMIT 50",
                        &[&sid, &tn],
                    )
                    .await
            } else {
                source
                    .query(
                        "SELECT id, table_name, record_id, action, data
                         FROM sync_queue
                         WHERE status = 'pending' AND retry_count < 10
                           AND target_store_id = $1
                         ORDER BY created_at ASC
                         LIMIT 50",
                        &[&sid],
                    )
                    .await
            }
        }
        (None, QueueSelectMode::InboundMaster) => Ok(vec![]),
        (None, QueueSelectMode::BranchOutbound) => {
            source
                .query(
                    "SELECT id, table_name, record_id, action, data
                     FROM sync_queue
                     WHERE status = 'pending' AND retry_count < 10
                     ORDER BY created_at ASC
                     LIMIT 50",
                    &[],
                )
                .await
        }
    }
}

async fn sync_one_direction(
    source: &tokio_postgres::Client,
    target: &tokio_postgres::Client,
    store_id: Option<&str>,
    select_mode: QueueSelectMode,
    terminal_name: Option<&str>,
) -> Result<SyncApplyTotals, String> {
    let mut totals = SyncApplyTotals::default();
    let store_uuid = store_id
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| uuid::Uuid::parse_str(s).ok());

    for _round in 0..100 {
        let rows = fetch_pending_batch(source, store_uuid, terminal_name, select_mode)
            .await
            .map_err(|e| format_pg_error(e))?;

        if rows.is_empty() {
            break;
        }

        for row in rows {
            let id: uuid::Uuid = row.get("id");
            let table_name: String = row.get("table_name");
            let record_id: uuid::Uuid = row.get("record_id");
            let action: String = row.get("action");
            let data: Option<serde_json::Value> = row.get("data");

            let apply = target
                .query_one(
                    "SELECT public.apply_sync_queue_item($1, $2, $3, $4::jsonb)",
                    &[&table_name, &action, &record_id, &data],
                )
                .await;

            match apply {
                Ok(row) => {
                    let outcome: String = row.get(0);
                    totals.record_apply(&outcome);
                    let _ = source
                        .execute(
                            "UPDATE sync_queue SET status = 'completed', synced_at = NOW(), error_message = NULL WHERE id = $1",
                            &[&id],
                        )
                        .await;
                    crate::logger::log_sync_success(&record_id.to_string(), &action);
                }
                Err(e) => {
                    let error_msg = format_pg_error(e);
                    let _ = source
                        .execute(
                            "UPDATE sync_queue SET retry_count = retry_count + 1, error_message = $2 WHERE id = $1",
                            &[&id, &error_msg],
                        )
                        .await;
                    totals.failed += 1;
                    crate::logger::log_sync_error(&record_id.to_string(), &action, &error_msg);
                }
            }
        }
    }

    Ok(totals)
}

fn normalize_rest_base(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn parse_unknown_postgrest_column(body: &str) -> Option<String> {
    let needle = "Could not find the '";
    let start = body.find(needle)? + needle.len();
    let end = body[start..].find('\'')? + start;
    Some(body[start..end].to_string())
}

async fn postgrest_upsert_json(
    http: &reqwest::Client,
    url: &str,
    table: &str,
    mut data: serde_json::Value,
) -> Result<(), String> {
    let Some(obj) = data.as_object_mut() else {
        return Ok(());
    };

    for _ in 0..16 {
        let res = http
            .post(url)
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("Accept-Profile", "public")
            .header("Content-Profile", "public")
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .json(&serde_json::Value::Object(obj.clone()))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if res.status().is_success() {
            return Ok(());
        }

        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        if status == reqwest::StatusCode::BAD_REQUEST {
            if let Some(col) = parse_unknown_postgrest_column(&body) {
                if obj.remove(&col).is_some() {
                    continue;
                }
            }
        }
        return Err(format!("PostgREST UPSERT {}: {} {}", table, status, body));
    }

    Err(format!(
        "PostgREST UPSERT {}: uzak şemada çok sayıda bilinmeyen kolon",
        table
    ))
}

async fn postgrest_apply_item(
    http: &reqwest::Client,
    base: &str,
    table: &str,
    action: &str,
    record_id: &uuid::Uuid,
    data: &Option<serde_json::Value>,
) -> Result<(), String> {
    let base = normalize_rest_base(base);
    if action.eq_ignore_ascii_case("DELETE") {
        let url = format!("{}/{}?id=eq.{}", base, table, record_id);
        let res = http
            .delete(&url)
            .header("Accept", "application/json")
            .header("Accept-Profile", "public")
            .header("Content-Profile", "public")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() && res.status() != reqwest::StatusCode::NOT_FOUND {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(format!("PostgREST DELETE {}: {} {}", table, status, body));
        }
        return Ok(());
    }
    if let Some(d) = data {
        let url = format!("{}/{}", base, table);
        postgrest_upsert_json(http, &url, table, d.clone()).await?;
    }
    Ok(())
}

async fn postgrest_mark_failed(
    http: &reqwest::Client,
    base: &str,
    id: &uuid::Uuid,
    error: &str,
) -> Result<(), String> {
    let base = normalize_rest_base(base);
    let get_url = format!("{}/sync_queue?id=eq.{}&select=retry_count", base, id);
    let mut retry = 0i32;
    if let Ok(get_res) = http
        .get(&get_url)
        .header("Accept", "application/json")
        .header("Accept-Profile", "public")
        .send()
        .await
    {
        if get_res.status().is_success() {
            if let Ok(rows) = get_res.json::<Vec<serde_json::Value>>().await {
                if let Some(n) = rows.first().and_then(|r| r.get("retry_count")).and_then(|v| v.as_i64()) {
                    retry = n as i32 + 1;
                }
            }
        }
    }
    let patch_url = format!("{}/sync_queue?id=eq.{}", base, id);
    let msg = if error.len() > 2000 { &error[..2000] } else { error };
    let body = serde_json::json!({
        "retry_count": retry,
        "error_message": msg
    });
    let res = http
        .patch(&patch_url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("Accept-Profile", "public")
        .header("Content-Profile", "public")
        .header("Prefer", "return=minimal")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let status = res.status();
        let t = res.text().await.unwrap_or_default();
        return Err(format!("PostgREST sync_queue PATCH failed: {} {}", status, t));
    }
    Ok(())
}

async fn postgrest_mark_completed(http: &reqwest::Client, base: &str, id: &uuid::Uuid) -> Result<(), String> {
    let base = normalize_rest_base(base);
    let url = format!("{}/sync_queue?id=eq.{}", base, id);
    let body = serde_json::json!({
        "status": "completed",
        "synced_at": chrono::Utc::now().to_rfc3339(),
        "error_message": serde_json::Value::Null
    });
    let res = http
        .patch(&url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("Accept-Profile", "public")
        .header("Content-Profile", "public")
        .header("Prefer", "return=minimal")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let status = res.status();
        let t = res.text().await.unwrap_or_default();
        return Err(format!("PostgREST sync_queue PATCH: {} {}", status, t));
    }
    Ok(())
}

async fn sync_pg_to_postgrest(
    source: &tokio_postgres::Client,
    http: &reqwest::Client,
    rest_base: &str,
    store_id: Option<&str>,
) -> Result<(i32, i32), String> {
    let mut total_synced = 0i32;
    let mut total_failed = 0i32;
    let store_uuid = store_id
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| uuid::Uuid::parse_str(s).ok());

    for _round in 0..100 {
        let rows = fetch_pending_batch(source, store_uuid, None, QueueSelectMode::BranchOutbound)
            .await
            .map_err(|e| format_pg_error(e))?;

        if rows.is_empty() {
            break;
        }

        for row in rows {
            let id: uuid::Uuid = row.get("id");
            let table_name: String = row.get("table_name");
            let record_id: uuid::Uuid = row.get("record_id");
            let action: String = row.get("action");
            let data: Option<serde_json::Value> = row.get("data");

            match postgrest_apply_item(http, rest_base, &table_name, &action, &record_id, &data).await {
                Ok(_) => {
                    let _ = source
                        .execute(
                            "UPDATE sync_queue SET status = 'completed', synced_at = NOW(), error_message = NULL WHERE id = $1",
                            &[&id],
                        )
                        .await;
                    total_synced += 1;
                }
                Err(e) => {
                    let _ = source
                        .execute(
                            "UPDATE sync_queue SET retry_count = retry_count + 1, error_message = $2 WHERE id = $1",
                            &[&id, &e],
                        )
                        .await;
                    total_failed += 1;
                }
            }
        }
    }

    Ok((total_synced, total_failed))
}

fn terminal_opt(config: &crate::config::AppConfig) -> Option<String> {
    let t = config.terminal_name.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_string())
    }
}

fn hybrid_sync_mutex() -> &'static tokio::sync::Mutex<()> {
    static M: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    M.get_or_init(|| tokio::sync::Mutex::new(()))
}

async fn try_acquire_hybrid_sync() -> Option<tokio::sync::MutexGuard<'static, ()>> {
    hybrid_sync_mutex().try_lock().ok()
}

fn is_pos_role(role: &str) -> bool {
    matches!(
        role.trim().to_lowercase().as_str(),
        "pos" | "terminal" | "kasa" | "mpos" | "cashier"
    )
}

fn is_kasa_terminal(config: &crate::config::AppConfig) -> bool {
    if is_pos_role(&config.role) {
        return true;
    }
    terminal_opt(config).is_some()
}

fn store_id_for_inbound(config: &crate::config::AppConfig) -> Option<&str> {
    let sid = config.store_id.trim();
    if sid.is_empty() {
        None
    } else {
        Some(sid)
    }
}

fn should_run_inbound_master(config: &crate::config::AppConfig) -> bool {
    let direction = config.hybrid_sync_direction.to_lowercase();
    let kasa = is_kasa_terminal(config);
    if kasa && config.store_id.trim().is_empty() {
        eprintln!("⚠️ Kasa inbound atlandı: store_id yapılandırılmamış (terminal={})", config.terminal_name);
        return false;
    }
    direction == "remote_to_local" || direction == "bidirectional" || kasa
}

fn pct_encode_component(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn build_inbound_postgrest_query(
    base: &str,
    store_id: Option<&str>,
    terminal_name: Option<&str>,
    limit: usize,
) -> String {
    let base = normalize_rest_base(base);
    if let Some(sid) = store_id.filter(|s| !s.trim().is_empty()) {
        if let Ok(u) = uuid::Uuid::parse_str(sid) {
            if let Some(tn) = terminal_name.filter(|t| !t.trim().is_empty()) {
                let enc = pct_encode_component(tn);
                return format!(
                    "{}/sync_queue?status=eq.pending&retry_count=lt.10&target_store_id=eq.{}&or=(terminal_name.is.null,terminal_name.eq.,terminal_name.eq.{})&order=created_at.asc&limit={}&select=id",
                    base, u, enc, limit
                );
            }
            return format!(
                "{}/sync_queue?status=eq.pending&retry_count=lt.10&target_store_id=eq.{}&order=created_at.asc&limit={}&select=id",
                base, u, limit
            );
        }
    }
    format!(
        "{}/sync_queue?status=eq.pending&retry_count=lt.10&order=created_at.asc&limit={}&select=id",
        base, limit
    )
}

async fn count_inbound_pending_postgrest(
    http: &reqwest::Client,
    rest_base: &str,
    store_id: Option<&str>,
    terminal_name: Option<&str>,
) -> Result<i64, String> {
    let count_url = build_inbound_postgrest_query(rest_base, store_id, terminal_name, 1);
    let res = http
        .get(&count_url)
        .header("Accept", "application/json")
        .header("Accept-Profile", "public")
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let status = res.status();
        let t = res.text().await.unwrap_or_default();
        return Err(format!("PostgREST sync_queue COUNT: {} {}", status, t));
    }
    let range = res.headers().get("content-range").and_then(|v| v.to_str().ok()).unwrap_or("");
    if let Some(total) = range.split('/').nth(1).and_then(|t| t.parse::<i64>().ok()) {
        return Ok(total);
    }
    let items: Vec<serde_json::Value> = res.json().await.unwrap_or_default();
    Ok(items.len() as i64)
}

async fn sync_postgrest_to_pg(
    http: &reqwest::Client,
    rest_base: &str,
    target: &tokio_postgres::Client,
    store_id: Option<&str>,
    inbound_master: bool,
    terminal_name: Option<&str>,
) -> Result<SyncApplyTotals, String> {
    let mut totals = SyncApplyTotals::default();
    let base = normalize_rest_base(rest_base);
    let query = if inbound_master {
        build_inbound_postgrest_query(&base, store_id, terminal_name, 50).replace(
            "select=id",
            "select=id,table_name,record_id,action,data",
        )
    } else if let Some(sid) = store_id.filter(|s| !s.trim().is_empty()) {
        if let Ok(u) = uuid::Uuid::parse_str(sid) {
            format!(
                "{}/sync_queue?status=eq.pending&retry_count=lt.10&or=(source_store_id.eq.{},target_store_id.eq.{})&order=created_at.asc&limit=50&select=id,table_name,record_id,action,data",
                base, u, u
            )
        } else {
            format!(
                "{}/sync_queue?status=eq.pending&retry_count=lt.10&order=created_at.asc&limit=50&select=id,table_name,record_id,action,data",
                base
            )
        }
    } else {
        format!(
            "{}/sync_queue?status=eq.pending&retry_count=lt.10&order=created_at.asc&limit=50&select=id,table_name,record_id,action,data",
            base
        )
    };

    for _round in 0..100 {
        let res = http
            .get(&query)
            .header("Accept", "application/json")
            .header("Accept-Profile", "public")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            let status = res.status();
            let t = res.text().await.unwrap_or_default();
            return Err(format!("PostgREST sync_queue GET: {} {}", status, t));
        }
        let items: Vec<serde_json::Value> = res.json().await.map_err(|e| e.to_string())?;
        if items.is_empty() {
            break;
        }

        for item in items {
            let id = item.get("id").and_then(|v| v.as_str()).and_then(|s| uuid::Uuid::parse_str(s).ok());
            let table_name = item.get("table_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let record_id = item
                .get("record_id")
                .and_then(|v| v.as_str())
                .and_then(|s| uuid::Uuid::parse_str(s).ok());
            let action = item.get("action").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let data = item.get("data").cloned();

            let (Some(id), Some(record_id)) = (id, record_id) else {
                continue;
            };

            let apply = target
                .query_one(
                    "SELECT public.apply_sync_queue_item($1, $2, $3, $4::jsonb)",
                    &[&table_name, &action, &record_id, &data],
                )
                .await;

            match apply {
                Ok(row) => {
                    let outcome: String = row.get(0);
                    totals.record_apply(&outcome);
                    let _ = postgrest_mark_completed(http, rest_base, &id).await;
                }
                Err(e) => {
                    totals.failed += 1;
                    let error_msg = format_pg_error(e);
                    eprintln!("postgrest→pg apply error: {}", error_msg);
                    let _ = postgrest_mark_failed(http, rest_base, &id, &error_msg).await;
                }
            }
        }
    }

    Ok(totals)
}

async fn process_sync_queue_rest_api(
    config: &crate::config::AppConfig,
    headless_log: bool,
) -> Result<SyncApplyTotals, String> {
    let rest_base = config.remote_rest_url.trim();
    if rest_base.is_empty() {
        return Ok(SyncApplyTotals::default());
    }

    let (local_host, local_port, local_db) = parse_pg_endpoint(&config.local_db);
    let local = connect_pg(
        &local_host,
        local_port,
        &config.pg_local_user,
        &config.pg_local_pass,
        &local_db,
    )
    .await?;

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let direction = config.hybrid_sync_direction.to_lowercase();
    let store_filter = store_id_for_inbound(config);
    let kasa = is_kasa_terminal(config);
    let term = terminal_opt(config);
    let term_ref = term.as_deref();
    let mut total = 0i32;

    let mut inbound_totals = SyncApplyTotals::default();

    if direction == "local_to_remote" || direction == "bidirectional" {
        let outbound_store = if config.store_id.trim().is_empty() {
            None
        } else {
            Some(config.store_id.as_str())
        };
        let (s, _) = sync_pg_to_postgrest(&local, &http, rest_base, outbound_store).await?;
        total += s;
    }
    if should_run_inbound_master(config) {
        inbound_totals = sync_postgrest_to_pg(
            &http,
            rest_base,
            &local,
            store_filter,
            true,
            term_ref,
        )
        .await?;
        total += inbound_totals.synced;
    }

    if headless_log && !is_app_ui_running() {
        log_service_inbound_sync(&local, config, &inbound_totals, inbound_totals.failed).await;
    }

    if total > 0 {
        println!(
            "✅ Hibrit PostgREST senkron: {} kayıt eşlendi ({}{}) → {}",
            total,
            direction,
            if kasa { " + kasa inbound" } else { "" },
            rest_base
        );
    }

    Ok(inbound_totals)
}

pub async fn process_sync_queue_internal(app: Option<tauri::AppHandle>) -> Result<(), String> {
    let _sync_guard = match try_acquire_hybrid_sync().await {
        Some(g) => g,
        None => {
            println!("⏭️ Hibrit senkron zaten çalışıyor, atlanıyor.");
            return Ok(());
        }
    };

    let config = crate::config::get_app_config_internal().map_err(|e| e.to_string())?;

    if !config.is_configured {
        return Ok(());
    }

    let db_mode = config.db_mode.to_lowercase();
    if db_mode != "hybrid" {
        return Ok(());
    }

    let mut inbound_totals = SyncApplyTotals::default();
    let headless_log = app.is_none();

    if config.connection_provider == "rest_api" {
        inbound_totals = process_sync_queue_rest_api(&config, headless_log).await?;
        emit_kasa_data_arrived(&app, &inbound_totals, inbound_totals.failed);
        return Ok(());
    }

    // Hibrit masaüstü: merkez uç yalnızca PostgREST (remote_rest_url).
    if !config.remote_rest_url.trim().is_empty() {
        inbound_totals = process_sync_queue_rest_api(&config, headless_log).await?;
        emit_kasa_data_arrived(&app, &inbound_totals, inbound_totals.failed);
        return Ok(());
    }

    eprintln!(
        "⚠️ Hibrit senkron atlandı: remote_rest_url boş — merkez API adresi zorunlu (doğrudan PG devre dışı)."
    );
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MposPullResult {
    pub synced: i32,
    pub failed: i32,
    pub inserted: i32,
    pub updated: i32,
    pub skipped: i32,
    pub pending_inbound: i64,
}

async fn count_inbound_pending_pg(
    source: &tokio_postgres::Client,
    store_id: Option<&str>,
    terminal_name: Option<&str>,
) -> Result<i64, String> {
    let store_uuid = store_id
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| uuid::Uuid::parse_str(s).ok());

    let rows = match (store_uuid, terminal_name.filter(|t| !t.trim().is_empty())) {
        (Some(sid), Some(tn)) => {
            source
                .query(
                    "SELECT COUNT(*)::bigint FROM sync_queue
                     WHERE status = 'pending' AND retry_count < 10
                       AND target_store_id = $1
                       AND (
                         terminal_name IS NULL
                         OR btrim(terminal_name) = ''
                         OR terminal_name = $2
                       )",
                    &[&sid, &tn],
                )
                .await
        }
        (Some(sid), None) => {
            source
                .query(
                    "SELECT COUNT(*)::bigint FROM sync_queue
                     WHERE status = 'pending' AND retry_count < 10
                       AND target_store_id = $1",
                    &[&sid],
                )
                .await
        }
        _ => {
            source
                .query(
                    "SELECT COUNT(*)::bigint FROM sync_queue
                     WHERE status = 'pending' AND retry_count < 10",
                    &[],
                )
                .await
        }
    }
    .map_err(|e| format_pg_error(e))?;

    Ok(rows.first().map(|r| r.get::<usize, i64>(0)).unwrap_or(0))
}

pub async fn mpos_pull_master_internal() -> Result<MposPullResult, String> {
    let _sync_guard = match try_acquire_hybrid_sync().await {
        Some(g) => g,
        None => {
            return Ok(MposPullResult {
                synced: 0,
                failed: 0,
                inserted: 0,
                updated: 0,
                skipped: 0,
                pending_inbound: 0,
            });
        }
    };

    let config = crate::config::get_app_config_internal().map_err(|e| e.to_string())?;

    if !config.is_configured || config.db_mode.to_lowercase() != "hybrid" {
        return Ok(MposPullResult {
            synced: 0,
            failed: 0,
            inserted: 0,
            updated: 0,
            skipped: 0,
            pending_inbound: 0,
        });
    }

    if is_kasa_terminal(&config) && config.store_id.trim().is_empty() {
        return Err("Kasa inbound için store_id zorunlu. Kurulum sihirbazında şube seçin.".to_string());
    }

    let store_filter = store_id_for_inbound(&config);
    let term = terminal_opt(&config);
    let term_ref = term.as_deref();

    let (local_host, local_port, local_db) = parse_pg_endpoint(&config.local_db);
    let local = connect_pg(
        &local_host,
        local_port,
        &config.pg_local_user,
        &config.pg_local_pass,
        &local_db,
    )
    .await?;

    let mut inbound = SyncApplyTotals::default();
    let pending_inbound: i64;

    let uses_postgrest =
        !config.remote_rest_url.trim().is_empty() || config.connection_provider == "rest_api";

    if uses_postgrest {
        let rest_base = config.remote_rest_url.trim();
        if rest_base.is_empty() {
            return Err("Merkez PostgREST URL yapılandırılmamış.".to_string());
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;
        inbound = sync_postgrest_to_pg(
            &http,
            rest_base,
            &local,
            store_filter,
            true,
            term_ref,
        )
        .await?;
        pending_inbound =
            count_inbound_pending_postgrest(&http, rest_base, store_filter, term_ref)
                .await
                .unwrap_or_else(|e| {
                    eprintln!("inbound pending count error: {}", e);
                    0
                });
    } else {
        return Err(
            "Merkez API (remote_rest_url) zorunlu — doğrudan uzak PostgreSQL devre dışı.".to_string(),
        );
    }

    Ok(MposPullResult {
        synced: inbound.synced,
        failed: inbound.failed,
        inserted: inbound.inserted,
        updated: inbound.updated,
        skipped: inbound.skipped,
        pending_inbound,
    })
}

#[tauri::command]
pub async fn mpos_pull_master_now(app: AppHandle) -> Result<MposPullResult, String> {
    let r = mpos_pull_master_internal().await?;
    let totals = SyncApplyTotals {
        synced: r.synced,
        failed: r.failed,
        inserted: r.inserted,
        updated: r.updated,
        skipped: r.skipped,
    };
    emit_kasa_data_arrived(&Some(app), &totals, r.failed);
    Ok(r)
}

#[allow(dead_code)]
async fn send_to_center_legacy(client: &reqwest::Client, api_url: &str, item: &SyncItem) -> Result<(), String> {
    let res = client
        .post(api_url)
        .json(&item)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("Server returned {}", res.status()))
    }
}
#[derive(Debug, Serialize, Deserialize)]
struct Heartbeat {
    #[serde(rename = "type")]
    msg_type: String, // "HEARTBEAT"
    terminal_id: String,
    role: String,
    store_id: String,
    firm_nr: String,
    virtual_ip: String,
    timestamp: String,
    version: String,
}

// Structure to hold the sender for outgoing WS messages
pub struct SyncSender(pub tokio::sync::mpsc::Sender<String>);

#[tauri::command]
pub async fn send_websocket_message(message: String, state: tauri::State<'_, SyncSender>) -> Result<(), String> {
    match state.0.send(message).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to send message: {}", e)),
    }
}

async fn start_websocket_listener(
    token: tokio_util::sync::CancellationToken, 
    app: Option<tauri::AppHandle>,
    mut rx: tokio::sync::mpsc::Receiver<String>,
    input_manager: Arc<RemoteInputManager>,
    screen_capture: Arc<ScreenCaptureService>,
    security_service: Arc<SecurityService>,
) {
    let config = match crate::config::get_app_config_internal() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to load config for WS: {}", e);
            return;
        }
    };

    // Skip if not configured or integration is skipped
    if !config.is_configured || config.skip_integration {
        println!("⏳ WebSocket waiting for configuration or skipped due to config...");
        sleep(Duration::from_secs(10)).await;
        return; 
    }

    if !crate::config::should_use_websocket_sync(&config) {
        println!("ℹ️ WebSocket devre dışı (hybrid_sync_transport=polling); yalnız periyodik senkron aktif.");
        loop {
            if token.is_cancelled() { break; }
            sleep(Duration::from_secs(60)).await;
            if let Ok(c) = crate::config::get_app_config_internal() {
                if crate::config::should_use_websocket_sync(&c) {
                    break;
                }
            }
        }
        if token.is_cancelled() { return; }
        if let Ok(c) = crate::config::get_app_config_internal() {
            if !crate::config::should_use_websocket_sync(&c) {
                return;
            }
        }
    }

    let url_str = crate::config::resolve_central_ws_url(&config);
    
    let url = match Url::parse(&url_str) {
        Ok(u) => u,
        Err(e) => {
            eprintln!("❌ Invalid WS URL: {}. Error: {}", url_str, e);
            return;
        }
    };
    println!("🔌 Connecting to WebSocket: {}", url);

    loop {
        if token.is_cancelled() { break; }

        match connect_async(url.clone()).await {
            Ok((ws_stream, _)) => {
                println!("✅ WebSocket Connected");
                let (mut write, mut read) = ws_stream.split();
                let mut heartbeat_interval = tokio::time::interval(Duration::from_secs(30));

                loop {
                    tokio::select! {
                        // 1. Incoming Messages from Server
                        msg = read.next() => {
                            match msg {
                                Some(Ok(Message::Text(text))) => {
                                    // Try to parse as generic message to route
                                    if let Ok(parsed) = serde_json::from_str::<WrappedWsMessage>(&text) {
                                        match parsed.msg_type.as_str() {
                                            "REMOTE_INPUT" => {
                                                if let Some(payload) = parsed.payload {
                                                    if let Ok(event) = serde_json::from_value(payload) {
                                                        input_manager.handle_event(event);
                                                    }
                                                }
                                            },
                                            "START_STREAM" => {
                                                println!("🎥 Creating Stream...");
                                                screen_capture.set_running(true);
                                            },
                                            "STOP_STREAM" => {
                                                println!("🛑 Stopping Stream...");
                                                screen_capture.set_running(false);
                                            },
                                            "EXECUTE_SQL" => {
                                                if let Some(payload) = parsed.payload {
                                                    if let Some(sql) = payload.get("sql").and_then(|v| v.as_str()) {
                                                        println!("🛠️ Executing Remote SQL...");
                                                        match RemoteMaintenanceService::execute_sql(sql.to_string()).await {
                                                            Ok(res) => println!("✅ SQL Success: {}", res),
                                                            Err(e) => eprintln!("❌ SQL Failed: {}", e),
                                                        }
                                                    }
                                                }
                                            },
                                            "UPDATE_APP" => {
                                                if let Some(payload) = parsed.payload {
                                                    let url = payload.get("url").and_then(|v| v.as_str());
                                                    let version = payload.get("version").and_then(|v| v.as_str());
                                                    
                                                    if let (Some(u), Some(v)) = (url, version) {
                                                        println!("🔄 Starting Update to v{}...", v);
                                                        match RemoteMaintenanceService::update_app(u.to_string(), v.to_string()).await {
                                                            Ok(res) => println!("✅ Update Started: {}", res),
                                                            Err(e) => eprintln!("❌ Update Failed: {}", e),
                                                        }
                                                    }
                                                }
                                            },
                                            "BLOCK_SITES" => {
                                                if let Some(payload) = parsed.payload {
                                                    if let Some(sites) = payload.get("sites").and_then(|v| v.as_array()) {
                                                        let site_list: Vec<String> = sites.iter()
                                                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                                            .collect();
                                                        println!("🛡️ Blocking Sites: {:?}", site_list);
                                                        security_service.set_blocked_sites(site_list);
                                                    }
                                                }
                                            },
                                            "BLOCK_APPS" => {
                                                if let Some(payload) = parsed.payload {
                                                    if let Some(apps) = payload.get("apps").and_then(|v| v.as_array()) {
                                                        let app_list: Vec<String> = apps.iter()
                                                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                                            .collect();
                                                        println!("🛡️ Blocking Apps: {:?}", app_list);
                                                        security_service.set_blocked_apps(app_list);
                                                    }
                                                }
                                            },
                                            "RTC_OFFER" | "RTC_ANSWER" | "RTC_CANDIDATE" => {
                                                if let Some(h) = &app {
                                                    let _ = h.emit("p2p-signal", &text);
                                                }
                                            },
                                            "UPDATE_PEERS" => {
                                                // Eski merkez mesajları: artık yerel mesh/VPN yok; yoksay.
                                            },
                                            "SYNC_QUEUE_PULL" | "MPOS_SYNC_PULL" => {
                                                println!("📥 Merkez anlık senkron tetikledi (WS)...");
                                                let ws_app = app.clone();
                                                tauri::async_runtime::spawn(async move {
                                                    if let Err(e) = process_sync_queue_internal(ws_app).await {
                                                        eprintln!("WS sync queue error: {}", e);
                                                    }
                                                });
                                            },
                                            _ => {}
                                        }
                                    } else {
                                        // Fallback for raw signaling messages if any
                                        if text.contains("RTC_") {
                                             if let Some(h) = &app {
                                                 let _ = h.emit("p2p-signal", &text);
                                             }
                                        }
                                    }
                                },
                                Some(Ok(Message::Close(_))) => {
                                    println!("🔌 WS Closed");
                                    screen_capture.set_running(false);
                                    break;
                                },
                                Some(Err(e)) => {
                                    eprintln!("❌ WS Error: {}", e);
                                    screen_capture.set_running(false);
                                    break;
                                },
                                None => break, 
                                _ => {}
                            }
                        }
                        // 2. Outgoing Messages from App (P2P Signals, Replies)
                        Some(out_msg) = rx.recv() => {
                            if let Err(e) = write.send(Message::Text(out_msg)).await {
                                eprintln!("❌ Failed to send outgoing message: {}", e);
                                break;
                            }
                        }
                        // 3. Periodic Heartbeat
                        _ = heartbeat_interval.tick() => {
                            let v_ip = if config.device_id.trim().is_empty() {
                                if config.terminal_name.trim().is_empty() {
                                    "local".to_string()
                                } else {
                                    config.terminal_name.clone()
                                }
                            } else {
                                config.device_id.clone()
                            };

                            let hb = Heartbeat {
                                msg_type: "HEARTBEAT".to_string(),
                                terminal_id: config.terminal_name.clone(),
                                role: config.role.clone(),
                                store_id: config.store_id.clone(),
                                firm_nr: config.erp_firm_nr.clone(),
                                virtual_ip: v_ip,
                                timestamp: chrono::Utc::now().to_rfc3339(),
                                version: env!("CARGO_PKG_VERSION").to_string(),
                            };
                             
                            if let Ok(json) = serde_json::to_string(&hb) {
                                if let Err(e) = write.send(Message::Text(json)).await {
                                    eprintln!("❌ Failed to send heartbeat: {}", e);
                                    break; // Reconnect
                                }
                            }
                        }
                        _ = token.cancelled() => {
                            return;
                        }
                    }
                }
            },
            Err(e) => {
                eprintln!("⚠️ WS Connect Error: {}. Retrying in 5s...", e);
                sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

#[tauri::command]
pub async fn enable_remote_support(_app: tauri::AppHandle) -> Result<String, String> {
    println!("🔧 Uzaktan destek: WebSocket merkez URL üzerinden kullanılır (VPN kaldırıldı).");
    Ok("Uzak destek için merkez WebSocket URL\'sini (central_ws_url) yapılandırın.".to_string())
}

#[tauri::command]
pub async fn announce_node(_app: tauri::AppHandle) -> Result<(), String> {
    println!("Announcing node to network...");
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncInfo {
    pub last_sync: Option<String>,
    pub pending_count: i64,
    pub status: String,
}

#[tauri::command]
pub async fn get_last_sync_info(app: tauri::AppHandle) -> Result<SyncInfo, String> {
    use crate::config::get_app_config;
    
    // 1. Get Config
    let config = get_app_config(app.clone()).map_err(|e| e.to_string())?;
    
    // 2. Connect to DB
    let host_part = config.local_db.split(':').next().unwrap_or("127.0.0.1");
    let db_name = config.local_db.split('/').last().unwrap_or("retailex_local");

    let mut pg_config = tokio_postgres::Config::new();
    pg_config.host(host_part)
             .user(&config.pg_local_user)
             .password(&config.pg_local_pass)
             .dbname(db_name)
             .connect_timeout(Duration::from_secs(5));

    let (client, connection) = pg_config.connect(NoTls).await.map_err(|e| format_pg_error(e))?;
    
    tauri::async_runtime::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    // 3. Get pending count
    let rows = client.query("SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'", &[]).await.map_err(|e| format_pg_error(e))?;
    let pending_count: i64 = rows.first().map(|r| r.get::<usize, i64>(0)).unwrap_or(0);

    // 4. Get last success
    let rows_last = client.query("SELECT synced_at FROM sync_queue WHERE status = 'completed' ORDER BY synced_at DESC LIMIT 1", &[]).await.map_err(|e| format_pg_error(e))?;
    
    let last_sync = if let Some(row) = rows_last.first() {
        let ts: Option<chrono::DateTime<chrono::Utc>> = row.get::<usize, Option<chrono::DateTime<chrono::Utc>>>(0);
        ts.map(|t: chrono::DateTime<chrono::Utc>| t.to_rfc3339())
    } else {
        None
    };

    Ok(SyncInfo {
        last_sync,
        pending_count,
        status: if pending_count > 0 { "uploading".to_string() } else { "idle".to_string() }
    })
}
