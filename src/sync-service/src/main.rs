use anyhow::Result;
use axum::{
    extract::{ws::{WebSocket, WebSocketUpgrade}, State, Path},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::{info, warn, error};
use std::collections::HashMap;
use uuid::Uuid;

mod models;
mod db;
mod websocket;
mod broadcast;

use models::*;
use db::Database;
use websocket::WebSocketManager;
use broadcast::BroadcastEngine;

// ============================================
// APPLICATION STATE
// ============================================

#[derive(Clone)]
pub struct AppState {
    db: Arc<Database>,
    ws_manager: Arc<RwLock<WebSocketManager>>,
    broadcast_engine: Arc<BroadcastEngine>,
}

// ============================================
// MAIN
// ============================================

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("retailex_sync_service=debug,tower_http=debug")
        .init();

    info!("🚀 RetailEX Sync Service v2.0 Starting...");

    // Load environment variables
    dotenv::dotenv().ok();
    
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost/exretail".to_string());

    // Initialize database
    info!("📊 Connecting to database...");
    let db = Arc::new(Database::new(&database_url).await?);
    info!("✅ Database connected");

    // Initialize WebSocket manager
    let ws_manager = Arc::new(RwLock::new(WebSocketManager::new()));

    // Initialize broadcast engine
    let broadcast_engine = Arc::new(BroadcastEngine::new(
        db.clone(),
        ws_manager.clone(),
    ));

    let state = AppState {
        db,
        ws_manager,
        broadcast_engine: broadcast_engine.clone(),
    };

    // Start broadcast workers
    let broadcast_clone = broadcast_engine.clone();
    tokio::spawn(async move {
        info!("📡 Starting broadcast queue worker...");
        broadcast_clone.run_worker().await;
    });

    let listener_clone = broadcast_engine.clone();
    tokio::spawn(async move {
        info!("📢 Starting exchange rate listener worker...");
        listener_clone.run_listener().await;
    });

    // Start Heartbeat Worker
    let db_heartbeat = state.db.clone();
    let ws_manager_heartbeat = state.ws_manager.clone();
    tokio::spawn(async move {
        info!("❤️ Starting heartbeat worker...");
        loop {
            let online_count = {
                let manager = ws_manager_heartbeat.read().await;
                manager.online_stores_count()
            };
            
            let metadata = serde_json::json!({
                "online_stores": online_count,
                "uptime_seconds": 0, // Could add actual uptime later
                "active_connections": online_count
            });

            if let Err(e) = db_heartbeat.upsert_heartbeat(
                "RetailEX-Sync-Service",
                "ONLINE",
                "2.0.0",
                metadata
            ).await {
                error!("❌ Heartbeat failed: {}", e);
            }
            
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
        }
    });

    // Build router
    let app = Router::new()
        // Health check
        .route("/health", get(health_check))
        
        // WebSocket endpoint
        .route("/ws/:store_id", get(websocket_handler))
        
        // REST API
        .route("/api/broadcasts", post(create_broadcast))
        .route("/api/broadcasts/:id", get(get_broadcast))
        .route("/api/broadcasts/pull", post(pull_data))
        .route("/api/devices", get(list_devices))
        .route("/api/devices/register", post(register_device))
        
        // CORS
        .layer(CorsLayer::permissive())
        
        // State
        .with_state(state);

    // Start server
    let addr = std::env::var("BIND_ADDRESS")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_string());
    
    info!("🌐 Server listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// ============================================
// HANDLERS
// ============================================

async fn health_check(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let online_count = {
        let manager = state.ws_manager.read().await;
        manager.online_stores_count()
    };

    Json(serde_json::json!({
        "status": "ONLINE",
        "version": "2.0.0",
        "connections": online_count,
        "timestamp": chrono::Utc::now()
    }))
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    Path(store_id): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    info!("🔌 WebSocket connection request from store: {}", store_id);
    
    ws.on_upgrade(move |socket| websocket::handle_connection(socket, store_id, state))
}

#[derive(Deserialize)]
struct CreateBroadcastRequest {
    message_type: String,
    action: String,
    priority: String,
    target_stores: Option<Vec<Uuid>>,
    payload: serde_json::Value,
}

async fn create_broadcast(
    State(state): State<AppState>,
    Json(req): Json<CreateBroadcastRequest>,
) -> Json<serde_json::Value> {
    info!("📨 Creating broadcast: {} - {}", req.message_type, req.action);
    
    match state.db.create_broadcast(
        &req.message_type,
        &req.action,
        &req.priority,
        req.target_stores.as_deref(),
        &req.payload,
    ).await {
        Ok(broadcast_id) => {
            info!("✅ Broadcast created: {}", broadcast_id);
            Json(serde_json::json!({
                "success": true,
                "broadcast_id": broadcast_id,
                "message": "Broadcast created and queued"
            }))
        }
        Err(e) => {
            error!("❌ Failed to create broadcast: {}", e);
            Json(serde_json::json!({
                "success": false,
                "error": e.to_string()
            }))
        }
    }
}

async fn get_broadcast(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Json<serde_json::Value> {
    match state.db.get_broadcast_status(&id).await {
        Ok(broadcast) => Json(serde_json::json!({
            "success": true,
            "broadcast": broadcast
        })),
        Err(e) => Json(serde_json::json!({
            "success": false,
            "error": e.to_string()
        }))
    }
}

#[derive(Deserialize)]
struct PullRequest {
    message_type: String,
    target_stores: Option<Vec<Uuid>>,
    since: Option<chrono::DateTime<chrono::Utc>>,
}

async fn pull_data(
    State(state): State<AppState>,
    Json(req): Json<PullRequest>,
) -> Json<serde_json::Value> {
    info!("⬇️ Pull request: {}", req.message_type);
    
    let payload = serde_json::json!({
        "pull_since": req.since,
        "include_items": true
    });
    
    match state.db.create_broadcast(
        &req.message_type,
        "pull",
        "high",
        req.target_stores.as_deref(),
        &payload,
    ).await {
        Ok(broadcast_id) => {
            Json(serde_json::json!({
                "success": true,
                "broadcast_id": broadcast_id,
                "message": "Pull request queued"
            }))
        }
        Err(e) => {
            Json(serde_json::json!({
                "success": false,
                "error": e.to_string()
            }))
        }
    }
}

async fn list_devices(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    match state.db.get_devices().await {
        Ok(devices) => Json(serde_json::json!({
            "success": true,
            "devices": devices
        })),
        Err(e) => Json(serde_json::json!({
            "success": false,
            "error": e.to_string()
        }))
    }
}

#[derive(Deserialize)]
struct RegisterDeviceRequest {
    store_id: Uuid,
    device_id: String,
    device_name: String,
    app_version: String,
}

async fn register_device(
    State(state): State<AppState>,
    Json(req): Json<RegisterDeviceRequest>,
) -> Json<serde_json::Value> {
    info!("📱 Registering device: {} for store: {}", req.device_id, req.store_id);
    
    match state.db.register_device(
        &req.store_id,
        &req.device_id,
        &req.device_name,
        &req.app_version,
    ).await {
        Ok(_) => Json(serde_json::json!({
            "success": true,
            "message": "Device registered"
        })),
        Err(e) => Json(serde_json::json!({
            "success": false,
            "error": e.to_string()
        }))
    }
}
