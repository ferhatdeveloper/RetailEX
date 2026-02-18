use axum::extract::ws::{Message, WebSocket};
use futures_util::{sink::SinkExt, stream::StreamExt};
use std::collections::HashMap;
use tokio::sync::mpsc;
use tracing::{info, warn, error};
use uuid::Uuid;

use crate::{AppState, models::WebSocketMessage};

pub struct WebSocketManager {
    connections: HashMap<String, mpsc::UnboundedSender<Message>>,
}

impl WebSocketManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
        }
    }
    
    pub fn add_connection(&mut self, store_id: String, sender: mpsc::UnboundedSender<Message>) {
        info!("➕ Adding WebSocket connection for store: {}", store_id);
        self.connections.insert(store_id, sender);
    }
    
    pub fn remove_connection(&mut self, store_id: &str) {
        info!("➖ Removing WebSocket connection for store: {}", store_id);
        self.connections.remove(store_id);
    }
    
    pub async fn send_to_store(&self, store_id: &str, message: Message) -> bool {
        if let Some(sender) = self.connections.get(store_id) {
            sender.send(message).is_ok()
        } else {
            false
        }
    }
    
    pub fn is_store_online(&self, store_id: &str) -> bool {
        self.connections.contains_key(store_id)
    }
    
    pub fn online_stores_count(&self) -> usize {
        self.connections.len()
    }
}

pub async fn handle_connection(socket: WebSocket, store_id: String, state: AppState) {
    info!("🔌 WebSocket connected: {}", store_id);
    
    // Split socket
    let (mut sender, mut receiver) = socket.split();
    
    // Create channel for outgoing messages
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    
    // Register connection
    {
        let mut manager = state.ws_manager.write().await;
        manager.add_connection(store_id.clone(), tx.clone());
    }
    
    // Update device status
    if let Err(e) = state.db.update_device_status(&store_id, "online").await {
        error!("Failed to update device status: {}", e);
    }
    
    // Spawn task to send outgoing messages
    let store_id_clone = store_id.clone();
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                warn!("Failed to send message to store: {}", store_id_clone);
                break;
            }
        }
    });
    
    // Send pending messages
    let store_id_clone = store_id.clone();
    let state_clone = state.clone();
    tokio::spawn(async move {
        send_pending_messages(&store_id_clone, &state_clone).await;
    });
    
    // Handle incoming messages
    while let Some(result) = receiver.next().await {
        match result {
            Ok(msg) => {
                if let Err(e) = handle_message(msg, &store_id, &state, &tx).await {
                    error!("Error handling message: {}", e);
                }
            }
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
        }
    }
    
    // Cleanup on disconnect
    info!("❌ WebSocket disconnected: {}", store_id);
    
    {
        let mut manager = state.ws_manager.write().await;
        manager.remove_connection(&store_id);
    }
    
    if let Err(e) = state.db.update_device_status(&store_id, "offline").await {
        error!("Failed to update device status on disconnect: {}", e);
    }
}

async fn handle_message(
    msg: Message,
    store_id: &str,
    state: &AppState,
    tx: &mpsc::UnboundedSender<Message>,
) -> anyhow::Result<()> {
    match msg {
        Message::Text(text) => {
            let ws_msg: WebSocketMessage = serde_json::from_str(&text)?;
            
            match ws_msg {
                WebSocketMessage::Ping { timestamp } => {
                    // Respond with pong
                    let pong = WebSocketMessage::Pong { timestamp };
                    let pong_text = serde_json::to_string(&pong)?;
                    tx.send(Message::Text(pong_text))?;
                }
                
                WebSocketMessage::Register { store_id: sid, device_id, app_version } => {
                    // Register device
                    let store_uuid = Uuid::parse_str(&sid)?;
                    state.db.register_device(
                        &store_uuid,
                        &device_id,
                        &format!("{} - WebSocket", store_id),
                        &app_version,
                    ).await?;
                    
                    info!("📱 Device registered: {} for store: {}", device_id, sid);
                }
                
                WebSocketMessage::Acknowledge { message_id, success, error } => {
                    // Mark message as delivered
                    let queue_id = Uuid::parse_str(&message_id)?;
                    state.db.mark_message_delivered(
                        &queue_id,
                        success,
                        error.as_deref(),
                    ).await?;
                    
                    info!("✅ Message acknowledged: {} - success: {}", message_id, success);
                }
                
                WebSocketMessage::Response { message_id, data } => {
                    // Handle pull response
                    info!("📦 Received response for message: {}", message_id);
                    if let Err(e) = state.db.process_pull_response(store_id, &message_id, &data).await {
                        error!("Failed to process pull response: {}", e);
                    }
                }
                
                _ => {
                    warn!("Unknown message type from store: {}", store_id);
                }
            }
        }
        
        Message::Binary(_) => {
            warn!("Received binary message (not supported)");
        }
        
        Message::Ping(_) => {
            // Axum handles pong automatically
        }
        
        Message::Pong(_) => {
            // Keep-alive confirmed
        }
        
        Message::Close(_) => {
            info!("WebSocket close requested");
        }
    }
    
    Ok(())
}

async fn send_pending_messages(store_id: &str, state: &AppState) {
    let store_uuid = match Uuid::parse_str(store_id) {
        Ok(uuid) => uuid,
        Err(_) => {
            error!("Invalid store UUID: {}", store_id);
            return;
        }
    };
    
    match state.db.get_pending_messages(&store_uuid, 100).await {
        Ok(messages) => {
            info!("📬 Sending {} pending messages to store: {}", messages.len(), store_id);
            
            for msg in messages {
                // Get message details from broadcast
                if let Ok(broadcast) = state.db.get_broadcast_status(&msg.broadcast_id).await {
                    let ws_msg = if broadcast.action == "pull" {
                        WebSocketMessage::Pull {
                            message_id: msg.id.to_string(),
                            pull_type: broadcast.message_type,
                            since: msg.payload.get("pull_since").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        }
                    } else {
                        WebSocketMessage::Broadcast {
                            message_id: msg.id.to_string(),
                            message_type: broadcast.message_type,
                            action: broadcast.action,
                            payload: msg.payload,
                        }
                    };
                    
                    if let Ok(text) = serde_json::to_string(&ws_msg) {
                        let manager = state.ws_manager.read().await;
                        if !manager.send_to_store(store_id, Message::Text(text)).await {
                            warn!("Failed to send message to store: {}", store_id);
                        }
                    }
                }
            }
        }
        Err(e) => {
            error!("Failed to get pending messages: {}", e);
        }
    }
}
