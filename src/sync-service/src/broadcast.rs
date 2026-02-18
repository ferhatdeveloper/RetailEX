use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::{info, error};
use axum::extract::ws::Message;

use crate::db::Database;
use crate::websocket::WebSocketManager;
use crate::models::WebSocketMessage;

pub struct BroadcastEngine {
    db: Arc<Database>,
    ws_manager: Arc<RwLock<WebSocketManager>>,
}

impl BroadcastEngine {
    pub fn new(db: Arc<Database>, ws_manager: Arc<RwLock<WebSocketManager>>) -> Self {
        Self { db, ws_manager }
    }
    
    pub async fn run_worker(&self) {
        info!("🚀 Broadcast worker started");
        
        loop {
            if let Err(e) = self.process_queue().await {
                error!("Error processing queue: {}", e);
            }
            
            // Check every 5 seconds
            sleep(Duration::from_secs(5)).await;
        }
    }
    
    async fn process_queue(&self) -> anyhow::Result<()> {
        // Get all stores
        let devices = self.db.get_devices().await?;
        
        for device in devices {
            // Only process online stores
            let manager = self.ws_manager.read().await;
            if !manager.is_store_online(&device.device_id) {
                continue;
            }
            drop(manager);
            
            // Get pending messages for this store
            let messages = self.db.get_pending_messages(&device.store_id, 10).await?;
            
            if messages.is_empty() {
                continue;
            }
            
            info!("📨 Processing {} messages for store: {}", messages.len(), device.device_id);
            
            for msg in messages {
                // Get broadcast details
                let broadcast = self.db.get_broadcast_status(&msg.broadcast_id).await?;
                
                // Create WebSocket message
                let ws_msg = WebSocketMessage::Broadcast {
                    message_id: msg.id.to_string(),
                    message_type: broadcast.message_type.clone(),
                    action: broadcast.action.clone(),
                    payload: msg.payload.clone(),
                };
                
                let text = serde_json::to_string(&ws_msg)?;
                
                // Send via WebSocket
                let manager = self.ws_manager.read().await;
                let sent = manager.send_to_store(&device.device_id, Message::Text(text)).await;
                drop(manager);
                
                if sent {
                    info!("✅ Message sent: {} to store: {}", msg.id, device.device_id);
                    
                    // Update status to 'sent'
                    // Note: Will be marked as 'delivered' when store acknowledges
                    sqlx::query!(
                        "UPDATE sync_queue SET status = 'processing', updated_at = NOW() WHERE id = $1",
                        msg.id
                    )
                    .execute(&self.db.pool)
                    .await?;
                } else {
                    error!("❌ Failed to send message: {} to store: {}", msg.id, device.device_id);
                }
            }
        }
        
        Ok(())
    }

    pub async fn run_listener(&self) {
        info!("📢 Exchange rate listener started");
        
        use sqlx::postgres::PgListener;
        let mut listener = PgListener::connect_with(&self.db.pool).await.expect("Failed to connect PgListener");
        listener.listen("exchange_rate_update").await.expect("Failed to listen to exchange_rate_update");

        loop {
            while let Ok(notification) = listener.recv().await {
                info!("🔔 Received exchange rate update notification");
                
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(notification.payload()) {
                    let ws_msg = WebSocketMessage::ExchangeRateUpdate {
                        currency_code: payload["currency_code"].as_str().unwrap_or("USD").to_string(),
                        buy_rate: payload["buy_rate"].as_f64().unwrap_or(0.0),
                        sell_rate: payload["sell_rate"].as_f64().unwrap_or(0.0),
                        date: payload["date"].as_str().unwrap_or("").to_string(),
                    };

                    if let Ok(text) = serde_json::to_string(&ws_msg) {
                        let manager = self.ws_manager.read().await;
                        manager.broadcast(Message::Text(text)).await;
                    }
                }
            }
            sleep(Duration::from_secs(1)).await;
        }
    }
}

// Expose pool for direct queries in broadcast engine
impl Database {
    pub fn pool(&self) -> &sqlx::PgPool {
        &self.pool
    }
}
