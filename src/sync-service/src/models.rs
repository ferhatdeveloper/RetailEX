use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastMessage {
    pub id: Uuid,
    pub message_type: String,
    pub action: String,
    pub priority: String,
    pub status: String,
    pub target_stores: Option<Vec<Uuid>>,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub total_targets: i32,
    pub successful: i32,
    pub failed: i32,
    pub pending: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastRecipient {
    pub id: Uuid,
    pub broadcast_id: Uuid,
    pub store_id: Uuid,
    pub status: String,
    pub queued_at: Option<DateTime<Utc>>,
    pub sent_at: Option<DateTime<Utc>>,
    pub delivered_at: Option<DateTime<Utc>>,
    pub attempts: i32,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreDevice {
    pub id: Uuid,
    pub store_id: Uuid,
    pub device_id: String,
    pub device_name: String,
    pub status: String,
    pub last_seen: Option<DateTime<Utc>>,
    pub last_sync_at: Option<DateTime<Utc>>,
    pub pending_messages: i32,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncQueueItem {
    pub id: Uuid,
    pub broadcast_id: Uuid,
    pub store_id: Uuid,
    pub priority: i32,
    pub sequence_number: i64,
    pub status: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WebSocketMessage {
    // Client → Server
    Ping {
        timestamp: String,
    },
    Register {
        store_id: String,
        device_id: String,
        app_version: String,
    },
    Acknowledge {
        message_id: String,
        success: bool,
        error: Option<String>,
    },
    Response {
        message_id: String,
        data: serde_json::Value,
    },
    
    // Server → Client
    Pong {
        timestamp: String,
    },
    Broadcast {
        message_id: String,
        message_type: String,
        action: String,
        payload: serde_json::Value,
    },
    Pull {
        message_id: String,
        pull_type: String,
        since: Option<String>,
    },
    Status {
        online_stores: i32,
        pending_messages: i32,
    },
    ExchangeRateUpdate {
        currency_code: String,
        buy_rate: f64,
        sell_rate: f64,
        date: String,
    },
}
