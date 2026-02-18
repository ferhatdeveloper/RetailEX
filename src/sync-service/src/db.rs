use anyhow::Result;
use sqlx::{PgPool, postgres::PgPoolOptions};
use uuid::Uuid;
use tracing::{info, error};
use crate::models::*;

use tokio::sync::RwLock;
use std::collections::{HashSet, HashMap};

pub struct Database {
    pub pool: PgPool,
    // Cache for initialized schemas: (firm_nr) or (firm_nr, period_nr)
    initialized_firms: RwLock<HashSet<String>>,
    initialized_periods: RwLock<HashSet<String>>,
    // Cache for store to (firm_nr, period_nr) mapping
    context_cache: RwLock<HashMap<String, (String, String)>>,
    // Cache for store_code to store_id mapping
    store_id_cache: RwLock<HashMap<String, Uuid>>,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(50)
            .connect(database_url)
            .await?;
        
        Ok(Self { 
            pool,
            initialized_firms: RwLock::new(HashSet::new()),
            initialized_periods: RwLock::new(HashSet::new()),
            context_cache: RwLock::new(HashMap::new()),
            store_id_cache: RwLock::new(HashMap::new()),
        })
    }
    
    // ============================================
    // BROADCAST OPERATIONS
    // ============================================
    
    pub async fn create_broadcast(
        &self,
        message_type: &str,
        action: &str,
        priority: &str,
        target_stores: Option<&[Uuid]>,
        payload: &serde_json::Value,
    ) -> Result<Uuid> {
        let broadcast_id = Uuid::new_v4();
        
        // Insert broadcast message
        sqlx::query!(
            r#"
            INSERT INTO broadcast_messages (
                id, message_type, action, priority, status,
                target_stores, payload, created_at
            )
            VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW())
            "#,
            broadcast_id,
            message_type,
            action,
            priority,
            target_stores,
            payload
        )
        .execute(&self.pool)
        .await?;
        
        // Create recipients
        let store_ids = if let Some(stores) = target_stores {
            stores.to_vec()
        } else {
            // Get all active stores
            self.get_all_store_ids().await?
        };
        
        for store_id in &store_ids {
            self.create_recipient(&broadcast_id, store_id).await?;
        }
        
        // Update total_targets
        sqlx::query!(
            "UPDATE broadcast_messages SET total_targets = $1, pending = $1 WHERE id = $2",
            store_ids.len() as i32,
            broadcast_id
        )
        .execute(&self.pool)
        .await?;
        
        info!("Created broadcast {} with {} recipients", broadcast_id, store_ids.len());
        
        Ok(broadcast_id)
    }
    
    async fn get_all_store_ids(&self) -> Result<Vec<Uuid>> {
        let records = sqlx::query!(
            "SELECT id FROM stores WHERE is_active = true"
        )
        .fetch_all(&self.pool)
        .await?;
        
        Ok(records.into_iter().map(|r| r.id).collect())
    }
    
    async fn create_recipient(&self, broadcast_id: &Uuid, store_id: &Uuid) -> Result<()> {
        let recipient_id = Uuid::new_v4();
        let sequence = self.get_next_sequence().await?;
        
        // Insert recipient
        sqlx::query!(
            r#"
            INSERT INTO broadcast_recipients (
                id, broadcast_id, store_id, status, created_at
            )
            VALUES ($1, $2, $3, 'pending', NOW())
            "#,
            recipient_id,
            broadcast_id,
            store_id
        )
        .execute(&self.pool)
        .await?;
        
        // Insert into sync queue
        let priority = self.get_broadcast_priority(broadcast_id).await?;
        
        sqlx::query!(
            r#"
            INSERT INTO sync_queue (
                id, broadcast_id, recipient_id, store_id,
                priority, sequence_number, status, queued_at
            )
            VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 'pending', NOW())
            "#,
            broadcast_id,
            recipient_id,
            store_id,
            priority,
            sequence
        )
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }
    
    async fn get_next_sequence(&self) -> Result<i64> {
        let record = sqlx::query!(
            "SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq FROM sync_queue"
        )
        .fetch_one(&self.pool)
        .await?;
        
        Ok(record.next_seq.unwrap_or(1))
    }
    
    async fn get_broadcast_priority(&self, broadcast_id: &Uuid) -> Result<i32> {
        let record = sqlx::query!(
            r#"
            SELECT 
                CASE priority
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'normal' THEN 3
                    WHEN 'low' THEN 4
                    ELSE 3
                END as priority_num
            FROM broadcast_messages
            WHERE id = $1
            "#,
            broadcast_id
        )
        .fetch_one(&self.pool)
        .await?;
        
        Ok(record.priority_num.unwrap_or(3))
    }
    
    pub async fn get_broadcast_status(&self, broadcast_id: &Uuid) -> Result<BroadcastMessage> {
        let record = sqlx::query_as!(
            BroadcastMessage,
            r#"
            SELECT 
                id, message_type, action, priority, status,
                target_stores, payload, created_at,
                total_targets, successful, failed, pending
            FROM broadcast_messages
            WHERE id = $1
            "#,
            broadcast_id
        )
        .fetch_one(&self.pool)
        .await?;
        
        Ok(record)
    }
    
    pub async fn get_pending_messages(&self, store_id: &Uuid, limit: i32) -> Result<Vec<SyncQueueItem>> {
        let records = sqlx::query!(
            r#"
            SELECT 
                sq.id,
                sq.broadcast_id,
                sq.store_id,
                sq.priority,
                sq.sequence_number,
                sq.status,
                bm.payload
            FROM sync_queue sq
            JOIN broadcast_messages bm ON bm.id = sq.broadcast_id
            WHERE sq.store_id = $1
              AND sq.status = 'pending'
              AND (sq.scheduled_for IS NULL OR sq.scheduled_for <= NOW())
              AND (sq.expires_at IS NULL OR sq.expires_at > NOW())
            ORDER BY sq.priority ASC, sq.sequence_number ASC
            LIMIT $2
            "#,
            store_id,
            limit
        )
        .fetch_all(&self.pool)
        .await?;
        
        let items = records.into_iter().map(|r| SyncQueueItem {
            id: r.id,
            broadcast_id: r.broadcast_id,
            store_id: r.store_id,
            priority: r.priority,
            sequence_number: r.sequence_number,
            status: r.status,
            payload: r.payload,
        }).collect();
        
        Ok(items)
    }
    
    pub async fn mark_message_delivered(
        &self,
        queue_id: &Uuid,
        success: bool,
        error: Option<&str>,
    ) -> Result<()> {
        if success {
            // Update queue status
            sqlx::query!(
                "UPDATE sync_queue SET status = 'completed', updated_at = NOW() WHERE id = $1",
                queue_id
            )
            .execute(&self.pool)
            .await?;
            
            // Update recipient
            let recipient_id = sqlx::query!(
                "SELECT recipient_id FROM sync_queue WHERE id = $1",
                queue_id
            )
            .fetch_one(&self.pool)
            .await?
            .recipient_id;
            
            sqlx::query!(
                r#"
                UPDATE broadcast_recipients 
                SET status = 'delivered', 
                    delivered_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1
                "#,
                recipient_id
            )
            .execute(&self.pool)
            .await?;
        } else {
            // Increment retry count
            sqlx::query!(
                r#"
                UPDATE sync_queue 
                SET retry_count = retry_count + 1,
                    status = CASE 
                        WHEN retry_count + 1 >= max_retries THEN 'failed'
                        ELSE 'pending'
                    END,
                    error_message = $2,
                    last_error_at = NOW(),
                    next_retry_at = NOW() + INTERVAL '5 minutes',
                    updated_at = NOW()
                WHERE id = $1
                "#,
                queue_id,
                error
            )
            .execute(&self.pool)
            .await?;
        }
        
        Ok(())
    }
    
    // ============================================
    // DEVICE OPERATIONS
    // ============================================
    
    pub async fn register_device(
        &self,
        store_id: &Uuid,
        device_id: &str,
        device_name: &str,
        app_version: &str,
    ) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO store_devices (
                id, store_id, device_id, device_name, app_version,
                status, registered_at, updated_at
            )
            VALUES (uuid_generate_v4(), $1, $2, $3, $4, 'online', NOW(), NOW())
            ON CONFLICT (device_id) 
            DO UPDATE SET 
                status = 'online',
                last_seen = NOW(),
                app_version = $4,
                updated_at = NOW()
            "#,
            store_id,
            device_id,
            device_name,
            app_version
        )
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }
    
    pub async fn update_device_status(&self, device_id: &str, status: &str) -> Result<()> {
        sqlx::query!(
            r#"
            UPDATE store_devices
            SET status = $1, last_seen = NOW(), updated_at = NOW()
            WHERE device_id = $2
            "#,
            status,
            device_id
        )
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }
    
    pub async fn get_devices(&self) -> Result<Vec<StoreDevice>> {
        let records = sqlx::query_as!(
            StoreDevice,
            r#"
            SELECT 
                id, store_id, device_id, device_name,
                status, last_seen, last_sync_at,
                pending_messages, app_version
            FROM store_devices
            ORDER BY last_seen DESC NULLS LAST
            "#
        )
        .fetch_all(&self.pool)
        .await?;
        
        Ok(records)
    }
    
    pub async fn get_store_pending_count(&self, store_id: &Uuid) -> Result<i32> {
        let record = sqlx::query!(
            "SELECT COUNT(*) as count FROM sync_queue WHERE store_id = $1 AND status = 'pending'",
            store_id
        )
        .fetch_one(&self.pool)
        .await?;
        
        Ok(record.count.unwrap_or(0) as i32)
    }

    // ============================================
    // DATA SYNC OPERATIONS
    // ============================================

    async fn get_firm_and_period(&self, store_id: &str) -> Result<(String, String)> {
        // 1. Check cache first
        {
            let cache = self.context_cache.read().await;
            if let Some(context) = cache.get(store_id) {
                return Ok(context.clone());
            }
        }

        // 2. Look up firm_nr from stores table
        let store_record = sqlx::query!(
            "SELECT firm_nr FROM stores WHERE code = $1",
            store_id
        )
        .fetch_one(&self.pool)
        .await?;

        let firm_nr = store_record.firm_nr;

        // 3. Look up active period for this firm
        let period_record = sqlx::query!(
            r#"
            SELECT nr 
            FROM periods p
            JOIN firms f ON f.id = p.firm_id
            WHERE f.firm_nr = $1 AND p.is_active = true
            ORDER BY p.nr DESC
            LIMIT 1
            "#,
            firm_nr
        )
        .fetch_one(&self.pool)
        .await?;

        let period_nr = format!("{:02}", period_record.nr);
        let context = (firm_nr, period_nr);

        // 4. Update cache
        {
            let mut cache = self.context_cache.write().await;
            cache.insert(store_id.to_string(), context.clone());
        }

        Ok(context)
    }

    async fn log_sync_event(
        &self,
        firm_nr: &str,
        store_code: &str,
        sync_type: &str,
        detail: serde_json::Value
    ) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO public.sync_logs (firm_nr, store_code, sync_type, last_sync_date, detail)
            VALUES ($1, $2, $3, NOW(), $4)
            "#,
            firm_nr,
            store_code,
            sync_type,
            detail
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get_store_id(&self, store_code: &str) -> Result<Option<Uuid>> {
        // 1. Check cache
        {
            let cache = self.store_id_cache.read().await;
            if let Some(id) = cache.get(store_code) {
                return Ok(Some(*id));
            }
        }

        // 2. Query DB
        let record = sqlx::query!(
            "SELECT id FROM stores WHERE code = $1",
            store_code
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(r) = record {
            // 3. Update cache
            let mut cache = self.store_id_cache.write().await;
            cache.insert(store_code.to_string(), r.id);
            return Ok(Some(r.id));
        }

        Ok(None)
    }

    async fn ensure_firm_tables(&self, firm_nr: &str) -> Result<()> {
        // 1. Check cache
        {
            let cache = self.initialized_firms.read().await;
            if cache.contains(firm_nr) {
                return Ok(());
            }
        }

        info!("🔍 Ensuring firm tables exist for firm: {}", firm_nr);
        sqlx::query("SELECT public.CREATE_FIRM_TABLES($1)")
            .bind(firm_nr)
            .execute(&self.pool)
            .await?;

        // 2. Update cache
        {
            let mut cache = self.initialized_firms.write().await;
            cache.insert(firm_nr.to_string());
        }
        Ok(())
    }

    async fn ensure_period_tables(&self, firm_nr: &str, period_nr: &str) -> Result<()> {
        let key = format!("{}_{}", firm_nr, period_nr);
        // 1. Check cache
        {
            let cache = self.initialized_periods.read().await;
            if cache.contains(&key) {
                return Ok(());
            }
        }

        info!("🔍 Ensuring period tables exist for firm: {}, period: {}", firm_nr, period_nr);
        sqlx::query("SELECT public.CREATE_PERIOD_TABLES($1, $2)")
            .bind(firm_nr)
            .bind(period_nr)
            .execute(&self.pool)
            .await?;

        // 2. Update cache
        {
            let mut cache = self.initialized_periods.write().await;
            cache.insert(key);
        }
        Ok(())
    }

    pub async fn process_pull_response(
        &self,
        store_id: &str,
        message_id: &str,
        data: &serde_json::Value,
    ) -> Result<()> {
        info!("📥 Processing pull response from store {} for message {}", store_id, message_id);
        
        // 1. Get firm and period context
        let (firm_nr, period_nr) = match self.get_firm_and_period(store_id).await {
            Ok(context) => context,
            Err(e) => {
                error!("❌ Failed to get firm/period context for store {}: {}", store_id, e);
                return Err(e);
            }
        };

        // 2. Process Sales
        if let Some(sales) = data.get("sales") {
            if let Some(sales_arr) = sales.as_array() {
                self.process_sales_sync(&firm_nr, &period_nr, sales_arr, store_id).await?;
            }
        }
        
        // 3. Process Products
        if let Some(products) = data.get("products") {
            if let Some(products_arr) = products.as_array() {
                self.process_products_sync(&firm_nr, products_arr).await?;
            }
        }

        // 4. Process Customers
        if let Some(customers) = data.get("customers") {
            if let Some(customers_arr) = customers.as_array() {
                self.process_customers_sync(&firm_nr, customers_arr).await?;
            }
        }

        // 5. Log synchronization event for traceability
        let detail = serde_json::json!({
            "has_sales": data.get("sales").is_some(),
            "has_products": data.get("products").is_some(),
            "has_customers": data.get("customers").is_some(),
            "message_id": message_id
        });
        
        if let Err(e) = self.log_sync_event(&firm_nr, store_id, "delta", detail).await {
            error!("⚠️ Failed to log sync event for store {}: {}", store_id, e);
            // We don't fail the whole sync just because logging failed, but we log the error.
        }

        Ok(())
    }

    async fn process_customers_sync(
        &self,
        firm_nr: &str,
        customers: &[serde_json::Value],
    ) -> Result<()> {
        // Ensure table exists
        self.ensure_firm_tables(firm_nr).await?;
        
        let customers_table = format!("rex_{}_customers", firm_nr);

        for customer in customers {
            let code = customer.get("code").and_then(|v| v.as_str()).unwrap_or("");
            if code.is_empty() { continue; }

            let query = format!(
                r#"
                INSERT INTO {} (
                    firm_nr, code, name, phone, email, tax_nr, tax_office, address, city
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    phone = EXCLUDED.phone,
                    email = EXCLUDED.email,
                    address = EXCLUDED.address,
                    city = EXCLUDED.city
                WHERE 
                    {} .name IS DISTINCT FROM EXCLUDED.name OR
                    {} .phone IS DISTINCT FROM EXCLUDED.phone OR
                    {} .email IS DISTINCT FROM EXCLUDED.email OR
                    {} .address IS DISTINCT FROM EXCLUDED.address OR
                    {} .city IS DISTINCT FROM EXCLUDED.city
                "#,
                customers_table, customers_table, customers_table, customers_table, customers_table, customers_table
            );

            sqlx::query(&query)
                .bind(firm_nr)
                .bind(code)
                .bind(customer.get("name").and_then(|v| v.as_str()))
                .bind(customer.get("phone").and_then(|v| v.as_str()))
                .bind(customer.get("email").and_then(|v| v.as_str()))
                .bind(customer.get("tax_nr").and_then(|v| v.as_str()))
                .bind(customer.get("tax_office").and_then(|v| v.as_str()))
                .bind(customer.get("address").and_then(|v| v.as_str()))
                .bind(customer.get("city").and_then(|v| v.as_str()))
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    async fn process_sales_sync(
        &self,
        firm_nr: &str,
        period_nr: &str,
        sales: &[serde_json::Value],
        store_code: &str,
    ) -> Result<()> {
        // Ensure tables exist
        self.ensure_period_tables(firm_nr, period_nr).await?;
        
        // Resolve store UUID for relational integrity
        let store_id = self.get_store_id(store_code).await?.unwrap_or_else(|| Uuid::nil());

        let sales_table = format!("rex_{}_{}_sales", firm_nr, period_nr);
        let items_table = format!("rex_{}_{}_sale_items", firm_nr, period_nr);

        for sale in sales {
            let fiche_no = sale.get("fiche_no").and_then(|v| v.as_str()).unwrap_or("");
            if fiche_no.is_empty() { continue; }

            // Insert or Update Sale Header
            let query = format!(
                r#"
                INSERT INTO {} (
                    fiche_no, document_no, customer_name, total_net, total_vat, 
                    total_gross, total_discount, net_amount, trcode, fiche_type, 
                    date, notes, payment_method, cashier, firm_nr, period_nr, store_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                ON CONFLICT (fiche_no) DO UPDATE SET
                    document_no = EXCLUDED.document_no,
                    total_net = EXCLUDED.total_net,
                    total_vat = EXCLUDED.total_vat,
                    total_gross = EXCLUDED.total_gross,
                    net_amount = EXCLUDED.net_amount,
                    store_id = EXCLUDED.store_id,
                    updated_at = NOW()
                WHERE 
                    {} .total_net IS DISTINCT FROM EXCLUDED.total_net OR
                    {} .total_gross IS DISTINCT FROM EXCLUDED.total_gross OR
                    {} .net_amount IS DISTINCT FROM EXCLUDED.net_amount OR
                    {} .document_no IS DISTINCT FROM EXCLUDED.document_no
                RETURNING id
                "#,
                sales_table, sales_table, sales_table, sales_table, sales_table
            );

            let row: Option<Uuid> = sqlx::query_scalar(&query)
                .bind(fiche_no)
                .bind(sale.get("document_no").and_then(|v| v.as_str()))
                .bind(sale.get("customer_name").and_then(|v| v.as_str()))
                .bind(sale.get("total_net").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(sale.get("total_vat").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(sale.get("total_gross").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(sale.get("total_discount").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(sale.get("net_amount").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(sale.get("trcode").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(sale.get("fiche_type").and_then(|v| v.as_str()))
                .bind(sale.get("date").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_else(|| chrono::Utc::now().to_rfc3339()))
                .bind(sale.get("notes").and_then(|v| v.as_str()))
                .bind(sale.get("payment_method").and_then(|v| v.as_str()))
                .bind(sale.get("cashier").and_then(|v| v.as_str()))
                .bind(firm_nr)
                .bind(period_nr)
                .bind(store_id)
                .fetch_optional(&self.pool)
                .await?;

            if let Some(sale_id) = row {
                // Only re-insert items if header was updated or newly inserted
                if let Some(items) = sale.get("items").and_then(|v| v.as_array()) {
                // Delete existing items first to avoid duplicates on update
                let delete_query = format!("DELETE FROM {} WHERE invoice_id = $1", items_table);
                sqlx::query(&delete_query)
                    .bind(sale_id)
                    .execute(&self.pool)
                    .await?;

                for item in items {
                    let item_query = format!(
                        r#"
                        INSERT INTO {} (
                            invoice_id, item_code, item_name, quantity, price, 
                            unit_price, vat_rate, discount_rate, total_amount, net_amount,
                            firm_nr
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        "#,
                        items_table
                    );

                    sqlx::query(&item_query)
                        .bind(sale_id)
                        .bind(item.get("item_code").and_then(|v| v.as_str()))
                        .bind(item.get("item_name").and_then(|v| v.as_str()))
                        .bind(item.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0))
                        .bind(item.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0))
                        .bind(item.get("unit_price").and_then(|v| v.as_f64()).unwrap_or(0.0))
                        .bind(item.get("vat_rate").and_then(|v| v.as_f64()).unwrap_or(0.0))
                        .bind(item.get("discount_rate").and_then(|v| v.as_f64()).unwrap_or(0.0))
                        .bind(item.get("total_amount").and_then(|v| v.as_f64()).unwrap_or(0.0))
                        .bind(item.get("net_amount").and_then(|v| v.as_f64()).unwrap_or(0.0))
                        .bind(firm_nr)
                        .execute(&self.pool)
                        .await?;
                }
            }
        }
    }
    Ok(())
}

    async fn process_products_sync(
        &self,
        firm_nr: &str,
        products: &[serde_json::Value],
    ) -> Result<()> {
        // Ensure table exists
        self.ensure_firm_tables(firm_nr).await?;

        let products_table = format!("rex_{}_products", firm_nr);

        for product in products {
            let code = product.get("code").and_then(|v| v.as_str()).unwrap_or("");
            if code.is_empty() { continue; }

            let query = format!(
                r#"
                INSERT INTO {} (
                    firm_nr, code, barcode, name, vat_rate, price, stock, category_code
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (code) DO UPDATE SET
                    barcode = EXCLUDED.barcode,
                    name = EXCLUDED.name,
                    price = EXCLUDED.price,
                    stock = EXCLUDED.stock,
                    updated_at = NOW()
                WHERE 
                    {} .barcode IS DISTINCT FROM EXCLUDED.barcode OR
                    {} .name IS DISTINCT FROM EXCLUDED.name OR
                    {} .price IS DISTINCT FROM EXCLUDED.price OR
                    {} .stock IS DISTINCT FROM EXCLUDED.stock
                "#,
                products_table, products_table, products_table, products_table, products_table
            );

            sqlx::query(&query)
                .bind(firm_nr)
                .bind(code)
                .bind(product.get("barcode").and_then(|v| v.as_str()))
                .bind(product.get("name").and_then(|v| v.as_str()))
                .bind(product.get("vat_rate").and_then(|v| v.as_f64()).unwrap_or(20.0))
                .bind(product.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(product.get("stock").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(product.get("category_code").and_then(|v| v.as_str()))
                .execute(&self.pool)
                .await?;
        }
    pub async fn upsert_heartbeat(
        &self,
        name: &str,
        status: &str,
        version: &str,
        metadata: serde_json::Value,
    ) -> Result<()> {
        sqlx::query!(
            "SELECT public.upsert_service_health($1, $2, $3, $4)",
            name,
            status,
            version,
            metadata
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
