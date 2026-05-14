use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use serde::{Serialize, Deserialize};
use tokio_postgres::NoTls;
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use url::Url;
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

        // 1. Data Sync Loop (Push to Center)
        let sync_token = token.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                if sync_token.is_cancelled() { break; }

                if let Err(e) = process_sync_queue_internal().await {
                   eprintln!("Sync Queue Error: {}", e);
                }
                sleep(Duration::from_secs(5)).await; // Poll every 5s
            }
        });

        // 2. Real-Time Listener (WebSocket)
        let ws_token = token.clone();
        let ws_handle = app_handle.clone();
        let input_mgr = self.input_manager.clone();
        let screen_cap = self.screen_capture.clone();
        let security_svc = self.security_service.clone();
        
        tauri::async_runtime::spawn(async move {
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
    process_sync_queue_internal().await
}

pub async fn process_sync_queue_internal() -> Result<(), String> {
    // 1. Fetch Config
    let config = crate::config::get_app_config_internal().map_err(|e| e.to_string())?;
    
    // Skip if not configured or integration is skipped
    if !config.is_configured || config.skip_integration { return Ok(()); }
    
    let api_url = if config.central_api_url.is_empty() || config.central_api_url == "https://api.retailex.app/sync" { 
        "http://localhost:8000/api/v1/sync".to_string() 
    } else { 
        config.central_api_url.clone() 
    };

    if api_url.contains("10.8.0.") {
        eprintln!("⚠️ WARNING: API URL Mesh aralığına (10.8.0.x) işaret ediyor; bağlantı başarısız olabilir.");
    }

    // 2. Connect to Local DB - Use Configured Credentials
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

    // 3. Fetch PENDING items
    let rows = client.query(
        "SELECT id::text, table_name, record_id::text, action, firm_nr, data, status, retry_count 
         FROM sync_queue 
         WHERE status = 'pending' AND retry_count < 10 
         ORDER BY created_at ASC LIMIT 50", 
        &[]
    ).await.map_err(|e| format_pg_error(e))?;

    if rows.is_empty() {
        return Ok(());
    }

    // 4. Process Batch
    let client_http = reqwest::Client::new();

    for row in rows {
        let item = SyncItem {
            id: row.get("id"),
            table_name: row.get("table_name"),
            record_id: row.get("record_id"),
            action: row.get("action"),
            firm_nr: row.get("firm_nr"),
            data: row.get("data"),
            status: row.get("status"),
            retry_count: row.get("retry_count"),
        };

        match send_to_center(&client_http, &api_url, &item).await {
            Ok(_) => {
                if let Ok(id_uuid) = uuid::Uuid::parse_str(&item.id) {
                    let _ = client.execute(
                        "UPDATE sync_queue SET status = 'completed', synced_at = NOW() WHERE id = $1",
                        &[&id_uuid]
                    ).await;
                }
                
                crate::logger::log_sync_success(&item.record_id.clone().unwrap_or_default(), &item.action);
            },
            Err(e) => {
                let error_msg = e.to_string();
                if let Ok(id_uuid) = uuid::Uuid::parse_str(&item.id) {
                    let _ = client.execute(
                        "UPDATE sync_queue SET retry_count = retry_count + 1, error_message = $2 WHERE id = $1",
                        &[&id_uuid as &(dyn tokio_postgres::types::ToSql + Sync), &error_msg as &(dyn tokio_postgres::types::ToSql + Sync)]
                    ).await;
                }

                crate::logger::log_sync_error(&item.record_id.clone().unwrap_or_default(), &item.action, &error_msg);
            }
        }
    }

    Ok(())
}

async fn send_to_center(client: &reqwest::Client, api_url: &str, item: &SyncItem) -> Result<(), String> {
    // Real HTTP POST
    let res = client.post(api_url)
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
        // Wait a bit longer before checking again if not configured
        sleep(Duration::from_secs(10)).await;
        return; 
    }

    let url_str = if config.central_ws_url.is_empty() || config.central_ws_url == "wss://api.retailex.app/ws" { 
        "ws://localhost:8000/api/v1/ws".to_string() 
    } else { 
        config.central_ws_url.clone() 
    };
    
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
                                version: "0.1.11".to_string(),
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
