use lapin::{
    options::*, types::FieldTable, Connection, ConnectionProperties,
};
use serde::{Deserialize, Serialize};

pub struct EnterpriseSyncManager {
    #[allow(dead_code)]
    rabbit_conn: Option<Connection>,
    #[allow(dead_code)]
    redis_client: Option<redis::Client>,
}

impl EnterpriseSyncManager {
    pub fn new() -> Self {
        Self {
            rabbit_conn: None,
            redis_client: None,
        }
    }

    pub async fn start_worker(&self, terminal_id: &str, amqp_url: &str) -> Result<(), Box<dyn std::error::Error>> {
        println!("🚀 Enterprise Sync Worker starting for terminal: {}", terminal_id);
        
        // 1. Connect to RabbitMQ
        let conn = Connection::connect(
            amqp_url,
            ConnectionProperties::default(),
        ).await?;
        
        println!("✅ Connected to RabbitMQ");

        let channel = conn.create_channel().await?;
        let queue_name = format!("q_terminal_{}", terminal_id);

        // 2. Declare Queue
        channel.queue_declare(
            &queue_name,
            QueueDeclareOptions {
                durable: true,
                ..Default::default()
            },
            FieldTable::default(),
        ).await?;

        // 3. Start Consumer
        let mut consumer = channel.basic_consume(
            &queue_name,
            "retail_ex_consumer",
            BasicConsumeOptions::default(),
            FieldTable::default(),
        ).await?;

        tokio::spawn(async move {
            while let Some(delivery) = futures::StreamExt::next(&mut consumer).await {
                if let Ok(delivery) = delivery {
                    let data = String::from_utf8_lossy(&delivery.data).to_string();
                    println!("📦 Received sync data: {}", data);
                    
                    if let Err(e) = process_sync_payload(&data).await {
                        eprintln!("❌ Sync processing error: {}", e);
                    }

                    let _ = delivery.ack(BasicAckOptions::default()).await;
                }
            }
        });

        Ok(())
    }
}

async fn process_sync_payload(payload: &str) -> Result<(), Box<dyn std::error::Error>> {
    let msg: SyncMessage = serde_json::from_str(payload)?;
    
    // 1. Get DB Connection (Localized to terminal)
    let config = crate::config::get_app_config_internal()?;
    let host_part = config.local_db.split(':').next().unwrap_or("localhost");
    let host_port_str = config.local_db.split('/').next().unwrap_or("localhost:5432");
    let port = if let Some(p) = host_port_str.split(':').nth(1) {
        p.parse::<u16>().unwrap_or(5432)
    } else {
        5432
    };
    let db_name = config.local_db.split('/').last().unwrap_or("retailex_local");
    let pg_conn_str = format!(
        "host={} port={} user={} password={} dbname={}",
        host_part, port, config.pg_local_user, config.pg_local_pass, db_name
    );

    let (client, connection) = tokio_postgres::connect(&pg_conn_str, tokio_postgres::NoTls).await?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Postgres connection error: {}", e);
        }
    });

    // 2. Process by Entity
    match msg.entity.as_str() {
        "ITEMS" => {
            let table = format!("rex_{}_products", msg.firm_nr);
            let sql = format!(
                "INSERT INTO {} (firm_nr, ref_id, code, name, vat_rate, price) 
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (code) DO UPDATE SET ref_id=$2, name=$4, vat_rate=$5, price=$6", 
                table
            );
            
            for item in msg.data {
                let ref_id = item.get("ref_id").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let code = item.get("code").and_then(|v| v.as_str()).unwrap_or("");
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let vat = item.get("vat").and_then(|v| v.as_f64()).unwrap_or(20.0);
                let price = item.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0);

                let _ = client.execute(
                    &sql, 
                    &[
                        &msg.firm_nr, 
                        &ref_id, 
                        &code, 
                        &name, 
                        &rust_decimal::Decimal::from_f64_retain(vat).unwrap_or_default(),
                        &rust_decimal::Decimal::from_f64_retain(price).unwrap_or_default()
                    ]
                ).await?;
            }
        },
        "CLCARD" => {
             let table = format!("rex_{}_customers", msg.firm_nr);
             let sql = format!(
                "INSERT INTO {} (firm_nr, ref_id, code, name, tax_nr) 
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (code) DO UPDATE SET ref_id=$2, name=$4, tax_nr=$5", 
                table
            );

            for item in msg.data {
                let ref_id = item.get("ref_id").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let code = item.get("code").and_then(|v| v.as_str()).unwrap_or("");
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let tax_nr = item.get("tax_nr").and_then(|v| v.as_str()).unwrap_or("");

                let _ = client.execute(&sql, &[&msg.firm_nr, &ref_id, &code, &name, &tax_nr]).await?;
            }
        },
        _ => println!("⚠️ Unknown sync entity: {}", msg.entity),
    }

    Ok(())
}

#[derive(Serialize, Deserialize)]
struct SyncMessage {
    firm_nr: String,
    entity: String,
    data: Vec<serde_json::Value>,
}

